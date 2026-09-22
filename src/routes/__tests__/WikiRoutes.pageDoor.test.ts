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
  let auditManager: any;
  let auditEvents: Array<Record<string, unknown>>;
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
    auditEvents = [];
    auditManager = {
      logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { auditEvents.push(e); return 'id'; }),
      // page-delete refuses without a durable sink (#1121), so the mock has one.
      flushAuditQueue: vi.fn(async () => {})
    };

    pageManager = {
      getPage: vi.fn(async (name: string) => (name === 'Old Title' ? page : null)),
      getPageMetadata: vi.fn(async () => page.metadata),
      getPageUUID: vi.fn(() => 'uuid-old'),
      savePage: vi.fn(async (pageName: string, content: string, metadata?: Record<string, unknown>) =>
        doorSaveResult(pageName, content, metadata, { name: 'Old Title', referrers: ['Alpha', 'Beta'] })),
      deletePage: vi.fn(async () => true),
      // #1462 slice 3: the restores are the door's too.
      restoreVersion: vi.fn(async () => ({ name: 'Old Title', uuid: 'uuid-old', version: 7 })),
      restoreDeletedPage: vi.fn(async () => ({ ok: true, title: 'Old Title' })),
      // #689: the admin raw editor's save is the door's as well.
      saveRawPageWithAdminOverride: vi.fn(async () => ({ name: 'Old Title', uuid: 'uuid-old', previousName: 'Old Title', previousReferrers: [], content: 'body' })),
      getRawPageContent: vi.fn(async () => ({ filePath: '/pages/uuid-old.md', content: 'raw' })),
      provider: { getDeletedPages: vi.fn(() => []), getPageVersion: vi.fn() }
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
        case 'AuditManager': return auditManager;
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
    // #1462 slice 3: one delete door — the page name and the requester's subject.
    expect(pageManager.deletePage).toHaveBeenCalledTimes(1);
    expect(pageManager.deletePage).toHaveBeenCalledWith('Old Title', expect.objectContaining({ username: expect.any(String) }));
    expectNoRouteIndexWork();
  });

  it('a version restore goes through the door and the route reindexes nothing', async () => {
    const r = res();
    await routes.restorePageVersion(req({ identifier: 'Old Title', version: '3' }, { comment: 'ignored' }), r);

    expect(pageManager.restoreVersion).toHaveBeenCalledWith('Old Title', 3, expect.objectContaining({ username: 'jim' }));
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, restoredFromVersion: 3, newVersion: 7 }));
    expectNoRouteIndexWork();
  });

  it('a trash restore goes through the door and the route reindexes nothing', async () => {
    const r = res();
    await routes.restoreDeletedPage(req({ uuid: 'uuid-old' }), r);

    expect(pageManager.restoreDeletedPage).toHaveBeenCalledWith('uuid-old', expect.objectContaining({ username: 'jim' }));
    expect(r.json).toHaveBeenCalledWith({ success: true, uuid: 'uuid-old', title: 'Old Title' });
    // The route used to update the search index and the link graph itself.
    expectNoRouteIndexWork();
  });

  it('a raw admin save goes through the door, and the route keeps the record the door cannot carry (#689)', async () => {
    const r = res();
    r.redirect = vi.fn(() => r);
    const rawReq = req({ page: 'Old%20Title' }, { rawContent: '---\ntitle: Old Title\n---\n\nbody' });
    rawReq.userContext.isAuthenticated = true;
    await routes.adminSaveRaw(rawReq, r);

    expect(pageManager.saveRawPageWithAdminOverride).toHaveBeenCalledWith(
      'Old Title',
      '---\ntitle: Old Title\n---\n\nbody',
      expect.objectContaining({ username: 'jim' })
    );
    expect(r.redirect).toHaveBeenCalledWith('/view/Old%20Title');
    // The door audits the write; this record says it was an admin override,
    // which file it wrote and how many bytes — facts the door has not got.
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      eventType: 'page-raw-edit',
      user: 'jim',
      metadata: expect.objectContaining({ adminOverride: true, bytes: 30, filePath: '/pages/uuid-old.md' })
    });
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
