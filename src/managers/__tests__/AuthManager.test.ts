'use strict';

import { hashPassword } from '../../utils/passwordHash';

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
    getUnresolvedProperty: vi.fn((key, defaultValue) => (overrides.properties ?? {})[key] ?? defaultValue),
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

    describe('the boot check of factor ids (#1523 Q1)', () => {
      test('an enabled entry naming an id no provider could register refuses the boot, naming it and the known ids', async () => {
        const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'pasword' }] });
        const problems = manager.checkFactorIds();
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^ngdpbase\.auth\.factors entry 'pasword' names no provider\. Known ids: .*\bpassword\b/);
        expect(problems[0]).toContain('passkey');
      });

      test('a disabled entry naming an unknown id only warns', async () => {
        const logger = (await import('../../utils/logger')).default;
        const warn = vi.spyOn(logger, 'warn');
        const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'pasword', enabled: false }] });
        expect(manager.checkFactorIds()).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/ngdpbase\.auth\.factors entry 'pasword' names no provider.*The entry is off, so it is ignored/));
        warn.mockRestore();
      });

      test('an id an add-on registers is known once it has registered', async () => {
        const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'addon-key' }] });
        expect(manager.checkFactorIds()).toHaveLength(1);
        manager.registerProvider(fake('addon-key', { ...PASSKEY, primary: true }), 'addon');
        expect(manager.checkFactorIds()).toEqual([]);
      });

      test('a core provider this site has off, and a configured outside provider, are not unknown', async () => {
        const manager = await started({
          'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'passkey' }, { authproviderid: 'cloudflare-access' }, { authproviderid: 'oidc:google' }, { authproviderid: 'oidc:work' }],
          'ngdpbase.auth.oidc.providers': { work: { enabled: false } }
        });
        expect(manager.getFactors().map(f => f.provider)).toEqual(['password']);
        expect(manager.checkFactorIds()).toEqual([]);
      });

      test('an outside provider id not in ngdpbase.auth.oidc.providers is unknown', async () => {
        const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'oidc:wrok' }] });
        expect(manager.checkFactorIds()).toEqual([expect.stringMatching(/entry 'oidc:wrok' names no provider/)]);
      });

      test('every provider core ships is known, registered or not', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const dir = path.join(__dirname, '../../providers');
        const ids = fs.readdirSync(dir).filter(f => f.endsWith('AuthProvider.ts'))
          .map(f => /readonly id = '([^']+)'/.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[1])
          .filter(Boolean);
        expect(ids.length).toBeGreaterThan(5);
        const manager = await started({ 'ngdpbase.auth.factors': ids.map(id => ({ authproviderid: id })) });
        expect(manager.checkFactorIds()).toEqual([]);
      });

      test('an old id is read as the provider it was renamed to', async () => {
        const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'email-link' }, { authproviderid: 'google-oidc' }] });
        expect(manager.checkFactorIds()).toEqual([]);
      });
    });

    test('a delegated credential is never a factor, even when listed', async () => {
      const manager = await started({ 'ngdpbase.auth.factors': [{ authproviderid: 'agent-token' }] });
      (manager as unknown as { registerCoreProvider: (p: unknown) => boolean }).registerCoreProvider({ id: 'agent-token', displayName: 'Agent', verify: vi.fn() });
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

      describe('step-up (#1525)', () => {
        // #1638: the permission entry carries `step-up`; the window stays in ngdpbase.auth.step-up.
        const STEP_UP = {
          'ngdpbase.auth.step-up': { 'max-age-minutes': 5 },
          'ngdpbase.permissions.definitions': {
            'account-security': { description: 'own account', 'step-up': true },
            'config-manage': { description: 'config', 'step-up': true },
            'page-edit': { description: 'edit pages' }
          }
        };
        const NOW = Date.parse('2026-10-04T12:00:00Z');
        const factor = (aal: number, minutesAgo: number) => ({ provider: aal >= 2 ? 'passkey' : 'password', amr: aal >= 2 ? ['hwk', 'user'] : ['pwd'], aal, at: new Date(NOW - minutesAgo * 60_000).toISOString() });
        const signIn = (...factors: ReturnType<typeof factor>[]) => ({ provider: 'password', factors, amr: [], aal: 1, acr: 'aal1', mfa: false, at: '' });

        test('a permission not on the list never asks', async () => {
          const m = await withRoles({ admin: 2, reader: 1 }, STEP_UP);
          expect(m.stepUpNeeded('page-edit', signIn(factor(1, 60)), ['reader'], false, NOW)).toBe(false);
        });

        test('a factor within the window that reaches the roles\' level is fresh; an older one is not', async () => {
          const m = await withRoles({ admin: 2, reader: 1 }, STEP_UP);
          expect(m.stepUpNeeded('account-security', signIn(factor(1, 2)), ['reader'], false, NOW)).toBe(false);
          expect(m.stepUpNeeded('account-security', signIn(factor(1, 6)), ['reader'], false, NOW)).toBe(true);
          expect(m.stepUpNeeded('account-security', undefined, ['reader'], false, NOW)).toBe(true);
        });

        test('an admin needs a fresh factor at their level: a fresh password is not enough, a fresh passkey is', async () => {
          const m = await withRoles({ admin: 2, reader: 1 }, STEP_UP);
          expect(m.stepUpNeeded('config-manage', signIn(factor(1, 1)), ['admin'], false, NOW)).toBe(true);
          expect(m.stepUpNeeded('config-manage', signIn(factor(1, 1), factor(2, 3)), ['admin'], false, NOW)).toBe(false);
        });

        test('a known device (aal 0) never counts, and a delegated credential never satisfies it', async () => {
          const m = await withRoles({ admin: 2, reader: 1 }, STEP_UP);
          expect(m.stepUpNeeded('account-security', signIn(factor(0, 0)), ['reader'], false, NOW)).toBe(true);
          expect(m.stepUpNeeded('account-security', signIn(factor(2, 0)), ['reader'], true, NOW)).toBe(true);
        });

        test('no policy, or a zero window, turns step-up off', async () => {
          const off = await withRoles({ reader: 1 }, {});
          expect(off.stepUpNeeded('account-security', undefined, ['reader'], false, NOW)).toBe(false);
          const zero = await withRoles({ reader: 1 }, { 'ngdpbase.auth.step-up': { 'max-age-minutes': 0, permissions: ['account-security'] } });
          expect(zero.stepUpNeeded('account-security', undefined, ['reader'], false, NOW)).toBe(false);
        });

        test('#2193: whether a sign-in is fresh enough for any step-up permission, for a page waiting on its prompt', async () => {
          const m = await withRoles({ admin: 2, reader: 1 }, STEP_UP);
          expect(m.signInFresh(signIn(factor(1, 2)), ['reader'], false, NOW)).toBe(true);
          expect(m.signInFresh(signIn(factor(1, 6)), ['reader'], false, NOW)).toBe(false);
          expect(m.signInFresh(undefined, ['reader'], false, NOW)).toBe(false);
          // At the roles' level: a fresh password is not enough for an admin.
          expect(m.signInFresh(signIn(factor(1, 1)), ['admin'], false, NOW)).toBe(false);
          expect(m.signInFresh(signIn(factor(2, 1)), ['admin'], false, NOW)).toBe(true);
          // A delegated credential never is; with step-up off, every sign-in is.
          expect(m.signInFresh(signIn(factor(2, 0)), ['reader'], true, NOW)).toBe(false);
          const off = await withRoles({ reader: 1 }, {});
          expect(off.signInFresh(undefined, ['reader'], false, NOW)).toBe(true);
        });

        test('#1638: a step-up permissions list in a custom config (the old shape) is still honoured', async () => {
          const legacy = await withRoles({ reader: 1 }, { 'ngdpbase.auth.step-up': { 'max-age-minutes': 5, permissions: ['account-security'] } });
          expect(legacy.stepUpNeeded('account-security', undefined, ['reader'], false, NOW)).toBe(true);
          expect(legacy.stepUpNeeded('page-edit', undefined, ['reader'], false, NOW)).toBe(false);
        });

        test('re-authenticating adds the factor, redoes the assessment and moves the sign-in time', async () => {
          const m = await withRoles({ reader: 1 }, STEP_UP);
          const before = signIn(factor(1, 30));
          const after = m.reauthenticated(before, { success: true, username: 'molly', provider: 'passkey', factors: [factor(2, 0)] });
          expect(after?.provider).toBe('password');
          expect(after?.factors).toHaveLength(2);
          expect(after?.aal).toBe(2);
          expect(Date.parse(after!.at)).toBeGreaterThan(Date.parse(before.factors[0].at));
          expect(m.reauthenticated(before as never, { success: false })).toBeNull();
        });
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

      describe('#1690 an account with no way to AAL2 holds its roles at AAL1', () => {
        const KEY_SITE = { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'key' }] };
        const withAccount = async (allowedAuthMethods: string[] | undefined) => {
          const cm = makeConfigManager({ properties: KEY_SITE });
          const manager = new AuthManager(makeEngine(cm, {
            RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
            UserManager: { getUser: async () => ({ username: 'admin', allowedAuthMethods }) }
          }));
          await manager.initialize();
          manager.registerProvider(fake('key', { amr: ['swk', 'user'], aal: 2, acr: 'phr', primary: true }));
          return manager;
        };

        test('the cap is what the account\'s allowed methods reach, never below 1', async () => {
          expect(await (await withAccount(['password', 'magic-link'])).aalCapFor('admin')).toBe(1);
          expect(await (await withAccount(['password', 'key'])).aalCapFor('admin')).toBe(2);
          expect(await (await withAccount(undefined)).aalCapFor('admin')).toBe(2);
          expect(await (await withAccount([])).aalCapFor('admin')).toBe(2);
          expect(await (await withAccount(['nothing-offered'])).aalCapFor('admin')).toBe(1);
        });

        test('a password session keeps admin when the account cannot reach AAL2', async () => {
          const m = await withAccount(['password']);
          const cap = await m.aalCapFor('admin');
          expect(m.rolesAtSignIn(['admin', 'reader'], 1, cap)).toEqual({ kept: ['admin', 'reader'], steppedDown: [] });
          expect(m.requiredAalFor(['admin'], cap)).toBe(1);
        });

        test('an account that can reach AAL2 still steps down on a password session', async () => {
          const m = await withAccount(['password', 'key']);
          const cap = await m.aalCapFor('admin');
          expect(m.rolesAtSignIn(['admin', 'reader'], 1, cap)).toEqual({ kept: ['reader'], steppedDown: ['admin'] });
        });

        test('step-up asks for the account\'s level, not one it can never reach', async () => {
          const cm = makeConfigManager({ properties: { ...KEY_SITE, 'ngdpbase.auth.step-up': { 'max-age-minutes': 5 }, 'ngdpbase.permissions.definitions': { 'config-manage': { description: 'c', 'step-up': true } } } });
          const m = new AuthManager(makeEngine(cm, { RoleManager: { roleRequiredAal: () => ({ admin: 2 }), operatorRequiredAal: () => ({}) } }));
          await m.initialize();
          m.registerProvider(fake('key', { amr: ['swk', 'user'], aal: 2, acr: 'phr', primary: true }));
          const now = Date.parse('2026-10-08T12:00:00Z');
          const fresh = { provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at: new Date(now - 60_000).toISOString() }], amr: [], aal: 1, acr: 'aal1', mfa: false, at: '' };
          expect(m.stepUpNeeded('config-manage', fresh as never, ['admin'], false, now)).toBe(true);
          expect(m.stepUpNeeded('config-manage', fresh as never, ['admin'], false, now, 1)).toBe(false);
        });
      });

      describe('#1690 allowed a passkey but none enrolled: keep the role, nag until one is added', () => {
        const PASSKEY_SITE = { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'passkey' }] };
        const withPasskeySite = async (enrolled: boolean) => {
          const cm = makeConfigManager({ properties: PASSKEY_SITE });
          const manager = new AuthManager(makeEngine(cm, {
            RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
            UserManager: { getUser: async () => ({ username: 'admin' }) }
          }));
          await manager.initialize();
          (manager as unknown as { registerCoreProvider: (p: unknown) => boolean }).registerCoreProvider(fake('passkey', { amr: ['hwk', 'user'], aal: 2, acr: 'phr', primary: true }));
          (manager as unknown as { credentials: unknown }).credentials = { list: () => (enrolled ? [{ kind: 'passkey' }] : []) };
          return manager;
        };

        test('not enrolled: AAL1 now, AAL2 once enrolled; admin kept and awaiting enrolment', async () => {
          const m = await withPasskeySite(false);
          const reach = await m.aalReachFor('admin');
          expect(reach).toEqual({ now: 1, ifEnrolled: 2 });
          expect(m.rolesAtSignIn(['admin', 'reader'], 1, reach.now)).toEqual({ kept: ['admin', 'reader'], steppedDown: [] });
          expect(m.rolesAwaitingEnrolment(['admin', 'reader'], reach)).toEqual(['admin']);
        });

        test('enrolled: no nag, and a password session steps admin down as before', async () => {
          const m = await withPasskeySite(true);
          const reach = await m.aalReachFor('admin');
          expect(reach).toEqual({ now: 2, ifEnrolled: 2 });
          expect(m.rolesAwaitingEnrolment(['admin', 'reader'], reach)).toEqual([]);
          expect(m.rolesAtSignIn(['admin', 'reader'], 1, reach.now)).toEqual({ kept: ['reader'], steppedDown: ['admin'] });
        });

        test('barred from passkeys: no nag — there is nothing to enrol', async () => {
          const m = await withPasskeySite(false);
          expect(m.rolesAwaitingEnrolment(['admin'], { now: 1, ifEnrolled: 1 })).toEqual([]);
        });
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
      const userManager = {
        storedPasswordHash: vi.fn().mockResolvedValue(await hashPassword('secret')),
        recordSignIn: vi.fn().mockResolvedValue(undefined),
        getUser: vi.fn().mockResolvedValue({ username: 'alice' })
      };
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
      // #1758: the provider checks the password itself, against the hash UserManager keeps.
      const mockUserManager = {
        storedPasswordHash: vi.fn().mockResolvedValue(await hashPassword('secret')),
        recordSignIn: vi.fn().mockResolvedValue(undefined),
        getUser: vi.fn().mockResolvedValue({ username: 'alice' })
      };
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm, { UserManager: mockUserManager }));
      await manager.initialize();

      const result = await manager.authenticate('password', { username: 'alice', password: 'secret' });
      expect(result).toMatchObject({ success: true, username: 'alice' });
      expect(mockUserManager.storedPasswordHash).toHaveBeenCalledWith('alice');
    });

    test('returns { success: false } on bad password', async () => {
      const mockUserManager = {
        storedPasswordHash: vi.fn().mockResolvedValue(await hashPassword('secret'))
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

    describe('#1664 a method the account may not use is never offered or enrolled', () => {
      const managerFor = async (allowedAuthMethods?: string[]) => {
        const cm = makeConfigManager();
        const manager = new AuthManager(makeEngine(cm, { UserManager: { getUser: vi.fn().mockResolvedValue({ username: 'admin', allowedAuthMethods }) } }));
        await manager.initialize();
        return manager;
      };

      test('allowedAuthMethods absent or empty means any provider', async () => {
        expect(await (await managerFor()).userMayUseProvider('admin', 'passkey')).toBe(true);
        expect(await (await managerFor([])).userMayUseProvider('admin', 'passkey')).toBe(true);
      });

      test('a list names the only providers the account may use', async () => {
        const m = await managerFor(['password']);
        expect(await m.userMayUseProvider('admin', 'password')).toBe(true);
        expect(await m.userMayUseProvider('admin', 'passkey')).toBe(false);
      });

      test('passkey enrolment is refused for an account that may not sign in with a passkey', async () => {
        const m = await managerFor(['password']);
        vi.spyOn(m as never, 'mayManageCredentials').mockResolvedValue(true);
        await expect(m.passkeyRegistrationOptions({ username: 'admin', roles: ['admin'], isAuthenticated: true }, 'admin', 'Admin'))
          .rejects.toThrow(/cannot sign in with a passkey/);
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

  // #1758: AuthManager is the one door for every check of a secret, and writes
  // the audit record of a sign-in method's failures and re-checks itself;
  // routes write none. A successful sign-in is recorded by completeSignIn.
  describe('authenticate() audits a sign-in method (#1758)', () => {
    const attempt = { ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0' };

    const setup = async (verifyResult: unknown) => {
      const audit = { logAuthentication: vi.fn().mockResolvedValue('a1') };
      const userManager = {
        getUser: vi.fn().mockResolvedValue({ username: 'alice' }),
        recordSignIn: vi.fn().mockResolvedValue(undefined)
      };
      const manager = new AuthManager(makeEngine(makeConfigManager(), { UserManager: userManager, AuditManager: audit }));
      await manager.initialize();
      // The password provider has a factor entry (a sign-in method); its check is stubbed here.
      vi.spyOn(manager.providers.get('password'), 'verify').mockResolvedValue(verifyResult);
      manager.providers.set('stub-token', { id: 'stub-token', displayName: 'Stub Token', verify: vi.fn().mockResolvedValue(verifyResult) });
      return { manager, audit, userManager };
    };

    test('a successful sign-in check writes no audit and no count: completeSignIn records it, once', async () => {
      const { manager, audit, userManager } = await setup({ username: 'alice' });

      const result = await manager.authenticate('password', { username: 'alice', password: 'pw' }, { ...attempt, purpose: 'sign-in' });

      expect(result.success).toBe(true);
      expect(audit.logAuthentication).not.toHaveBeenCalled();
      expect(userManager.recordSignIn).not.toHaveBeenCalled();
    });

    test('purpose defaults to sign-in: a success is not audited, a failure is', async () => {
      const ok = await setup({ username: 'alice' });
      await ok.manager.authenticate('password', { username: 'alice', password: 'pw' });
      expect(ok.audit.logAuthentication).not.toHaveBeenCalled();
      expect(ok.userManager.recordSignIn).not.toHaveBeenCalled();

      const bad = await setup(null);
      await bad.manager.authenticate('password', { username: 'alice', password: 'wrong' });
      expect(bad.audit.logAuthentication).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice', loginMethod: 'password' }), 'failure', 'password refused');
    });

    test('a refused sign-in is audited as a failure, named by the username tried, and not counted', async () => {
      const { manager, audit, userManager } = await setup(null);

      const result = await manager.authenticate('password', { username: 'alice', password: 'wrong' }, { ...attempt, purpose: 'sign-in' });

      expect(result).toEqual({ success: false });
      expect(audit.logAuthentication).toHaveBeenCalledWith(
        { username: 'alice', ipAddress: '203.0.113.7', userAgent: 'TestAgent/1.0', loginMethod: 'password' }, 'failure', 'password refused');
      expect(userManager.recordSignIn).not.toHaveBeenCalled();
    });

    test('a re-check is audited as one, success and failure, and is never counted as a sign-in', async () => {
      const ok = await setup({ username: 'alice' });
      await ok.manager.authenticate('password', { username: 'alice', password: 'pw' }, { ...attempt, purpose: 're-check' });
      expect(ok.audit.logAuthentication).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice', loginMethod: 'password' }), 'success', 're-check: password');
      expect(ok.userManager.recordSignIn).not.toHaveBeenCalled();

      const bad = await setup(null);
      await bad.manager.authenticate('password', { username: 'alice', password: 'wrong' }, { ...attempt, purpose: 're-check' });
      expect(bad.audit.logAuthentication).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice', loginMethod: 'password' }), 'failure', 're-check: password refused');
      expect(bad.userManager.recordSignIn).not.toHaveBeenCalled();
    });

    test('a request credential with no factor entry is not audited and not counted', async () => {
      const ok = await setup({ username: 'alice' });
      expect((await ok.manager.authenticate('stub-token', { token: 't' }, attempt)).success).toBe(true);
      expect(ok.audit.logAuthentication).not.toHaveBeenCalled();
      expect(ok.userManager.recordSignIn).not.toHaveBeenCalled();

      const bad = await setup(null);
      expect((await bad.manager.authenticate('stub-token', { token: 't' }, attempt)).success).toBe(false);
      expect(bad.audit.logAuthentication).not.toHaveBeenCalled();
    });

    test('a failing audit write does not change the outcome of the check', async () => {
      const { manager, audit } = await setup({ username: 'alice' });
      audit.logAuthentication.mockRejectedValue(new Error('disk full'));
      expect((await manager.authenticate('password', { username: 'alice', password: 'pw' }, { ...attempt, purpose: 're-check' })).success).toBe(true);
      expect(audit.logAuthentication).toHaveBeenCalled();
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
      await expect(manager.startFlow('oidc:google', { redirect: '/' }))
        .rejects.toThrow(/cannot start a redirect flow/);
    });

    test('throws when a registered provider has no startFlow', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      await expect(manager.startFlow('password', {})).rejects.toThrow(/cannot start a redirect flow/);
    });

    test('returns the provider URL and passes the context through', async () => {
      const cm = makeConfigManager();
      const manager = new AuthManager(makeEngine(cm));
      await manager.initialize();
      const startFlow = vi.fn().mockReturnValue('https://idp.example/authorize');
      manager.providers.set('stub-flow', {
        id: 'stub-flow', displayName: 'Stub Flow', verify: vi.fn(), startFlow
      });

      expect(await manager.startFlow('stub-flow', { redirect: '/dashboard', connectFor: 'mallory' }))
        .toBe('https://idp.example/authorize');
      // #1743: a sign-in flow never connects; connecting is startConnect's.
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

    // #2223: an add-on brings its own verify() and AAL, so a core id it could
    // take where core left it unregistered would be trusted by a factors entry.
    describe('core ids and the oidc: prefix are reserved for core', () => {
      const PHISHING_RESISTANT = { primary: true, amr: ['hwk', 'user'], aal: 2, acr: 'phr' };

      test('an add-on registering passkey on an http site is refused, logged, and the factor stays off', async () => {
        const logger = (await import('../../utils/logger')).default;
        const error = vi.spyOn(logger, 'error');
        const cm = makeConfigManager({ properties: { 'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'passkey' }] } });
        cm.getBaseURL.mockReturnValue('http://wiki.example.com');
        const manager = new AuthManager(makeEngine(cm));
        await manager.initialize();
        expect(manager.isEnabled('passkey')).toBe(false);

        expect(manager.registerProvider(stub('passkey', { factor: PHISHING_RESISTANT }), 'evil-addon')).toBe(false);
        expect(manager.isEnabled('passkey')).toBe(false);
        expect(manager.getFactors().map((f) => f.provider)).toEqual(['password']);
        expect(error).toHaveBeenCalledWith(expect.stringMatching(/Rejected provider 'passkey' from evil-addon: .*reserved for core/));
        error.mockRestore();
      });

      test('an add-on registering oidc:google is refused, whether or not core registered it', async () => {
        const manager = await bareManager();
        expect(manager.registerProvider(stub('oidc:google'), 'evil-addon')).toBe(false);
        expect(manager.registerProvider(stub('oidc:anything'), 'evil-addon')).toBe(false);
        expect(manager.isEnabled('oidc:google')).toBe(false);
      });

      test('every core id is refused from an add-on, with no source named too', async () => {
        const manager = await bareManager();
        for (const id of ['password', 'magic-link', 'passkey', 'cloudflare-access', 'authentik-bearer', 'agent-token', 'oidc-bearer']) {
          expect(manager.registerProvider(stub(id))).toBe(false);
        }
        expect(manager.getProviders().map((p) => p.id)).toEqual(['password']);
      });

      test('an id getter that answers harmless, then passkey, is refused', async () => {
        const manager = await bareManager();
        const reads = ['harmless', 'passkey'];
        const shifty = { displayName: 'Shifty', verify: vi.fn().mockResolvedValue(null), get id() { return reads.shift() ?? 'passkey'; } };
        expect(manager.registerProvider(shifty as never, 'evil-addon')).toBe(false);
        expect(manager.isEnabled('passkey')).toBe(false);
        expect(manager.isEnabled('harmless')).toBe(false);
      });

      test('core registers its own ids: password on a bare boot, agent-token when configured', async () => {
        const cm = makeConfigManager({ properties: { 'ngdpbase.auth.agent-token.enabled': true } });
        const manager = new AuthManager(makeEngine(cm));
        await manager.initialize();
        expect(manager.isEnabled('password')).toBe(true);
        expect(manager.isEnabled('agent-token')).toBe(true);
      });

      test('an id that only starts like a core one is the add-on\'s to register', async () => {
        const manager = await bareManager();
        expect(manager.registerProvider(stub('passkey-plus'), 'my-addon')).toBe(true);
        expect(manager.registerProvider(stub('my-oidc:x'), 'my-addon')).toBe(true);
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
