/**
 * Admin → Configuration refuses an unreadable `ngdpbase.access.narrowed-role-writes` on save, in plain words,
 * and flags one that is already in force (#2270). A value read as empty would lift a permission reduction
 * without a sign.
 */

import WikiRoutes from '../WikiRoutes';
import PolicyValidator from '../../managers/PolicyValidator';

const KEY = 'ngdpbase.access.narrowed-role-writes';
const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

async function makeRoutes(inForce: unknown = []) {
  const config: Record<string, unknown> = { 'ngdpbase.access.policies': [], [KEY]: inForce };
  const configManager = {
    getProperty: vi.fn((k: string, d: unknown) => (k in config ? config[k] : d)),
    getUnresolvedProperty: vi.fn((k: string, d: unknown) => (k in config ? config[k] : d)),
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
const save = (value: unknown) => req({ property: KEY, value: typeof value === 'string' ? value : JSON.stringify(value) });

describe('saving ngdpbase.access.narrowed-role-writes (#2270)', () => {
  it.each([
    ['a string that is not a list', 'editor:page-delete', 'list'],
    ['an object, not a list', {}, 'list'],
    ['a misspelt write', [{ role: 'editor', action: 'page-delet' }], "'page-delet'"],
    ['a role in capitals', [{ role: 'Editor', action: 'page-delete' }], "'Editor'"],
    ['entries that are not pairs', [null, 1, 'x'], 'entry 1'],
    ['a write the role never had', [{ role: 'contributor', action: 'page-delete' }], 'page-edit']
  ])('refuses %s and writes nothing', async (_name, value, message) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save(value), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain('not saved');
    expect(error).toContain(message);
  });

  it('redirects a form post with the problem in the error', async () => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration({ ...save([{ role: 'Editor', action: 'page-delete' }]), xhr: false, headers: {} }, r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(decodeURIComponent(String(r.redirect.mock.calls[0][0]))).toContain("'Editor'");
  });

  it.each([
    ['good pairs', [{ role: 'editor', action: 'page-delete' }, { role: 'contributor', action: 'page-edit' }]],
    ['an empty list, which gives every write back', []]
  ])('saves %s', async (_name, value) => {
    const { routes, configManager } = await makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(save(value), r);
    expect(configManager.setProperty).toHaveBeenCalledWith(KEY, value, adminUser);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('loading Admin → Configuration with an unreadable ngdpbase.access.narrowed-role-writes (#2270)', () => {
  it("hands the problem to the page for that key's row", async () => {
    const { routes } = await makeRoutes([{ role: 'Editor', action: 'page-delete' }]);
    const r = res();
    await routes.adminConfiguration(req(), r);
    expect(r.render.mock.calls[0][1].configProblems[KEY].join(' ')).toContain("'Editor'");
  });

  it('shows nothing when the pairs are fine, or there are none', async () => {
    for (const value of [[{ role: 'editor', action: 'page-delete' }], []]) {
      const { routes } = await makeRoutes(value);
      const r = res();
      await routes.adminConfiguration(req(), r);
      expect(r.render.mock.calls[0][1].configProblems).toEqual({});
    }
  });
});
