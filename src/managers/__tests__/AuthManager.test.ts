'use strict';

describe('AuthManager', () => {
  let AuthManager;
  let mockEngine;
  let mockConfigManager;

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key, defaultValue) => {
      const values = {
        'ngdpbase.auth.magic-link.enabled': overrides.magicLinkEnabled ?? false,
        'ngdpbase.auth.magic-link.ttl-minutes': 15,
        ...overrides.properties
      };
      return values[key] ?? defaultValue;
    }),
    // #642 Iteration 3: AuthManager checks this before registering magic-link.
    // Defaults to true so existing tests behave as before; override per-test
    // to exercise the refuse-to-register path.
    // #1523: the retired flat list is read only from custom config.
    getCustomProperty: vi.fn((key) => (overrides.custom ?? {})[key]),
    isBaseUrlExplicit: vi.fn().mockReturnValue(overrides.baseUrlExplicit ?? true),
    getBaseURL: vi.fn().mockReturnValue('https://wiki.example.com')
  });

  const makeMockEmailManager = () => ({
    send: vi.fn().mockResolvedValue(undefined),
    sendTo: vi.fn().mockResolvedValue(undefined),
    getProviderName: vi.fn().mockReturnValue('console'),
    isEnabled: vi.fn().mockReturnValue(false)
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../AuthManager');
    AuthManager = mod.default ?? mod;
  });

  const makeEngine = (configManager, extraManagers = {}) => ({
    getManager: vi.fn((name) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'EmailManager') return extraManagers.EmailManager ?? makeMockEmailManager();
      return extraManagers[name] ?? null;
    })
  });

  describe('initialization', () => {
    test('always registers password provider', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.isEnabled('password')).toBe(true);
    });

    test('does not register magic-link when disabled', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: false });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.isEnabled('magic-link')).toBe(false);
    });

    test('registers magic-link when enabled', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.isEnabled('magic-link')).toBe(true);
    });

    // #642 Iteration 3: refuse-to-register security check
    test('refuses to register magic-link when application.base-url is implicit', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true, baseUrlExplicit: false });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.isEnabled('magic-link')).toBe(false);
    });

    test('registers magic-link when enabled AND base-url is explicit', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true, baseUrlExplicit: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.isEnabled('magic-link')).toBe(true);
    });

  });

  // #1523 — what each method gives, lowered to the provider's code, and what a
  // set of satisfied factors amounts to.
  describe('factors (#1523)', () => {
    const PWD = { amr: ['pwd'], aal: 1 };
    const OTP = { amr: ['otp'], aal: 1 };
    const EMAIL = { amr: ['email'], aal: 1 };
    const PASSKEY = { amr: ['swk', 'user'], aal: 2, acr: 'phr' };
    const SECURITY_KEY = { amr: ['hwk', 'pin'], aal: 3, acr: 'phrh' };

    const started = async (properties = {}, custom = {}) => {
      const manager = new AuthManager(makeEngine(makeConfigManager({ properties, custom })));
      await manager.initialize();
      return manager;
    };
    const fake = (id, factor) => ({ id, displayName: id, factor, verify: vi.fn() });

    test('with no configuration, password is the one factor offered', async () => {
      const manager = await started();
      expect(manager.getFactors()).toEqual([{ provider: 'password', primary: true, amr: ['pwd'], aal: 1 }]);
    });

    test('a listed provider that is not registered is never offered', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'passkey' }] });
      expect(manager.getFactors().map(f => f.provider)).toEqual(['password']);
    });

    test('a disabled entry is never offered', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password', enabled: false }] });
      expect(manager.getFactors()).toEqual([]);
    });

    test('a delegated credential is never a factor, even when listed', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'agent-token' }] });
      manager.registerProvider({ id: 'agent-token', displayName: 'Agent', verify: vi.fn() });
      expect(manager.getFactors()).toEqual([]);
    });

    test('a provider an add-on registers late is offered once registered', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'totp' }] });
      expect(manager.getFactors()).toHaveLength(1);
      manager.registerProvider(fake('totp', { ...OTP, primary: false }), 'totp-addon');
      expect(manager.getFactors().map(f => f.provider)).toEqual(['password', 'totp']);
    });

    test('config may lower what a provider gives', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'key', aal: 2, acr: 'phr', primary: false }] });
      manager.registerProvider(fake('key', { ...SECURITY_KEY, primary: true }));
      expect(manager.getFactors()).toEqual([{ provider: 'key', primary: false, amr: ['hwk', 'pin'], aal: 2, acr: 'phr' }]);
    });

    test('config never raises what a provider gives: an overstated value is lowered to the code', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [
        { authproviderid: 'password', aal: 3, acr: 'phrh', amr: ['hwk'] },
        { authproviderid: 'totp', primary: true }
      ] });
      manager.registerProvider(fake('totp', { ...OTP, primary: false }));
      expect(manager.getFactors()).toEqual([
        { provider: 'password', primary: true, amr: ['pwd'], aal: 1 },
        { provider: 'totp', primary: false, amr: ['otp'], aal: 1 }
      ]);
    });

    test('"trust" is config-only and never reported as an amr value', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'idp', amr: ['trust'] }] });
      manager.registerProvider(fake('idp', { amr: [], aal: 1, primary: true }));
      expect(manager.getFactors()).toEqual([{ provider: 'idp', primary: true, amr: [], aal: 1 }]);
    });

    test('the retired required-factors list in custom config is converted', async () => {
      const manager = await started({}, { 'ngdpbase.auth.required-factors': ['password', 'totp'] });
      manager.registerProvider(fake('totp', { ...OTP, primary: false }));
      expect(manager.getFactors().map(f => [f.provider, f.primary])).toEqual([['password', true], ['totp', false]]);
    });

    test('the retired list is ignored when ngdpbase.auth.factors is also set in custom config', async () => {
      const factors = [{ authproviderid: 'password' }];
      const manager = await started({ 'ngdpbase.auth.factors': factors },
        { 'ngdpbase.auth.factors': factors, 'ngdpbase.auth.required-factors': ['password', 'totp'] });
      manager.registerProvider(fake('totp', { ...OTP, primary: false }));
      expect(manager.getFactors().map(f => f.provider)).toEqual(['password']);
    });

    describe('assess()', () => {
      let manager;
      beforeEach(async () => { manager = await started(); });

      test('a password alone is AAL1, one type, not MFA', () => {
        expect(manager.assess([PWD])).toEqual({ amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false });
      });

      test('a password and an OTP are two types: MFA at AAL2', () => {
        expect(manager.assess([PWD, OTP])).toEqual({ amr: ['pwd', 'otp'], aal: 2, acr: 'aal2', mfa: true });
      });

      test('email counts towards MFA but never lifts a sign-in above AAL1', () => {
        expect(manager.assess([PWD, EMAIL])).toEqual({ amr: ['pwd', 'email'], aal: 1, acr: 'aal1', mfa: true });
      });

      test('a password, an email link and an OTP reach AAL2 without the email', () => {
        expect(manager.assess([PWD, EMAIL, OTP]).aal).toBe(2);
      });

      test('two factors of one type are not MFA', () => {
        expect(manager.assess([PWD, { amr: ['kba'], aal: 1 }])).toMatchObject({ aal: 1, mfa: false });
      });

      test('a passkey alone is AAL2 and phishing-resistant', () => {
        expect(manager.assess([PASSKEY])).toMatchObject({ aal: 2, acr: 'phr' });
      });

      test('the strongest phishing resistance wins the acr', () => {
        expect(manager.assess([PASSKEY, SECURITY_KEY])).toMatchObject({ aal: 3, acr: 'phrh' });
      });

      test('nothing satisfied is AAL0', () => {
        expect(manager.assess([])).toMatchObject({ aal: 0, mfa: false, amr: [] });
      });
    });

    describe('required-aal (#1523)', () => {
      const withRoles = async (levels: Record<string, number>, properties = {}, operator: Record<string, number> = levels) => {
        const cm = makeConfigManager({ properties });
        const manager = new AuthManager(makeEngine(cm, { RoleManager: { roleRequiredAal: () => levels, operatorRequiredAal: () => operator } }));
        await manager.initialize();
        return manager;
      };

      test('a person needs the highest level among their roles', async () => {
        const manager = await withRoles({ admin: 2, reader: 1 });
        expect(manager.requiredAalFor(['reader'])).toBe(1);
        expect(manager.requiredAalFor(['reader', 'admin'])).toBe(2);
        expect(manager.requiredAalFor(['anonymous'])).toBe(0);
      });

      test('every role at AAL1 with a password available: nothing unreachable', async () => {
        const manager = await withRoles({ admin: 1, reader: 1 });
        expect(manager.unreachableRequiredAal()).toEqual([]);
      });

      test('AAL2 with only a password available is unreachable, named with what is offered', async () => {
        const manager = await withRoles({ admin: 2, reader: 1 });
        const problems = manager.unreachableRequiredAal();
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/role 'admin' requires AAL2.*reach AAL1.*password \(AAL1\)/);
      });

      test('AAL2 becomes reachable once a second factor of another type is available', async () => {
        const manager = await withRoles({ admin: 2 }, { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'totp' }] });
        manager.registerProvider(fake('totp', { amr: ['otp'], aal: 1, primary: false }), 'totp-addon');
        expect(manager.unreachableRequiredAal()).toEqual([]);
      });

      test('a SHIPPED level no factor reaches acts at what is reachable and degrades; it does not refuse the boot (#448)', async () => {
        const manager = await withRoles({ admin: 2, reader: 1 }, {}, {});
        expect(manager.checkRequiredAal()).toEqual([]);
        expect(manager.getManagerStatus()).toEqual(expect.objectContaining({ state: 'degraded', configKey: 'ngdpbase.auth.factors' }));
        expect(manager.requiredAalFor(['admin'])).toBe(1);
        expect(manager.rolesAtSignIn(['admin', 'reader'], 1)).toEqual({ kept: ['admin', 'reader'], steppedDown: [] });
      });

      test('an OPERATOR level no factor reaches refuses the boot, and is never lowered', async () => {
        const manager = await withRoles({ admin: 2, reader: 1 }, {}, { admin: 2 });
        expect(manager.checkRequiredAal()).toEqual([expect.stringMatching(/role 'admin' requires AAL2 \(set in app-custom-config.json\)/)]);
        expect(manager.requiredAalFor(['admin'])).toBe(2);
      });

      test('where AAL2 is reachable, a password session steps admin down and keeps the rest', async () => {
        const manager = await withRoles({ admin: 2, reader: 1 }, { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'key' }] }, {});
        manager.registerProvider(fake('key', { amr: ['swk', 'user'], aal: 2, acr: 'phr', primary: true }));
        expect(manager.checkRequiredAal()).toEqual([]);
        expect(manager.getManagerStatus().state).not.toBe('degraded');
        expect(manager.rolesAtSignIn(['admin', 'vault-owner', 'Authenticated'], 1)).toEqual({ kept: ['vault-owner', 'Authenticated'], steppedDown: ['admin'] });
        expect(manager.rolesAtSignIn(['admin', 'vault-owner'], 2)).toEqual({ kept: ['admin', 'vault-owner'], steppedDown: [] });
      });

      test('an email link never lifts the reachable level', async () => {
        const manager = await withRoles({ admin: 2 }, { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'mail' }] });
        manager.registerProvider(fake('mail', { amr: ['email'], aal: 1, primary: false }));
        expect(manager.unreachableRequiredAal()).toHaveLength(1);
      });
    });

    describe('signInRecord()', () => {
      test('a successful sign-in becomes provider, factors and their assessment', async () => {
        const manager = await started();
        const record = manager.signInRecord({ success: true, username: 'molly', provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at: 't' }] });
        expect(record).toEqual({ provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at: 't' }], amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false, at: expect.any(String) });
      });

      test('a failed result or a delegated credential never becomes a session record', async () => {
        const manager = await started();
        expect(manager.signInRecord({ success: false })).toBeNull();
        expect(manager.signInRecord({ success: true, username: 'bot', provider: 'agent-token', factors: [], viaToken: { id: 't', name: 'n', scopes: [] } })).toBeNull();
      });
    });

    test('a successful sign-in reports its provider and the factor satisfied, with its time', async () => {
      const userManager = { authenticateUser: vi.fn().mockResolvedValue({ username: 'alice' }), getUser: vi.fn().mockResolvedValue({ username: 'alice' }) };
      const manager = new AuthManager(makeEngine(makeConfigManager(), { UserManager: userManager }));
      await manager.initialize();
      const result = await manager.authenticate('password', { username: 'alice', password: 'secret' });
      expect(result).toMatchObject({ success: true, username: 'alice', provider: 'password' });
      expect(result.factors).toEqual([{ provider: 'password', amr: ['pwd'], aal: 1, at: expect.any(String) }]);
      expect(Number.isNaN(Date.parse(result.factors[0].at))).toBe(false);
    });
  });

  describe('authenticate()', () => {
    test('returns { success: false } for unknown providerId', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      const result = await manager.authenticate('unknown', { username: 'x', password: 'y' });
      expect(result).toEqual({ success: false });
    });

    test('delegates password auth to PasswordAuthProvider', async () => {
      const mockUserManager = {
        authenticateUser: vi.fn().mockResolvedValue({ username: 'alice' }),
        getUser: vi.fn().mockResolvedValue({ username: 'alice' })
      };
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
      await manager.initialize();

      const result = await manager.authenticate('password', { username: 'alice', password: 'secret' });
      expect(result).toMatchObject({ success: true, username: 'alice' });
      expect(mockUserManager.authenticateUser).toHaveBeenCalledWith('alice', 'secret');
    });

    test('returns { success: false } on bad password', async () => {
      const mockUserManager = {
        authenticateUser: vi.fn().mockResolvedValue(null)
      };
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
      await manager.initialize();

      const result = await manager.authenticate('password', { username: 'alice', password: 'wrong' });
      expect(result).toEqual({ success: false });
    });

    // #1048 — `viaToken` moved from a cast in AuthManager into `AuthResult`.
    // The compiler is the real guard for that (test files are excluded from
    // tsconfig, so a type assertion here would check nothing), but the
    // pass-through itself is runtime behaviour worth pinning: the scope ceiling
    // and page provenance both depend on this field surviving authenticate().
    // These pass before the change too — they exist so a later refactor cannot
    // quietly drop the field now that no cast marks the spot.
    describe('viaToken pass-through (#1048)', () => {
      const VIA_TOKEN = { id: 'tok_1', name: 'CI runner', scopes: ['page:write'] };

      const withStubProvider = async (verifyResult) => {
        const mockUserManager = { getUser: vi.fn().mockResolvedValue({ username: 'alice' }) };
        const cm = makeConfigManager();
        const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
        await manager.initialize();
        // Registered directly because there is no public registration API yet
        // — that is #1050.
        manager.providers.set('stub-token', {
          id: 'stub-token',
          displayName: 'Stub Token',
          verify: vi.fn().mockResolvedValue(verifyResult)
        });
        return manager;
      };

      test('carries viaToken through to the caller intact', async () => {
        const manager = await withStubProvider({ username: 'alice', viaToken: VIA_TOKEN });

        const result = await manager.authenticate('stub-token', { token: 'anything' });

        expect(result).toEqual({ success: true, username: 'alice', provider: 'stub-token', factors: [], viaToken: VIA_TOKEN });
      });

      test('omits the key entirely when the provider returns none', async () => {
        // Absent, not `viaToken: undefined` — UserManager's scope check treats
        // any present token as a ceiling to enforce.
        const manager = await withStubProvider({ username: 'alice' });

        const result = await manager.authenticate('stub-token', { token: 'anything' });

        expect(result).toEqual({ success: true, username: 'alice', provider: 'stub-token', factors: [] });
        expect('viaToken' in result).toBe(false);
      });

      test('drops viaToken when the user is barred from that provider', async () => {
        const mockUserManager = {
          getUser: vi.fn().mockResolvedValue({ username: 'alice', allowedAuthMethods: ['password'] })
        };
        const cm = makeConfigManager();
        const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
        await manager.initialize();
        manager.providers.set('stub-token', {
          id: 'stub-token',
          displayName: 'Stub Token',
          verify: vi.fn().mockResolvedValue({ username: 'alice', viaToken: VIA_TOKEN })
        });

        const result = await manager.authenticate('stub-token', { token: 'anything' });

        expect(result).toEqual({ success: false });
      });
    });

    test('delegates magic-link verify to MagicLinkAuthProvider', async () => {
      const mockUserManager = {
        getUserByEmail: vi.fn().mockResolvedValue({ username: 'alice', email: 'a@b.com' })
      };
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
      await manager.initialize();

      // Initiate to get a real token
      await manager.initiate('magic-link', {
        email: 'a@b.com',
        redirect: '/',
        baseUrl: 'http://localhost:3000'
      });

      // We can't know the token from outside, but we can verify that an unknown token fails
      const result = await manager.authenticate('magic-link', { token: 'notavalidtoken' });
      expect(result).toEqual({ success: false });
    });
  });

  describe('initiate()', () => {
    test('no-op for unknown providerId', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      // Should not throw
      await expect(manager.initiate('unknown', {})).resolves.toBeUndefined();
    });

    test('no-op for password provider (has no initiate)', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      await expect(manager.initiate('password', {})).resolves.toBeUndefined();
    });
  });

  describe('consumeToken()', () => {
    test('no-op for unknown providerId', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(() => manager.consumeToken('unknown', 'tok')).not.toThrow();
    });
  });

  describe('getProviders()', () => {
    test('returns array of registered providers', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      const providers = manager.getProviders();
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('password');
      expect(ids).toContain('magic-link');
    });
  });

  // #1049 — one dispatcher replaces getMagicLinkRedirect + getGoogleOIDCRedirect.
  describe('getFlowRedirect()', () => {
    test('returns "/" when the provider is not registered', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: false });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.getFlowRedirect('magic-link', 'sometoken')).toBe('/');
      expect(manager.getFlowRedirect('google-oidc', 'nonce')).toBe('/');
    });

    test('returns "/" for an unknown handle on a registered provider', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.getFlowRedirect('magic-link', 'no-such-token')).toBe('/');
    });

    test('returns "/" rather than throwing for a provider without the capability', async () => {
      // password has no flow to redirect back into. Degrading to the front page
      // is the deliberate choice here — see startFlow() for the opposite one.
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.getFlowRedirect('password', 'anything')).toBe('/');
    });

    test('dispatches to the named provider, carrying the stored destination', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      manager.providers.set('stub-flow', {
        id: 'stub-flow',
        displayName: 'Stub Flow',
        verify: vi.fn(),
        getFlowRedirect: vi.fn().mockReturnValue('/dashboard')
      });

      expect(manager.getFlowRedirect('stub-flow', 'handle-1')).toBe('/dashboard');
      expect(manager.providers.get('stub-flow').getFlowRedirect).toHaveBeenCalledWith('handle-1');
    });
  });

  // #1049 — throws where getFlowRedirect falls back, deliberately: there is no
  // sensible substitute for "where should the browser go".
  describe('startFlow()', () => {
    test('throws when the provider is not registered', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(() => manager.startFlow('google-oidc', { redirect: '/' }))
        .toThrow(/cannot start a redirect flow/);
    });

    test('throws when a registered provider has no startFlow', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(() => manager.startFlow('password', {})).toThrow(/cannot start a redirect flow/);
    });

    test('returns the provider URL and passes the context through', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      const startFlow = vi.fn().mockReturnValue('https://idp.example/authorize');
      manager.providers.set('stub-flow', {
        id: 'stub-flow', displayName: 'Stub Flow', verify: vi.fn(), startFlow
      });

      expect(manager.startFlow('stub-flow', { redirect: '/dashboard' }))
        .toBe('https://idp.example/authorize');
      expect(startFlow).toHaveBeenCalledWith({ redirect: '/dashboard' });
    });
  });

  // #1049 — three-state on purpose. The old provisionMagicLinkUser returned
  // false for a missing provider, conflating "no such capability" with "tried
  // and failed"; the route treats only false as fatal.
  describe('provisionIfNew()', () => {
    test('returns undefined when the provider is not registered', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: false });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(await manager.provisionIfNew('magic-link', 'tok')).toBeUndefined();
    });

    test('returns undefined when the provider cannot provision', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(await manager.provisionIfNew('password', 'tok')).toBeUndefined();
    });

    test('passes the provider verdict through unchanged', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      manager.providers.set('stub-flow', {
        id: 'stub-flow',
        displayName: 'Stub Flow',
        verify: vi.fn(),
        provisionIfNew: vi.fn().mockResolvedValue(false)
      });

      // false must survive as false — the route redirects the sign-in away on
      // it, and coercing it to undefined would let a failed provision through.
      expect(await manager.provisionIfNew('stub-flow', 'tok')).toBe(false);
    });
  });

  // #1050 — the built-ins now register through this same method, so these
  // cases guard the path every boot takes, not just the addon path.
  describe('registerProvider()', () => {
    const stub = (id: string, extra = {}) => ({
      id, displayName: `Stub ${id}`, verify: vi.fn().mockResolvedValue(null), ...extra
    });

    const bareManager = async () => {
      const manager = new AuthManager(makeEngine(makeConfigManager()));
      await manager.initialize();
      return manager;
    };

    test('registers a provider and makes it visible to the rest of the API', async () => {
      const manager = await bareManager();

      expect(manager.registerProvider(stub('addon-sso'), 'my-addon')).toBe(true);
      expect(manager.isEnabled('addon-sso')).toBe(true);
      expect(manager.getProviders().map((p) => p.id)).toContain('addon-sso');
    });

    test('the built-ins arrive through it — password is registered on a bare boot', async () => {
      const manager = await bareManager();
      expect(manager.isEnabled('password')).toBe(true);
    });

    describe('duplicate ids — first registration wins', () => {
      test('an addon cannot replace a built-in provider', async () => {
        // The security case for first-wins: last-wins would let a config change
        // swap out password verification for an addon's own verify().
        const manager = await bareManager();
        const incumbent = manager.getProviders().find((p) => p.id === 'password');
        const impostor = stub('password');

        expect(manager.registerProvider(impostor, 'evil-addon')).toBe(false);
        expect(manager.getProviders().find((p) => p.id === 'password')).toBe(incumbent);
      });

      test('rejects rather than throws, so one bad addon cannot fail the boot', async () => {
        const manager = await bareManager();
        manager.registerProvider(stub('addon-sso'), 'addon-a');
        expect(() => manager.registerProvider(stub('addon-sso'), 'addon-b')).not.toThrow();
      });
    });

    describe('malformed providers are refused at registration', () => {
      test('rejects a provider with no id', async () => {
        const manager = await bareManager();
        expect(manager.registerProvider({ displayName: 'x', verify: vi.fn() }, 'bad')).toBe(false);
        expect(manager.registerProvider(stub('   '), 'bad')).toBe(false);
      });

      test('rejects a provider with no verify()', async () => {
        // Registering it would move the failure from boot to a live sign-in,
        // which is a far worse place to discover it.
        const manager = await bareManager();
        expect(manager.registerProvider({ id: 'broken', displayName: 'x' }, 'bad')).toBe(false);
        expect(manager.isEnabled('broken')).toBe(false);
      });

      test('rejects a null provider without throwing', async () => {
        const manager = await bareManager();
        expect(manager.registerProvider(null, 'bad')).toBe(false);
      });
    });

    test('a late registration can authenticate like any other provider', async () => {
      // AddonsManager initializes after AuthManager, so every addon-contributed
      // provider is late by definition.
      const mockUserManager = { getUser: vi.fn().mockResolvedValue({ username: 'alice' }) };
      const manager = new AuthManager(makeEngine(makeConfigManager(), { UserManager: mockUserManager }));
      await manager.initialize();

      manager.registerProvider(
        stub('addon-sso', { verify: vi.fn().mockResolvedValue({ username: 'alice' }) }),
        'my-addon'
      );

      expect(await manager.authenticate('addon-sso', { token: 't' }))
        .toEqual({ success: true, username: 'alice', provider: 'addon-sso', factors: [] });
    });

    test('backup() reports a contributed provider alongside the built-ins', async () => {
      const manager = await bareManager();
      manager.registerProvider(stub('addon-sso'), 'my-addon');

      const backup = await manager.backup();
      expect(backup.data.providers).toContain('addon-sso');
      expect(backup.data.providers).toContain('password');
    });
  });

  describe('isEnabled()', () => {
    test('returns true for registered provider', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.isEnabled('password')).toBe(true);
    });

    test('returns false for unregistered provider', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.isEnabled('unknown-provider')).toBe(false);
    });
  });

  describe('backup() and restore()', () => {
    test('backup() returns provider list', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      const backup = await manager.backup();
      expect(backup.managerName).toBe('AuthManager');
      expect((backup.data as { providers: string[] }).providers).toContain('password');
    });

    test('restore() resolves without error', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      await expect(manager.restore({ managerName: 'AuthManager', timestamp: '', data: null })).resolves.toBeUndefined();
    });
  });
});
