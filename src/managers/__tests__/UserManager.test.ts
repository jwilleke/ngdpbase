/**
 * UserManager Tests
 *
 * UserManager is a thin proxy that delegates user operations to a provider.
 * These tests verify the proxy behavior, not the provider logic itself.
 * Provider logic is tested in provider-specific test files.
 */

import UserManager from '../UserManager';
import type { WikiEngine } from '../../types/WikiEngine';

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
      'ngdpbase.directories.users': './users'
    };
    return config[key] !== undefined ? config[key] : defaultValue;
  })
};

// Mock engine
const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') return mockConfigurationManager;
    return null;
  }),
  getConfig: vi.fn(() => ({ get: vi.fn() }))
};

describe('UserManager', () => {
  let userManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementation to default behavior
    mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
      const config = {
        'ngdpbase.user.provider.default': 'fileuserprovider',
        'ngdpbase.user.provider': 'fileuserprovider',
        'ngdpbase.user.defaultPassword': 'admin',
        'ngdpbase.user.passwordSalt': 'test-salt',
        'ngdpbase.user.sessionExpiration': 3600000,
        'ngdpbase.user.defaultTimezone': 'UTC',
        'ngdpbase.directories.users': './users'
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

    test('should initialize role and permission maps', () => {
      expect(userManager.roles).toBeInstanceOf(Map);
      expect(userManager.permissions).toBeInstanceOf(Map);
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

      await expect(userManager.createUser(userData)).rejects.toThrow('Username already exists');
    });

    test('deleteUser() should throw if user not found', async () => {
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);

      await expect(userManager.deleteUser('nonexistent')).rejects.toThrow('User not found');
    });

    test('deleteUser() should call provider for existing user', async () => {
      const mockUser = { username: 'test', isSystem: false };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);
      userManager.provider.deleteUser = vi.fn().mockResolvedValue(undefined);

      await userManager.deleteUser('test');

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

  describe('Role Management', () => {
    beforeEach(() => {
      // Setup default roles
      userManager.roles.set('admin', {
        name: 'admin',
        permissions: ['read', 'write', 'delete', 'admin']
      });
      userManager.roles.set('user', {
        name: 'user',
        permissions: ['read', 'write']
      });
    });

    test('getRole() should return role definition', () => {
      const role = userManager.getRole('admin');
      expect(role).toBeTruthy();
      expect(role.name).toBe('admin');
      expect(role.permissions).toContain('admin');
    });

    test('getRoles() should return all roles', () => {
      const roles = userManager.getRoles();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBe(2);
    });

    test('hasRole() should check user roles via RoleManager', async () => {
      // #617 iteration 3b: hasRole consults RoleManager (canonical
      // OrganizationRole records), not the deprecated User.roles[] field.
      const personManager = { getByIdentifier: vi.fn().mockResolvedValue({ '@id': 'urn:uuid:test', identifier: 'test' }) };
      const roleManager = { listByMember: vi.fn().mockResolvedValue([
        { '@id': 'r1', namedPosition: 'admin', organization: { '@id': 'o' } },
        { '@id': 'r2', namedPosition: 'user', organization: { '@id': 'o' } }
      ]) };
      userManager.engine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PersonManager') return personManager;
        if (name === 'RoleManager') return roleManager;
        return null;
      });
      userManager.provider.getUser = vi.fn().mockResolvedValue({ username: 'test' });

      const result = await userManager.hasRole('test', 'admin');

      expect(result).toBe(true);
    });

    test('hasRole() should return false for role not assigned', async () => {
      const personManager = { getByIdentifier: vi.fn().mockResolvedValue({ '@id': 'urn:uuid:test', identifier: 'test' }) };
      const roleManager = { listByMember: vi.fn().mockResolvedValue([
        { '@id': 'r2', namedPosition: 'user', organization: { '@id': 'o' } }
      ]) };
      userManager.engine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PersonManager') return personManager;
        if (name === 'RoleManager') return roleManager;
        return null;
      });
      userManager.provider.getUser = vi.fn().mockResolvedValue({ username: 'test' });

      const result = await userManager.hasRole('test', 'admin');

      expect(result).toBe(false);
    });
  });

  describe('Permission Management', () => {
    let mockPolicyManager;

    beforeEach(() => {
      // Mock PolicyManager for permission tests
      mockPolicyManager = {
        getAllPolicies: vi.fn(() => [
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
        ])
      };

      // Override engine.getManager to return mock PolicyManager
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PolicyManager') return mockPolicyManager;
        return null;
      });
    });

    test('getUserPermissions() should aggregate from policies', async () => {
      const mockUser = { username: 'test', roles: ['user'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const permissions = await userManager.getUserPermissions('test');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
    });

    test('hasPermission() should check user permissions via policies', async () => {
      const mockUser = { username: 'test', roles: ['admin'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const permissions = await userManager.getUserPermissions('test');
      const result = permissions.length > 0;

      expect(result).toBe(true);
    });

    test('getUserPermissions() should return empty array without PolicyManager', async () => {
      // Override to return no PolicyManager
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        return null;
      });

      const permissions = await userManager.getUserPermissions('test');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    // ─── #637: hasPermission fast path (pre-resolved userContext) ─────────────

    function installPolicyEvaluator(allowed: boolean) {
      const policyEvaluator = {
        evaluateAccess: vi.fn().mockResolvedValue({ allowed })
      };
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        if (name === 'PolicyEvaluator') return policyEvaluator;
        return null;
      });
      return policyEvaluator;
    }

    test('hasPermission(userContext, action) skips provider.getUser + resolveUserRoles (#637)', async () => {
      installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn().mockResolvedValue(null);
      userManager.resolveUserRoles = vi.fn().mockResolvedValue([]);

      const result = await userManager.hasPermission(
        { username: 'jane', roles: ['admin', 'Authenticated', 'All'], isAuthenticated: true },
        'admin-system'
      );

      // Fast path: skipped both lookups
      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(userManager.resolveUserRoles).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('hasPermission(username, action) still works (back-compat string path) (#637)', async () => {
      installPolicyEvaluator(true);
      const mockUser = { username: 'jane', roles: ['admin'], isActive: true };
      userManager.provider.getUser = vi.fn().mockResolvedValue(mockUser);

      const result = await userManager.hasPermission('jane', 'admin-system');

      // String path: must look up the user
      expect(userManager.provider.getUser).toHaveBeenCalledWith('jane');
      expect(result).toBe(true);
    });

    test('hasPermission(userContext, action) trusts the caller-provided roles array verbatim (#637)', async () => {
      const policyEvaluator = installPolicyEvaluator(true);
      userManager.provider.getUser = vi.fn();
      userManager.resolveUserRoles = vi.fn();

      // Caller's userContext claims `super-admin` role even though the user
      // record on disk wouldn't grant it. Fast path must trust the caller —
      // session middleware is the source of truth for roles.
      await userManager.hasPermission(
        { username: 'mallory', roles: ['super-admin'], isAuthenticated: true },
        'admin-system'
      );

      expect(userManager.provider.getUser).not.toHaveBeenCalled();
      expect(userManager.resolveUserRoles).not.toHaveBeenCalled();
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
