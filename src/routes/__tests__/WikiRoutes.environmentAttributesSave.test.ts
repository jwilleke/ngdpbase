/**
 * Admin → Configuration checks ngdpbase.access.environment-attributes on save and on
 * load (#2261 slice 4), with PolicyValidator's own messages, as it does the policies (#2278/#2281).
 */

import WikiRoutes from '../WikiRoutes';
import PolicyValidator from '../../managers/PolicyValidator';

const KEY = 'ngdpbase.access.environment-attributes';
const POLICIES = 'ngdpbase.access.policies';
const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const PAGE_ATTRIBUTES = { owner: { type: 'identity' }, 'system-category': { type: 'string' } };

async function makeRoutes(inForce: unknown = null, resourceTypes: unknown = { page: { attributes: PAGE_ATTRIBUTES } }, definitions: unknown = { 'page-read': {}, 'page-edit': {} }) {
  const config: Record<string, unknown> = { [POLICIES]: [], ...(inForce === null ? {} : { [KEY]: inForce }), 'ngdpbase.access.resource-types': resourceTypes, 'ngdpbase.permissions.definitions': definitions };
  const configManager = {
    getProperty: vi.fn((k: string, d: unknown) => (k in config ? config[k] : d)),
    getDefaultProperties: () => ({}),
    getCustomProperties: () => ({}),
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
const save = (value: unknown) => req({ property: KEY, value: JSON.stringify(value) });

const SHIPPED = { 'is-business-hours': { type: 'boolean', from: 'schedule:business-hours' } };

describe('saving ngdpbase.access.environment-attributes (#2261 slice 4)', () => {
  it.each([
    ['a type that is not boolean', { x: { type: 'string', from: 'config:a.b' } }, 'boolean only'],
    ['a source that is neither schedule: nor config:', { x: { type: 'boolean', from: 'frontmatter:a' } }, 'start it with schedule: or config:'],
    ['a config: with no key', { x: { type: 'boolean', from: 'config:' } }, 'no key'],
    ['a value that is not an object', ['x'], 'must be an object']
  ])('refuses %s and writes nothing', async (_name, value, message) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save(value), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    expect(String(r.json.mock.calls[0][0].error)).toContain(message);
  });

  it('accepts a secret key: any configuration key may be read', async () => {
    const { routes, configManager } = await makeRoutes();
    const value = { ...SHIPPED, probe: { type: 'boolean', from: 'config:ngdpbase.session.secret' } };
    const r = res();
    await routes.adminUpdateConfiguration(save(value), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, value, adminUser);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('loading Admin → Configuration with environment attributes in force', () => {
  it('hands the problem to the page for that key\'s row', async () => {
    const { routes } = await makeRoutes({ x: { type: 'string', from: 'config:a.b' } });
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems[KEY].join(' ')).toContain('boolean only');
  });

  it('shows nothing when they are fine', async () => {
    const { routes } = await makeRoutes(SHIPPED);
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems).toEqual({});
  });
});
