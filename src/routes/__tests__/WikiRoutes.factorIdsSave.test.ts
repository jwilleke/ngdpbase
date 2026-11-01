/**
 * #1523 — the configuration screen refuses saving an `ngdpbase.auth.factors`
 * entry that is on and names an id no provider could register, since the next
 * start would refuse with it. The rule is AuthManager's own `checkFactorIds`
 * one: core ids, `oidc:` ids from config, and registered providers are known.
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';

const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const FACTORS = 'ngdpbase.auth.factors';

function makeRoutes() {
  const configManager = {
    getProperty: vi.fn((_key: string, def: unknown) => def),
    getUnresolvedProperty: vi.fn((key: string, def: unknown) =>
      key === 'ngdpbase.auth.oidc.providers' ? { work: { 'client-secret': '$WORK_SECRET' } } : def),
    getAllProperties: () => ({}),
    getEnvControlledKeys: () => ({}),
    setProperty: vi.fn().mockResolvedValue(undefined)
  };
  const engine: { getManager: (name: string) => unknown } = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      if (name === 'AuthManager') return authManager;
      return null;
    }
  };
  const authManager = new AuthManager(engine);
  authManager.registerProvider({
    id: 'addon-key', displayName: 'Add-on key', verify: vi.fn(),
    factor: { primary: true, amr: ['hwk'], aal: 2 }
  }, 'addon');
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes as unknown as { freshEnough: () => Promise<boolean> }, 'freshEnough').mockResolvedValue(true);
  return { routes, configManager };
}

const req = (value: unknown) => ({
  params: {},
  query: {},
  body: { property: FACTORS, value: JSON.stringify(value) },
  session: { csrfToken: 'tok' },
  path: '/admin/configuration',
  originalUrl: '/admin/configuration',
  protocol: 'http',
  headers: { 'x-requested-with': 'XMLHttpRequest' },
  xhr: true,
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: adminUser
});

const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis()
});

describe('saving ngdpbase.auth.factors (#1523)', () => {
  it('refuses an enabled entry naming an unknown id, naming it, and writes nothing', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req([{ authproviderid: 'password' }, { authproviderid: 'pasword' }]), r);
    expect(configManager.setProperty).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(400);
    const error = String(r.json.mock.calls[0][0].error);
    expect(error).toContain("ngdpbase.auth.factors entry 'pasword' names no provider");
    expect(error).not.toContain('WORK_SECRET');
  });

  it('saves a disabled entry naming an unknown id, with a warning', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req([{ authproviderid: 'password' }, { authproviderid: 'pasword', enabled: false }]), r);
    expect(configManager.setProperty).toHaveBeenCalledTimes(1);
    const body = r.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.warning).toMatch(/entry 'pasword' names no provider.*The entry is off, so it is ignored/);
  });

  it('saves known ids: core, an oidc: name from config, a registered add-on, an old alias', async () => {
    const { routes, configManager } = makeRoutes();
    const r = res();
    await routes.adminUpdateConfiguration(req([
      { authproviderid: 'password' }, { authproviderid: 'passkey' }, { authproviderid: 'oidc:work' },
      { authproviderid: 'addon-key' }, { authproviderid: 'email-link' }
    ]), r);
    expect(configManager.setProperty).toHaveBeenCalledTimes(1);
    expect(r.json).toHaveBeenCalledWith({ success: true, message: 'Configuration updated successfully' });
  });
});
