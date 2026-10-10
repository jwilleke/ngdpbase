/**
 * #1751: the page cache reads through with data versions. A page whose plugin
 * reads a manager's data stays cached until that manager bumps its topic, then
 * re-renders on the next read; a volatile plugin keeps its page out of the
 * cache. Real MarkupParser, PluginManager and RegionCache; an in-memory adapter.
 */
import MarkupParser from '../MarkupParser';
import PluginManager from '../../managers/PluginManager';
import RegionCache from '../../cache/RegionCache';
import NodeCacheAdapter from '../../cache/NodeCacheAdapter';

describe('MarkupParser parse cache: read-through with data versions (#1751)', () => {
  let adapter: NodeCacheAdapter;
  let versions: Map<string, string>;
  let parser: MarkupParser;
  let balance: number;
  let renders: number;

  beforeEach(async () => {
    adapter = new NodeCacheAdapter({ stdTTL: 300, checkperiod: 0, maxKeys: 100 });
    versions = new Map();
    const regions = new Map<string, RegionCache>();
    const region = (name: string) => {
      if (!regions.has(name)) regions.set(name, new RegionCache(adapter as never, name, async (t) => versions.get(t) ?? '0'));
      return regions.get(name);
    };
    balance = 100;
    renders = 0;

    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getAllProperties: () => ({}) },
      CacheManager: { isInitialized: () => true, region },
      PageManager: { isSharedIndexable: () => true },
      RenderingManager: { converter: { makeHtml: (t: string) => t } }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null, logger: { info() {}, warn() {}, debug() {}, error() {} } };
    const plugins = new PluginManager(engine);
    managers.PluginManager = plugins;
    await plugins.registerPlugin('Balance', {
      execute: (context: { dependsOn?: (t: string) => void }) => {
        context.dependsOn?.('LedgerManager');
        renders++;
        return `<span class="balance">${balance}</span>`;
      }
    });
    await plugins.registerPlugin('Clock', { volatile: true, execute: () => { renders++; return `<span class="clock">${renders}</span>`; } });

    parser = new MarkupParser(engine);
    await parser.initialize?.();
  });

  afterEach(async () => { await adapter.close(); });

  test('cached while the data is unchanged; re-rendered once its manager bumps', async () => {
    const page = 'Balance: [{Balance}]';
    expect(await parser.parse(page, { pageName: 'Ledger' })).toContain('>100<');
    balance = 250; // written, but not yet announced
    expect(await parser.parse(page, { pageName: 'Ledger' })).toContain('>100<');
    expect(renders).toBe(1);

    versions.set('LedgerManager', 'v2'); // LedgerManager bumps after its write
    expect(await parser.parse(page, { pageName: 'Ledger' })).toContain('>250<');
    expect(await parser.parse(page, { pageName: 'Ledger' })).toContain('>250<');
    expect(renders).toBe(2);
  });

  test('a bump of data the page does not read leaves it cached', async () => {
    await parser.parse('[{Balance}]', { pageName: 'Ledger' });
    versions.set('CalendarDataManager', 'v9');
    await parser.parse('[{Balance}]', { pageName: 'Ledger' });
    expect(renders).toBe(1);
  });

  test('a page with a volatile plugin is never served from the cache', async () => {
    await parser.parse('[{Clock}]', { pageName: 'Home' });
    await parser.parse('[{Clock}]', { pageName: 'Home' });
    expect(renders).toBe(2);
  });
});
