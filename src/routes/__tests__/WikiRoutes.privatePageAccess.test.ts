/**
 * Unit tests for WikiRoutes — private attachment access control (#122)
 *
 * Tests that serveAttachment() enforces a 403 guard when an attachment
 * belongs to a private page, allowing access only to the page creator
 * and admins.
 *
 * Covers:
 * - Anonymous user → 403
 * - Authenticated non-creator non-admin → 403
 * - Page creator → 200 (attachment served)
 * - Admin user → 200 (attachment served)
 * - Public attachment (isPrivate not set) → 200 without access check
 * - pageName derived from meta.mentions when present
 * - pageName derived from meta.pageName fallback
 */

import WikiRoutes from '../WikiRoutes';
import type { Request } from 'express';
import type { WikiEngine } from '../../types/WikiEngine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_UUID = 'uuid-private-abc123';
const PAGE_CREATOR = 'alice';
const PAGE_NAME = 'AlicePrivatePage';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Provider stub with a pageIndex (legacy pre-#714 check; kept for symmetry). */
function makeProvider(location = 'private', creator = PAGE_CREATOR) {
  return {
    pageIndex: {
      pages: {
        [PAGE_UUID]: { location, creator }
      }
    }
  };
}

/**
 * PageManager stub. #714 Slice C migrated `WikiRoutes.serveAttachment` from
 * the legacy `checkPrivatePageAccess` helper (which read
 * `provider.pageIndex.pages[uuid].location === 'private'`) to
 * `wikiContext.canAccess('view', linkedPageName)`. The new path reads
 * `metadata.private` directly (Tier 0 of the ACL evaluator) — so the
 * fixture now sets `private: true` + `author: <creator>` on the returned
 * metadata to drive the same scenarios.
 */
function makePageManager(uuid = PAGE_UUID, location = 'private', creator = PAGE_CREATOR) {
  const isPrivate = location === 'private';
  return {
    getPageMetadata: vi.fn().mockResolvedValue({
      uuid,
      title: PAGE_NAME,
      lastModified: '',
      ...(isPrivate ? { private: true, author: creator } : {})
    }),
    getCurrentPageProvider: vi.fn().mockReturnValue(makeProvider(location, creator))
  };
}

/** AttachmentManager stub */
function makeAttachmentManager({ isPrivate = false, pageName = PAGE_NAME } = {}) {
  return {
    getAttachmentMetadata: vi.fn().mockResolvedValue(
      isPrivate
        ? { isPrivate: true, mentions: [{ name: pageName }] }
        : null
    ),
    getAttachment: vi.fn().mockResolvedValue({
      buffer: Buffer.from('file-bytes'),
      metadata: { name: 'photo.jpg', encodingFormat: 'image/jpeg', contentSize: 10 }
    }),
    uploadAttachment: vi.fn(),
    deleteAttachment: vi.fn()
  };
}

/** Engine stub */
/**
 * ACLManager stub used by `wikiContext.canAccess('view', pageName)`. #714
 * Slice C migrated `serveAttachment` from the legacy
 * `WikiRoutes.checkPrivatePageAccess` helper to the cross-page facade,
 * which routes through `ACLManager.canUserAccessPage(userContext, pageName, action)`.
 *
 * The stub re-implements the private-attachment access rule in terms of
 * the new contract so the route-level tests can drive the same scenarios:
 *   - anonymous → deny
 *   - admin role → allow
 *   - username === creator → allow
 *   - else → deny
 * For a non-private page (location !== 'private'), allow.
 */
function makeACLManagerStub({ creator = PAGE_CREATOR, isPrivatePage = true } = {}) {
  return {
    canUserAccessPage: vi.fn(async (userContext, pageName, _action) => {
      // Mimic canUserAccessPage's "no page name → deny" rule from
      // Slice B (the conservative-on-security default).
      if (!pageName) return false;
      if (!isPrivatePage) return true;

      const username = userContext?.username;
      const roles    = userContext?.roles ?? [];
      if (!username) return false;
      if (roles.includes('admin')) return true;
      if (username === creator) return true;
      return false;
    }),
    // Same-page fast path — not exercised by serveAttachment (which is
    // always a cross-page check) but defined so WikiContext.canAccess
    // doesn't trip when it constructs the cache key shape.
    checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
  };
}

function makeEngine(pageManager, attachmentManager, aclManager = makeACLManagerStub()) {
  return {
    getManager: vi.fn((name) => {
      if (name === 'PageManager')       return pageManager;
      if (name === 'AttachmentManager') return attachmentManager;
      if (name === 'ACLManager')        return aclManager;
      // #1059: serveAttachment now gates on asset-read via
      // WikiContext.hasPermission → UserManager. Grant it — these tests
      // exercise the private-page ACL layer, not the capability gate.
      if (name === 'UserManager')       return { hasPermission: vi.fn().mockResolvedValue(true) };
      return null;
    })
  } as unknown as WikiEngine;
}

function createReq(userContext = null, params = {}) {
  return {
    params,
    session: {},
    path: '/test',
    userContext,
    headers: {}
  } as unknown as Request;
}

function createRes() {
  const res = {
    status:     vi.fn().mockReturnThis(),
    json:       vi.fn().mockReturnThis(),
    send:       vi.fn().mockReturnThis(),
    render:     vi.fn().mockReturnThis(),
    redirect:   vi.fn().mockReturnThis(),
    setHeader:  vi.fn().mockReturnThis()
  };
  return res;
}

// ---------------------------------------------------------------------------
// Private attachment tests
// ---------------------------------------------------------------------------

describe('WikiRoutes — private attachment access (#122)', () => {
  let attachmentManager;
  let pageManager;
  let wikiRoutes;

  beforeEach(() => {
    attachmentManager = makeAttachmentManager({ isPrivate: true, pageName: PAGE_NAME });
    pageManager = makePageManager();
    const engine = makeEngine(pageManager, attachmentManager);
    wikiRoutes = new WikiRoutes(engine);
  });

  test('anonymous user receives 403 for private attachment', async () => {
    const req = createReq(null, { attachmentId: 'att-001' });
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ code: 403 }));
  });

  test('non-creator non-admin user receives 403 for private attachment', async () => {
    const req = createReq(
      { username: 'bob', roles: ['user'], authenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('page creator receives the attachment', async () => {
    const req = createReq(
      { username: PAGE_CREATOR, roles: ['user'], authenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalled();
  });

  test('admin user receives the attachment regardless of creator', async () => {
    const req = createReq(
      { username: 'admin', roles: ['admin'], authenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Public attachment — no access check
// ---------------------------------------------------------------------------

describe('WikiRoutes — public attachment access (#122)', () => {
  test('public attachment is served to anonymous users without access check', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    const pageManager = makePageManager();
    const engine = makeEngine(pageManager, attachmentManager);
    const wikiRoutes = new WikiRoutes(engine);

    const req = createReq(null, { attachmentId: 'att-public' });
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalled();
    // PageManager should NOT be consulted for public attachments
    expect(pageManager.getPageMetadata).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pageName fallback from meta.pageName
// ---------------------------------------------------------------------------

describe('WikiRoutes — private attachment — pageName resolution (#122)', () => {
  test('uses meta.pageName when mentions array is absent', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    attachmentManager.getAttachmentMetadata.mockResolvedValue({
      isPrivate: true,
      pageName: PAGE_NAME
      // no mentions field
    });
    const pageManager = makePageManager();
    const aclManager = makeACLManagerStub();
    const engine = makeEngine(pageManager, attachmentManager, aclManager);
    const wikiRoutes = new WikiRoutes(engine);

    // Anonymous — should be denied
    const req = createReq(null, { attachmentId: 'att-002' });
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    // #714 Slice C: the route now delegates the cross-page check to
    // `ACLManager.canUserAccessPage`. Verify the right `pageName`
    // (from `meta.pageName` fallback) reached the gate. Previously this
    // asserted on `pageManager.getPageMetadata` because the legacy
    // `WikiRoutes.checkPrivatePageAccess` invoked it directly; under the
    // new wiring `pageManager.getPageMetadata` is called inside
    // `ACLManager.canUserAccessPage` (in production code, not in the
    // ACL-manager stub used here).
    // Anonymous request → userContext is null. `expect.anything()` does NOT
    // match null/undefined, so check the args positionally.
    expect(aclManager.canUserAccessPage).toHaveBeenCalled();
    const [_userContext, pageName, action] = aclManager.canUserAccessPage.mock.calls[0];
    expect(pageName).toBe(PAGE_NAME);
    expect(action).toBe('view');
  });

  test('empty string pageName denies (#714 — deny-on-empty replaces legacy allow-on-empty)', async () => {
    // #714 Slice C: the legacy `WikiRoutes.checkPrivatePageAccess` returned
    // **allow** when `pageName` couldn't be resolved (`if (!pageMetadata?.uuid) return true`).
    // Under the new cross-page facade `wikiContext.canAccess('view', '')`,
    // the empty page name returns **deny** at the first guard in
    // `ACLManager.canUserAccessPage` (`if (!pageName) return false`).
    // This is the EPIC's explicit "Behavior decision point" — some
    // private attachments whose owning-page name was unresolvable now 403.
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    attachmentManager.getAttachmentMetadata.mockResolvedValue({
      isPrivate: true
      // no mentions, no pageName
    });
    const pageManager = makePageManager();
    pageManager.getPageMetadata.mockResolvedValue(null);
    const engine = makeEngine(pageManager, attachmentManager);
    const wikiRoutes = new WikiRoutes(engine);

    const req = createReq(null, { attachmentId: 'att-003' });
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    // Empty linkedPageName → canUserAccessPage returns false → 403.
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
