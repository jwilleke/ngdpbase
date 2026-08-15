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
        'ngdpbase.auth.required-factors': overrides.requiredFactors ?? ['password'],
        ...overrides.properties
      };
      return values[key] ?? defaultValue;
    }),
    // #642 Iteration 3: AuthManager checks this before registering magic-link.
    // Defaults to true so existing tests behave as before; override per-test
    // to exercise the refuse-to-register path.
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

    test('getRequiredFactors() returns value from config', async () => {
      const cm = makeConfigManager({ requiredFactors: ['password', 'totp'] });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();

      expect(manager.getRequiredFactors()).toEqual(['password', 'totp']);
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
      expect(result).toEqual({ success: true, username: 'alice' });
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

        expect(result).toEqual({ success: true, username: 'alice', viaToken: VIA_TOKEN });
      });

      test('omits the key entirely when the provider returns none', async () => {
        // Absent, not `viaToken: undefined` — UserManager's scope check treats
        // any present token as a ceiling to enforce.
        const manager = await withStubProvider({ username: 'alice' });

        const result = await manager.authenticate('stub-token', { token: 'anything' });

        expect(result).toEqual({ success: true, username: 'alice' });
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
        .toEqual({ success: true, username: 'alice' });
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
