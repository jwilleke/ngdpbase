/**
 * Admin → Configuration checks ngdpbase.access.policies on save and on load
 * (#2278), with PolicyValidator's own messages.
 */

import WikiRoutes from '../WikiRoutes';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import PolicyValidator from '../../managers/PolicyValidator';

const KEY = 'ngdpbase.access.policies';
const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const PAGE_ATTRIBUTES = { owner: { type: 'identity' }, 'system-category': { type: 'string' } };

const OWNER = { 'string-equal': [{ attributeid: 'resource:owner', datatype: 'string' }, { attributeid: 'subject:id', datatype: 'string' }] };
const policy = (id: string, condition?: unknown) => ({
  id, name: id, effect: 'allow',
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page-read'],
  ...(condition === undefined ? {} : { condition })
});

async function makeRoutes(inForce: unknown[] = [], resourceTypes: unknown = { page: { attributes: PAGE_ATTRIBUTES } }, definitions: unknown = { 'page-read': {}, 'page-edit': {} }) {
  const config: Record<string, unknown> = { [KEY]: inForce, 'ngdpbase.access.resource-types': resourceTypes, 'ngdpbase.permissions.definitions': definitions };
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
    ['an empty or', { or: [] }, "'or' is empty; list at least one condition, or remove the condition"],
    ['an unknown function', { sounds: [{ attributeid: 'resource:owner', datatype: 'string' }, { value: 'x', datatype: 'string' }] }, "condition uses 'sounds'; use one of string-equal"],
    ['an undeclared attribute', { 'string-equal': [{ attributeid: 'resource:department', datatype: 'string' }, { value: 'x', datatype: 'string' }] }, "condition reads 'resource:department', which is not declared"],
    ['a depth over 4', { not: [{ not: [{ not: [{ not: [OWNER] }] }] }] }, 'conditions are nested 5 deep; the limit is 4']
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

  it('refuses an action that is not a defined permission, naming the policy and the action', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([{ ...policy('p4'), effect: 'deny', actions: ['page-read', 'page-edt'] }]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain("'p4'");
    expect(error).toContain("'page-edt'");
    expect(error).toContain('ngdpbase.permissions.definitions');
  });

  it("accepts the evaluator's '*' wildcard", async () => {
    const { routes, configManager } = await makeRoutes();
    await routes.adminUpdateConfiguration(save([{ ...policy('p5'), actions: ['*'] }]), res());
    expect(configManager.setProperty).toHaveBeenCalled();
  });

  it('refuses the save, saying why, when the permission definitions cannot be read', async () => {
    const { routes, configManager } = await makeRoutes([], undefined, {});
    const r = res();
    await routes.adminUpdateConfiguration(save([policy('p1')]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(String(r.json.mock.calls[0][0].error)).toContain('could not be read');
  });

  it.each([
    ['a key on anyone', { type: 'anyone', key: 'x' }, "'anyone' takes no key"],
    ['a value on authenticated', { type: 'authenticated', value: 'x' }, "'authenticated' takes no value"]
  ])('refuses %s, shows the message with the id, and writes nothing (#2284)', async (_name, subject, message) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([{ ...policy('p4'), subjects: [subject] }]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain("'p4'");
    expect(error).toContain(message);
  });

  it('redirects a form post with the problem in the error', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    const form = { ...save([policy('p1', { or: [] })]), xhr: false, headers: {} };
    await routes.adminUpdateConfiguration(form, r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(decodeURIComponent(String(r.redirect.mock.calls[0][0]))).toContain('list at least one condition');
  });

  it('saves a valid policy, with and without a condition', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    const policies = [policy('p1'), policy('p3', OWNER)];
    await routes.adminUpdateConfiguration(save(policies), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, policies, adminUser);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('a policy with the old conditions array on save (#2334)', () => {
  const old = { ...policy('old-one'), conditions: [{ type: 'user-attribute', key: 'department', value: 'IT', operator: '==' }] };

  it('saves it and shows the not-enforced message, naming the policy', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([policy('p1'), old]), r);
    expect(r.json.mock.calls[0][0]).not.toHaveProperty('error');
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, [policy('p1'), old], adminUser);
    const body = r.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.warning).toContain("This rule has an old 'conditions' list that the site ignores, so it doesn't limit anyone: 'old-one'");
    expect(body.warning).not.toMatch(/#\d{4}|[{}]/);
    expect(body.warning).not.toContain("'p1'");
  });

  it('says "these rules have" for several', async () => {
    const { routes } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([old, { ...old, id: 'old-two' }]), r);
    expect(r.json.mock.calls[0][0].warning).toContain("These rules have an old 'conditions' list");
  });

  it('does not warn about an empty conditions array', async () => {
    const { routes } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([{ ...policy('p1'), conditions: [] }]), r);
    expect(r.json.mock.calls[0][0].warning).toBeUndefined();
  });

  it('still refuses a conditions entry the schema rejects (an unknown type), with no warning', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([{ ...policy('p1'), conditions: [{ type: 'bogus' }] }]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].warning).toBeUndefined();
  });

  it('the page shows data.warning as a warning alert that stays', () => {
    const view = readFileSync(new URL('../../../views/admin-configuration.ejs', import.meta.url), 'utf8');
    expect(view).toMatch(/data\.success && data\.warning\)[\s\S]{0,200}showConfigAlert\('warning'/);
    expect(view).toMatch(/if \(type !== 'success'\) return;/);
  });

  it('shows no message when no policy has one', async () => {
    const { routes } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save([policy('p1')]), r);
    expect(r.json.mock.calls[0][0].warning).toBeUndefined();
  });

  it('does not touch the save of another setting', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req({ property: 'ngdpbase.applicationName', value: JSON.stringify('Wiki') }), r);
    expect(configManager.setProperty).toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].warning).toBeUndefined();
  });
});

describe('loading Admin → Configuration with policies in force that have problems (#2278)', () => {
  it('hands the policy id and the validator message to the page for the policies row', async () => {
    const { routes } = await makeRoutes([policy('from-custom-config', { or: [] })]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    const data = r.render.mock.calls[0][1];
    expect(data.configProblems[KEY]).toEqual(["'from-custom-config': 'or' is empty; list at least one condition, or remove the condition"]);
  });

  it('shows nothing when the policies are fine', async () => {
    const { routes } = await makeRoutes([policy('p1')]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems).toEqual({});
  });
});

describe('the policies add-ons ship (#2278)', () => {
  it('only name permissions their own definitions or the core defaults define', () => {
    const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
    const files = ['config/app-default-config.json', ...readdirSync('addons').map((a) => `addons/${a}/config/default-config.json`).filter((f) => existsSync(f))];
    const configs = files.map(read);
    const defined = new Set(configs.flatMap((c) => Object.keys((c['ngdpbase.permissions.definitions'] ?? {}) as object)));
    const unknown = files.flatMap((f, i) => ((configs[i][KEY] ?? []) as { id: string; actions: string[] }[])
      .flatMap((p) => p.actions.filter((a) => a !== '*' && !defined.has(a)).map((a) => `${f} '${p.id}': ${a}`)));
    expect(unknown).toEqual([]);
    expect(configs.filter((c) => c[KEY]).length).toBeGreaterThan(1); // core plus at least one add-on
  });
});

describe('the shipped policies', () => {
  it('have no problems, so saving them unchanged is not refused', async () => {
    const shipped = JSON.parse(readFileSync('config/app-default-config.json', 'utf8')) as Record<string, unknown>;
    const { routes } = await makeRoutes([], shipped['ngdpbase.access.resource-types'], shipped['ngdpbase.permissions.definitions']);
    const r = res();
    await routes.adminUpdateConfiguration(save(shipped[KEY] as unknown[]), r);
    expect(r.json.mock.calls[0][0]).toEqual(expect.objectContaining({ success: true }));
  });
});

describe('ngdpbase.access.rule-combining-algorithm (#2330)', () => {
  const ALGORITHM = 'ngdpbase.access.rule-combining-algorithm';
  const saveAlgorithm = (value: unknown) => req({ property: ALGORITHM, value: JSON.stringify(value) });

  it.each(['permit-overrides', 'first-applicable', '', 7, null])('refuses %j on save and writes nothing', async (value) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(saveAlgorithm(value), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    expect(String(r.json.mock.calls[0][0].error)).toContain('the only value accepted is "deny-overrides"');
  });

  it('saves deny-overrides', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(saveAlgorithm('deny-overrides'), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(ALGORITHM, 'deny-overrides', adminUser);
  });

  it('is shown above the policies with the plain sentence', async () => {
    const { routes } = await makeRoutes([policy('p1')]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].ruleCombiningAlgorithm).toEqual({ value: 'deny-overrides', explanation: "Any matching deny wins. Order and priority don't matter." });
  });

  it('is reported on the key\'s row when the stored value is not deny-overrides', async () => {
    const { routes, configManager } = await makeRoutes([policy('p1')]);
    const getProperty = configManager.getProperty.getMockImplementation();
    configManager.getProperty.mockImplementation((k: string, d: unknown) => (k === ALGORITHM ? 'permit-overrides' : getProperty(k, d)));
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems[ALGORITHM][0]).toContain('the only value accepted is "deny-overrides"');
  });

  it('ships as deny-overrides, and no shipped policy has a priority or an old-shape condition', () => {
    const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
    const files = ['config/app-default-config.json', ...readdirSync('addons').map((a) => `addons/${a}/config/default-config.json`).filter((f) => existsSync(f))];
    expect(read('config/app-default-config.json')[ALGORITHM]).toBe('deny-overrides');
    const shipped = files.flatMap((f) => ((read(f)[KEY] ?? []) as Array<Record<string, unknown>>).map((p) => ({ f, p })));
    expect(shipped.filter(({ p }) => 'priority' in p).map(({ f, p }) => `${f} '${String(p.id)}'`)).toEqual([]);
    expect(shipped.filter(({ p }) => 'condition' in p && JSON.stringify(p.condition).includes('"attribute"')).map(({ p }) => String(p.id))).toEqual([]);
  });
});
