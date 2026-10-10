/**
 * #1751: read-through with data versions. An entry is served only while every
 * version it was built from is still current; a manager bumps its topic after
 * a write, and the next read re-renders.
 */
import NodeCacheAdapter from '../NodeCacheAdapter';
import RegionCache from '../RegionCache';
import CacheDependencies from '../CacheDependencies';

describe('CacheDependencies', () => {
  test('snapshots a topic\'s version when the dependency is declared, once per topic', async () => {
    let current = 'v1';
    const versionOf = vi.fn(async () => current);
    const deps = new CacheDependencies(versionOf);
    deps.dependsOn('LedgerManager');
    current = 'v2'; // a write after the plugin declared and read its data
    deps.dependsOn('LedgerManager');
    expect(await deps.resolved()).toEqual({ LedgerManager: 'v1' });
    expect(versionOf).toHaveBeenCalledTimes(1);
  });

  test('volatile marks a render that must not be stored', () => {
    const deps = new CacheDependencies(async () => '0');
    expect(deps.isVolatile()).toBe(false);
    deps.markVolatile();
    expect(deps.isVolatile()).toBe(true);
  });
});

describe('RegionCache.getOrSetVersioned', () => {
  let adapter: NodeCacheAdapter;
  let versions: Map<string, string>;
  let region: RegionCache;

  beforeEach(() => {
    adapter = new NodeCacheAdapter({ stdTTL: 60, checkperiod: 10, maxKeys: 100 });
    versions = new Map();
    region = new RegionCache(adapter, 'pages', async (topic) => versions.get(topic) ?? '0');
  });

  afterEach(async () => { await adapter.close(); });

  test('serves the stored value while its versions are current', async () => {
    const factory = vi.fn(async (deps: CacheDependencies) => { deps.dependsOn('LedgerManager'); return 'html-1'; });
    expect(await region.getOrSetVersioned('Ledger', factory)).toBe('html-1');
    expect(await region.getOrSetVersioned('Ledger', factory)).toBe('html-1');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test('re-renders once a topic it read has moved, and stores the new value', async () => {
    let n = 0;
    const factory = vi.fn(async (deps: CacheDependencies) => { deps.dependsOn('LedgerManager'); return `html-${++n}`; });
    await region.getOrSetVersioned('Ledger', factory);
    versions.set('LedgerManager', 'bumped');
    expect(await region.getOrSetVersioned('Ledger', factory)).toBe('html-2');
    expect(await region.getOrSetVersioned('Ledger', factory)).toBe('html-2');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('a topic it did not read does not invalidate it', async () => {
    const factory = vi.fn(async (deps: CacheDependencies) => { deps.dependsOn('LedgerManager'); return 'html'; });
    await region.getOrSetVersioned('Ledger', factory);
    versions.set('CalendarDataManager', 'bumped');
    await region.getOrSetVersioned('Ledger', factory);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test('a volatile render is returned but never stored', async () => {
    const factory = vi.fn(async (deps: CacheDependencies) => { deps.markVolatile(); return 'clock'; });
    expect(await region.getOrSetVersioned('Clock', factory)).toBe('clock');
    await region.getOrSetVersioned('Clock', factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('reports whether it was a hit', async () => {
    const factory = async () => 'x';
    const hits: boolean[] = [];
    await region.getOrSetVersioned('k', factory, { onResult: (hit) => hits.push(hit) });
    await region.getOrSetVersioned('k', factory, { onResult: (hit) => hits.push(hit) });
    expect(hits).toEqual([false, true]);
  });

  test('a plain set value under the same key is not mistaken for a versioned entry', async () => {
    await region.set('k', 'raw');
    expect(await region.getOrSetVersioned('k', async () => 'fresh')).toBe('fresh');
  });
});
