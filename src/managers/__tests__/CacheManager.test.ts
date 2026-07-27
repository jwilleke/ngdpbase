/**
 * CacheManager tests
 *
 * Tests CacheManager's core functionality:
 * - Initialization with ConfigurationManager
 * - Provider normalization (normalizeProviderName)
 * - Disabled cache loads NullCacheProvider
 * - Fallback to NullCacheProvider on load error
 * - get/set/del/clear/keys/stats/isHealthy proxy methods
 * - region() — returns RegionCache scoped to namespace
 * - flushAll() and shutdown()
 * - getCacheForManager() static helper
 */

import CacheManager from '../CacheManager';
import type { WikiEngine } from '../../types/WikiEngine';

const mockConfigManager = {
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const config: Record<string, unknown> = {
      'ngdpbase.cache.enabled': true,
      'ngdpbase.cache.provider.default': 'nullcacheprovider',
      'ngdpbase.cache.provider': 'nullcacheprovider',
      'ngdpbase.cache.defaultttl': 300,
      'ngdpbase.cache.maxkeys': 1000,
      'ngdpbase.cache.checkperiod': 120
    };
    return config[key] !== undefined ? config[key] : defaultValue;
  })
};

const mockEngine = {
  getManager: vi.fn((name: string) => {
    if (name === 'ConfigurationManager') return mockConfigManager;
    return null;
  })
};

describe('CacheManager', () => {
  let cm: CacheManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
      const config: Record<string, unknown> = {
        'ngdpbase.cache.enabled': true,
        'ngdpbase.cache.provider.default': 'nullcacheprovider',
        'ngdpbase.cache.provider': 'nullcacheprovider',
        'ngdpbase.cache.defaultttl': 300,
        'ngdpbase.cache.maxkeys': 1000,
        'ngdpbase.cache.checkperiod': 120
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    });

    cm = new CacheManager(mockEngine);
    await cm.initialize();
  });

  afterEach(async () => {
    if (cm.isInitialized()) {
      await cm.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should throw when ConfigurationManager is missing', async () => {
      const emptyEngine = { getManager: vi.fn(() => null) };
      const manager = new CacheManager(emptyEngine);

      await expect(manager.initialize()).rejects.toThrow('CacheManager requires ConfigurationManager');
    });

    test('should initialize successfully with NullCacheProvider', async () => {
      expect(cm.isInitialized()).toBe(true);
    });

    test('should load NullCacheProvider when cache is disabled', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ngdpbase.cache.enabled') return false;
        return defaultValue;
      });

      const disabledCm = new CacheManager(mockEngine);
      await disabledCm.initialize();

      expect(disabledCm.isInitialized()).toBe(true);
      // NullCacheProvider always returns healthy
      expect(await disabledCm.isHealthy()).toBe(true);
      await disabledCm.shutdown();
    });

    test('should fallback to NullCacheProvider on unknown provider name', async () => {
      mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'ngdpbase.cache.enabled') return true;
        if (key === 'ngdpbase.cache.provider') return 'nonexistentprovider';
        if (key === 'ngdpbase.cache.provider.default') return 'nullcacheprovider';
        if (key === 'ngdpbase.cache.defaultttl') return 300;
        if (key === 'ngdpbase.cache.maxkeys') return 1000;
        if (key === 'ngdpbase.cache.checkperiod') return 120;
        return defaultValue;
      });

      const fallbackCm = new CacheManager(mockEngine);
      await fallbackCm.initialize();

      // Should have fallen back gracefully (still initialized)
      expect(fallbackCm.isInitialized()).toBe(true);
      await fallbackCm.shutdown();
    });
  });

  describe('normalizeProviderName (via providerClass)', () => {
    const casesToTest = [
      { input: 'nullcacheprovider', expected: 'NullCacheProvider' },
      { input: 'nodecacheprovider', expected: 'NodeCacheProvider' },
      { input: 'rediscacheprovider', expected: 'RedisCacheProvider' },
      { input: 'null', expected: 'NullCacheProvider' },
      { input: 'disabled', expected: 'NullCacheProvider' }
    ];

    for (const { input, expected } of casesToTest) {
      test(`normalizes "${input}" to "${expected}"`, async () => {
        mockConfigManager.getProperty.mockImplementation((key: string, defaultValue: unknown) => {
          if (key === 'ngdpbase.cache.enabled') return true;
          if (key === 'ngdpbase.cache.provider') return input;
          if (key === 'ngdpbase.cache.provider.default') return 'nullcacheprovider';
          if (key === 'ngdpbase.cache.defaultttl') return 300;
          if (key === 'ngdpbase.cache.maxkeys') return 1000;
          if (key === 'ngdpbase.cache.checkperiod') return 120;
          return defaultValue;
        });

        const testCm = new CacheManager(mockEngine);
        await testCm.initialize();

        // getConfig() exposes the resolved provider class name
        const config = testCm.getConfig();
        expect(config.provider).toBe(expected);
        await testCm.shutdown();
      });
    }
  });

  describe('get/set/del', () => {
    test('set() and get() round-trip via NullCacheProvider (get always undefined)', async () => {
      await cm.set('test-key', { data: 42 });
      // NullCacheProvider always returns undefined
      const result = await cm.get('test-key');
      expect(result).toBeUndefined();
    });

    test('del() does not throw', async () => {
      await expect(cm.del('some-key')).resolves.not.toThrow();
    });

    test('del() accepts array of keys', async () => {
      await expect(cm.del(['key1', 'key2'])).resolves.not.toThrow();
    });
  });

  describe('clear()', () => {
    test('clear() without args clears global scope', async () => {
      await expect(cm.clear()).resolves.not.toThrow();
    });

    test('clear(region) delegates to RegionCache', async () => {
      await expect(cm.clear('my-region')).resolves.not.toThrow();
    });

    test('clear(region, pattern) delegates with pattern', async () => {
      await expect(cm.clear('my-region', 'page:*')).resolves.not.toThrow();
    });
  });

  describe('keys()', () => {
    test('returns empty array from NullCacheProvider', async () => {
      const result = await cm.keys('*');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('stats()', () => {
    test('returns global stats with provider and config fields', async () => {
      const result = await cm.stats();

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('config');
      expect(result.config).toHaveProperty('defaultTTL');
      expect(result.config).toHaveProperty('maxKeys');
    });

    test('stats() includes regions array', async () => {
      cm.region('test-region');
      const result = await cm.stats();

      expect(Array.isArray(result.regions)).toBe(true);
      expect(result.regions).toContain('test-region');
    });

    test('stats(region) returns region stats', async () => {
      const result = await cm.stats('some-region');
      expect(result).toBeDefined();
    });
  });

  describe('isHealthy()', () => {
    test('returns true when provider is healthy', async () => {
      expect(await cm.isHealthy()).toBe(true);
    });
  });

  describe('getConfig()', () => {
    test('returns configured TTL and maxKeys', async () => {
      const config = cm.getConfig();
      expect(config.defaultTTL).toBe(300);
      expect(config.maxKeys).toBe(1000);
    });
  });

  describe('region()', () => {
    test('returns a RegionCache for the given namespace', () => {
      const r = cm.region('pages');
      expect(r).toBeDefined();
      expect(typeof r.get).toBe('function');
      expect(typeof r.set).toBe('function');
    });

    test('returns the same RegionCache instance for the same name', () => {
      const r1 = cm.region('pages');
      const r2 = cm.region('pages');
      expect(r1).toBe(r2);
    });

    test('returns different instances for different region names', () => {
      const r1 = cm.region('pages');
      const r2 = cm.region('users');
      expect(r1).not.toBe(r2);
    });

    test('getRegions() lists all created regions', () => {
      cm.region('alpha');
      cm.region('beta');
      const names = cm.getRegions();
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });
  });

  describe('flushAll()', () => {
    test('flushAll() clears all regions', async () => {
      cm.region('r1');
      cm.region('r2');
      await cm.flushAll();
      expect(cm.getRegions()).toHaveLength(0);
    });
  });

  describe('shutdown()', () => {
    test('marks manager as not initialized after shutdown', async () => {
      await cm.shutdown();
      expect(cm.isInitialized()).toBe(false);
    });

    test('clears regions on shutdown', async () => {
      cm.region('pre-shutdown');
      await cm.shutdown();
      expect(cm.getRegions()).toHaveLength(0);
    });
  });

  describe('getCacheForManager() static helper', () => {
    test('returns a RegionCache from engine CacheManager', () => {
      const engineWithCm = {
        getManager: vi.fn((name: string) => {
          if (name === 'CacheManager') return cm;
          return null;
        })
      };

      const r = CacheManager.getCacheForManager(engineWithCm, 'my-manager');
      expect(r).toBeDefined();
      expect(typeof r.get).toBe('function');
    });

    test('returns a null RegionCache when CacheManager is unavailable', () => {
      const engineWithoutCm = {
        getManager: vi.fn(() => null)
      };

      const r = CacheManager.getCacheForManager(engineWithoutCm, 'my-manager');
      expect(r).toBeDefined();
      // NullCacheProvider-backed — get returns undefined
      expect(typeof r.get).toBe('function');
    });

    test('uses "default" as region when none is specified', () => {
      const engineWithCm = {
        getManager: vi.fn((name: string) => {
          if (name === 'CacheManager') return cm;
          return null;
        })
      };

      const r = CacheManager.getCacheForManager(engineWithCm);
      expect(r).toBeDefined();
    });
  });
});
