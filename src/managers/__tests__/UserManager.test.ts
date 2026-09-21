/**
 * UserManager Tests
 *
 * UserManager is a thin proxy that delegates user operations to a provider.
 * These tests verify the proxy behavior, not the provider logic itself.
 * Provider logic is tested in provider-specific test files.
 */

import UserManager from '../UserManager';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import type { WikiEngine } from '../../types/WikiEngine';
/** #1179: the account writes take the actor's context — a request subject here. */
const ACTOR = { username: 'root', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };


// Mock ConfigurationManager
const mockConfigurationManager = {
  getProperty: vi.fn((key, defaultValue) => {
    const config = {
      'ngdpbase.user.provider.default': 'fileuserprovider',
      'ngdpbase.user.provider': 'fileuserprovider',
      'ngdpbase.user.defaultPassword': 'admin',
      'ngdpbase.user.passwordSalt': 'test-salt',
      'ngdpbase.user.sessionExpiration': 3600000,
      'ngdpbase.user.defaultTimezone': 'UTC',
      'ngdpbase.directories.users': './users',
      // #631: always present in a booted instance — app.ts refuses to start
      // without it — so the mock carries it too.
      'ngdpbase.system.principal': 'svc-ngdpbase',
      'ngdpbase.system.roles': ['admin']
    };
    return config[key] !== undefined ? config[key] : defaultValue;
  })
};

// Who holds which role is RoleManager's (#1431 step 12). Tests set
// mockRoles.resolveUserRoles to say what a user holds.
const mockRoles = {
  resolveUserRoles: vi.fn(async () => [] as string[]),
  applyRoleDiff: vi.fn(async () => undefined),
  removeAllMemberships: vi.fn(async () => undefined)
};

// Mock engine
const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') return mockConfigurationManager;
    if (name === 'PolicyInformationPoint') return pip;
    if (name === 'RoleManager') return mockRoles;
    return null;
  }),
  getConfig: vi.fn(() => ({ get: vi.fn() }))
};

// #1431 step 13: subjects are built by the PIP — a real one, over this engine,
// so whatever the test installs as UserManager / RoleManager is what it asks.
const pip = new PolicyInformationPoint(mockEngine);
// #1431 step 14: decisions are the PDP's — a real one over this engine.
const pdp = new PolicyDecisionPoint(mockEngine);

describe('UserManager', () => {
  let userManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRoles.resolveUserRoles = vi.fn(async () => [] as string[]);

    // Reset mock implementation to default behavior
    mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
      const config = {
        'ngdpbase.user.provider.default': 'fileuserprovider',
        'ngdpbase.user.provider': 'fileuserprovider',
        'ngdpbase.user.defaultPassword': 'admin',
        'ngdpbase.user.passwordSalt': 'test-salt',
        'ngdpbase.user.sessionExpiration': 3600000,
        'ngdpbase.user.defaultTimezone': 'UTC',
        'ngdpbase.directories.users': './users',
        // #631: always present in a booted instance — app.ts refuses to start
        // without it — so the mock carries it too.
        'ngdpbase.system.principal': 'svc-ngdpbase',
        'ngdpbase.system.roles': ['admin']
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });

    userManager = new UserManager(mockEngine);
    await userManager.initialize();
  });

  afterEach(async () => {
    if (userManager.provider) {
      await userManager.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should require ConfigurationManager', async () => {
      const engineWithoutConfig = { getManager: vi.fn(() => null) };
      const manager = new UserManager(engineWithoutConfig);

      await expect(manager.initialize()).rejects.toThrow('UserManager requires ConfigurationManager');
    });

    test('should initialize provider', () => {
      expect(userManager.provider).toBeTruthy();
      expect(userManager.provider.initialized).toBe(true);
    });

    test('should get configuration from ConfigurationManager', () => {
      expect(mockConfigurationManager.getProperty).toHaveBeenCalledWith('ngdpbase.user.provider', expect.any(String));
    });
  });

  describe('getCurrentUserProvider()', () => {
    test('should return the provider instance', () => {
      const provider = userManager.getCurrentUserProvider();
      expect(provider).toBe(userManager.provider);
      expect(provider).toBeTruthy();
    });

    test('should return provider with correct interface', () => {
      const provider = userManager.getCurrentUserProvider();
      expect(provider.getProviderInfo).toBeDefined();
      expect(typeof provider.getProviderInfo).toBe('function');
    });
  });

  describe('User CRUD Operations', () => {
    test('getUser() should call provider and strip password', async () => {
      const mockUser = { username: 'test', email: 'test@example.com', password: 'hashed:test-fixture' };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const result = await userManager.getUser('test');

      expect(userManager.provider.getUser).toHaveBeenCalledWith('test');
      expect(result).toEqual({ username: 'test', email: 'test@example.com' });
      expect(result.password).toBeUndefined();
    });

    test('getUser() should return undefined for null result', async () => {
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);

      const result = await userManager.getUser('nonexistent');

      expect(result).toBeUndefined();
    });

    test('getUsers() should call provider', async () => {
      const mockUsers = [{ username: 'user1' }, { username: 'user2' }];
      userManager.provider.getAllUsers = vi.fn().mockResolvedValue(mockUsers);

      const result = await userManager.getUsers();

      expect(userManager.provider.getAllUsers).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
    });

    test('createUser() should check for existing user', async () => {
      const userData = { username: 'test', password: 'test-plaintext-input', email: 'test@example.com' };

      userManager.provider.userExists = vi.fn().mockResolvedValue(true);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue(['test', 'admin']);

      await expect(userManager.createUser(userData, ACTOR)).rejects.toThrow('Username already exists');
    });

    test('deleteUser() should throw if user not found', async () => {
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);

      await expect(userManager.deleteUser('nonexistent', ACTOR)).rejects.toThrow('User not found');
    });

    test('deleteUser() should call provider for existing user', async () => {
      const mockUser = { username: 'test', isSystem: false };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);
      userManager.provider.deleteUser = vi.fn().mockResolvedValue(undefined);

      await userManager.deleteUser('test', ACTOR);

      expect(userManager.provider.deleteUser).toHaveBeenCalledWith('test');
    });
  });

  describe('Authentication', () => {
    test('authenticateUser() should validate and return user with isAuthenticated flag', async () => {
      const hashedPassword = userManager.hashPassword('password');
      const mockUser = {
        username: 'test',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: true,
        loginCount: 0
      };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      const result = await userManager.authenticateUser('test', 'password');

      expect(userManager.provider.getUser).toHaveBeenCalledWith('test');
      expect(result).toBeTruthy();
      expect(result.username).toBe('test');
      expect(result.isAuthenticated).toBe(true);
      expect(result.password).toBeUndefined();
    });

    test('authenticateUser() should return null for invalid password', async () => {
      const hashedPassword = userManager.hashPassword('correctpass');
      const mockUser = {
        username: 'test',
        password: hashedPassword,
        isActive: true
      };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const result = await userManager.authenticateUser('test', 'wrongpass');

      expect(result).toBeNull();
    });

    test('authenticateUser() should return null for inactive user', async () => {
      const mockUser = {
        username: 'test',
        password: 'hashed:test-fixture',
        isActive: false
      };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const result = await userManager.authenticateUser('test', 'password');

      expect(result).toBeNull();
    });
  });

  describe('Permission Management', () => {
    let policiesConfig;
    let mockMemberRoles;

    beforeEach(() => {
      // #1431 step 10: the policies are read through ConfigurationManager,
      // live — so the fixture puts them in the config, where the system reads
      // them, rather than in a PolicyManager that no longer exists.
      mockMemberRoles = ['user'];
      const permissionPolicies = [
        {
          id: 'policy1',
          subjects: [
            { type: 'role', value: 'user' },
            { type: 'role', value: 'Authenticated' }
          ],
          effect: 'allow',
          actions: ['page:view', 'page:edit']
        },
        {
          id: 'policy2',
          subjects: [
            { type: 'role', value: 'admin' }
          ],
          effect: 'allow',
          actions: ['page:view', 'page:edit', 'page:delete', 'admin:manage']
        }
      ];
      policiesConfig = {
        getProperty: vi.fn((key, def) => {
          if (key === 'ngdpbase.access.policies.enabled') return true;
          if (key === 'ngdpbase.access.policies') return permissionPolicies;
          return mockConfigurationManager.getProperty(key, def);
        })
      };

      // Override engine.getManager to return the policy-carrying config.
      // #1429: a user's roles come from RoleManager records — nothing synthetic
      // is added any more, so a fixture that wants a role must supply it. These
      // tests passed before because the injected 'Authenticated' matched
      // policy1, not because the user's own role did.
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return policiesConfig;
        if (name === 'PolicyInformationPoint') return pip;
        if (name === 'UserManager') return userManager;
        if (name === 'RoleManager') return { resolveUserRoles: vi.fn(async () => mockMemberRoles) };
        return null;
      });
    });

    test('getUserPermissions() should aggregate from policies', async () => {
      const mockUser = { username: 'test', roles: ['user'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const permissions = await pdp.getUserPermissions('test');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
    });

    test('permits() should check user permissions via policies', async () => {
      const mockUser = { username: 'test', roles: ['admin'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const permissions = await pdp.getUserPermissions('test');
      const result = permissions.length > 0;

      expect(result).toBe(true);
    });

    test('getUserPermissions() is empty when no policies are in force', async () => {
      // A config with no policies — and the enabled switch unset, which is off
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PolicyInformationPoint') return pip;
        if (name === 'UserManager') return userManager;
        if (name === 'RoleManager') return mockRoles;
        return null;
      });

      const permissions = await pdp.getUserPermissions('test');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    // ─── #637: hasPermission fast path (pre-resolved userContext) ─────────────

    // #1431: the decision lives in the PDP now, so the engine gets a REAL one
    // wired to this mock. That keeps what these tests are about — the ceilings,
    // the live role resolution, what reaches the evaluator — exercising the
    // actual ordering rather than a stub of it.
    function installPolicyEvaluator(allowed: boolean) {
      const policyEvaluator = {
        evaluateAccess: vi.fn().mockResolvedValue({ allowed })
      };
      const pdp = new PolicyDecisionPoint(mockEngine);
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PolicyInformationPoint') return pip;
        if (name === 'PolicyEvaluator') return policyEvaluator;
        if (name === 'PolicyDecisionPoint') return pdp;
        if (name === 'UserManager') return userManager;
        if (name === 'RoleManager') return mockRoles;
        return null;
      });
      return policyEvaluator;
    }

    test('permits(userContext, action) skips provider.getUser + resolveUserRoles (#637)', async () => {
      installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);
      mockRoles.resolveUserRoles = vi.fn().mockResolvedValue([]);

      const result = await pdp.permits(
        { username: 'jane', roles: ['admin'], isAuthenticated: true },
        'admin-system'
      );

      // Fast path: skipped both lookups
      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(mockRoles.resolveUserRoles).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('userHoldsPermission(username, action) looks the user up (#1173)', async () => {
      // This asserted `hasPermission('jane', …)` — the username overload. That
      // form is gone: it could not carry an agent token, so the scope ceiling
      // had nothing to read, which is how #1164 reached seventeen call sites.
      //
      // The question it was really asking — "does this NAMED USER hold this
      // permission?" — is legitimate and survives under its own name, where no
      // request and no token are involved and nothing can be dropped.
      installPolicyEvaluator(true);
      const mockUser = { username: 'jane', roles: ['admin'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const result = await pdp.userHoldsPermission('jane', 'admin-system');

      expect(userManager.provider.getUser).toHaveBeenCalledWith('jane');
      expect(result).toBe(true);
    });

    test('permits(userContext, action) trusts the caller-provided roles array verbatim (#637)', async () => {
      const policyEvaluator = installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn();
      mockRoles.resolveUserRoles = vi.fn();

      // Caller's userContext claims `super-admin` role even though the user
      // record on disk wouldn't grant it. Fast path must trust the caller —
      // session middleware is the source of truth for roles.
      await pdp.permits(
        { username: 'mallory', roles: ['super-admin'], isAuthenticated: true },
        'admin-system'
      );

      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(mockRoles.resolveUserRoles).not.toHaveBeenCalled();
      // Verify the roles array was passed through to PolicyEvaluator verbatim
      expect(policyEvaluator.evaluateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: expect.objectContaining({
            username: 'mallory',
            roles: ['super-admin'],
            isAuthenticated: true
          })
        })
      );
    });

    // ─── #631: a JobSubject (resolveRolesNow, #1212) is resolved NOW, not defaulted ──
    //
    // `toPermissionSubject` drops roles on purpose so a job enqueued at 09:00
    // and running at 09:12 authorises against 09:12's roles. Its docblock said
    // hasPermission would resolve them; hasPermission substituted anonymous.

    test('permits(subject without roles) resolves the user\'s CURRENT roles (#631)', async () => {
      const policyEvaluator = installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn().mockResolvedValue({ username: 'jim', isActive: true });
      mockRoles.resolveUserRoles = vi.fn().mockResolvedValue(['editor']);

      await pdp.permits({ username: 'jim', isAuthenticated: true, resolveRolesNow: true }, 'page-edit');

      expect(mockRoles.resolveUserRoles).toHaveBeenCalledWith('jim');
      expect(policyEvaluator.evaluateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: expect.objectContaining({ username: 'jim', roles: ['editor'], isAuthenticated: true })
        })
      );
    });

    test('a demoted user\'s job asks with the DEMOTED roles — nothing from enqueue time survives (#631)', async () => {
      const policyEvaluator = installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn().mockResolvedValue({ username: 'jim', isActive: true });
      mockRoles.resolveUserRoles = vi.fn().mockResolvedValue([]);

      await pdp.permits({ username: 'jim', isAuthenticated: true, resolveRolesNow: true }, 'admin-system');

      const seen = policyEvaluator.evaluateAccess.mock.calls[0][0].userContext.roles;
      expect(seen).not.toContain('admin');
      // #1429: no synthetic role rides along — a demoted user resolves to nothing.
      expect(seen).toEqual([]);
    });

    test('a subject without roles for a user who no longer exists resolves ANONYMOUS (#631)', async () => {
      const policyEvaluator = installPolicyEvaluator(false);
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);
      mockRoles.resolveUserRoles = vi.fn();

      await pdp.permits({ username: 'ghost', isAuthenticated: true, resolveRolesNow: true }, 'page-edit');

      expect(mockRoles.resolveUserRoles).not.toHaveBeenCalled();
      expect(policyEvaluator.evaluateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: expect.objectContaining({ username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false })
        })
      );
    });

    // ─── #631: the system principal — a NAME from .env, roles from the catalog ─

    function installSystemPrincipal(policyAllowed: boolean, name = 'svc-ngdpbase', roles: unknown = ['admin']) {
      const policyEvaluator = installPolicyEvaluator(policyAllowed);
      const base = mockConfigurationManager.getProperty.getMockImplementation();
      mockConfigurationManager.getProperty.mockImplementation((key, fallback) => {
        if (key === 'ngdpbase.system.principal') return name;
        if (key === 'ngdpbase.system.roles') return roles;
        return base ? base(key, fallback) : fallback;
      });
      return policyEvaluator;
    }

    test('a roles-absent subject naming the system principal resolves to the CATALOG roles, not a user record (#631)', async () => {
      const policyEvaluator = installSystemPrincipal(true);
      userManager.provider.getUser = vi.fn();
      mockRoles.resolveUserRoles = vi.fn();

      await pdp.permits({ username: 'svc-ngdpbase', isAuthenticated: true, resolveRolesNow: true }, 'page-create');

      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(mockRoles.resolveUserRoles).not.toHaveBeenCalled();
      expect(policyEvaluator.evaluateAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          userContext: expect.objectContaining({
            username: 'svc-ngdpbase', roles: ['admin'], isAuthenticated: true
          })
        })
      );
    });

    test('the name matches case-insensitively, like the user store (#631)', async () => {
      const policyEvaluator = installSystemPrincipal(true);
      userManager.provider.getUser = vi.fn();
      await pdp.permits({ username: 'SVC-NGDPBASE', isAuthenticated: true, resolveRolesNow: true }, 'page-read');
      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(policyEvaluator.evaluateAccess.mock.calls[0][0].userContext.roles).toContain('admin');
    });

    test('ngdpbase.system.roles is read, not assumed — a narrower list is honoured (#631)', async () => {
      const policyEvaluator = installSystemPrincipal(true, 'svc-ngdpbase', ['editor']);
      await pdp.permits({ username: 'svc-ngdpbase', isAuthenticated: true, resolveRolesNow: true }, 'page-edit');
      const roles = policyEvaluator.evaluateAccess.mock.calls[0][0].userContext.roles;
      expect(roles).toEqual(['editor']);
      expect(roles).not.toContain('admin');
    });

    test('a subject that ASSERTS roles is never rerouted to the system principal, whatever its name (#631)', async () => {
      // The fast path trusts supplied roles verbatim (#637) and does not
      // consult the name. A request-bound context carrying the principal's
      // name with its own roles gets its own roles — the store cannot hold
      // such a user anyway, because createUser reserves the name.
      const policyEvaluator = installSystemPrincipal(true);
      await pdp.permits({ username: 'svc-ngdpbase', roles: ['reader'], isAuthenticated: true }, 'page-read');
      expect(policyEvaluator.evaluateAccess.mock.calls[0][0].userContext.roles).toEqual(['reader']);
    });

    test('the PIP\'s systemPrincipalName() refuses an empty name rather than acting as nobody (#631)', () => {
      installSystemPrincipal(true, '');
      expect(() => pip.systemPrincipalName()).toThrow(/NGDPBASE_SYSTEM_USER/);
    });

    test('createUser() refuses the system principal name, with the same reason as a taken name (#631)', async () => {
      installSystemPrincipal(true);
      userManager.provider = {
        userExists: vi.fn().mockResolvedValue(false),
        createUser: vi.fn()
      };
      await expect(userManager.createUser({ username: 'Svc-NgdpBase', password: 'x', email: 'a@b.c' }, ACTOR))
        .rejects.toMatchObject({ reason: 'username-taken' });
      expect(userManager.provider.createUser).not.toHaveBeenCalled();
    });
  });

  describe('Password Management', () => {
    test('hashPassword() should hash password with salt', () => {
      const hashed = userManager.hashPassword('password123');

      expect(typeof hashed).toBe('string');
      expect(hashed).not.toBe('password123');
      expect(hashed.length).toBeGreaterThan(0);
    });

    test('hashPassword() produces a DIFFERENT hash each time (#1042)', () => {
      // Asserted equality before #1042, when one instance-wide salt meant two
      // accounts with the same password stored identical bytes. Per-user salts
      // make that impossible, which is the point — the verify test below is now
      // what proves the hash is usable.
      const hash1 = userManager.hashPassword('password123');
      const hash2 = userManager.hashPassword('password123');

      expect(hash1).not.toBe(hash2);
      expect(userManager.verifyPassword('password123', hash1)).toBe(true);
      expect(userManager.verifyPassword('password123', hash2)).toBe(true);
    });

    test('verifyPassword() should validate correct password', () => {
      const hashed = userManager.hashPassword('password123');
      const result = userManager.verifyPassword('password123', hashed);

      expect(result).toBe(true);
    });

    test('verifyPassword() should reject incorrect password', () => {
      const hashed = userManager.hashPassword('password123');
      const result = userManager.verifyPassword('wrongpass', hashed);

      expect(result).toBe(false);
    });
  });

  describe('Provider Normalization', () => {
    test('should normalize fileuserprovider to FileUserProvider', () => {
      expect(userManager.providerClass).toBe('FileUserProvider');
    });

    test('should handle provider name case-insensitively', async () => {
      mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.user.provider') return 'FILEUSERPROVIDER';
        if (key === 'ngdpbase.user.provider.default') return 'fileuserprovider';
        return defaultValue;
      });

      const manager = new UserManager(mockEngine);
      await manager.initialize();

      expect(manager.providerClass).toBe('FileUserProvider');
      await manager.shutdown();
    });
  });

  describe('Shutdown', () => {
    test('should mark manager as not initialized', async () => {
      expect(userManager.initialized).toBe(true);

      await userManager.shutdown();

      expect(userManager.initialized).toBe(false);
    });

    test('should not throw errors', async () => {
      await expect(userManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle missing provider gracefully', async () => {
      const uninitializedManager = new UserManager(mockEngine);

      // Operations should fail gracefully
      await expect(uninitializedManager.getUser('test')).rejects.toThrow();
    });
  });

  describe('Session methods', () => {
    test('deleteSession() throws when no provider', async () => {
      const mgr = new UserManager(mockEngine);
      await expect(mgr.deleteSession('sid')).rejects.toThrow('Provider not initialized');
    });

    test('deleteSession() calls provider.deleteSession', async () => {
      userManager.provider.deleteSession = vi.fn().mockResolvedValue(undefined);
      await userManager.deleteSession('session-abc');
      expect(userManager.provider.deleteSession).toHaveBeenCalledWith('session-abc');
    });

    test('deleteUserSessions() throws when no provider', async () => {
      const mgr = new UserManager(mockEngine);
      await expect(mgr.deleteUserSessions('bob')).rejects.toThrow('Provider not initialized');
    });

    test('deleteUserSessions() deletes matching sessions', async () => {
      const sessions = new Map([
        ['s1', { username: 'bob', expiresAt: '2099-01-01' }],
        ['s2', { username: 'alice', expiresAt: '2099-01-01' }],
        ['s3', { username: 'bob', expiresAt: '2099-01-01' }]
      ]);
      userManager.provider.getAllSessions = vi.fn().mockResolvedValue(sessions);
      userManager.provider.deleteSession = vi.fn().mockResolvedValue(undefined);
      await userManager.deleteUserSessions('bob');
      expect(userManager.provider.deleteSession).toHaveBeenCalledWith('s1');
      expect(userManager.provider.deleteSession).toHaveBeenCalledWith('s3');
      expect(userManager.provider.deleteSession).not.toHaveBeenCalledWith('s2');
    });
  });

  describe('backup() and restore()', () => {
    test('backup() returns placeholder when no provider', async () => {
      const mgr = new UserManager(mockEngine);
      const result = await mgr.backup();
      expect(result.managerName).toBe('UserManager');
      expect(result.data).toBeNull();
    });

    test('backup() calls provider.backup when available', async () => {
      userManager.provider.backup = vi.fn().mockResolvedValue({ users: [] });
      const result = await userManager.backup();
      expect(userManager.provider.backup).toHaveBeenCalled();
      expect(result.managerName).toBe('UserManager');
    });

    test('backup() succeeds when provider has no backup method', async () => {
      userManager.provider.backup = undefined;
      const result = await userManager.backup();
      expect(result.managerName).toBe('UserManager');
      expect(result.providerBackup).toBeNull();
    });

    test('backup() rethrows provider errors', async () => {
      userManager.provider.backup = vi.fn().mockRejectedValue(new Error('disk full'));
      await expect(userManager.backup()).rejects.toThrow('disk full');
    });

    test('restore() throws with no backup data', async () => {
      await expect(userManager.restore(null as unknown as import('../UserManager').BackupData)).rejects.toThrow('No backup data');
    });

    test('restore() throws when no provider', async () => {
      const mgr = new UserManager(mockEngine);
      await expect(mgr.restore({ managerName: 'UserManager', timestamp: '', providerClass: null, data: null })).rejects.toThrow('No provider');
    });

    test('restore() calls provider.restore with providerBackup', async () => {
      userManager.provider.restore = vi.fn().mockResolvedValue(undefined);
      await userManager.restore({ managerName: 'UserManager', timestamp: '', providerClass: 'FileUserProvider', providerBackup: { users: [] } });
      expect(userManager.provider.restore).toHaveBeenCalledWith({ users: [] });
    });

    test('restore() logs warning on provider class mismatch', async () => {
      userManager.provider.restore = vi.fn().mockResolvedValue(undefined);
      // No throw expected — just a warning log
      await expect(
        userManager.restore({ managerName: 'UserManager', timestamp: '', providerClass: 'OtherProvider', providerBackup: { users: [] } })
      ).resolves.not.toThrow();
    });

    test('restore() warns when no providerBackup present', async () => {
      await expect(
        userManager.restore({ managerName: 'UserManager', timestamp: '', providerClass: null, data: null })
      ).resolves.not.toThrow();
    });

    test('restore() rethrows provider errors', async () => {
      userManager.provider.restore = vi.fn().mockRejectedValue(new Error('corrupt data'));
      await expect(
        userManager.restore({ managerName: 'UserManager', timestamp: '', providerClass: null, providerBackup: { users: [] } })
      ).rejects.toThrow('corrupt data');
    });
  });
});
