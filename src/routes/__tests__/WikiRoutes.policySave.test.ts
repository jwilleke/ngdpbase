/**
 * Admin → Configuration checks ngdpbase.access.policies on save and on load
 * (#2278), with PolicyValidator's own messages.
 */

import WikiRoutes from '../WikiRoutes';
import { readFileSync } from 'node:fs';
import PolicyValidator from '../../managers/PolicyValidator';

const KEY = 'ngdpbase.access.policies';
const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const PAGE_ATTRIBUTES = { owner: { type: 'identity' }, 'system-category': { type: 'string' } };

const policy = (id: string, condition?: unknown) => ({
  id, name: id, effect: 'allow', priority: 50,
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['view'],
  ...(condition === undefined ? {} : { condition })
});

async function makeRoutes(inForce: unknown[] = [], resourceTypes: unknown = { page: { attributes: PAGE_ATTRIBUTES } }) {
  const config: Record<string, unknown> = { [KEY]: inForce, 'ngdpbase.access.resource-types': resourceTypes };
  const configManager = {
    getProperty: vi.fn((k: string, d: unknown) => (k in config ? config[k] : d)),
    getDefaultProperties: () => ({}),
    getCustomProperties: () => ({ [KEY]: inForce }),
    getAllProperties: () => ({ ...config }),
    getEnvControlledKeys: () => ({}),
    setProperty: vi.fn().mockResolvedValue(undefined)
  };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager, PolicyDecisionPoint: { permits: vi.fn().mockResolvedValue(true) } };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  const validator = new PolicyValidator(engine);
  await validator.initialize();
  managers.PolicyValidator = validator;
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
  return { routes, configManager };
}

const req = (body: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body, session: { csrfToken: 'tok' },
  path: '/admin/configuration', originalUrl: '/admin/configuration', protocol: 'http',
  headers: { 'x-requested-with': 'XMLHttpRequest' }, xhr: true,
  get: vi.fn().mockReturnValue('localhost:3000'), userContext: adminUser
});
const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});
const save = (policies: unknown[]) => req({ property: KEY, value: JSON.stringify(policies) });

describe('saving ngdpbase.access.policies (#2278)', () => {
  it.each([
    ['an empty any-of', { 'any-of': [] }, "'any-of' is empty; list at least one condition, or remove the condition"],
    ['an unknown operator', { attribute: 'resource:owner', sounds: 'like' }, "condition uses 'sounds'; use one of equals"],
    ['an undeclared attribute', { attribute: 'resource:department', equals: 'x' }, "condition reads 'resource:department', which is not declared"],
    ['a depth over 4', { not: { not: { not: { not: { attribute: 'resource:owner', equals: 'subject:id' } } } } }, 'conditions are nested 5 deep; the limit is 4']
  ])('refuses %s, shows the validator message with the id, and writes nothing', async (_name, condition, message) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([policy('p1', condition)]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain("'p1'");
    expect(error).toContain(message);
  });

  it('refuses a policy the schema rejects, naming it', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([{ ...policy('p2'), effect: 'maybe' }]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(String(r.json.mock.calls[0][0].error)).toContain("'p2'");
  });

  it('redirects a form post with the problem in the error', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    const form = { ...save([policy('p1', { 'any-of': [] })]), xhr: false, headers: {} };
    await routes.adminUpdateConfiguration(form, r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(decodeURIComponent(String(r.redirect.mock.calls[0][0]))).toContain('list at least one condition');
  });

  it('saves a valid policy, with and without a condition', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    const policies = [policy('p1'), policy('p3', { attribute: 'resource:owner', equals: 'subject:id' })];
    await routes.adminUpdateConfiguration(save(policies), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, policies, adminUser);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('loading Admin → Configuration with policies in force that have problems (#2278)', () => {
  it('hands the policy id and the validator message to the page for the policies row', async () => {
    const { routes } = await makeRoutes([policy('from-custom-config', { 'any-of': [] })]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    const data = r.render.mock.calls[0][1];
    expect(data.configProblems[KEY]).toEqual(["'from-custom-config': 'any-of' is empty; list at least one condition, or remove the condition"]);
  });

  it('shows nothing when the policies are fine', async () => {
    const { routes } = await makeRoutes([policy('p1')]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems).toEqual({});
  });
});

describe('the shipped policies', () => {
  it('have no problems, so saving them unchanged is not refused', async () => {
    const shipped = JSON.parse(readFileSync('config/app-default-config.json', 'utf8')) as Record<string, unknown>;
    const { routes } = await makeRoutes([], shipped['ngdpbase.access.resource-types']);
    const r = res();
    await routes.adminUpdateConfiguration(save(shipped[KEY] as unknown[]), r);
    expect(r.json.mock.calls[0][0]).toEqual(expect.objectContaining({ success: true }));
  });
});
