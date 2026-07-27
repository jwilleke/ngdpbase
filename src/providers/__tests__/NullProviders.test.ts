/**
 * NullAuditProvider and NullCacheProvider tests
 *
 * @jest-environment node
 */

// Bypass global provider mocks so we test real implementations
vi.unmock('../../providers/NullAuditProvider');
vi.unmock('../../providers/NullCacheProvider');

import NullAuditProvider from '../NullAuditProvider';
import NullCacheProvider from '../NullCacheProvider';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(): WikiEngine {
  return { getManager: vi.fn(() => null) };
}

// ─── NullAuditProvider ──────────────────────────────────────────────────────

describe('NullAuditProvider', () => {
  test('initialize() sets initialized=true', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    expect((p as unknown as { initialized: boolean }).initialized).toBe(true);
  });

  test('getProviderInfo() returns correct name', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const info = p.getProviderInfo();
    expect(info.name).toBe('NullAuditProvider');
    expect(Array.isArray(info.features)).toBe(true);
  });

  test('logAuditEvent() returns null-event-id', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const id = await p.logAuditEvent({
      eventType: 'test', user: 'u', resource: '/r', resourceType: 'page',
      action: 'view', result: 'allow', severity: 'low'
    } as Parameters<typeof p.logAuditEvent>[0]);
    expect(id).toBe('null-event-id');
  });

  test('searchAuditLogs() returns empty results', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const results = await p.searchAuditLogs();
    expect(results.results).toEqual([]);
    expect(results.total).toBe(0);
    expect(results.hasMore).toBe(false);
  });

  test('searchAuditLogs() uses provided limit/offset', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const results = await p.searchAuditLogs({}, { limit: 50, offset: 10 });
    expect(results.limit).toBe(50);
    expect(results.offset).toBe(10);
  });

  test('getAuditStats() returns zero counts', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const stats = await p.getAuditStats();
    expect(stats.totalEvents).toBe(0);
    expect(stats.securityIncidents).toBe(0);
  });

  test('exportAuditLogs() returns empty JSON array by default', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const data = await p.exportAuditLogs();
    expect(data).toBe('[]');
  });

  test('exportAuditLogs() returns CSV header for csv format', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    const data = await p.exportAuditLogs({}, 'csv');
    expect(data).toContain('timestamp');
    expect(data).toContain('eventType');
  });

  test('flush() resolves without error', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    await expect(p.flush()).resolves.not.toThrow();
  });

  test('cleanup() resolves without error', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    await expect(p.cleanup()).resolves.not.toThrow();
  });

  test('isHealthy() returns true', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    expect(await p.isHealthy()).toBe(true);
  });

  test('close() sets initialized=false', async () => {
    const p = new NullAuditProvider(makeEngine());
    await p.initialize();
    await p.close();
    expect((p as unknown as { initialized: boolean }).initialized).toBe(false);
  });
});

// ─── NullCacheProvider ──────────────────────────────────────────────────────

describe('NullCacheProvider', () => {
  test('initialize() sets initialized=true', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    expect((p as unknown as { initialized: boolean }).initialized).toBe(true);
  });

  test('getProviderInfo() returns correct name', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    const info = p.getProviderInfo();
    expect(info.name).toBe('NullCacheProvider');
  });

  test('get() always returns undefined', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    expect(await p.get('any-key')).toBeUndefined();
  });

  test('set() resolves without error', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await expect(p.set('key', 'value', 60)).resolves.not.toThrow();
  });

  test('del() resolves without error for single key', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await expect(p.del('key')).resolves.not.toThrow();
  });

  test('del() resolves without error for array of keys', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await expect(p.del(['key1', 'key2'])).resolves.not.toThrow();
  });

  test('clear() resolves without error', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await expect(p.clear()).resolves.not.toThrow();
  });

  test('clear() with pattern resolves without error', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await expect(p.clear('prefix:*')).resolves.not.toThrow();
  });

  test('keys() returns empty array', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    expect(await p.keys()).toEqual([]);
  });

  test('keys() with pattern returns empty array', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    expect(await p.keys('prefix:*')).toEqual([]);
  });

  test('stats() returns all-zero stats', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    const s = await p.stats();
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
    expect(s.hitRate).toBe(0);
  });

  test('isHealthy() returns true', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    expect(await p.isHealthy()).toBe(true);
  });

  test('close() sets initialized=false', async () => {
    const p = new NullCacheProvider(makeEngine());
    await p.initialize();
    await p.close();
    expect((p as unknown as { initialized: boolean }).initialized).toBe(false);
  });
});
