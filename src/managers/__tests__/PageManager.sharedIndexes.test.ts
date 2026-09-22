/**
 * #1462: the page door keeps the shared indexes in step — and nothing else does.
 *
 * Every save and delete through PageManager brings the link graph, the search
 * index, attachment mentions, page assets and the rendered-page cache (of the
 * page and of the pages linking to it) in step with the change. Callers —
 * routes, import, addon seeding, the shipped-page seeder — do none of it, so
 * this is the one place that work is proven.
 */
import PageManager from '../PageManager';

interface StoredPage { content: string; metadata: Record<string, unknown> }

function makeDoor(existing: Record<string, StoredPage> = {}, links: Record<string, string[]> = {}) {
  const pages = new Map(Object.entries(existing));
  // target → pages linking to it
  const graph = new Map(Object.entries(links));
  const uuids = new Map<string, string>([['Alpha', 'uuid-alpha'], ['Beta', 'uuid-beta'], ['Gamma', 'uuid-gamma']]);

  const rendering = {
    getReferringPages: vi.fn((name: string) => [...(graph.get(name) ?? [])]),
    removePageFromLinkGraph: vi.fn((name: string) => { graph.delete(name); }),
    addPageToCache: vi.fn(),
    updatePageInLinkGraph: vi.fn()
  };
  const search = { updatePageInIndex: vi.fn(async () => {}), removePageFromIndex: vi.fn(async () => {}) };
  const attachments = { syncPageMentions: vi.fn(async () => {}) };
  const assets = { syncPageAssets: vi.fn(async () => {}) };
  const cache = { isInitialized: () => true, clear: vi.fn(async () => {}) };

  const provider = {
    // As the provider answers: title and uuid on the page, and in its frontmatter.
    getPage: vi.fn(async (name: string) => {
      const p = pages.get(name);
      return p ? { ...p, title: p.metadata.title, uuid: p.metadata.uuid } : null;
    }),
    getPageMetadata: vi.fn(async (name: string) => pages.get(name)?.metadata ?? null),
    getPageUUID: vi.fn((name: string) => uuids.get(name) ?? null),
    savePage: vi.fn(async (name: string, _content: string, metadata: Record<string, unknown>) => ({
      name: typeof metadata.title === 'string' ? metadata.title : name,
      uuid: typeof metadata.uuid === 'string' ? metadata.uuid : 'uuid-new'
    })),
    deletePage: vi.fn(async (name: string) => pages.delete(name))
  };

  const managers: Record<string, unknown> = {
    RenderingManager: rendering,
    SearchManager: search,
    AttachmentManager: attachments,
    AssetManager: assets,
    CacheManager: cache,
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: (_k: string, d: string) => d }
  };
  const pm = new PageManager({ getManager: vi.fn((name: string) => managers[name] ?? null) });
  (pm as unknown as { provider: unknown }).provider = provider;
  const ctx = (pageName: string, content: string | null) =>
    ({ pageName, content, userContext: { username: 'jim', isAuthenticated: true } }) as unknown;
  const cleared = () => cache.clear.mock.calls.map((c: unknown[]) => c[1]).sort();
  return { pm, provider, rendering, search, attachments, assets, cache, ctx, cleared };
}

describe('PageManager — the page door keeps the shared indexes (#1462)', () => {
  it('a new public page goes into every shared index, and its referrers\' rendered pages are cleared', async () => {
    const d = makeDoor({}, { 'New Page': ['Alpha'] });
    const saved = await d.pm.savePageWithContext(d.ctx('New Page', 'see [Beta]'), { title: 'New Page', uuid: 'uuid-new' });

    expect(saved).toEqual({ content: 'see [Beta]', name: 'New Page', uuid: 'uuid-new', previousName: null, previousReferrers: [] });
    expect(d.rendering.addPageToCache).toHaveBeenCalledWith('New Page');
    expect(d.rendering.updatePageInLinkGraph).toHaveBeenCalledWith('New Page', 'see [Beta]');
    expect(d.search.updatePageInIndex).toHaveBeenCalledWith('New Page', expect.objectContaining({ name: 'New Page', content: 'see [Beta]' }));
    expect(d.attachments.syncPageMentions).toHaveBeenCalledWith('New Page', 'see [Beta]');
    expect(d.assets.syncPageAssets).toHaveBeenCalledWith('New Page', 'see [Beta]');
    expect(d.rendering.removePageFromLinkGraph).not.toHaveBeenCalled();
    expect(d.search.removePageFromIndex).not.toHaveBeenCalled();
    expect(d.cleared()).toEqual(['rendered-pages:uuid-alpha:*', 'rendered-pages:uuid-new:*']);
  });

  it('an edit reindexes the page under its name without re-adding it', async () => {
    const d = makeDoor({ Doc: { content: 'old', metadata: { title: 'Doc', uuid: 'uuid-doc' } } });
    await d.pm.savePageWithContext(d.ctx('Doc', 'new'), { title: 'Doc', uuid: 'uuid-doc' });

    expect(d.rendering.addPageToCache).not.toHaveBeenCalled();
    expect(d.rendering.updatePageInLinkGraph).toHaveBeenCalledWith('Doc', 'new');
    expect(d.search.updatePageInIndex).toHaveBeenCalledWith('Doc', expect.objectContaining({ content: 'new' }));
    expect(d.search.removePageFromIndex).not.toHaveBeenCalled();
  });

  it('a rename moves the page to its new title and answers the referrers read before the old title left the graph', async () => {
    const d = makeDoor(
      { 'Old Title': { content: 'body', metadata: { title: 'Old Title', uuid: 'uuid-doc' } } },
      { 'Old Title': ['Alpha', 'Beta'] }
    );
    const saved = await d.pm.savePageWithContext(d.ctx('Old Title', 'body'), { title: 'New Title', uuid: 'uuid-doc' });

    expect(saved.previousName).toBe('Old Title');
    expect(saved.name).toBe('New Title');
    expect(saved.previousReferrers).toEqual(['Alpha', 'Beta']);
    expect(d.rendering.removePageFromLinkGraph).toHaveBeenCalledWith('Old Title');
    expect(d.search.removePageFromIndex).toHaveBeenCalledWith('Old Title');
    expect(d.rendering.addPageToCache).toHaveBeenCalledWith('New Title');
    expect(d.search.updatePageInIndex).toHaveBeenCalledWith('New Title', expect.objectContaining({ name: 'New Title' }));
    // The page and every page that linked to the old title.
    expect(d.cleared()).toEqual(['rendered-pages:uuid-alpha:*', 'rendered-pages:uuid-beta:*', 'rendered-pages:uuid-doc:*']);
  });

  it('a private page is kept out of every shared index; only its own rendered page is cleared', async () => {
    const d = makeDoor();
    d.provider.savePage.mockResolvedValueOnce({ name: 'private/jim/default/Diary', uuid: 'uuid-diary' });
    const saved = await d.pm.savePageWithContext(d.ctx('private/jim/default/Diary', 'secret'), { title: 'Diary', uuid: 'uuid-diary', private: true });

    expect(saved.name).toBe('private/jim/default/Diary');
    for (const fn of [d.rendering.addPageToCache, d.rendering.updatePageInLinkGraph, d.rendering.removePageFromLinkGraph,
      d.search.updatePageInIndex, d.search.removePageFromIndex, d.attachments.syncPageMentions, d.assets.syncPageAssets]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(d.cleared()).toEqual(['rendered-pages:uuid-diary:*']);
  });

  it('a public page moved into a store leaves the shared indexes under its old name', async () => {
    const d = makeDoor({ Doc: { content: 'body', metadata: { title: 'Doc', uuid: 'uuid-doc' } } }, { Doc: ['Gamma'] });
    d.provider.savePage.mockResolvedValueOnce({ name: 'private/jim/default/Doc', uuid: 'uuid-doc' });
    await d.pm.savePageWithContext(d.ctx('Doc', 'body'), { title: 'Doc', uuid: 'uuid-doc', private: true });

    expect(d.rendering.removePageFromLinkGraph).toHaveBeenCalledWith('Doc');
    expect(d.search.removePageFromIndex).toHaveBeenCalledWith('Doc');
    expect(d.search.updatePageInIndex).not.toHaveBeenCalled();
    expect(d.rendering.addPageToCache).not.toHaveBeenCalled();
    expect(d.cleared()).toEqual(['rendered-pages:uuid-doc:*', 'rendered-pages:uuid-gamma:*']);
  });

  it('a delete takes the page out of the shared indexes and clears its referrers\' rendered pages', async () => {
    const d = makeDoor({ Doc: { content: 'body', metadata: { title: 'Doc', uuid: 'uuid-doc' } } }, { Doc: ['Alpha'] });
    const deleted = await d.pm.deletePageWithContext(
      { pageName: 'Doc', userContext: { username: 'jim', isAuthenticated: true } }
    );

    expect(deleted).toBe(true);
    expect(d.rendering.removePageFromLinkGraph).toHaveBeenCalledWith('Doc');
    expect(d.search.removePageFromIndex).toHaveBeenCalledWith('Doc');
    expect(d.search.updatePageInIndex).not.toHaveBeenCalled();
    expect(d.cleared()).toEqual(['rendered-pages:uuid-alpha:*', 'rendered-pages:uuid-doc:*']);
  });

  it('the context-free savePage door — import, addon and shipped-page seeding — indexes too', async () => {
    const d = makeDoor();
    await d.pm.savePage('Seeded', 'hello', { title: 'Seeded', uuid: 'uuid-seeded' }, { username: 'system' }, { skipValidation: true });

    expect(d.rendering.addPageToCache).toHaveBeenCalledWith('Seeded');
    expect(d.search.updatePageInIndex).toHaveBeenCalledWith('Seeded', expect.objectContaining({ content: 'hello' }));
    expect(d.attachments.syncPageMentions).toHaveBeenCalledWith('Seeded', 'hello');
    expect(d.assets.syncPageAssets).toHaveBeenCalledWith('Seeded', 'hello');
  });

  it('a failing index step is logged, not thrown — the page is already saved', async () => {
    const d = makeDoor();
    d.search.updatePageInIndex.mockRejectedValueOnce(new Error('index down'));
    await expect(d.pm.savePageWithContext(d.ctx('P', 'x'), { title: 'P', uuid: 'uuid-p' })).resolves.toMatchObject({ name: 'P' });
    expect(d.attachments.syncPageMentions).toHaveBeenCalled();
  });
});
