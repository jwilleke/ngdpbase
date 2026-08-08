/**
 * Read-only admin access (#1029).
 *
 * `admin-system` granted viewing and mutating together, so there was no way to
 * offer a look-but-don't-touch dashboard — which is what a public demo needs,
 * and why #969's trash view could not be shown to anyone.
 *
 * `admin-read` opens the GET screens. The mutating routes were deliberately
 * left alone, so the read-only guarantee is the ABSENCE of `admin-system`
 * rather than a new check on 50 handlers. These tests pin that: the mutation
 * cases are the ones that matter, because a regression there is a privilege
 * escalation and would otherwise be silent.
 */

import WikiRoutes from '../WikiRoutes';

const readOnlyAdmin = { username: 'admindemo', isAuthenticated: true, roles: ['demo-admin'] };
const fullAdmin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const createMockReq = (userContext: unknown = null) => ({
  params: {},
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/admin',
  originalUrl: '/admin',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
});

/**
 * @param granted permissions the caller holds. `demo-admin` holds admin-read
 *                and nothing else administrative.
 */
function makeRoutes(granted: string[]) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') {
        return {
          hasPermission: vi.fn((_u: string, p: string) => Promise.resolve(granted.includes(p))),
          // adminRoles renders the role × permission matrix from these.
          getRoles: () => new Map([['admin', { name: 'admin', permissions: [] }]]),
          getPermissions: () => new Map([['admin-read', 'View administration screens']])
        };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) =>
            key === 'ngdpbase.config.secret-keys' ? ['ngdpbase.session.secret'] : def
          ),
          getDefaultProperties: () => ({ 'ngdpbase.session.secret': 'top-secret' }),
          getCustomProperties: () => ({}),
          getAllProperties: () => ({ 'ngdpbase.session.secret': 'top-secret' })
        };
      }
      if (name === 'PageManager') return { provider: { getDeletedPages: () => [] } };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes;
}

/** Did the handler render its own screen, rather than an error page? */
function rendered(res: ReturnType<typeof createMockRes>, template: string): boolean {
  return res.render.mock.calls.some((c) => c[0] === template);
}

beforeEach(() => vi.clearAllMocks());

describe('admin-read opens the read-only screens (#1029)', () => {
  test.each([
    ['adminTrash', 'admin-trash'],
    ['adminConfiguration', 'admin-configuration']
  ])('%s renders for a caller holding only admin-read', async (handler, template) => {
    const res = createMockRes();
    const routes = makeRoutes(['admin-read']) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;
    await routes[handler](createMockReq(readOnlyAdmin), res);

    expect(rendered(res, template)).toBe(true);
  });

  test('the roles screen is viewable — the permission model is the point of the demo', async () => {
    const res = createMockRes();
    await makeRoutes(['admin-read']).adminRoles(createMockReq(readOnlyAdmin), res);

    expect(rendered(res, 'admin-roles')).toBe(true);
  });

  test('an anonymous caller still gets nothing', async () => {
    const res = createMockRes();
    await makeRoutes([]).adminTrash(createMockReq(null), res);

    expect(rendered(res, 'admin-trash')).toBe(false);
  });
});

describe('admin-read grants NO ability to change anything (#1029)', () => {
  // The important half. A regression here is a privilege escalation, and the
  // design relies on these handlers never having been touched.
  test.each([
    'adminCreateRole',
    'adminUpdateRole',
    'adminDeleteRole',
    'adminCreateUser',
    'adminUpdateUser',
    'adminDeleteUser',
    'adminUpdateConfiguration',
    'adminResetConfiguration',
    'adminSyncRequiredPages',
    'adminClearCache',
    'adminReindex',
    'purgeDeletedPage',
    'restoreDeletedPage'
  ])('%s refuses a caller holding only admin-read', async (handler) => {
    const res = createMockRes();
    const routes = makeRoutes(['admin-read']) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;
    await routes[handler](createMockReq(readOnlyAdmin), res);

    // Either a JSON/HTTP refusal or an error page — never the success path.
    const statuses = res.status.mock.calls.map((c) => c[0]);
    const refused = statuses.some((s) => s === 401 || s === 403 || s === 404)
      || res.redirect.mock.calls.length > 0
      || res.render.mock.calls.some((c) => String(c[0]).includes('error'));
    expect(refused).toBe(true);
  });
});

describe('control — the mutation tests are not passing vacuously', () => {
  test('adminCreateRole gets PAST the permission gate when admin-roles is held', async () => {
    // Without this, a handler that threw on a missing mock would look
    // "refused" and the whole block above would prove nothing.
    const res = createMockRes();
    await makeRoutes(['admin-read', 'admin-roles', 'admin-system'])
      .adminCreateRole(createMockReq(fullAdmin), res);

    const statuses = res.status.mock.calls.map((c) => c[0]);
    expect(statuses).not.toContain(403);
  });

  test('and refuses with 403 specifically when it is not', async () => {
    const res = createMockRes();
    await makeRoutes(['admin-read']).adminCreateRole(createMockReq(readOnlyAdmin), res);

    expect(res.status.mock.calls.map((c) => c[0])).toContain(403);
  });
});

describe('secrets stay masked for a read-only admin (#1029)', () => {
  test('the configuration screen offers no reveal control', async () => {
    const res = createMockRes();
    await makeRoutes(['admin-read']).adminConfiguration(createMockReq(readOnlyAdmin), res);

    const data = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(data.canRevealSecrets).toBe(false);
    expect(JSON.stringify(data)).not.toContain('top-secret');
  });

  test('and the reveal endpoint refuses them server-side', async () => {
    // The control being absent from the page is not a security boundary; this
    // is. A forged request must fail too.
    const res = createMockRes();
    await makeRoutes(['admin-read']).adminRevealSecret(
      { ...createMockReq(readOnlyAdmin), params: { key: 'ngdpbase.session.secret' } }, res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('top-secret');
  });

  test('a full admin still can reveal', async () => {
    const res = createMockRes();
    await makeRoutes(['admin-read', 'admin-system']).adminConfiguration(createMockReq(fullAdmin), res);

    const data = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(data.canRevealSecrets).toBe(true);
  });
});

describe('the admin role is unchanged (#1029)', () => {
  test('admin-system alone still opens the screens without admin-read', async () => {
    // Existing deployments must not depend on the new permission being present.
    const res = createMockRes();
    await makeRoutes(['admin-system']).adminTrash(createMockReq(fullAdmin), res);

    expect(rendered(res, 'admin-trash')).toBe(true);
  });
});
