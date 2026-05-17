import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('AddonsManager', () => {
  let tmpDir;
  let AddonsManager;

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key, defaultValue) => {
      if (key === 'ngdpbase.managers.addons-manager.enabled') {
        return overrides.enabled ?? true;
      }
      if (key === 'ngdpbase.managers.addons-manager.addons-path') {
        return overrides.addonsPath ?? tmpDir;
      }
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') {
        return overrides.pagesDir ?? path.join(tmpDir, 'pages');
      }
      if (key.startsWith('ngdpbase.addons.')) {
        const parts = key.split('.');
        const addonName = parts[2];
        const prop = parts[3];
        if (prop === 'enabled') {
          const enabledAddons = overrides.enabledAddons || [];
          return enabledAddons.includes(addonName);
        }
        return defaultValue;
      }
      if (key === 'ngdpbase.addons') {
        return overrides.addonsConfig ?? {};
      }
      return defaultValue;
    }),
    getAllProperties: vi.fn(() => overrides.allProperties ?? {}),
    getCustomProperty: vi.fn((key) => overrides.customProperties?.[key] ?? null),
    setRuntimeProperty: vi.fn()
  });

  const makeEngine = (configManager) => ({
    getManager: vi.fn((name) =>
      name === 'ConfigurationManager' ? configManager : null
    )
  });

  beforeAll(() => {
    vi.setConfig({ testTimeout: 20000 });
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addons-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    // Fresh import each test
    const mod = await import('../AddonsManager');
    AddonsManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  describe('initialization', () => {
    test('initializes with empty addons directory', async () => {
      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getAddonNames()).toEqual([]);
    });

    test('handles missing addons directory gracefully', async () => {
      const nonExistentPath = path.join(tmpDir, 'nonexistent');
      const configManager = makeConfigManager({ addonsPath: nonExistentPath });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getAddonNames()).toEqual([]);
    });

    test('skips initialization when disabled in config', async () => {
      const configManager = makeConfigManager({ enabled: false });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.getAddonNames()).toEqual([]);
    });
  });

  describe('addon discovery', () => {
    test('discovers addon with valid index.js', async () => {
      // Create addon directory structure
      const addonDir = path.join(tmpDir, 'test-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        module.exports = {
          name: 'test-addon',
          version: '1.0.0',
          description: 'A test addon',
          register: async function(engine, config) {
            // Do nothing
          }
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('test-addon')).toBe(true);
      expect(manager.getAddonNames()).toContain('test-addon');
    });

    test('skips hidden directories', async () => {
      const hiddenDir = path.join(tmpDir, '.hidden-addon');
      await fs.mkdir(hiddenDir);
      await fs.writeFile(
        path.join(hiddenDir, 'index.js'),
        'module.exports = { name: \'hidden\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('hidden')).toBe(false);
    });

    test('skips shared directory', async () => {
      const sharedDir = path.join(tmpDir, 'shared');
      await fs.mkdir(sharedDir);
      await fs.writeFile(
        path.join(sharedDir, 'index.js'),
        'module.exports = { name: \'shared\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('shared')).toBe(false);
    });

    test('skips addon without index.js', async () => {
      const addonDir = path.join(tmpDir, 'no-index');
      await fs.mkdir(addonDir);
      await fs.writeFile(path.join(addonDir, 'README.md'), '# No index', 'utf8');

      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('no-index')).toBe(false);
    });

    test('skips addon without register function', async () => {
      const addonDir = path.join(tmpDir, 'no-register');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'no-register\', version: \'1.0.0\' };',
        'utf8'
      );

      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('no-register')).toBe(false);
    });

    test('discovers addons from multiple paths when addons-path is an array', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');
      await fs.mkdir(path.join(dir1, 'addon-a'), { recursive: true });
      await fs.mkdir(path.join(dir2, 'addon-b'), { recursive: true });
      await fs.writeFile(
        path.join(dir1, 'addon-a', 'index.js'),
        'module.exports = { name: \'addon-a\', version: \'1.0.0\', register: async () => {} };',
        'utf8'
      );
      await fs.writeFile(
        path.join(dir2, 'addon-b', 'index.js'),
        'module.exports = { name: \'addon-b\', version: \'1.0.0\', register: async () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({ addonsPath: [dir1, dir2] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('addon-a')).toBe(true);
      expect(manager.hasAddon('addon-b')).toBe(true);
    });

    test('handles some paths in array not existing', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const nonExistent = path.join(tmpDir, 'does-not-exist');
      await fs.mkdir(path.join(dir1, 'addon-a'), { recursive: true });
      await fs.writeFile(
        path.join(dir1, 'addon-a', 'index.js'),
        'module.exports = { name: \'addon-a\', version: \'1.0.0\', register: async () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({ addonsPath: [dir1, nonExistent] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('addon-a')).toBe(true);
      expect(manager.getAddonNames()).toHaveLength(1);
    });

    test('first path wins when same addon name appears in two paths', async () => {
      const dir1 = path.join(tmpDir, 'dir1');
      const dir2 = path.join(tmpDir, 'dir2');
      await fs.mkdir(path.join(dir1, 'dup-addon'), { recursive: true });
      await fs.mkdir(path.join(dir2, 'dup-addon'), { recursive: true });
      await fs.writeFile(
        path.join(dir1, 'dup-addon', 'index.js'),
        'module.exports = { name: \'dup-addon\', version: \'1.0.0\', register: async () => {} };',
        'utf8'
      );
      await fs.writeFile(
        path.join(dir2, 'dup-addon', 'index.js'),
        'module.exports = { name: \'dup-addon\', version: \'2.0.0\', register: async () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({ addonsPath: [dir1, dir2] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('dup-addon')).toBe(true);
      expect(manager.getAddonNames()).toHaveLength(1);
      // dir1 version (1.0.0) should win over dir2 (2.0.0)
      const status = await manager.getStatus();
      expect(status.find(s => s.name === 'dup-addon').version).toBe('1.0.0');
    });
  });

  describe('addon loading', () => {
    test('loads enabled addon', async () => {
      const addonDir = path.join(tmpDir, 'enabled-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        module.exports = {
          name: 'enabled-addon',
          version: '1.0.0',
          register: async function(engine, config) {
            // Successfully registered
          }
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['enabled-addon']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.isLoaded('enabled-addon')).toBe(true);
    });

    test('does not load disabled addon', async () => {
      const addonDir = path.join(tmpDir, 'disabled-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        module.exports = {
          name: 'disabled-addon',
          version: '1.0.0',
          register: async function() {}
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: [] // Not enabled
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.hasAddon('disabled-addon')).toBe(true);
      expect(manager.isLoaded('disabled-addon')).toBe(false);
    });

    test('handles addon registration errors gracefully', async () => {
      const addonDir = path.join(tmpDir, 'error-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        module.exports = {
          name: 'error-addon',
          version: '1.0.0',
          register: async function() {
            throw new Error('Registration failed!');
          }
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['error-addon']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      // Should not throw
      await manager.initialize();

      expect(manager.hasAddon('error-addon')).toBe(true);
      expect(manager.isLoaded('error-addon')).toBe(false);

      const status = await manager.getStatus();
      const errorAddon = status.find((s) => s.name === 'error-addon');
      expect(errorAddon.error).toContain('Registration failed!');
    });
  });

  describe('dependency resolution', () => {
    test('resolves simple dependency order', async () => {
      // Create addon A (no deps)
      const addonDirA = path.join(tmpDir, 'addon-a');
      await fs.mkdir(addonDirA);
      await fs.writeFile(
        path.join(addonDirA, 'index.js'),
        'module.exports = { name: \'addon-a\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );

      // Create addon B (depends on A)
      const addonDirB = path.join(tmpDir, 'addon-b');
      await fs.mkdir(addonDirB);
      await fs.writeFile(
        path.join(addonDirB, 'index.js'),
        'module.exports = { name: \'addon-b\', version: \'1.0.0\', dependencies: [\'addon-a\'], register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['addon-a', 'addon-b']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      // Both should be loaded
      expect(manager.isLoaded('addon-a')).toBe(true);
      expect(manager.isLoaded('addon-b')).toBe(true);
    });

    test('detects circular dependencies', async () => {
      // Create addon A (depends on B)
      const addonDirA = path.join(tmpDir, 'circular-a');
      await fs.mkdir(addonDirA);
      await fs.writeFile(
        path.join(addonDirA, 'index.js'),
        'module.exports = { name: \'circular-a\', version: \'1.0.0\', dependencies: [\'circular-b\'], register: () => {} };',
        'utf8'
      );

      // Create addon B (depends on A)
      const addonDirB = path.join(tmpDir, 'circular-b');
      await fs.mkdir(addonDirB);
      await fs.writeFile(
        path.join(addonDirB, 'index.js'),
        'module.exports = { name: \'circular-b\', version: \'1.0.0\', dependencies: [\'circular-a\'], register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['circular-a', 'circular-b']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      // Should not throw, but addons won't be loaded
      await manager.initialize();

      // Neither should be loaded due to circular dependency
      expect(manager.isLoaded('circular-a')).toBe(false);
      expect(manager.isLoaded('circular-b')).toBe(false);
    });

    test('errors when dependency not installed', async () => {
      const addonDir = path.join(tmpDir, 'needs-missing');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'needs-missing\', version: \'1.0.0\', dependencies: [\'not-installed\'], register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['needs-missing']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(manager.isLoaded('needs-missing')).toBe(false);
    });
  });

  describe('status reporting', () => {
    test('returns status for all discovered addons', async () => {
      const addonDir = path.join(tmpDir, 'status-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        module.exports = {
          name: 'status-addon',
          version: '2.0.0',
          description: 'Test description',
          author: 'Test Author',
          register: () => {},
          status: () => ({ healthy: true, records: 42 })
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['status-addon']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      const status = await manager.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0]).toMatchObject({
        name: 'status-addon',
        version: '2.0.0',
        description: 'Test description',
        author: 'Test Author',
        enabled: true,
        loaded: true,
        error: null
      });
      expect(status[0].details).toMatchObject({
        healthy: true,
        records: 42
      });
    });
  });

  describe('shutdown', () => {
    test('calls shutdown on loaded addons', async () => {
      const addonDir = path.join(tmpDir, 'shutdown-addon');
      await fs.mkdir(addonDir);

      // Create a tracker module
      await fs.writeFile(
        path.join(tmpDir, 'tracker.js'),
        'module.exports = { shutdownCalled: false };',
        'utf8'
      );

      const trackerPath = path.join(tmpDir, 'tracker.js').replace(/\\/g, '\\\\');
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `
        const tracker = require('${trackerPath}');
        module.exports = {
          name: 'shutdown-addon',
          version: '1.0.0',
          register: () => {},
          shutdown: () => { tracker.shutdownCalled = true; }
        };
        `,
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['shutdown-addon']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();
      expect(manager.isLoaded('shutdown-addon')).toBe(true);

      await manager.shutdown();

      // Check tracker
      const tracker = require(path.join(tmpDir, 'tracker.js'));
      expect(tracker.shutdownCalled).toBe(true);
    });
  });

  describe('domainDefaults', () => {
    const makeAddonWithDefaults = async (addonName, domainDefaults) => {
      const addonDir = path.join(tmpDir, addonName);
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `module.exports = { name: '${addonName}', version: '1.0.0', register: () => {} };`,
        'utf8'
      );
      await fs.writeJson(path.join(addonDir, 'package.json'), {
        name: addonName,
        version: '1.0.0',
        ngdpbase: { type: 'domain', domainDefaults }
      });
    };

    test('applies domainDefaults when key not in custom config', async () => {
      await makeAddonWithDefaults('domain-addon', {
        'ngdpbase.front-page': 'my-home',
        'ngdpbase.application-name': 'My App'
      });

      const configManager = makeConfigManager({ enabledAddons: ['domain-addon'] });
      // getCustomProperty returns null for both keys (not in custom config)
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(configManager.setRuntimeProperty).toHaveBeenCalledWith('ngdpbase.front-page', 'my-home');
      expect(configManager.setRuntimeProperty).toHaveBeenCalledWith('ngdpbase.application-name', 'My App');
    });

    test('does not overwrite key already set by operator', async () => {
      await makeAddonWithDefaults('domain-addon-2', {
        'ngdpbase.front-page': 'addon-home',
        'ngdpbase.application-name': 'Addon App'
      });

      const configManager = makeConfigManager({
        enabledAddons: ['domain-addon-2'],
        customProperties: {
          'ngdpbase.front-page': 'operator-home' // operator has set this
        }
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      // front-page is set by operator — must not be overwritten
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalledWith(
        'ngdpbase.front-page',
        expect.anything()
      );
      // application-name is not in custom config — should be injected
      expect(configManager.setRuntimeProperty).toHaveBeenCalledWith(
        'ngdpbase.application-name',
        'Addon App'
      );
    });

    test('no-op when addon has no package.json', async () => {
      const addonDir = path.join(tmpDir, 'no-pkg-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'no-pkg-addon\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );
      // No package.json written

      const configManager = makeConfigManager({ enabledAddons: ['no-pkg-addon'] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await expect(manager.initialize()).resolves.not.toThrow();
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
    });

    test('no-op when package.json has no ngdpbase key', async () => {
      const addonDir = path.join(tmpDir, 'no-manifest-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'no-manifest-addon\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );
      await fs.writeJson(path.join(addonDir, 'package.json'), {
        name: 'no-manifest-addon',
        version: '1.0.0'
        // no ngdpbase key
      });

      const configManager = makeConfigManager({ enabledAddons: ['no-manifest-addon'] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
    });

    test('no-op when domainDefaults is empty', async () => {
      await makeAddonWithDefaults('empty-defaults-addon', {});

      const configManager = makeConfigManager({ enabledAddons: ['empty-defaults-addon'] });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
    });
  });

  describe('domain addon enforcement', () => {
    const makeAddon = async (addonName, type) => {
      const addonDir = path.join(tmpDir, addonName);
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `module.exports = { name: '${addonName}', version: '1.0.0', register: () => {} };`,
        'utf8'
      );
      const pkg = { name: addonName, version: '1.0.0' };
      if (type) pkg.ngdpbase = { type };
      await fs.writeJson(path.join(addonDir, 'package.json'), pkg);
    };

    test('first domain addon is accepted and status type is domain', async () => {
      await makeAddon('first-domain', 'domain');

      const configManager = makeConfigManager({ enabledAddons: ['first-domain'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      const status = await manager.getStatus();
      const entry = status.find(a => a.name === 'first-domain');
      expect(entry.type).toBe('domain');
    });

    test('second domain addon is demoted to additive', async () => {
      // Addons are loaded in discovery order — use alphabetically sorted names
      await makeAddon('aaa-domain', 'domain');
      await makeAddon('bbb-domain', 'domain');

      const configManager = makeConfigManager({ enabledAddons: ['aaa-domain', 'bbb-domain'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      const status = await manager.getStatus();
      const first = status.find(a => a.name === 'aaa-domain');
      const second = status.find(a => a.name === 'bbb-domain');
      expect(first.type).toBe('domain');
      expect(second.type).toBe('additive');
    });

    test('additive addon type is exposed in status', async () => {
      await makeAddon('additive-one', 'additive');

      const configManager = makeConfigManager({ enabledAddons: ['additive-one'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      const status = await manager.getStatus();
      const entry = status.find(a => a.name === 'additive-one');
      expect(entry.type).toBe('additive');
    });

    test('addon with no type has undefined type in status', async () => {
      await makeAddon('no-type-addon', null);

      const configManager = makeConfigManager({ enabledAddons: ['no-type-addon'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      const status = await manager.getStatus();
      const entry = status.find(a => a.name === 'no-type-addon');
      expect(entry.type).toBeUndefined();
    });
  });

  describe('addonDefaults (config/default-config.json)', () => {
    const makeAddonWithDefaultConfig = async (addonName, defaults) => {
      const addonDir = path.join(tmpDir, addonName);
      const configDir = path.join(addonDir, 'config');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `module.exports = { name: '${addonName}', version: '1.0.0', register: () => {} };`,
        'utf8'
      );
      await fs.writeJson(path.join(configDir, 'default-config.json'), defaults);
    };

    test('injects key when absent from mergedConfig', async () => {
      await makeAddonWithDefaultConfig('cfg-addon-1', {
        'ngdpbase.addons.cfg-addon-1.dataPath': './data/cfg1'
      });

      const configManager = makeConfigManager({
        enabledAddons: ['cfg-addon-1'],
        allProperties: {} // key not present
      });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(configManager.setRuntimeProperty).toHaveBeenCalledWith(
        'ngdpbase.addons.cfg-addon-1.dataPath',
        './data/cfg1'
      );
    });

    test('does not inject key already present in mergedConfig', async () => {
      await makeAddonWithDefaultConfig('cfg-addon-2', {
        'ngdpbase.addons.cfg-addon-2.dataPath': './data/default'
      });

      const configManager = makeConfigManager({
        enabledAddons: ['cfg-addon-2'],
        allProperties: { 'ngdpbase.addons.cfg-addon-2.dataPath': './data/custom' }
      });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(configManager.setRuntimeProperty).not.toHaveBeenCalledWith(
        'ngdpbase.addons.cfg-addon-2.dataPath',
        expect.anything()
      );
    });

    test('skips _comment keys', async () => {
      await makeAddonWithDefaultConfig('cfg-addon-3', {
        '_comment': 'Documentation string',
        'ngdpbase.addons.cfg-addon-3.enabled': false
      });

      const configManager = makeConfigManager({
        enabledAddons: ['cfg-addon-3'],
        allProperties: {}
      });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);
      await manager.initialize();

      expect(configManager.setRuntimeProperty).not.toHaveBeenCalledWith('_comment', expect.anything());
    });

    test('missing default-config.json is a no-op — no error thrown', async () => {
      const addonDir = path.join(tmpDir, 'cfg-addon-4');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'cfg-addon-4\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );
      // No config/ directory

      const configManager = makeConfigManager({ enabledAddons: ['cfg-addon-4'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);

      await expect(manager.initialize()).resolves.not.toThrow();
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
    });

    test('malformed JSON in default-config.json warns and addon still loads', async () => {
      const addonDir = path.join(tmpDir, 'cfg-addon-5');
      const configDir = path.join(addonDir, 'config');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'cfg-addon-5\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );
      await fs.writeFile(path.join(configDir, 'default-config.json'), '{ invalid json }', 'utf8');

      const configManager = makeConfigManager({ enabledAddons: ['cfg-addon-5'] });
      const engine = makeEngine(configManager);
      const manager = new AddonsManager(engine);

      await expect(manager.initialize()).resolves.not.toThrow();
      expect(manager.isLoaded('cfg-addon-5')).toBe(true);
      expect(configManager.setRuntimeProperty).not.toHaveBeenCalled();
    });
  });

  describe('backup and restore', () => {
    test('backup returns addon state', async () => {
      const addonDir = path.join(tmpDir, 'backup-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'backup-addon\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({
        enabledAddons: ['backup-addon']
      });
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      const backup = await manager.backup();
      expect(backup.managerName).toBe('AddonsManager');
      expect(backup.timestamp).toBeDefined();
      expect(backup.data).toHaveProperty('addonStates');
    });

    test('restore is a no-op (state determined by config)', async () => {
      const configManager = makeConfigManager();
      const engine = makeEngine(configManager);

      const manager = new AddonsManager(engine);
      await manager.initialize();

      // Should not throw
      await expect(
        manager.restore({
          managerName: 'AddonsManager',
          timestamp: new Date().toISOString(),
          data: {}
        })
      ).resolves.not.toThrow();
    });
  });

  describe('seed pages', () => {
    // Helpers ----------------------------------------------------------------

    /**
     * Write a seed page .md file with frontmatter into dir.
     * uuid and slug are required for valid seed pages.
     * Omitting uuid or slug tests the skip paths.
     */
    const writeSeedPage = async (dir, filename, { uuid, slug, title = 'Test Page', systemCategory, addonName } = {}) => {
      let fm = `---\ntitle: ${title}\n`;
      if (uuid)           fm += `uuid: ${uuid}\n`;
      if (slug)           fm += `slug: ${slug}\n`;
      if (addonName)      fm += `addon: ${addonName}\n`;
      if (systemCategory) fm += `system-category: ${systemCategory}\n`;
      fm += '---\nPage content.\n';
      await fs.writeFile(path.join(dir, filename), fm, 'utf8');
    };

    /**
     * Create a minimal addon directory (index.js + optional pages/ files).
     * Returns { addonDir, addonPagesDir }.
     */
    const makeAddonWithSeedPages = async (addonName, pages = []) => {
      const addonDir = path.join(tmpDir, addonName);
      const addonPagesDir = path.join(addonDir, 'pages');
      await fs.mkdir(addonPagesDir, { recursive: true });
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        `module.exports = { name: '${addonName}', version: '1.0.0', register: () => {} };`,
        'utf8'
      );
      for (const page of pages) {
        await writeSeedPage(addonPagesDir, page.filename, page);
      }
      return { addonDir, addonPagesDir };
    };

    /**
     * Build a mock PageManager. existingSlugs controls which slugs report as existing.
     * existingPages is a map of slug → page object returned by getPage().
     */
    const makePageManager = (existingSlugs = [], existingPages = {}) => ({
      pageExists: vi.fn((slug) => existingSlugs.includes(slug)),
      savePage: vi.fn().mockResolvedValue(undefined),
      getPage: vi.fn((slug) => Promise.resolve(existingPages[slug] ?? null))
    });

    /**
     * Build a mock SearchManager.
     */
    const makeSearchManager = () => ({
      updatePageInIndex: vi.fn().mockResolvedValue(undefined)
    });

    /**
     * Build an engine that returns ConfigurationManager, PageManager, and optionally SearchManager.
     */
    const makeEngineWithPageManager = (configManager, pageManager, searchManager = null) => ({
      getManager: vi.fn((name) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'PageManager') return pageManager;
        if (name === 'SearchManager') return searchManager;
        return null;
      })
    });

    // Tests ------------------------------------------------------------------

    test('seeds pages from addon pages/ directory on startup', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440001';
      await makeAddonWithSeedPages('seed-addon', [
        { filename: 'home.md', uuid, slug: 'home', title: 'Home' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['seed-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).toHaveBeenCalledTimes(1);
      expect(pageManager.savePage).toHaveBeenCalledWith('home', expect.stringContaining('Page content.'), expect.objectContaining({ uuid, addon: 'seed-addon' }));
    });

    test('seeds multiple pages from one addon', async () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440011';
      const uuid2 = '550e8400-e29b-41d4-a716-446655440012';
      await makeAddonWithSeedPages('multi-seed-addon', [
        { filename: 'page1.md', uuid: uuid1, slug: 'page-one', title: 'Page 1' },
        { filename: 'page2.md', uuid: uuid2, slug: 'page-two', title: 'Page 2' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['multi-seed-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).toHaveBeenCalledTimes(2);
      expect(pageManager.savePage).toHaveBeenCalledWith('page-one', expect.any(String), expect.objectContaining({ uuid: uuid1 }));
      expect(pageManager.savePage).toHaveBeenCalledWith('page-two', expect.any(String), expect.objectContaining({ uuid: uuid2 }));
    });

    test('sets addon field on seeded pages', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440031';
      await makeAddonWithSeedPages('meta-addon', [
        { filename: 'page.md', uuid, slug: 'meta-page', title: 'Test' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['meta-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      const [, , metadata] = pageManager.savePage.mock.calls[0];
      expect(metadata.addon).toBe('meta-addon');
    });

    test('sets system-category: addon when not already present', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440032';
      await makeAddonWithSeedPages('syscat-addon', [
        { filename: 'page.md', uuid, slug: 'syscat-page', title: 'Test' } // no systemCategory
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['syscat-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      const [, , metadata] = pageManager.savePage.mock.calls[0];
      expect(metadata['system-category']).toBe('addon');
    });

    test('preserves existing system-category value if already set in source', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440033';
      await makeAddonWithSeedPages('custom-cat-addon', [
        { filename: 'page.md', uuid, slug: 'custom-page', title: 'Test', systemCategory: 'custom-cat' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['custom-cat-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      const [, , metadata] = pageManager.savePage.mock.calls[0];
      expect(metadata['system-category']).toBe('custom-cat');
    });

    test('skips page that already exists — user edits are never overwritten', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440041';
      await makeAddonWithSeedPages('idem-addon', [
        { filename: 'home.md', uuid, slug: 'idem-home', title: 'Addon Default Title' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['idem-addon'] });
      // pageExists returns true for 'idem-home' — simulates a user-edited page
      const pageManager = makePageManager(['idem-home'], {
        'idem-home': { content: 'existing content', metadata: { title: 'User Edited', 'system-category': 'addon' } }
      });
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).not.toHaveBeenCalled();
    });

    test('re-indexes already-existing pages via SearchManager on startup', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440042';
      await makeAddonWithSeedPages('reindex-addon', [
        { filename: 'page.md', uuid, slug: 'reindex-page', title: 'Test' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['reindex-addon'] });
      const existingPage = { content: 'existing content', metadata: { title: 'Test', 'system-category': 'addon' } };
      const pageManager = makePageManager(['reindex-page'], { 'reindex-page': existingPage });
      const searchManager = makeSearchManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager, searchManager));
      await manager.initialize();

      expect(pageManager.savePage).not.toHaveBeenCalled();
      expect(searchManager.updatePageInIndex).toHaveBeenCalledWith('reindex-page', {
        name: 'reindex-page',
        content: existingPage.content,
        metadata: existingPage.metadata
      });
    });

    test('indexes new pages in SearchManager after seeding', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440043';
      await makeAddonWithSeedPages('index-addon', [
        { filename: 'page.md', uuid, slug: 'index-page', title: 'Test' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['index-addon'] });
      const pageManager = makePageManager();
      const searchManager = makeSearchManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager, searchManager));
      await manager.initialize();

      expect(pageManager.savePage).toHaveBeenCalledTimes(1);
      expect(searchManager.updatePageInIndex).toHaveBeenCalledWith('index-page',
        expect.objectContaining({ name: 'index-page', metadata: expect.objectContaining({ 'system-category': 'addon' }) })
      );
    });

    test('skips search indexing gracefully when SearchManager is unavailable', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440044';
      await makeAddonWithSeedPages('no-search-addon', [
        { filename: 'page.md', uuid, slug: 'no-search-page', title: 'Test' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['no-search-addon'] });
      const pageManager = makePageManager(); // no SearchManager wired
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await expect(manager.initialize()).resolves.not.toThrow();
      expect(pageManager.savePage).toHaveBeenCalledTimes(1);
    });

    test('skips page with missing uuid in frontmatter', async () => {
      await makeAddonWithSeedPages('no-uuid-addon', [
        { filename: 'no-uuid.md', slug: 'no-uuid-page', title: 'No UUID' } // uuid intentionally omitted
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['no-uuid-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).not.toHaveBeenCalled();
    });

    test('skips page with missing slug in frontmatter', async () => {
      await makeAddonWithSeedPages('no-slug-addon', [
        { filename: 'no-slug.md', uuid: '550e8400-e29b-41d4-a716-446655440099', title: 'No Slug' } // slug omitted
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['no-slug-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).not.toHaveBeenCalled();
    });

    test('skips page with invalid uuid format', async () => {
      await makeAddonWithSeedPages('bad-uuid-addon', [
        { filename: 'bad.md', uuid: 'not-a-valid-uuid', slug: 'bad-uuid-page', title: 'Bad UUID' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['bad-uuid-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await manager.initialize();

      expect(pageManager.savePage).not.toHaveBeenCalled();
    });

    test('no-op when PageManager is unavailable', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440060';
      await makeAddonWithSeedPages('no-pm-addon', [
        { filename: 'page.md', uuid, slug: 'nope', title: 'Test' }
      ]);

      const configManager = makeConfigManager({ enabledAddons: ['no-pm-addon'] });
      // engine returns null for PageManager
      const manager = new AddonsManager(makeEngine(configManager));
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    test('no-op when addon has no pages/ directory', async () => {
      const addonDir = path.join(tmpDir, 'no-pages-addon');
      await fs.mkdir(addonDir);
      await fs.writeFile(
        path.join(addonDir, 'index.js'),
        'module.exports = { name: \'no-pages-addon\', version: \'1.0.0\', register: () => {} };',
        'utf8'
      );

      const configManager = makeConfigManager({ enabledAddons: ['no-pages-addon'] });
      const pageManager = makePageManager();
      const manager = new AddonsManager(makeEngineWithPageManager(configManager, pageManager));
      await expect(manager.initialize()).resolves.not.toThrow();

      expect(pageManager.savePage).not.toHaveBeenCalled();
    });
  });

  // #718: getAddonConfig must deep-nest dotted keys so addons can read
  // structured config (config.calendars.clubhouse.enabled) instead of
  // flat-dot keys (config['calendars.clubhouse.enabled']) that nobody
  // was actually parsing.
  describe('getAddonConfig — deep-nest dotted keys (#718)', () => {
    test('single-segment keys stay flat', () => {
      const configManager = makeConfigManager({
        allProperties: {
          'ngdpbase.addons.calendar.enabled': true,
          'ngdpbase.addons.calendar.dataPath': './data/calendar'
        }
      });
      const manager = new AddonsManager(makeEngine(configManager));
      const cfg = manager.getAddonConfig('calendar');
      expect(cfg.enabled).toBe(true);
      expect(cfg.dataPath).toBe('./data/calendar');
    });

    test('multi-segment keys nest into objects', () => {
      const configManager = makeConfigManager({
        allProperties: {
          'ngdpbase.addons.calendar.calendars.clubhouse.enabled': true,
          'ngdpbase.addons.calendar.calendars.clubhouse.workflow': 'reservation',
          'ngdpbase.addons.calendar.calendars.clubhouse.visibility': 'authenticated'
        }
      });
      const manager = new AddonsManager(makeEngine(configManager));
      const cfg = manager.getAddonConfig('calendar');
      expect(cfg.calendars).toEqual({
        clubhouse: {
          enabled: true,
          workflow: 'reservation',
          visibility: 'authenticated'
        }
      });
    });

    test('flat and nested keys coexist', () => {
      const configManager = makeConfigManager({
        allProperties: {
          'ngdpbase.addons.calendar.dataPath': './data/calendar',
          'ngdpbase.addons.calendar.clubhouse-manager-email': 'jim@example.com',
          'ngdpbase.addons.calendar.calendars.clubhouse.enabled': true,
          'ngdpbase.addons.calendar.calendars.clubhouse.workflow': 'reservation'
        }
      });
      const manager = new AddonsManager(makeEngine(configManager));
      const cfg = manager.getAddonConfig('calendar');
      expect(cfg.dataPath).toBe('./data/calendar');
      expect(cfg['clubhouse-manager-email']).toBe('jim@example.com');
      expect(cfg.calendars).toEqual({
        clubhouse: { enabled: true, workflow: 'reservation' }
      });
    });

    test('only properties matching the addon prefix are included', () => {
      const configManager = makeConfigManager({
        allProperties: {
          'ngdpbase.addons.calendar.dataPath': './data/calendar',
          'ngdpbase.addons.forms.dataPath': './data/forms',
          'ngdpbase.application-name': 'Test'
        }
      });
      const manager = new AddonsManager(makeEngine(configManager));
      const cfg = manager.getAddonConfig('calendar');
      expect(cfg.dataPath).toBe('./data/calendar');
      expect(Object.keys(cfg)).toEqual(['dataPath']);
    });
  });

  describe('theme deploy (#443)', () => {
    // configManager that points the instance themes dir inside tmpDir so
    // tests never touch the real ./themes
    const themeEngine = () => {
      const themesDir = path.join(tmpDir, 'themes');
      const cm = {
        getProperty: vi.fn((key: string, dflt: unknown) =>
          key === 'ngdpbase.theme.directory' ? themesDir : dflt)
      };
      return { engine: makeEngine(cm), themesDir };
    };

    const makeAddonWithTheme = async (name: string) => {
      const addonPath = path.join(tmpDir, name);
      await fs.ensureDir(path.join(addonPath, 'theme', 'css'));
      await fs.writeJson(path.join(addonPath, 'theme', 'theme.json'), { name });
      await fs.writeFile(path.join(addonPath, 'theme', 'css', 'site.css'), 'body{color:red}');
      return addonPath;
    };

    test('addonShipsTheme: true with theme.json sentinel, false without', async () => {
      const { engine } = themeEngine();
      const manager = new AddonsManager(engine);
      const withTheme = await makeAddonWithTheme('a1');
      const noTheme = path.join(tmpDir, 'a2');
      await fs.ensureDir(noTheme);
      expect(manager.addonShipsTheme(withTheme)).toBe(true);
      expect(manager.addonShipsTheme(noTheme)).toBe(false);
    });

    test('first-boot deploy copies theme/ → themes/<name>/', async () => {
      const { engine, themesDir } = themeEngine();
      const manager = new AddonsManager(engine);
      const addonPath = await makeAddonWithTheme('fairways');

      const r = await manager.seedAddonTheme('fairways', addonPath);

      expect(r).toMatchObject({ ok: true, deployed: true });
      expect(await fs.pathExists(path.join(themesDir, 'fairways', 'theme.json'))).toBe(true);
      expect(await fs.readFile(path.join(themesDir, 'fairways', 'css', 'site.css'), 'utf8'))
        .toBe('body{color:red}');
    });

    test('skip-if-exists: never overwrites an existing themes/<name>/ on first boot', async () => {
      const { engine, themesDir } = themeEngine();
      const manager = new AddonsManager(engine);
      const addonPath = await makeAddonWithTheme('fairways');
      // Pre-existing instance theme with a local edit
      await fs.ensureDir(path.join(themesDir, 'fairways'));
      await fs.writeFile(path.join(themesDir, 'fairways', 'theme.json'), '{"local":true}');

      const r = await manager.seedAddonTheme('fairways', addonPath);

      expect(r).toMatchObject({ ok: true, deployed: false });
      // Local edit preserved — not clobbered
      expect(await fs.readFile(path.join(themesDir, 'fairways', 'theme.json'), 'utf8'))
        .toBe('{"local":true}');
    });

    test('overwrite=true replaces an existing theme (dashboard redeploy)', async () => {
      const { engine, themesDir } = themeEngine();
      const manager = new AddonsManager(engine);
      const addonPath = await makeAddonWithTheme('fairways');
      await fs.ensureDir(path.join(themesDir, 'fairways'));
      await fs.writeFile(path.join(themesDir, 'fairways', 'theme.json'), '{"stale":true}');

      const r = await manager.seedAddonTheme('fairways', addonPath, true);

      expect(r).toMatchObject({ ok: true, deployed: true });
      expect(await fs.readJson(path.join(themesDir, 'fairways', 'theme.json')))
        .toMatchObject({ name: 'fairways' });
    });

    test('no theme/ is a no-op (ok, not deployed)', async () => {
      const { engine } = themeEngine();
      const manager = new AddonsManager(engine);
      const addonPath = path.join(tmpDir, 'plain');
      await fs.ensureDir(addonPath);

      const r = await manager.seedAddonTheme('plain', addonPath);
      expect(r).toMatchObject({ ok: true, deployed: false });
    });

    test('deployAddonTheme on an unknown addon returns ok:false not-found', async () => {
      const { engine } = themeEngine();
      const manager = new AddonsManager(engine);
      const r = await manager.deployAddonTheme('does-not-exist');
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/not found/i);
    });
  });
});
