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

  describe('getMagicLinkRedirect()', () => {
    test('returns "/" when magic-link provider not registered', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: false });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.getMagicLinkRedirect('sometoken')).toBe('/');
    });

    test('returns token redirect from registered provider', async () => {
      const cm = makeConfigManager({ magicLinkEnabled: true });
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      const redirect = manager.getMagicLinkRedirect('no-such-token');
      expect(typeof redirect).toBe('string');
    });
  });

  describe('getGoogleOIDCRedirect()', () => {
    test('returns "/" when google-oidc provider not registered', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      expect(manager.getGoogleOIDCRedirect('nonce')).toBe('/');
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
