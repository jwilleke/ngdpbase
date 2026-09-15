/**
 * Unit tests for WikiRoutes — private attachment access control (#122)
 *
 * Tests that serveAttachment() serves a private file only under the private
 * container rule (#1382, docs/planning/private-stores.md, Access): the file's
 * owner (its `creator`), or a delegate of the owner — never by role, and not
 * to whoever may view a page that links it.
 *
 * Covers:
 * - Anonymous user → 403
 * - Authenticated other user → 403
 * - Owner → 200 (attachment served)
 * - Admin user → 403 (no role reaches a private container)
 * - Public attachment (isPrivate not set) → 200 without access check
 * - The decision is the file owner's, through ACLManager (recorded)
 */

import WikiRoutes from '../WikiRoutes';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
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
        ? { isPrivate: true, creator: PAGE_CREATOR, mentions: [{ name: pageName }] }
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
function makeACLManagerStub() {
  return {
    // The private-container decision for a file, on the real rule (#1382) —
    // the stub only stands in for ACLManager's recording of a refusal.
    canAccessPrivateContainer: vi.fn((userContext, owner, _resource, _action) =>
      Boolean(userContext && owner) && mayActInPrivateContainer(userContext, owner)),
    canUserAccessPage: vi.fn().mockResolvedValue(true),
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

  test('another authenticated user receives 403 for private attachment', async () => {
    const req = createReq(
      { username: 'bob', roles: ['user'], isAuthenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('the file\'s owner receives the attachment', async () => {
    const req = createReq(
      { username: PAGE_CREATOR, roles: ['user'], isAuthenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalled();
  });

  test('admin receives 403 — no role reaches a private container', async () => {
    const req = createReq(
      { username: 'admin', roles: ['admin'], isAuthenticated: true },
      { attachmentId: 'att-001' }
    );
    const res = createRes();

    await wikiRoutes.serveAttachment(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).not.toHaveBeenCalled();
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

describe('WikiRoutes — private attachment — the file owner decides (#1382)', () => {
  test('the decision is the file owner\'s, through ACLManager — not view access to a linked page', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    // Linked from a public page that anyone may view; the file itself is carol's.
    attachmentManager.getAttachmentMetadata.mockResolvedValue({
      isPrivate: true, creator: 'carol', mentions: [{ name: 'PublicPage' }]
    });
    const pageManager = makePageManager(PAGE_UUID, 'pages');
    const aclManager = makeACLManagerStub();
    const wikiRoutes = new WikiRoutes(makeEngine(pageManager, attachmentManager, aclManager));

    const res = createRes();
    await wikiRoutes.serveAttachment(
      createReq({ username: PAGE_CREATOR, roles: ['user'], isAuthenticated: true }, { attachmentId: 'att-002' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(aclManager.canUserAccessPage).not.toHaveBeenCalled();
    const [, owner, resource, action] = aclManager.canAccessPrivateContainer.mock.calls[0];
    expect(owner).toBe('carol');
    expect(resource).toBe('attachment:att-002');
    expect(action).toBe('view');
  });

  test('a private file with no recorded owner is refused', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    attachmentManager.getAttachmentMetadata.mockResolvedValue({ isPrivate: true });
    const wikiRoutes = new WikiRoutes(makeEngine(makePageManager(), attachmentManager));

    const res = createRes();
    await wikiRoutes.serveAttachment(
      createReq({ username: PAGE_CREATOR, roles: ['user'], isAuthenticated: true }, { attachmentId: 'att-003' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
