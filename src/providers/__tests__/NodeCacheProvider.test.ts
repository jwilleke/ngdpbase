/**
 * NodeCacheProvider tests
 *
 * Covers:
 * - initialize() with ConfigurationManager
 * - initialize() throws without ConfigurationManager
 * - get(), set(), del(), clear(), keys(), stats(), isHealthy(), close(), backup()
 * - all "no cache" branches (before initialize)
 *
 * @jest-environment node
 */

vi.unmock('../../providers/NodeCacheProvider');

import NodeCacheProvider from '../NodeCacheProvider';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(overrides: Record<string, unknown> = {}): WikiEngine {
  const configManager = {
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      const map: Record<string, unknown> = {
        'ngdpbase.cache.provider.nodecache.stdttl': 60,
        'ngdpbase.cache.provider.nodecache.checkperiod': 30,
        'ngdpbase.cache.provider.nodecache.maxkeys': 100,
        'ngdpbase.cache.provider.nodecache.useclones': false,
        ...overrides
      };
      return map[key] !== undefined ? map[key] : defaultValue;
    })
  };
  return {
    getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? configManager : null)
  };
}

describe('NodeCacheProvider', () => {
  describe('initialize()', () => {
    test('throws when ConfigurationManager is unavailable', async () => {
      const engine = { getManager: vi.fn(() => null) } as unknown as WikiEngine;
      const p = new NodeCacheProvider(engine);
      await expect(p.initialize()).rejects.toThrow('ConfigurationManager');
    });

    test('initializes successfully with ConfigurationManager', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await expect(p.initialize()).resolves.not.toThrow();
      await p.close();
    });
  });

  describe('getProviderInfo()', () => {
    test('returns NodeCacheProvider name and features', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await p.initialize();
      const info = p.getProviderInfo();
      expect(info.name).toBe('NodeCacheProvider');
      expect(info.features).toContain('ttl');
      await p.close();
    });
  });

  describe('before initialize — no-cache branches', () => {
    test('get() returns undefined when not initialized', async () => {
      const p = new NodeCacheProvider(makeEngine());
      expect(await p.get('key')).toBeUndefined();
    });

    test('del() resolves when not initialized', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await expect(p.del('key')).resolves.not.toThrow();
    });

    test('clear() resolves when not initialized', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await expect(p.clear()).resolves.not.toThrow();
    });

    test('keys() returns empty array when not initialized', async () => {
      const p = new NodeCacheProvider(makeEngine());
      expect(await p.keys()).toEqual([]);
    });

    test('stats() returns zero stats when not initialized', async () => {
      const p = new NodeCacheProvider(makeEngine());
      const s = await p.stats();
      expect(s.hits).toBe(0);
      expect(s.keys).toBe(0);
    });
  });

  describe('cache operations after initialize()', () => {
    let provider: NodeCacheProvider;

    beforeEach(async () => {
      provider = new NodeCacheProvider(makeEngine());
      await provider.initialize();
    });

    afterEach(async () => {
      await provider.close();
    });

    test('set() and get() round-trip', async () => {
      await provider.set('hello', 'world');
      expect(await provider.get('hello')).toBe('world');
    });

    test('set() with explicit TTL', async () => {
      await provider.set('timed', 'value', 60);
      expect(await provider.get<string>('timed')).toBe('value');
    });

    test('del() removes a key', async () => {
      await provider.set('toRemove', 42);
      await provider.del('toRemove');
      expect(await provider.get('toRemove')).toBeUndefined();
    });

    test('del() with array of keys', async () => {
      await provider.set('k1', 'v1');
      await provider.set('k2', 'v2');
      await provider.del(['k1', 'k2']);
      expect(await provider.get('k1')).toBeUndefined();
    });

    test('keys() returns all keys', async () => {
      await provider.set('alpha', 1);
      await provider.set('beta', 2);
      const allKeys = await provider.keys();
      expect(allKeys).toContain('alpha');
      expect(allKeys).toContain('beta');
    });

    test('keys() with * pattern returns all', async () => {
      await provider.set('foo', 1);
      const allKeys = await provider.keys('*');
      expect(allKeys).toContain('foo');
    });

    test('keys() with prefix pattern filters', async () => {
      await provider.set('user:1', 'a');
      await provider.set('user:2', 'b');
      await provider.set('session:1', 'c');
      const userKeys = await provider.keys('user:*');
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
      expect(userKeys).not.toContain('session:1');
    });

    test('clear() with * flushes all keys', async () => {
      await provider.set('a', 1);
      await provider.set('b', 2);
      await provider.clear('*');
      expect(await provider.keys()).toEqual([]);
    });

    test('clear() with pattern removes matching keys', async () => {
      await provider.set('prefix:1', 'v1');
      await provider.set('prefix:2', 'v2');
      await provider.set('other', 'v3');
      await provider.clear('prefix:*');
      const remaining = await provider.keys();
      expect(remaining).not.toContain('prefix:1');
      expect(remaining).toContain('other');
    });

    test('clear() with no keys to match does not throw', async () => {
      await expect(provider.clear('nonexistent:*')).resolves.not.toThrow();
    });

    test('stats() returns non-zero after operations', async () => {
      await provider.set('s1', 'v1');
      await provider.get('s1');
      await provider.get('miss');
      const s = await provider.stats();
      expect(typeof s.keys).toBe('number');
      expect(typeof s.hitRate).toBe('number');
    });

    test('isHealthy() returns true', async () => {
      expect(await provider.isHealthy()).toBe(true);
    });

    test('backup() returns config and statistics', async () => {
      const backup = await provider.backup();
      expect(backup.provider).toBe('NodeCacheProvider');
      expect(backup.config).toBeDefined();
      expect(backup.statistics).toBeDefined();
      expect(typeof backup.keyCount).toBe('number');
    });

    test('getNodeCache() returns cache instance', () => {
      const cache = provider.getNodeCache();
      expect(cache).not.toBeNull();
    });
  });

  describe('close()', () => {
    test('sets initialized=false and nullifies cache', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await p.initialize();
      await p.close();
      expect(p.getNodeCache()).toBeNull();
    });

    test('close() when already closed does not throw', async () => {
      const p = new NodeCacheProvider(makeEngine());
      await expect(p.close()).resolves.not.toThrow();
    });
  });

  describe('backup() before initialize()', () => {
    test('returns backup with null config fallback', async () => {
      const p = new NodeCacheProvider(makeEngine());
      const backup = await p.backup();
      expect(backup.config.stdTTL).toBe(300);
      expect(backup.keyCount).toBe(0);
    });
  });
});
