import fs from 'fs-extra';
import path from 'path';

// Mock logger before requiring ConfigurationManager
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    })

  }
}));

import ConfigurationManager from '../ConfigurationManager';

describe('ConfigurationManager', () => {
  let configManager;
  let mockEngine;
  let tempDir;
  let originalCwd;
  let originalEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Create temp directory for test configs
    tempDir = path.join(__dirname, 'temp', `config-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.ensureDir(path.join(tempDir, 'config'));
    await fs.ensureDir(path.join(tempDir, 'data'));

    // Create minimal default config
    const defaultConfig = {
      'ngdpbase.application-name': 'TestWiki',
      'ngdpbase.page.provider.filesystem.storagedir': './data/pages',
      'ngdpbase.directories.data': './data'
    };
    await fs.writeJson(path.join(tempDir, 'config', 'app-default-config.json'), defaultConfig, { spaces: 2 });

    // Save original cwd and change to temp directory
    originalCwd = process.cwd();
    process.chdir(tempDir);

    // Reset storage env vars so tests see clean defaults
    delete process.env.INSTANCE_DATA_FOLDER;
    delete process.env.FAST_STORAGE;
    delete process.env.SLOW_STORAGE;

    // Create mock engine
    mockEngine = {
      getManager: vi.fn()
    };

    // Create ConfigurationManager
    configManager = new ConfigurationManager(mockEngine);
  });

  afterEach(async () => {
    // Restore original cwd
    if (originalCwd) {
      process.chdir(originalCwd);
    }

    // Clean up temp directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Failed to clean up temp directory:', err.message);
      }
    }
  });

  describe('getInstanceDataFolder', () => {
    test('should return default ./data path when INSTANCE_DATA_FOLDER not set', async () => {
      await configManager.initialize();

      const result = configManager.getInstanceDataFolder();

      expect(result).toBe(path.resolve(tempDir, './data'));
    });

    test('should respect INSTANCE_DATA_FOLDER environment variable', async () => {
      process.env.INSTANCE_DATA_FOLDER = '/var/lib/ngdpbase/data';

      // Create new manager to pick up new env var
      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const result = newConfigManager.getInstanceDataFolder();

      expect(result).toBe('/var/lib/ngdpbase/data');
    });

    test('should resolve relative INSTANCE_DATA_FOLDER from cwd', async () => {
      process.env.INSTANCE_DATA_FOLDER = './custom-data';

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const result = newConfigManager.getInstanceDataFolder();

      expect(result).toBe(path.resolve(tempDir, './custom-data'));
    });
  });

  describe('resolveDataPath', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    test('should resolve ./data/pages to instance data folder/pages', () => {
      const result = configManager.resolveDataPath('./data/pages');

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'pages'));
    });

    test('should resolve data/users to instance data folder/users', () => {
      const result = configManager.resolveDataPath('data/users');

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'users'));
    });

    test('should resolve ./data to just instance data folder', () => {
      const result = configManager.resolveDataPath('./data');

      expect(result).toBe(configManager.getInstanceDataFolder());
    });

    test('should resolve data to just instance data folder', () => {
      const result = configManager.resolveDataPath('data');

      expect(result).toBe(configManager.getInstanceDataFolder());
    });

    test('should resolve ./data/logs/audit.log correctly', () => {
      const result = configManager.resolveDataPath('./data/logs/audit.log');

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'logs', 'audit.log'));
    });

    test('should handle path without ./data prefix by adding to instance folder', () => {
      const result = configManager.resolveDataPath('pages');

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'pages'));
    });

    test('should resolve correctly with custom INSTANCE_DATA_FOLDER', async () => {
      process.env.INSTANCE_DATA_FOLDER = '/var/lib/wiki';
      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const result = newConfigManager.resolveDataPath('./data/pages');

      expect(result).toBe('/var/lib/wiki/pages');
    });
  });

  describe('getResolvedDataPath', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    test('should resolve data path from config', () => {
      const result = configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'pages'));
    });

    test('should use default value when config key not found', () => {
      const result = configManager.getResolvedDataPath(
        'nonexistent.key',
        './data/fallback'
      );

      expect(result).toBe(path.join(configManager.getInstanceDataFolder(), 'fallback'));
    });

    test('should not modify non-data paths', () => {
      const result = configManager.getResolvedDataPath(
        'nonexistent.key',
        './required-pages'
      );

      // Non-data paths should be returned as-is
      expect(result).toBe('./required-pages');
    });

    test('should not modify absolute paths', () => {
      const result = configManager.getResolvedDataPath(
        'nonexistent.key',
        '/absolute/path/to/data'
      );

      expect(result).toBe('/absolute/path/to/data');
    });
  });

  describe('custom config loading from instance data folder', () => {
    test('should load custom config from instance data folder when not in config dir', async () => {
      // Create custom config in instance data folder/config/ subdirectory
      const instanceDataFolder = path.join(tempDir, 'data');
      const instanceConfigDir = path.join(instanceDataFolder, 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.application-name': 'CustomFromData'
      };
      await fs.writeJson(path.join(instanceConfigDir, 'app-custom-config.json'), customConfig, { spaces: 2 });

      // Initialize fresh manager
      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const appName = newConfigManager.getProperty('ngdpbase.application-name');

      expect(appName).toBe('CustomFromData');
    });

    test('should only read custom config from instance data folder (not code config dir)', async () => {
      // Custom config in code config dir should be ignored
      // Only INSTANCE_DATA_FOLDER/config/ is used for custom and environment configs
      const configDir = path.join(tempDir, 'config');
      const instanceDataFolder = path.join(tempDir, 'data');
      const instanceConfigDir = path.join(instanceDataFolder, 'config');
      await fs.ensureDir(instanceConfigDir);

      // This should be ignored - custom config in code dir
      await fs.writeJson(
        path.join(configDir, 'app-custom-config.json'),
        { 'ngdpbase.application-name': 'FromConfigDir' },
        { spaces: 2 }
      );

      // This should be used - custom config in instance data dir
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        { 'ngdpbase.application-name': 'FromDataDir' },
        { spaces: 2 }
      );

      // Initialize fresh manager
      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const appName = newConfigManager.getProperty('ngdpbase.application-name');

      // Should use instance data folder config, NOT code config dir
      expect(appName).toBe('FromDataDir');
    });
  });

  describe('deep-merge configurations', () => {
    test('should deep-merge object-type properties', async () => {
      // Default config with user-keywords
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.user-keywords': {
          'default': {
            'label': 'default',
            'description': 'Default keyword',
            'enabled': true
          },
          'draft': {
            'label': 'draft',
            'description': 'Work in progress',
            'enabled': true
          }
        }
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      // Custom config adds new keyword
      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.user-keywords': {
          'immigration': {
            'label': 'immigration',
            'description': 'Immigration content',
            'enabled': true
          }
        }
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const keywords = newConfigManager.getProperty('ngdpbase.user-keywords') as Record<string, { label: string }>;

      // Should have all three keywords: default, draft, and immigration
      expect(keywords).toHaveProperty('default');
      expect(keywords).toHaveProperty('draft');
      expect(keywords).toHaveProperty('immigration');
      expect(keywords.default.label).toBe('default');
      expect(keywords.draft.label).toBe('draft');
      expect(keywords.immigration.label).toBe('immigration');
    });

    test('should allow custom to override default object properties', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.user-keywords': {
          'draft': {
            'label': 'draft',
            'description': 'Default description',
            'enabled': true
          }
        }
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.user-keywords': {
          'draft': {
            'label': 'draft',
            'description': 'Custom description override',
            'enabled': false
          }
        }
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const keywords = newConfigManager.getProperty('ngdpbase.user-keywords');

      // Custom should override default with same key
      expect(keywords.draft.description).toBe('Custom description override');
      expect(keywords.draft.enabled).toBe(false);
    });

    test('should deep-merge nested objects', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.interwiki.sites': {
          'Wikipedia': {
            'url': 'https://en.wikipedia.org/wiki/%s',
            'enabled': true
          }
        }
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.interwiki.sites': {
          'GitHub': {
            'url': 'https://github.com/%s',
            'enabled': true
          }
        }
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const sites = newConfigManager.getProperty('ngdpbase.interwiki.sites');

      // Should have both Wikipedia and GitHub
      expect(sites).toHaveProperty('Wikipedia');
      expect(sites).toHaveProperty('GitHub');
    });

    test('should merge arrays with id-based objects', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.access.policies': [
          { 'id': 'admin-full-access', 'name': 'Admin Access', 'priority': 100 },
          { 'id': 'reader-permissions', 'name': 'Reader', 'priority': 60 }
        ]
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.access.policies': [
          { 'id': 'custom-policy', 'name': 'Custom Policy', 'priority': 50 },
          { 'id': 'reader-permissions', 'name': 'Custom Reader', 'priority': 65 }
        ]
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const policies = newConfigManager.getProperty('ngdpbase.access.policies');

      // Should have admin-full-access from default, custom-policy from custom,
      // and reader-permissions overridden by custom
      expect(policies).toHaveLength(3);
      const adminPolicy = policies.find(p => p.id === 'admin-full-access');
      const customPolicy = policies.find(p => p.id === 'custom-policy');
      const readerPolicy = policies.find(p => p.id === 'reader-permissions');

      expect(adminPolicy.name).toBe('Admin Access');
      expect(customPolicy.name).toBe('Custom Policy');
      expect(readerPolicy.name).toBe('Custom Reader');
      expect(readerPolicy.priority).toBe(65);
    });

    test('should replace arrays without id fields', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.managers.plugin-manager.search-paths': ['./dist/plugins']
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.managers.plugin-manager.search-paths': ['./custom-plugins', './more-plugins']
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const searchPaths = newConfigManager.getProperty('ngdpbase.managers.plugin-manager.search-paths');

      // Arrays without id should be replaced entirely
      expect(searchPaths).toEqual(['./custom-plugins', './more-plugins']);
    });

    test('should handle primitives being overridden by custom', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'DefaultWiki',
        'ngdpbase.server.port': 3000
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      const customConfig = {
        'ngdpbase.application-name': 'CustomWiki',
        'ngdpbase.server.port': 8080
      };
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        customConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      expect(newConfigManager.getProperty('ngdpbase.application-name')).toBe('CustomWiki');
      expect(newConfigManager.getProperty('ngdpbase.server.port')).toBe(8080);
    });

    test('should preserve defaults when custom config is empty', async () => {
      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.user-keywords': {
          'default': { 'label': 'default', 'enabled': true },
          'draft': { 'label': 'draft', 'enabled': true }
        }
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      // No custom config file

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      const keywords = newConfigManager.getProperty('ngdpbase.user-keywords');

      expect(keywords).toHaveProperty('default');
      expect(keywords).toHaveProperty('draft');
    });
  });

  describe('NODE_ENV logging level override', () => {
    test('development mode without custom logging.level defaults to debug', async () => {
      process.env.NODE_ENV = 'development';

      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.logging.level': 'info'
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      expect(newConfigManager.getProperty('ngdpbase.logging.level')).toBe('debug');
    });

    test('development mode with custom logging.level preserves custom value', async () => {
      process.env.NODE_ENV = 'development';

      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.logging.level': 'info'
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        { 'ngdpbase.logging.level': 'warn' },
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      expect(newConfigManager.getProperty('ngdpbase.logging.level')).toBe('warn');
    });

    test('production mode without custom logging.level uses default (info)', async () => {
      process.env.NODE_ENV = 'production';

      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.logging.level': 'info'
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      expect(newConfigManager.getProperty('ngdpbase.logging.level')).toBe('info');
    });

    test('production mode does not override logging level', async () => {
      process.env.NODE_ENV = 'production';

      const defaultConfig = {
        'ngdpbase.application-name': 'TestWiki',
        'ngdpbase.logging.level': 'info'
      };
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        defaultConfig,
        { spaces: 2 }
      );

      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        { 'ngdpbase.logging.level': 'error' },
        { spaces: 2 }
      );

      const newConfigManager = new ConfigurationManager(mockEngine);
      await newConfigManager.initialize();

      expect(newConfigManager.getProperty('ngdpbase.logging.level')).toBe('error');
    });
  });

  // #642: canonical key migration. Custom configs may set legacy
  // `ngdpbase.base-url` (kebab) or `ngdpbase.baseURL` (camel); both must
  // be migrated to `ngdpbase.application.base-url` at load time so all
  // downstream readers see one canonical key.
  describe('base-url canonical key migration (#642)', () => {
    const writeCustom = async (custom: Record<string, unknown>) => {
      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        custom,
        { spaces: 2 }
      );
    };

    const writeDefault = async (extra: Record<string, unknown> = {}) => {
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        {
          'ngdpbase.application-name': 'TestWiki',
          'ngdpbase.application.base-url': 'http://localhost:3000',
          ...extra
        },
        { spaces: 2 }
      );
    };

    test('getBaseURL() returns canonical key value', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.application.base-url': 'https://canonical.example.com' });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://canonical.example.com');
    });

    test('legacy ngdpbase.base-url is migrated to canonical key', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.base-url': 'https://legacy-kebab.example.com' });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://legacy-kebab.example.com');
      // Sentinel default proves the key is genuinely absent from merged config.
      expect(cm.getProperty('ngdpbase.base-url', '__missing__')).toBe('__missing__');
    });

    test('legacy ngdpbase.baseURL (camelCase) is migrated to canonical key', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.baseURL': 'https://legacy-camel.example.com' });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://legacy-camel.example.com');
      expect(cm.getProperty('ngdpbase.baseURL', '__missing__')).toBe('__missing__');
    });

    test('canonical key wins when both canonical and legacy are set', async () => {
      await writeDefault();
      await writeCustom({
        'ngdpbase.application.base-url': 'https://canonical.example.com',
        'ngdpbase.base-url': 'https://legacy-kebab.example.com',
        'ngdpbase.baseURL': 'https://legacy-camel.example.com'
      });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://canonical.example.com');
    });

    test('kebab-case legacy wins over camelCase legacy when both present and canonical absent', async () => {
      await writeDefault();
      await writeCustom({
        'ngdpbase.base-url': 'https://legacy-kebab.example.com',
        'ngdpbase.baseURL': 'https://legacy-camel.example.com'
      });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://legacy-kebab.example.com');
    });

    test('migration logs a deprecation warning', async () => {
      const logger = (await import('../../utils/logger')).default;
      const warnSpy = vi.spyOn(logger, 'warn');

      await writeDefault();
      await writeCustom({ 'ngdpbase.baseURL': 'https://legacy.example.com' });

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      const deprecationCalls = warnSpy.mock.calls.filter((args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('DEPRECATED') && args[0].includes('#642')
      );
      expect(deprecationCalls.length).toBeGreaterThan(0);
      warnSpy.mockRestore();
    });

    test('NGDPBASE_BASE_URL env var overrides canonical key', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.application.base-url': 'https://config.example.com' });
      process.env.NGDPBASE_BASE_URL = 'https://env.example.com';

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('https://env.example.com');
      delete process.env.NGDPBASE_BASE_URL;
    });

    test('default localhost:3000 returned when nothing is set', async () => {
      await writeDefault();
      // No custom config

      const cm = new ConfigurationManager(mockEngine);
      await cm.initialize();

      expect(cm.getBaseURL()).toBe('http://localhost:3000');
    });
  });

  // #642 Iteration 2: post-install startup invariant. Refuse to start if
  // the install is complete but no one has explicitly set
  // ngdpbase.application.base-url (custom config or env var). Pre-install
  // is fine — the install flow will set the value before completing.
  describe('base-url startup invariant (#642 Iteration 2)', () => {
    const writeCustom = async (custom: Record<string, unknown>) => {
      const instanceConfigDir = path.join(tempDir, 'data', 'config');
      await fs.ensureDir(instanceConfigDir);
      await fs.writeJson(
        path.join(instanceConfigDir, 'app-custom-config.json'),
        custom,
        { spaces: 2 }
      );
    };

    const writeDefault = async () => {
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        {
          'ngdpbase.application-name': 'TestWiki',
          'ngdpbase.application.base-url': 'http://localhost:3000'
        },
        { spaces: 2 }
      );
    };

    const markInstallComplete = async () => {
      await fs.ensureDir(path.join(tempDir, 'data'));
      await fs.writeFile(path.join(tempDir, 'data', '.install-complete'), '');
    };

    test('pre-install (no .install-complete) does not throw even if base-url unset', async () => {
      await writeDefault();
      // No custom config, no install-complete marker

      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('post-install with explicit custom base-url does not throw', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.application.base-url': 'https://wiki.example.com' });
      await markInstallComplete();

      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('post-install with NGDPBASE_BASE_URL env var does not throw', async () => {
      await writeDefault();
      await markInstallComplete();
      process.env.NGDPBASE_BASE_URL = 'https://wiki.example.com';

      try {
        const cm = new ConfigurationManager(mockEngine);
        await expect(cm.initialize()).resolves.not.toThrow();
      } finally {
        delete process.env.NGDPBASE_BASE_URL;
      }
    });

    test('post-install with migrated legacy key does not throw (shim sets canonical)', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.baseURL': 'https://legacy.example.com' });
      await markInstallComplete();

      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
      expect(cm.getBaseURL()).toBe('https://legacy.example.com');
    });

    test('post-install without any explicit base-url throws fatal error', async () => {
      await writeDefault();
      // No custom config — only the default localhost
      await markInstallComplete();

      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*application\.base-url.*#642/s);
    });

    test('post-install with empty-object custom config (no base-url key) throws', async () => {
      await writeDefault();
      await writeCustom({ 'ngdpbase.application-name': 'OnlyAppName' });
      await markInstallComplete();

      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start/);
    });
  });

  describe('contact.page loop guard (#658 Iteration 2)', () => {
    const writeContactDefault = async (extra: Record<string, unknown> = {}) => {
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        {
          'ngdpbase.application-name': 'TestWiki',
          'ngdpbase.application.base-url': 'http://localhost:3000',
          'ngdpbase.application.contact.enabled': true,
          'ngdpbase.application.contact.page': '',
          'ngdpbase.application.contact.recipient': '',
          ...extra
        },
        { spaces: 2 }
      );
    };

    test('contact.page = "" does not throw', async () => {
      await writeContactDefault();
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('contact.page = "support" does not throw', async () => {
      await writeContactDefault({ 'ngdpbase.application.contact.page': 'support' });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('contact.page = "contact" throws fatal startup error', async () => {
      await writeContactDefault({ 'ngdpbase.application.contact.page': 'contact' });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.page.*"contact".*#658/s);
    });

    test('contact.page = "  contact  " (whitespace-padded) throws — trimmed before comparison', async () => {
      await writeContactDefault({ 'ngdpbase.application.contact.page': '  contact  ' });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.page/s);
    });
  });

  describe('contact.recipient well-formed guard (#670 Phase D)', () => {
    const writeContactDefault = async (recipient: string) => {
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        {
          'ngdpbase.application-name': 'TestWiki',
          'ngdpbase.application.base-url': 'http://localhost:3000',
          'ngdpbase.application.contact.enabled': true,
          'ngdpbase.application.contact.page': '',
          'ngdpbase.application.contact.recipient': recipient
        },
        { spaces: 2 }
      );
    };

    // ── empty / whitespace — no validation needed ────────────────────────
    test('empty recipient does not throw (resolves at request time from admin list)', async () => {
      await writeContactDefault('');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('whitespace-only recipient does not throw (treated as empty)', async () => {
      await writeContactDefault('   ');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    // ── single-address (distribution-list pattern) ───────────────────────
    test('single well-formed address does not throw', async () => {
      await writeContactDefault('admins@example.com');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    // ── inline CSV pattern ───────────────────────────────────────────────
    test('two well-formed addresses (CSV) does not throw', async () => {
      await writeContactDefault('alice@example.com, bob@example.com');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('three well-formed addresses with mixed spacing does not throw', async () => {
      await writeContactDefault('alice@example.com,bob@example.com ,  carol@example.com');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    // ── malformed entries throw ──────────────────────────────────────────
    test('single malformed address (no @) throws', async () => {
      await writeContactDefault('not-an-email');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.recipient.*not-an-email.*#670/s);
    });

    test('single malformed address (no TLD) throws', async () => {
      await writeContactDefault('alice@localhost');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.recipient.*alice@localhost.*#670/s);
    });

    test('CSV with one malformed segment throws and identifies the offender', async () => {
      await writeContactDefault('alice@example.com, oops, bob@example.com');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.recipient.*oops.*#670/s);
    });

    test('trailing comma (empty segment) throws', async () => {
      await writeContactDefault('alice@example.com,');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*contact\.recipient.*#670/s);
    });

    test('error message points operators at the inline-CSV / single-address / empty options', async () => {
      await writeContactDefault('garbage');
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/inline CSV.*single address.*auto-resolve|admins@example\.com|alice@example\.com/s);
    });
  });

  describe('configured-addons-exist guard (#672)', () => {
    /**
     * Helper: write a default config that enables/disables specific addon
     * IDs and points addons-path at a list of directories. The caller is
     * expected to have already populated those directories (see
     * `seedAddonDir` below) before calling `cm.initialize()`.
     */
    const writeAddonDefault = async (extra: Record<string, unknown>) => {
      await fs.writeJson(
        path.join(tempDir, 'config', 'app-default-config.json'),
        {
          'ngdpbase.application-name': 'TestWiki',
          'ngdpbase.application.base-url': 'http://localhost:3000',
          'ngdpbase.application.contact.enabled': true,
          'ngdpbase.application.contact.page': '',
          'ngdpbase.application.contact.recipient': '',
          ...extra
        },
        { spaces: 2 }
      );
    };

    /**
     * Create an addon directory structure that the invariant will
     * recognise: `<root>/<name>/index.js` (file content irrelevant —
     * the invariant only checks existence, not module load).
     */
    const seedAddonDir = async (root: string, name: string) => {
      const dir = path.join(root, name);
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, 'index.js'), '// stub addon');
    };

    // ── no-op cases ──────────────────────────────────────────────────────
    test('empty config (no addons.*.enabled keys) does not throw', async () => {
      await writeAddonDefault({});
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('enabled key matches a discovered directory does not throw', async () => {
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'calendar');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.calendar.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('enabled: false for a non-existent addon is harmless (only true triggers)', async () => {
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': path.join(tempDir, 'addons'),
        'ngdpbase.addons.does-not-exist.enabled': false
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('addons-path entry that does not exist on disk is silently skipped', async () => {
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': path.join(tempDir, 'no-such-dir')
        // no enabled keys → still no-op
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    test('multiple addons-path entries: all are searched before deciding "not found"', async () => {
      const a = path.join(tempDir, 'addons-a');
      const b = path.join(tempDir, 'addons-b');
      await seedAddonDir(a, 'calendar');
      await seedAddonDir(b, 'forms');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': [a, b],
        'ngdpbase.addons.calendar.enabled': true,
        'ngdpbase.addons.forms.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).resolves.not.toThrow();
    });

    // ── failure cases ────────────────────────────────────────────────────
    test('enabled key with no matching directory throws and identifies the bad id', async () => {
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'calendar');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.does-not-exist.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*does-not-exist.*#672/s);
    });

    test('error lists discovered addons so operator can pick the right name', async () => {
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'calendar');
      await seedAddonDir(addonsRoot, 'forms');
      await seedAddonDir(addonsRoot, 'journal');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.does-not-exist.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Available addons.*calendar.*forms.*journal/s);
    });

    test('did-you-mean suggestion fires for typos within edit distance 2', async () => {
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'calendar');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.calandar.enabled': true  // typo: "calandar" vs "calendar"
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/did you mean "calendar"/);
    });

    test('did-you-mean is omitted for very different names (rename case)', async () => {
      // The geohazardwatch.com outage scenario: ve-geology vs geohazardwatch
      // are far apart (Levenshtein > 2). No suggestion offered, but the
      // available-addons list still tells the operator the new name.
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'geohazardwatch');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.ve-geology.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/Refusing to start.*ve-geology/);
      await expect(cm.initialize()).rejects.not.toThrow(/did you mean/);
    });

    test('multiple unknown enabled keys: error lists all of them', async () => {
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'calendar');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.foo.enabled': true,
        'ngdpbase.addons.bar.enabled': true,
        'ngdpbase.addons.baz.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/foo.*bar.*baz/s);
    });

    test('directory without index.js or index.ts is not considered an addon', async () => {
      // An empty directory under addons-path shouldn't count as a discovered
      // addon. Catches the case where `addons/<x>/` exists but the addon
      // hasn't been built / its index file was deleted.
      const addonsRoot = path.join(tempDir, 'addons');
      await fs.ensureDir(path.join(addonsRoot, 'incomplete-addon')); // no index.js
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.incomplete-addon.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/incomplete-addon/);
    });

    test('"shared" directory is excluded from discovery (reserved name)', async () => {
      // AddonsManager.scanAddonsDirectory() skips an entry named "shared"
      // (line 273); the invariant must do the same so a `shared/` folder
      // doesn't accidentally satisfy `ngdpbase.addons.shared.enabled`.
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, 'shared');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.shared.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/shared/);
    });

    test('hidden directories (dotfiles) are excluded from discovery — even when an enabled key tries to match', async () => {
      // AddonsManager.scanAddonsDirectory() skips entries starting with "."
      // (line 267); the invariant must do the same. If an operator creates
      // an addon dir at `.hidden/` and tries to enable it under the key
      // `ngdpbase.addons.hidden.enabled`, the invariant should reject —
      // the dotfile is not a valid addon identity.
      const addonsRoot = path.join(tempDir, 'addons');
      await seedAddonDir(addonsRoot, '.hidden');
      await writeAddonDefault({
        'ngdpbase.managers.addons-manager.addons-path': addonsRoot,
        'ngdpbase.addons.hidden.enabled': true
      });
      const cm = new ConfigurationManager(mockEngine);
      await expect(cm.initialize()).rejects.toThrow(/hidden/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // #775 — env-var-ref resolution in getProperty / getMaskedProperty
  // ─────────────────────────────────────────────────────────────────────────

  describe('#775 — env-var-ref resolution', () => {
    /**
     * Helper: build a configured manager with a custom default-config map.
     * Reuses the outer `tempDir` (created fresh per test in beforeEach and
     * cleaned up in afterEach) so we don't leak test artifacts under
     * `__tests__/temp/`.
     */
    async function makeCm(defaultConfig: Record<string, unknown>) {
      // Overwrite the outer beforeEach's default config with this test's values.
      await fs.writeJson(path.join(tempDir, 'config', 'app-default-config.json'), defaultConfig, { spaces: 2 });
      const cm = new ConfigurationManager({ getManager: vi.fn() });
      await cm.initialize();
      return { cm };
    }

    test('bare $VAR resolves to process.env.VAR', async () => {
      process.env.NGDPBASE_TEST_KEY = 'abc123';
      const { cm } = await makeCm({ 'test.secret': '$NGDPBASE_TEST_KEY' });
      expect(cm.getProperty('test.secret')).toBe('abc123');
      delete process.env.NGDPBASE_TEST_KEY;
    });

    test('bare $VAR throws with a clear message when env var is unset', async () => {
      delete process.env.NGDPBASE_MISSING_KEY;
      const { cm } = await makeCm({ 'test.secret': '$NGDPBASE_MISSING_KEY' });
      expect(() => cm.getProperty('test.secret')).toThrow(
        /Config secret `NGDPBASE_MISSING_KEY` referenced by `test\.secret` but env var is unset/
      );
    });

    test('brace ${VAR} embedded form preserves legacy silent-on-missing behavior', async () => {
      delete process.env.NGDPBASE_MISSING_KEY;
      const { cm } = await makeCm({ 'test.path': '${NGDPBASE_MISSING_KEY}/sessions' });
      // Silent: returns the unresolved placeholder. (Pre-#775 behavior; back-compat.)
      expect(cm.getProperty('test.path')).toBe('${NGDPBASE_MISSING_KEY}/sessions');
    });

    test('brace ${VAR} embedded form resolves when env var is set', async () => {
      process.env.NGDPBASE_TEST_PATH = '/tmp/fast';
      const { cm } = await makeCm({ 'test.path': '${NGDPBASE_TEST_PATH}/sessions' });
      expect(cm.getProperty('test.path')).toBe('/tmp/fast/sessions');
      delete process.env.NGDPBASE_TEST_PATH;
    });

    test('$$literal escape hatch returns $literal', async () => {
      const { cm } = await makeCm({ 'test.lit': '$$abc' });
      expect(cm.getProperty('test.lit')).toBe('$abc');
    });

    test('plain strings without $ prefix pass through unchanged', async () => {
      const { cm } = await makeCm({ 'test.plain': 'hello world' });
      expect(cm.getProperty('test.plain')).toBe('hello world');
    });

    test('non-string values (number/boolean/array/object) pass through unchanged', async () => {
      const { cm } = await makeCm({
        'test.num':  42,
        'test.bool': true,
        'test.arr':  ['a', 'b'],
        'test.obj':  { x: 1 }
      });
      expect(cm.getProperty('test.num')).toBe(42);
      expect(cm.getProperty('test.bool')).toBe(true);
      expect(cm.getProperty('test.arr')).toEqual(['a', 'b']);
      expect(cm.getProperty('test.obj')).toEqual({ x: 1 });
    });

    test('resolution is lazy — env var set after init is picked up on next read', async () => {
      delete process.env.NGDPBASE_LAZY_KEY;
      const { cm } = await makeCm({ 'test.lazy': '$NGDPBASE_LAZY_KEY' });
      // Verify the env var is unset right now — read would throw.
      expect(() => cm.getProperty('test.lazy')).toThrow();
      // Set the env var; next read resolves.
      process.env.NGDPBASE_LAZY_KEY = 'late-bound';
      expect(cm.getProperty('test.lazy')).toBe('late-bound');
      delete process.env.NGDPBASE_LAZY_KEY;
    });

    test('lowercase $var does NOT resolve as a bare ref (POSIX env var name convention)', async () => {
      process.env.lowercase_key = 'should-not-match';
      const { cm } = await makeCm({ 'test.weird': '$lowercase_key' });
      // The bare-form regex requires uppercase-leading; lowercase falls
      // through to the "no $ prefix" pass-through path. Returns the
      // literal string. (Operator wanting to use a lowercase env var
      // can switch to the `${var}` brace form for embedded use.)
      expect(cm.getProperty('test.weird')).toBe('$lowercase_key');
      delete process.env.lowercase_key;
    });

    test('getMaskedProperty returns *** for bare $VAR secrets when env var is set', async () => {
      process.env.NGDPBASE_LOG_TEST = 'super-secret-value';
      const { cm } = await makeCm({ 'test.secret': '$NGDPBASE_LOG_TEST' });
      expect(cm.getMaskedProperty('test.secret')).toBe('***');
      delete process.env.NGDPBASE_LOG_TEST;
    });

    test('getMaskedProperty returns the literal value for plain (non-secret) config', async () => {
      const { cm } = await makeCm({ 'test.public': 'https://example.com' });
      expect(cm.getMaskedProperty('test.public')).toBe('https://example.com');
    });

    test('getMaskedProperty resolves and returns brace ${VAR} values unmasked (paths, not secrets)', async () => {
      process.env.NGDPBASE_PATH_TEST = '/tmp/fast';
      const { cm } = await makeCm({ 'test.path': '${NGDPBASE_PATH_TEST}/sessions' });
      // Brace form is for path templates — non-secret. Surface the
      // resolved value so operators see the actual path.
      expect(cm.getMaskedProperty('test.path')).toBe('/tmp/fast/sessions');
      delete process.env.NGDPBASE_PATH_TEST;
    });

    test('getMaskedProperty still throws when a referenced secret env var is unset (loud failure)', async () => {
      delete process.env.NGDPBASE_MISSING_FOR_MASK;
      const { cm } = await makeCm({ 'test.secret': '$NGDPBASE_MISSING_FOR_MASK' });
      expect(() => cm.getMaskedProperty('test.secret')).toThrow(
        /Config secret `NGDPBASE_MISSING_FOR_MASK`/
      );
    });
  });
});
