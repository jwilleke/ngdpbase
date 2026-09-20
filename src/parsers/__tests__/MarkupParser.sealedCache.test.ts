/**
 * A sealed page's parse result never enters the shared parse-results cache
 * (#1423, epic #1382).
 *
 * The cache is one process-wide map keyed by a content hash. An entry made
 * while the owner's session is unlocked outlives that session, so a sealed
 * page's rendered HTML would sit in memory — and in any external cache backend
 * CacheManager is configured with — after the owner logs out.
 */

import MarkupParser from '../MarkupParser';

type CacheRegion = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
};

const newRegion = (): CacheRegion => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => true),
  del: vi.fn(async () => true),
  clear: vi.fn(async () => true)
});

describe('MarkupParser parse-results cache and sealed pages (#1423)', () => {
  let regions: Record<string, CacheRegion>;
  let region: CacheRegion;
  let sharedIndexable: Record<string, boolean>;
  let parser: MarkupParser;

  beforeEach(async () => {
    regions = {};
    const regionFor = (name: string): CacheRegion => (regions[name] ??= newRegion());
    region = regionFor('MarkupParser-ParseResults');
    sharedIndexable = { OpenPage: true, SealedPage: false };

    const engine = {
      getManager: (name: string) => {
        const managers: Record<string, unknown> = {
          ConfigurationManager: {
            getProperty: (_key: string, def: unknown) => def,
            getAllProperties: () => ({})
          },
          CacheManager: {
            isInitialized: () => true,
            region: (name: string) => regionFor(name),
            get: async () => null,
            set: async () => true
          },
          PageManager: {
            isSharedIndexable: (id: string) => sharedIndexable[id] ?? true
          },
          RenderingManager: { converter: { makeHtml: (t: string) => t } }
        };
        return managers[name] ?? null;
      }
    };

    parser = new MarkupParser(engine);
    await parser.initialize?.();
  });

  test('an ordinary page is cached: the entry is read and written', async () => {
    await parser.parse('Some text', { pageName: 'OpenPage' });
    expect(region.get).toHaveBeenCalled();
    expect(region.set).toHaveBeenCalled();
  });

  test('a sealed page is neither read from nor written to the parse cache', async () => {
    await parser.parse('Sealed secret text', { pageName: 'SealedPage' });
    expect(region.set).not.toHaveBeenCalled();
    expect(region.get).not.toHaveBeenCalled();
  });

  test('a sealed page still renders — skipping the cache is not skipping the parse', async () => {
    const html = await parser.parse('Sealed secret text', { pageName: 'SealedPage' });
    expect(html).toContain('Sealed secret text');
  });

  test('the page name arriving nested in pageContext is read the same way', async () => {
    await parser.parse('Sealed secret text', { pageContext: { pageName: 'SealedPage' } });
    expect(region.set).not.toHaveBeenCalled();
  });
});
