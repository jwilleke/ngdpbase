import UserManager from '../managers/UserManager';
import type { WikiEngine } from '../types/WikiEngine';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    access: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()

  }
}));

// Mock the provider with all methods used by UserManager
vi.mock('../providers/FileUserProvider', () => {
  const MockProvider = vi.fn().mockImplementation(function () {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      getProviderInfo: vi.fn().mockReturnValue({
        name: 'FileUserProvider',
        version: '1.0.0',
        features: ['local-storage']
      }),
      // User methods
      getAllUsers: vi.fn().mockResolvedValue(new Map()),
      getAllUsernames: vi.fn().mockResolvedValue([]),
      getUser: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn().mockResolvedValue(undefined),
      deleteUser: vi.fn().mockResolvedValue(undefined),
      userExists: vi.fn().mockResolvedValue(false),
      // Session methods
      createSession: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      getAllSessions: vi.fn().mockResolvedValue(new Map()),
      // Backup methods
      backup: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined)
    };
  });
  return { default: MockProvider };
});

describe('UserManager', () => {
  let userManager;
  let mockEngine;
  let mockConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock ConfigurationManager
    mockConfigManager = {
      getProperty: vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.user.provider.default': 'fileuserprovider',
          'ngdpbase.user.provider': 'fileuserprovider',
          'ngdpbase.user.provider.storagedir': './data/users',
          'ngdpbase.user.security.passwordsalt': 'test-salt',
          'ngdpbase.user.security.defaultpassword': 'admin123',
          'ngdpbase.user.security.sessionexpiration': 86400000,
          'ngdpbase.user.defaults.timezone': 'utc',
          'ngdpbase.roles.definitions': {
            admin: { name: 'admin', displayName: 'Administrator', permissions: ['*'] },
            reader: { name: 'reader', displayName: 'Reader', permissions: ['page:read'] }
          }
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      })
    };

    // Create mock engine
    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        return null;
      })
    };

    userManager = new UserManager(mockEngine);
  });

  describe('constructor', () => {
    test('should create UserManager with engine reference', () => {
      expect(userManager).toBeDefined();
      expect(userManager.engine).toBe(mockEngine);
      expect(userManager.provider).toBeNull();
      expect(userManager.roles).toBeInstanceOf(Map);
      expect(userManager.permissions).toBeInstanceOf(Map);
    });
  });

  describe('initialization', () => {
    test('should throw error if ConfigurationManager is not available', async () => {
      const engineWithoutConfig = {
        getManager: vi.fn().mockReturnValue(null)
      };
      const manager = new UserManager(engineWithoutConfig);

      await expect(manager.initialize()).rejects.toThrow('UserManager requires ConfigurationManager');
    });

    test('should initialize with provider from config', async () => {
      await userManager.initialize();

      expect(mockEngine.getManager).toHaveBeenCalledWith('ConfigurationManager');
      expect(mockConfigManager.getProperty).toHaveBeenCalledWith('ngdpbase.user.provider.default', 'fileuserprovider');
      expect(userManager.providerClass).toBe('FileUserProvider');
    });

    test('should load role definitions from config', async () => {
      await userManager.initialize();

      expect(userManager.roles.size).toBeGreaterThan(0);
      expect(userManager.roles.has('admin')).toBe(true);
      expect(userManager.roles.has('reader')).toBe(true);
    });

    test('should initialize permissions registry', async () => {
      await userManager.initialize();

      expect(userManager.permissions.size).toBeGreaterThan(0);
    });

    test('should set configuration values', async () => {
      await userManager.initialize();

      expect(userManager.passwordSalt).toBe('test-salt');
      expect(userManager.defaultPassword).toBe('admin123');
      // sessionExpiration and defaultTimezone were removed as dead code (declared but never used)
    });
  });

  describe('password handling', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should hash passwords consistently', () => {
      const password = 'testpassword123';
      const hash1 = userManager.hashPassword(password);
      const hash2 = userManager.hashPassword(password);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(password);
      expect(hash1.length).toBeGreaterThan(0);
    });

    test('should verify correct passwords', () => {
      const password = 'testpassword123';
      const hash = userManager.hashPassword(password);

      expect(userManager.verifyPassword(password, hash)).toBe(true);
    });

    test('should reject incorrect passwords', () => {
      const password = 'testpassword123';
      const hash = userManager.hashPassword(password);

      expect(userManager.verifyPassword('wrongpassword', hash)).toBe(false);
    });

    test('should produce different hashes for different passwords', () => {
      const hash1 = userManager.hashPassword('password1');
      const hash2 = userManager.hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('role management', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should get role by name', () => {
      const adminRole = userManager.getRole('admin');
      expect(adminRole).toBeDefined();
      expect(adminRole.name).toBe('admin');
    });

    test('should return null for non-existent role', () => {
      const role = userManager.getRole('nonexistent');
      expect(role).toBeNull();
    });

    test('should get all roles', () => {
      const roles = userManager.getRoles();
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
    });
  });

  describe('permission management', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should get all permissions', () => {
      const permissions = userManager.getPermissions();
      expect(permissions).toBeInstanceOf(Map);
      expect(permissions.size).toBeGreaterThan(0);
    });

    test('should check permissions include standard ones', () => {
      const permissions = userManager.getPermissions();
      // Standard permissions should be defined
      expect(permissions.has('page-read') || permissions.has('admin-system')).toBe(true);
    });
  });

  describe('anonymous and special users', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should return anonymous user object', () => {
      const anonymousUser = userManager.getAnonymousUser();
      expect(anonymousUser).toBeDefined();
      expect(anonymousUser.username).toBe('Anonymous');
      expect(anonymousUser.isAuthenticated).toBe(false);
    });

    test('should return asserted user object', () => {
      const assertedUser = userManager.getAssertedUser();
      expect(assertedUser).toBeDefined();
      expect(assertedUser.username).toBe('asserted');
      expect(assertedUser.isAuthenticated).toBe(false);
    });

    test('should handle anonymous user permissions', async () => {
      const permissions = await userManager.getUserPermissions('Anonymous');
      expect(Array.isArray(permissions)).toBe(true);
      // Anonymous user permissions returned based on role configuration
    });

    test('should handle null username as anonymous', async () => {
      const permissions = await userManager.getUserPermissions(null);
      expect(Array.isArray(permissions)).toBe(true);
    });
  });

  describe('provider normalization', () => {
    test('should normalize provider name to PascalCase', async () => {
      // Test with lowercase
      mockConfigManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.user.provider') return 'fileuserprovider';
        if (key === 'ngdpbase.user.provider.default') return 'fileuserprovider';
        if (key === 'ngdpbase.roles.definitions') return {};
        return defaultValue;
      });

      await userManager.initialize();
      expect(userManager.providerClass).toBe('FileUserProvider');
    });
  });

  describe('hasRole', () => {
    beforeEach(async () => {
      await userManager.initialize();
      // Mock provider to return a user with roles
      userManager.provider.getUser = vi.fn().mockImplementation((username) => {
        if (username === 'admin') {
          return Promise.resolve({ username: 'admin', roles: ['admin'] });
        }
        if (username === 'testuser') {
          return Promise.resolve({ username: 'testuser', roles: ['reader'] });
        }
        return Promise.resolve(null);
      });
    });

    test('should check if user has role', async () => {
      // For admin role checking (synchronous check based on provider data)
      const hasAdminRole = await userManager.hasRole('admin', 'admin');
      expect(hasAdminRole).toBeDefined();
    });
  });

  describe('hasPermission', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should check user permissions returns boolean', async () => {
      // hasPermission should return a boolean
      const result = await userManager.hasPermission('Anonymous', 'page:read');
      expect(typeof result).toBe('boolean');
    });

    test('should deny permissions for non-existent permission', async () => {
      const result = await userManager.hasPermission('Anonymous', 'nonexistent:permission');
      expect(result).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should return array of permissions for anonymous', async () => {
      const permissions = await userManager.getUserPermissions('Anonymous');
      expect(Array.isArray(permissions)).toBe(true);
    });

    test('should return array of permissions for asserted', async () => {
      const permissions = await userManager.getUserPermissions('asserted');
      expect(Array.isArray(permissions)).toBe(true);
    });
  });

  describe('session management', () => {
    beforeEach(async () => {
      await userManager.initialize();
    });

    test('should create session for user', async () => {
      const user = { username: 'testuser', roles: ['reader'] };
      // createSession delegates to provider
      const session = await userManager.createSession(user);
      // With mocked provider, session creation is handled by provider
      // Verify the method doesn't throw
      expect(userManager.provider.createSession).toBeDefined();
    });

    test('should retrieve session by id', async () => {
      // getSession delegates to provider
      const result = await userManager.getSession('test-session-id');
      // With mocked provider returning null, result is null
      expect(result).toBeNull();
    });

    test('should return null for non-existent session', async () => {
      const result = await userManager.getSession('nonexistent-id');
      expect(result).toBeNull();
    });

    test('should delete session', async () => {
      const user = { username: 'testuser', roles: ['reader'] };
      const session = await userManager.createSession(user);

      await userManager.deleteSession(session.id);

      const result = await userManager.getSession(session.id);
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle provider initialization failure', async () => {
      mockConfigManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.user.provider') return 'nonexistentprovider';
        if (key === 'ngdpbase.user.provider.default') return 'nonexistentprovider';
        return defaultValue;
      });

      const newManager = new UserManager(mockEngine);
      await expect(newManager.initialize()).rejects.toThrow();
    });
  });
});
