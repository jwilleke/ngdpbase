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
 * - The decision is the file owner's, through PolicyInformationPoint (recorded)
 */

import WikiRoutes from '../WikiRoutes';
import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
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
    // #1400: not one of the viewer's sealed files — the public path decides.
    getSealedAttachment: vi.fn().mockResolvedValue(null),
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
 * PolicyInformationPoint stub used by `wikiContext.canAccess('view', pageName)`. #714
 * Slice C migrated `serveAttachment` from the legacy
 * `WikiRoutes.checkPrivatePageAccess` helper to the cross-page facade,
 * which routes through `PolicyInformationPoint.canUserAccessPage(userContext, pageName, action)`.
 *
 * The stub re-implements the private-attachment access rule in terms of
 * the new contract so the route-level tests can drive the same scenarios:
 *   - anonymous → deny
 *   - admin role → allow
 *   - username === creator → allow
 *   - else → deny
 * For a non-private page (location !== 'private'), allow.
 */
function makePolicyInformationPointStub() {
  return {
    // The private-container decision for a file, on the real rule (#1382) —
    // the stub only stands in for PolicyInformationPoint's recording of a refusal.
    canAccessPrivateContainer: vi.fn((userContext, owner, _resource, _action) =>
      Boolean(userContext && owner) && mayActInPrivateContainer(userContext, owner)),
    canUserAccessPage: vi.fn().mockResolvedValue(true),
    checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
  };
}

function makeEngine(pageManager, attachmentManager, policyInformationPoint = makePolicyInformationPointStub()) {
  return {
    getManager: vi.fn((name) => {
      if (name === 'PageManager')       return pageManager;
      if (name === 'AttachmentManager') return attachmentManager;
      if (name === 'PolicyInformationPoint')        return policyInformationPoint;
      // #1059: serveAttachment now gates on asset-read via
      // WikiContext.hasPermission → PolicyDecisionPoint. Grant it — these tests
      // exercise the private-page ACL layer, not the capability gate.
      // #1431 step 14: decisions are the PDP's.
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      return null;
    })
  } as unknown as WikiEngine;
}

// #1399: an anonymous caller carries the anonymous PRINCIPAL, not null. The
// session middleware assigns it on every request that has no session, so a
// request with no subject at all is a shape the server never produces.
function createReq(userContext = ANONYMOUS_SUBJECT, params = {}) {
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
    const req = createReq(ANONYMOUS_SUBJECT, { attachmentId: 'att-001' });
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

    const req = createReq(ANONYMOUS_SUBJECT, { attachmentId: 'att-public' });
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
  test('the decision is the file owner\'s, through PolicyInformationPoint — not view access to a linked page', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    // Linked from a public page that anyone may view; the file itself is carol's.
    attachmentManager.getAttachmentMetadata.mockResolvedValue({
      isPrivate: true, creator: 'carol', mentions: [{ name: 'PublicPage' }]
    });
    const pageManager = makePageManager(PAGE_UUID, 'pages');
    const policyInformationPoint = makePolicyInformationPointStub();
    const wikiRoutes = new WikiRoutes(makeEngine(pageManager, attachmentManager, policyInformationPoint));

    const res = createRes();
    await wikiRoutes.serveAttachment(
      createReq({ username: PAGE_CREATOR, roles: ['user'], isAuthenticated: true }, { attachmentId: 'att-002' }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(policyInformationPoint.canUserAccessPage).not.toHaveBeenCalled();
    const [, owner, resource, action] = policyInformationPoint.canAccessPrivateContainer.mock.calls[0];
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

describe('WikiRoutes — a file in the viewer\'s own encrypted store (#1400)', () => {
  test('is served from the store, uncached, without consulting the global metadata', async () => {
    const attachmentManager = makeAttachmentManager({ isPrivate: false });
    const bytes = Buffer.from('%PDF sealed contents');
    attachmentManager.getSealedAttachment.mockResolvedValue({
      buffer: bytes,
      metadata: { identifier: 'u-1', name: 'labs.pdf', encodingFormat: 'application/pdf', isPrivate: true, creator: PAGE_CREATOR }
    });
    const wikiRoutes = new WikiRoutes(makeEngine(makePageManager(), attachmentManager));
    const viewer = { username: PAGE_CREATOR, roles: ['user'], isAuthenticated: true };

    const res = createRes();
    await wikiRoutes.serveAttachment(createReq(viewer, { attachmentId: 'u-1' }), res);

    expect(attachmentManager.getSealedAttachment).toHaveBeenCalledWith('u-1', expect.objectContaining({ username: PAGE_CREATOR }));
    expect(attachmentManager.getAttachmentMetadata).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.send).toHaveBeenCalledWith(bytes);
  });
});
