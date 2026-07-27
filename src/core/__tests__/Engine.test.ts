/**
 * Engine tests
 *
 * Covers:
 * - Constructor
 * - initialize(): first call succeeds, second throws
 * - getManager() / registerManager()
 * - getRegisteredManagers()
 * - getProperty() / getProperties()
 * - isConfigured()
 * - getApplicationName() / getWorkDir()
 * - getConfig()
 * - setCapability() / getCapabilities()
 * - shutdown(): calls shutdown on managers
 *
 * @jest-environment node
 */

import Engine from '../Engine';
import type BaseManager from '../../managers/BaseManager';

const makeManager = (name = 'TestManager'): BaseManager => (({
  name,
  shutdown: vi.fn().mockResolvedValue(undefined)
}));

describe('Engine', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = new Engine();
  });

  describe('constructor', () => {
    test('creates engine in uninitialized state', () => {
      expect(engine.isConfigured()).toBe(false);
    });

    test('starts with empty managers map', () => {
      expect(engine.getRegisteredManagers()).toHaveLength(0);
    });
  });

  describe('initialize()', () => {
    test('initializes with empty config', async () => {
      await engine.initialize({});
      expect(engine.isConfigured()).toBe(true);
    });

    test('initializes with config object', async () => {
      await engine.initialize({ applicationName: 'TestWiki' });
      expect(engine.isConfigured()).toBe(true);
    });

    test('throws if called a second time', async () => {
      await engine.initialize({});
      await expect(engine.initialize({})).rejects.toThrow('already initialized');
    });

    test('stores config properties', async () => {
      await engine.initialize({ workDir: '/my/path' });
      expect(engine.getProperty('workDir')).toBe('/my/path');
    });
  });

  describe('registerManager() / getManager()', () => {
    test('registers and retrieves a manager by name', () => {
      const mgr = makeManager('PageManager');
      engine.registerManager('PageManager', mgr);
      expect(engine.getManager('PageManager')).toBe(mgr);
    });

    test('returns undefined for unknown manager', () => {
      expect(engine.getManager('NonExistentManager')).toBeUndefined();
    });

    test('overwrites manager registered with same name', () => {
      const mgr1 = makeManager('A');
      const mgr2 = makeManager('A');
      engine.registerManager('A', mgr1);
      engine.registerManager('A', mgr2);
      expect(engine.getManager('A')).toBe(mgr2);
    });
  });

  describe('getRegisteredManagers()', () => {
    test('returns empty array initially', () => {
      expect(engine.getRegisteredManagers()).toEqual([]);
    });

    test('returns names of all registered managers', () => {
      engine.registerManager('Alpha', makeManager('Alpha'));
      engine.registerManager('Beta', makeManager('Beta'));
      const names = engine.getRegisteredManagers();
      expect(names).toContain('Alpha');
      expect(names).toContain('Beta');
      expect(names).toHaveLength(2);
    });
  });

  describe('getProperty()', () => {
    test('returns null for missing key', async () => {
      await engine.initialize({});
      expect(engine.getProperty('missing')).toBeNull();
    });

    test('returns default value for missing key', async () => {
      await engine.initialize({});
      expect(engine.getProperty('missing', 'default')).toBe('default');
    });

    test('returns stored config value', async () => {
      await engine.initialize({ appName: 'MyApp' });
      expect(engine.getProperty('appName')).toBe('MyApp');
    });

    test('returns null default before initialization (empty properties)', () => {
      expect(engine.getProperty('anything')).toBeNull();
    });
  });

  describe('getProperties()', () => {
    test('returns empty map before initialization', () => {
      expect(engine.getProperties()).toBeInstanceOf(Map);
      expect(engine.getProperties().size).toBe(0);
    });

    test('returns map of all config properties', async () => {
      await engine.initialize({ key1: 'val1', key2: 42 });
      const props = engine.getProperties();
      expect(props.get('key1')).toBe('val1');
      expect(props.get('key2')).toBe(42);
    });
  });

  describe('isConfigured()', () => {
    test('returns false before initialization', () => {
      expect(engine.isConfigured()).toBe(false);
    });

    test('returns true after initialization', async () => {
      await engine.initialize({});
      expect(engine.isConfigured()).toBe(true);
    });
  });

  describe('getApplicationName()', () => {
    test('returns "ngdpbase" by default', async () => {
      await engine.initialize({});
      expect(engine.getApplicationName()).toBe('ngdpbase');
    });

    test('returns configured application name', async () => {
      await engine.initialize({ applicationName: 'MyWiki' });
      expect(engine.getApplicationName()).toBe('MyWiki');
    });
  });

  describe('getWorkDir()', () => {
    test('returns "./" by default', async () => {
      await engine.initialize({});
      expect(engine.getWorkDir()).toBe('./');
    });

    test('returns configured work dir', async () => {
      await engine.initialize({ workDir: '/data/wiki' });
      expect(engine.getWorkDir()).toBe('/data/wiki');
    });
  });

  describe('getConfig()', () => {
    test('returns empty object before initialization', () => {
      const config = engine.getConfig();
      expect(typeof config).toBe('object');
    });

    test('returns config object after initialization', async () => {
      await engine.initialize({ key: 'value' });
      expect(engine.getConfig()).toEqual(expect.objectContaining({ key: 'value' }));
    });
  });

  describe('setCapability() / getCapabilities()', () => {
    test('starts with empty capabilities', () => {
      expect(engine.getCapabilities()).toEqual({});
    });

    test('records a capability as enabled', () => {
      engine.setCapability('media', true);
      expect(engine.getCapabilities()).toEqual({ media: true });
    });

    test('records a capability as disabled', () => {
      engine.setCapability('audit', false);
      expect(engine.getCapabilities()).toEqual({ audit: false });
    });

    test('records multiple capabilities', () => {
      engine.setCapability('media', true);
      engine.setCapability('audit', false);
      engine.setCapability('search', true);
      const caps = engine.getCapabilities();
      expect(caps.media).toBe(true);
      expect(caps.audit).toBe(false);
      expect(caps.search).toBe(true);
    });

    test('overwrites capability', () => {
      engine.setCapability('media', true);
      engine.setCapability('media', false);
      expect(engine.getCapabilities().media).toBe(false);
    });
  });

  describe('shutdown()', () => {
    test('calls shutdown() on all managers', async () => {
      const mgr1 = makeManager('M1');
      const mgr2 = makeManager('M2');
      engine.registerManager('M1', mgr1);
      engine.registerManager('M2', mgr2);
      await engine.initialize({});

      await engine.shutdown();

      expect(mgr1.shutdown).toHaveBeenCalled();
      expect(mgr2.shutdown).toHaveBeenCalled();
    });

    test('marks engine as not initialized', async () => {
      await engine.initialize({});
      await engine.shutdown();
      expect(engine.isConfigured()).toBe(false);
    });

    test('does not throw if managers have no shutdown method', async () => {
      const mgrNoShutdown = { name: 'Lean' } as unknown as BaseManager;
      engine.registerManager('Lean', mgrNoShutdown);
      await engine.initialize({});
      await expect(engine.shutdown()).resolves.not.toThrow();
    });
  });
});
