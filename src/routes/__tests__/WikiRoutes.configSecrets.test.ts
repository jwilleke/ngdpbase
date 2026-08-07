/**
 * Admin Configuration secret masking.
 *
 * Before this, `/admin/configuration` rendered every value verbatim — on a real
 * instance that meant the session secret (enough to forge cookies), the SMTP
 * credential and API keys, all in the page source.
 *
 * The property that matters is not "the value looks masked" but "the value is
 * NEVER SENT". A `type="password"` input would still ship the secret to the
 * browser, where view-source defeats it. So these tests assert on what reaches
 * the template, not on markup.
 */

import WikiRoutes from '../WikiRoutes';

const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const readOnlyUser = { username: 'demo', isAuthenticated: true, roles: ['demo-admin'] };

const SECRET_KEYS = [
  'ngdpbase.session.secret',
  'ngdpbase.mail.provider.smtp.pass',
  'ngdpbase.dawarichCompat.apiKey'
];

const CONFIG = {
  'ngdpbase.application-name': 'ngdp-instance',
  'ngdpbase.server.port': 3000,
  'ngdpbase.session.secret': 'super-secret-session-value',
  'ngdpbase.mail.provider.smtp.pass': 're_live_key_value',
  'ngdpbase.dawarichCompat.apiKey': ''
};

const createMockReq = (userContext: unknown = null, params: Record<string, string> = {}) => ({
  params,
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/admin/configuration',
  originalUrl: '/admin/configuration',
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
  setHeader: vi.fn().mockReturnThis()
});

function makeRoutes(opts: { canReveal?: boolean; secretKeys?: unknown } = {}) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) => {
            if (key === 'ngdpbase.config.secret-keys') {
              return opts.secretKeys !== undefined ? opts.secretKeys : SECRET_KEYS;
            }
            return key in CONFIG ? (CONFIG as Record<string, unknown>)[key] : def;
          }),
          getDefaultProperties: () => ({ ...CONFIG }),
          getCustomProperties: () => ({ 'ngdpbase.session.secret': 'super-secret-session-value' }),
          getAllProperties: () => ({ ...CONFIG })
        };
      }
      if (name === 'UserManager') {
        return { hasPermission: vi.fn().mockResolvedValue(opts.canReveal ?? true) };
      }
      return null;
    })
  };

  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes;
}

/** Every string anywhere in the data handed to the template. */
function renderedStrings(res: ReturnType<typeof createMockRes>): string {
  return JSON.stringify(res.render.mock.calls[0][1]);
}

describe('GET /admin/configuration — secret values are never sent', () => {
  test('strips listed secrets from every property map', async () => {
    const res = createMockRes();
    await makeRoutes().adminConfiguration(createMockReq(adminUser), res);

    const payload = renderedStrings(res);
    expect(payload).not.toContain('super-secret-session-value');
    expect(payload).not.toContain('re_live_key_value');
  });

  test('strips from customProperties too, not just merged', async () => {
    // The screen renders three separate maps; masking one and forgetting
    // another leaks the value just as completely.
    const res = createMockRes();
    await makeRoutes().adminConfiguration(createMockReq(adminUser), res);

    const data = res.render.mock.calls[0][1] as Record<string, Record<string, unknown>>;
    expect(data.customProperties['ngdpbase.session.secret']).toBeNull();
    expect(data.defaultProperties['ngdpbase.session.secret']).toBeNull();
    expect(data.mergedProperties['ngdpbase.session.secret']).toBeNull();
  });

  test('leaves non-secret values untouched', async () => {
    const res = createMockRes();
    await makeRoutes().adminConfiguration(createMockReq(adminUser), res);

    const data = res.render.mock.calls[0][1] as Record<string, Record<string, unknown>>;
    expect(data.mergedProperties['ngdpbase.application-name']).toBe('ngdp-instance');
    expect(data.mergedProperties['ngdpbase.server.port']).toBe(3000);
  });

  test('reports whether a secret is set without revealing it', async () => {
    // "Is SMTP configured?" must be answerable without unmasking a credential.
    const res = createMockRes();
    await makeRoutes().adminConfiguration(createMockReq(adminUser), res);

    const data = res.render.mock.calls[0][1] as Record<string, Record<string, boolean>>;
    expect(data.secretIsSet['ngdpbase.mail.provider.smtp.pass']).toBe(true);
    expect(data.secretIsSet['ngdpbase.dawarichCompat.apiKey']).toBe(false);
  });

  test('passes canRevealSecrets so the view can omit the reveal control', async () => {
    // Today the screen itself still requires admin-system, so everyone who can
    // see it can also reveal. This flag is what lets a future read-only admin
    // role (admin-read) see the screen with no way to unmask — the view renders
    // the button only when it is true.
    const res = createMockRes();
    await makeRoutes({ canReveal: true }).adminConfiguration(createMockReq(adminUser), res);

    const data = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(data.canRevealSecrets).toBe(true);
  });

  test('refuses a caller without admin-system, leaking nothing', async () => {
    // The denial path renders an error template, so asserting "render not
    // called" would be wrong — what matters is that no secret is in whatever
    // does get rendered.
    const res = createMockRes();
    await makeRoutes({ canReveal: false }).adminConfiguration(createMockReq(readOnlyUser), res);

    expect(res.render.mock.calls[0][0]).not.toBe('admin-configuration');
    expect(JSON.stringify(res.render.mock.calls)).not.toContain('super-secret-session-value');
  });
});

describe('GET /api/admin/config/secret/:key — reveal', () => {
  test('returns the value for an admin who may reveal', async () => {
    const res = createMockRes();
    await makeRoutes({ canReveal: true }).adminRevealSecret(
      createMockReq(adminUser, { key: 'ngdpbase.session.secret' }), res
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, value: 'super-secret-session-value' })
    );
  });

  test('refuses a read-only admin', async () => {
    // The whole point of admin-read: sees the screen, cannot unmask.
    const res = createMockRes();
    await makeRoutes({ canReveal: false }).adminRevealSecret(
      createMockReq(readOnlyUser, { key: 'ngdpbase.session.secret' }), res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('super-secret-session-value');
  });

  test('refuses an anonymous caller', async () => {
    const res = createMockRes();
    await makeRoutes().adminRevealSecret(
      createMockReq(null, { key: 'ngdpbase.session.secret' }), res
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('refuses a key that is not on the deny-list', async () => {
    // Otherwise this is a general config-read API that bypasses the screen.
    const res = createMockRes();
    await makeRoutes({ canReveal: true }).adminRevealSecret(
      createMockReq(adminUser, { key: 'ngdpbase.application-name' }), res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('secret-keys list handling', () => {
  test('a missing or malformed list masks nothing rather than throwing', async () => {
    const res = createMockRes();
    await makeRoutes({ secretKeys: 'not-an-array' }).adminConfiguration(createMockReq(adminUser), res);
    expect(res.render).toHaveBeenCalled();
  });

  test('does not lowercase keys — camelCase keys must still match', async () => {
    // ngdpbase config keys are case-sensitive (ngdpbase.dawarichCompat.apiKey).
    // Normalising case, as some implementations do, silently stops matching.
    const res = createMockRes();
    await makeRoutes({ secretKeys: ['  ngdpbase.dawarichCompat.apiKey  '] })
      .adminConfiguration(createMockReq(adminUser), res);

    const data = res.render.mock.calls[0][1] as Record<string, Record<string, unknown>>;
    expect(data.mergedProperties).toHaveProperty('ngdpbase.dawarichCompat.apiKey', null);
  });
});
