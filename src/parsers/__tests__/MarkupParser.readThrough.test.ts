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
  let nextEvent: string;

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
    nextEvent = 'Board meeting';

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
    // Declares nothing: fetching the manager is what records the dependency.
    managers.CalendarDataManager = { nextEvent: () => nextEvent };
    await plugins.registerPlugin('NextEvent', {
      execute: (context: { engine: { getManager(n: string): { nextEvent(): string } } }) => {
        renders++;
        return `<span class="event">${context.engine.getManager('CalendarDataManager').nextEvent()}</span>`;
      }
    });
    // What the viewer may see depends on their roles.
    await plugins.registerPlugin('EditorsOnly', {
      execute: (context: { userContext?: { roles?: string[] } }) => {
        renders++;
        return context.userContext?.roles?.includes('editor') ? '<span>secret</span>' : '<span>nothing</span>';
      }
    });

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

  test('a plugin that only fetches a manager re-renders when that manager bumps — nothing declared', async () => {
    expect(await parser.parse('[{NextEvent}]', { pageName: 'Home' })).toContain('Board meeting');
    nextEvent = 'Annual picnic';
    versions.set('CalendarDataManager', 'v2');
    expect(await parser.parse('[{NextEvent}]', { pageName: 'Home' })).toContain('Annual picnic');
    expect(renders).toBe(2);
  });

  test('every render depends on page data: a page change re-renders a page with no plugins', async () => {
    const plain = { pageName: 'Plain' };
    const first = await parser.parse('Just text', plain);
    expect(await parser.parse('Just text', plain)).toBe(first);
    versions.set('PageManager', 'v2');
    // Re-rendered (same text, so the same HTML) — what matters is the cache was not trusted.
    const spy = vi.spyOn(parser as unknown as { renderUncached: () => Promise<string> }, 'renderUncached');
    await parser.parse('Just text', plain);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a revoked role is not served the render made before the revoke', async () => {
    const as = (roles: string[]) => ({ pageName: 'Books', userContext: { username: 'molly', roles } });
    expect(await parser.parse('[{EditorsOnly}]', as(['reader', 'editor']))).toContain('secret');
    expect(await parser.parse('[{EditorsOnly}]', as(['reader']))).toContain('nothing');
  });
});
