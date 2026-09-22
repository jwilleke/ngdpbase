/**
 * #1462: the page door does the shared-index work; routes do none.
 *
 * PageManager's save and delete doors bring the link graph, the search index,
 * attachment mentions, page assets and the rendered-page cache in step with
 * the change (PageManager.sharedIndexes.test.ts). These tests hold the JSON
 * page routes to their side of that: they save or delete through the door,
 * touch no shared index themselves, and act on what the door answers — a
 * rename rewrites the referrers the door read before the old title left the
 * link graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WikiRoutes from '../WikiRoutes.js';
import { doorSaveResult } from './__fixtures__/pageDoor';

describe('WikiRoutes JSON page routes leave the shared indexes to the door (#1462)', () => {
  let routes: any;
  let pageManager: any;
  let rendering: Record<string, ReturnType<typeof vi.fn>>;
  let search: Record<string, ReturnType<typeof vi.fn>>;
  let attachments: Record<string, ReturnType<typeof vi.fn>>;
  let assets: Record<string, ReturnType<typeof vi.fn>>;
  let cache: Record<string, ReturnType<typeof vi.fn>>;
  const page = { content: 'see [Other]', metadata: { title: 'Old Title', uuid: 'uuid-old', 'system-keywords': [] as string[] } };

  const req = (params: Record<string, string>, body: Record<string, unknown> = {}): any => ({
    params,
    body,
    ip: '10.0.0.1',
    userContext: { username: 'jim', isAuthenticated: true, roles: ['admin'] }
  });
  const res = (): any => {
    const r: any = {};
    r.status = vi.fn(() => r);
    r.json = vi.fn(() => r);
    r.set = vi.fn(() => r);
    return r;
  };

  /** No shared index was touched by the route. */
  const expectNoRouteIndexWork = () => {
    for (const fn of [...Object.values(rendering), ...Object.values(search), ...Object.values(attachments), ...Object.values(assets), ...Object.values(cache)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  };

  beforeEach(() => {
    rendering = {
      addPageToCache: vi.fn(),
      updatePageInLinkGraph: vi.fn(),
      removePageFromLinkGraph: vi.fn(),
      getReferringPages: vi.fn(() => ['Stale Referrer'])
    };
    search = { updatePageInIndex: vi.fn(async () => {}), removePageFromIndex: vi.fn(async () => {}) };
    attachments = { syncPageMentions: vi.fn(async () => {}) };
    assets = { syncPageAssets: vi.fn(async () => {}) };
    cache = { clear: vi.fn(async () => {}) };

    pageManager = {
      getPage: vi.fn(async (name: string) => (name === 'Old Title' ? page : null)),
      getPageMetadata: vi.fn(async () => page.metadata),
      getPageUUID: vi.fn(() => 'uuid-old'),
      savePage: vi.fn(async (pageName: string, content: string, metadata?: Record<string, unknown>) =>
        doorSaveResult(pageName, content, metadata, { name: 'Old Title', referrers: ['Alpha', 'Beta'] })),
      deletePageWithContext: vi.fn(async () => true)
    };

    const engine = {
      getManager: vi.fn((name: string) => {
        switch (name) {
        case 'PageManager': return pageManager;
        case 'RenderingManager': return rendering;
        case 'SearchManager': return search;
        case 'AttachmentManager': return attachments;
        case 'AssetManager': return assets;
        case 'CacheManager': return { isInitialized: () => true, ...cache };
        case 'PolicyInformationPoint': return { checkPagePermissionWithContext: vi.fn(async () => true) };
        case 'ConfigurationManager': return { getProperty: (_k: string, d: unknown) => d };
        default: return null;
        }
      })
    };
    routes = new WikiRoutes(engine);
    // Admin, for the test-artifact route's gate.
    vi.spyOn(routes, 'createWikiContext').mockImplementation((...args: unknown[]) => {
      const opts = (args[1] ?? {}) as Record<string, unknown>;
      return { ...opts, userContext: (args[0] as any).userContext, hasPermission: vi.fn(async () => true) };
    });
  });

  it('a rename saves through the door and rewrites the referrers the door read', async () => {
    const rewrite = vi.spyOn(routes, 'rewriteInboundLinksAfterRename').mockResolvedValue(undefined);
    const r = res();
    await routes.apiRenamePage(req({ identifier: 'Old Title' }, { newTitle: 'New Title' }), r);

    expect(r.json).toHaveBeenCalledWith({ success: true, from: 'Old Title', to: 'New Title' });
    expect(pageManager.savePage).toHaveBeenCalledWith('Old Title', expect.any(String), expect.objectContaining({ title: 'New Title' }), expect.anything(), expect.anything());
    // The door's referrers — not a link-graph read the route made itself.
    expect(rewrite).toHaveBeenCalledWith(expect.anything(), ['Alpha', 'Beta'], 'Old Title', 'New Title');
    expectNoRouteIndexWork();
  });

  it('a delete goes through the door and the route reindexes nothing', async () => {
    const r = res();
    await routes.apiDeletePage(req({ identifier: 'Old Title' }), r);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, pageName: 'Old Title' }));
    expect(pageManager.deletePageWithContext).toHaveBeenCalledTimes(1);
    expectNoRouteIndexWork();
  });

  it('marking a test artifact saves through the door and the route reindexes nothing', async () => {
    const r = res();
    await routes.apiMarkTestArtifact(req({ identifier: 'Old Title' }), r);

    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, changed: true }));
    expect(pageManager.savePage).toHaveBeenCalledTimes(1);
    expectNoRouteIndexWork();
  });
});
