import WikiRoutes from '../WikiRoutes';
import { doorSaveResult } from './__fixtures__/pageDoor';
import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
import { policyShaped } from './__fixtures__/policyShaped';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock dependencies
const mockAttachmentManager = {
  uploadAttachment: vi.fn(),
  getAttachment: vi.fn(),
  getAttachmentMetadata: vi.fn().mockResolvedValue(null), // null = not private
  // #1400: not one of the viewer's sealed files — the public path decides.
  getSealedAttachment: vi.fn().mockResolvedValue(null),
  deleteAttachment: vi.fn(),
  getAttachmentPath: vi.fn()
};

// #1059: serveAttachment gates on asset-read via WikiContext.hasPermission →
// the PDP. Default grant; individual tests flip it to exercise the deny path.
// #1431 step 14: decisions are the PDP's.
const mockPolicyDecisionPoint = {
  permits: vi.fn(policyShaped)   // #1198: anonymous holds only the read trio
};

const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'AttachmentManager') return mockAttachmentManager;
    if (name === 'PolicyDecisionPoint') return mockPolicyDecisionPoint;
    return null;
  })
};

// Create request object with proper structure
// #1399: an anonymous caller carries the anonymous PRINCIPAL, not null. The
// session middleware assigns it on every request that has no session, so a
// request with no subject at all is a shape the server never produces.
const createMockReq = (userContext = ANONYMOUS_SUBJECT, params = {}, body = {}, file = ANONYMOUS_SUBJECT) => ({
  params,
  body,
  file,
  session: {},
  path: '/test',
  userContext
});

const createMockRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    sendFile: vi.fn()
  };
  return res;
};

describe('WikiRoutes - Attachment Security (Issue #22)', () => {
  let wikiRoutes;

  beforeEach(() => {
    wikiRoutes = new WikiRoutes(mockEngine);
    vi.clearAllMocks();
  });

  describe('uploadAttachment', () => {
    test('should allow authenticated users to upload attachments', async () => {
      // Setup - authenticated user with file
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { page: 'TestPage' },
        { description: 'Test attachment' },
        { buffer: Buffer.from('test'), originalname: 'test.pdf', mimetype: 'application/pdf', size: 4 }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.uploadAttachment.mockResolvedValue({
        identifier: 'test-attachment',
        filename: 'test.pdf',
        url: '/attachments/test.pdf'
      });

      // Execute
      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // Verify
      expect(mockAttachmentManager.uploadAttachment).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          attachment: expect.objectContaining({
            identifier: 'test-attachment'
          })
        })
      );
    });

    test('should deny access for unauthenticated users', async () => {
      // Setup - no user context
      const mockReq = createMockReq(ANONYMOUS_SUBJECT,  // Not authenticated
        { page: 'TestPage' },
        {}
      );
      const mockRes = createMockRes();

      // Execute
      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should deny access when user is not authenticated', async () => {
      // Setup - user context exists but isAuthenticated is false
      // #1198: policy decides; the anonymous subject is refused and 401 classifies it.
      const mockReq = createMockReq(
        { username: 'anonymous', isAuthenticated: false, roles: ['anonymous', 'All'] },
        { page: 'TestPage' },
        {}
      );
      const mockRes = createMockRes();

      // Execute
      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 when no file is uploaded', async () => {
      // Setup - authenticated user but no file
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { page: 'TestPage' },
        {},
        null  // No file
      );
      const mockRes = createMockRes();

      // Execute
      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    test('should accept pageName from request body (no URL param needed)', async () => {
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        {},  // no :page URL param
        { pageName: 'MyPage', description: 'uploaded from picker' },
        { buffer: Buffer.from('test'), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 4 }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.uploadAttachment.mockResolvedValue({
        identifier: 'img-id',
        filename: 'photo.jpg',
        url: '/attachments/img-id'
      });

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // #1179: the subject is the third argument — forwarded, not tucked into options.
      expect(mockAttachmentManager.uploadAttachment).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ originalName: 'photo.jpg' }),
        expect.objectContaining({ username: expect.any(String) }),
        expect.objectContaining({ pageName: 'MyPage' })
      );
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('#1398: body private=true is passed to uploadAttachment', async () => {
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        {},
        { private: 'true', description: 'lab' },
        { buffer: Buffer.from('x'), originalname: 'lab.pdf', mimetype: 'application/pdf', size: 1 }
      );
      const mockRes = createMockRes();
      mockAttachmentManager.uploadAttachment.mockResolvedValue({
        identifier: 'id',
        filename: 'lab.pdf',
        url: '/attachments/id'
      });

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockAttachmentManager.uploadAttachment).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Object),
        expect.objectContaining({ username: 'testuser' }),
        expect.objectContaining({ private: true })
      );
    });

    test('#1398: the route passes the checkbox as-is; AttachmentManager decides a private page', async () => {
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { page: 'Diary' },
        { description: 'note' },
        { buffer: Buffer.from('x'), originalname: 'note.pdf', mimetype: 'application/pdf', size: 1 }
      );
      const mockRes = createMockRes();
      mockAttachmentManager.uploadAttachment.mockResolvedValue({
        identifier: 'id',
        filename: 'note.pdf',
        url: '/attachments/id'
      });

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      const opts = mockAttachmentManager.uploadAttachment.mock.calls[0][3];
      expect(opts.private).toBeUndefined();
      expect(opts.pageName).toBe('Diary');
    });

    test('should handle upload errors gracefully', async () => {
      // Setup - authenticated user with file but upload fails
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { page: 'TestPage' },
        {},
        { buffer: Buffer.from('test'), originalname: 'test.pdf', mimetype: 'application/pdf', size: 4 }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.uploadAttachment.mockRejectedValue(new Error('Upload failed'));

      // Execute
      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Upload failed'
      });
    });

    test('a refusal at the door (another user\'s private page) is a 403, not a 500', async () => {
      const mockReq = createMockReq(
        { username: 'bob', isAuthenticated: true },
        { page: 'AlicesDiary' },
        {},
        { buffer: Buffer.from('x'), originalname: 'x.pdf', mimetype: 'application/pdf', size: 1 }
      );
      const mockRes = createMockRes();
      mockAttachmentManager.uploadAttachment.mockRejectedValue(
        new Error('Permission denied: you cannot upload to this page')
      );

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Permission denied: you cannot upload to this page'
      });
    });
  });

  describe('serveAttachment', () => {
    test('should serve attachments to authorized users', async () => {
      // Setup - serveAttachment uses attachmentId param
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.getAttachment.mockResolvedValue({
        buffer: Buffer.from('test file content'),
        metadata: {
          name: 'test.pdf',
          encodingFormat: 'application/pdf',
          contentSize: 17
        }
      });

      // Execute
      await wikiRoutes.serveAttachment(mockReq, mockRes);

      // Verify
      expect(mockAttachmentManager.getAttachment).toHaveBeenCalledWith('test-attachment-id');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalled();
    });

    test('should return 404 for non-existent attachments', async () => {
      // Setup
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { attachmentId: 'nonexistent-id' }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.getAttachment.mockResolvedValue(null);

      // Execute
      await wikiRoutes.serveAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    test('should handle file system errors', async () => {
      // Setup
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.getAttachment.mockRejectedValue(new Error('File system error'));

      // Execute
      await wikiRoutes.serveAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    test('#1059: 403s when the caller lacks asset-read', async () => {
      const mockReq = createMockReq(
        { username: 'norights', isAuthenticated: true, roles: [] },
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = { ...createMockRes(), render: vi.fn().mockReturnThis() };

      mockPolicyDecisionPoint.permits.mockResolvedValueOnce(false);

      await wikiRoutes.serveAttachment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockAttachmentManager.getAttachment).not.toHaveBeenCalled();
    });
  });

  describe('attachmentThumb (#1059)', () => {
    test('403s when the caller lacks asset-read, before touching the store', async () => {
      const mockReq = {
        ...createMockReq(
          { username: 'norights', isAuthenticated: true, roles: [] },
          { attachmentId: 'test-attachment-id' }
        ),
        query: {}
      };
      const mockRes = createMockRes();
      const getThumbnail = vi.fn();
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'AttachmentManager') return { ...mockAttachmentManager, getThumbnail };
        if (name === 'PolicyDecisionPoint') return mockPolicyDecisionPoint;
        return null;
      });
      mockPolicyDecisionPoint.permits.mockResolvedValueOnce(false);

      await wikiRoutes.attachmentThumb(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(getThumbnail).not.toHaveBeenCalled();

      // vi.clearAllMocks() does not undo mockImplementation — restore the
      // module-scope wiring so later describes see the original managers.
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'AttachmentManager') return mockAttachmentManager;
        if (name === 'PolicyDecisionPoint') return mockPolicyDecisionPoint;
        return null;
      });
    });
  });

  describe('deleteAttachment', () => {
    test('should allow authorized users to delete attachments', async () => {
      // Setup - deleteAttachment uses attachmentId param
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = createMockRes();

      mockAttachmentManager.deleteAttachment.mockResolvedValue(true);

      // Execute
      await wikiRoutes.deleteAttachment(mockReq, mockRes);

      // Verify
      expect(mockAttachmentManager.deleteAttachment).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    // #1080: attachment deletes produced no audit record at all. These pin
    // that one is emitted, that it carries the filename (read BEFORE the
    // delete, since afterwards the name is gone and an id alone does not
    // answer "what was lost?"), and that a failing audit backend cannot turn
    // a committed delete into an error.
    // #1183: the two audit tests that were here moved to
    // `src/managers/__tests__/AttachmentManager.audit.test.ts`.
    //
    // They asserted that THIS ROUTE records, which it did — while the media
    // browser's delete, the NCM-localization upload, the bulk import and the
    // thumbnail render recorded nothing. A route test can only ever prove the
    // route. The emit now lives at the manager door every caller passes
    // through, so the assertions live there too.

    test('should deny delete access for unauthenticated users', async () => {
      // Setup
      const mockReq = createMockReq(ANONYMOUS_SUBJECT,  // Not authenticated
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = createMockRes();

      // Execute
      await wikiRoutes.deleteAttachment(mockReq, mockRes);

      // Verify - implementation returns 401 for unauthenticated
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test('should handle delete errors gracefully', async () => {
      // Setup
      const mockReq = createMockReq(
        { username: 'testuser', isAuthenticated: true },
        { attachmentId: 'test-attachment-id' }
      );
      const mockRes = createMockRes();

      // Its own engine mock: getManager's implementation persists between
      // tests, and the preceding one installs a failing audit sink that now
      // refuses the delete before it is attempted (#1121).
      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'AttachmentManager') return mockAttachmentManager;
        if (name === 'PolicyDecisionPoint') return mockPolicyDecisionPoint;
        return null;
      });

      mockAttachmentManager.deleteAttachment.mockRejectedValue(new Error('Delete failed'));

      // Execute
      await wikiRoutes.deleteAttachment(mockReq, mockRes);

      // Verify
      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // #870 — upload with a page context must actually put the attachment ON the
  // page: linkage is content-scan driven (#403), so the handler appends an
  // [{ATTACH src='…'}] directive through the save pipeline.
  describe('uploadAttachment attach-to-page (#870)', () => {
    let mockSaveWithContext;
    let mockGetPage;
    let mockPermits;
    let mockSyncPageMentions;
    let mockUpdatePageInIndex;

    const authedUser = { username: 'jim', isAuthenticated: true, roles: ['admin'] };
    const pdfFile = { buffer: Buffer.from('pdf'), originalname: 'report.pdf', mimetype: 'application/pdf', size: 3 };

    beforeEach(() => {
      mockSaveWithContext = vi.fn(async (name: string, content: string, metadata?: Record<string, unknown>) => doorSaveResult(name, content, metadata));
      mockGetPage = vi.fn().mockResolvedValue({
        name: 'Journal — jim — 2026-06-22',
        content: '# Entry\n\nSome text\n',
        metadata: { title: 'Journal — jim — 2026-06-22', uuid: 'page-uuid-1', author: 'jim' }
      });
      mockPermits = vi.fn().mockResolvedValue(true);
      mockSyncPageMentions = vi.fn().mockResolvedValue(undefined);
      mockUpdatePageInIndex = vi.fn().mockResolvedValue(undefined);

      mockAttachmentManager.uploadAttachment.mockResolvedValue({
        identifier: 'att-1',
        filename: 'report.pdf',
        url: '/attachments/att-1'
      });

      mockEngine.getManager.mockImplementation((name) => {
        if (name === 'AttachmentManager') {
          return { ...mockAttachmentManager, syncPageMentions: mockSyncPageMentions };
        }
        if (name === 'PageManager') {
          return {
            getPage: mockGetPage,
            savePage: mockSaveWithContext,
            getPageUUID: vi.fn().mockReturnValue('page-uuid-1')
          };
        }
        // #1431 step 14: decisions are the PDP's.
        if (name === 'PolicyDecisionPoint') {
          return { permits: mockPermits };
        }
        if (name === 'RenderingManager') {
          return { addPageToCache: vi.fn(), updatePageInLinkGraph: vi.fn() };
        }
        if (name === 'SearchManager') {
          return { updatePageInIndex: mockUpdatePageInIndex };
        }
        if (name === 'CacheManager') {
          return { isInitialized: () => false };
        }
        if (name === 'AssetManager') {
          return { syncPageAssets: vi.fn().mockResolvedValue(undefined) };
        }
        return null;
      });
    });

    test('appends an ATTACH directive through the save pipeline', async () => {
      const mockReq = createMockReq(authedUser, { page: 'Journal — jim — 2026-06-22' }, {}, pdfFile);
      const mockRes = createMockRes();

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockSaveWithContext).toHaveBeenCalledTimes(1);
      const [savedName, savedContent] = mockSaveWithContext.mock.calls[0];
      expect(savedName).toBe('Journal — jim — 2026-06-22');
      expect(savedContent).toContain("[{ATTACH src='report.pdf'}]");
      expect(savedContent).toContain('Some text');
      // #1462: the page door reindexes the page; the route does not.
      expect(mockUpdatePageInIndex).not.toHaveBeenCalled();
      const jsonArg = mockRes.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.attachedToPage).toBe(true);
    });

    test('attachToPage=false skips the append', async () => {
      const mockReq = createMockReq(authedUser, { page: 'Journal — jim — 2026-06-22' }, { attachToPage: 'false' }, pdfFile);
      const mockRes = createMockRes();

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockSaveWithContext).not.toHaveBeenCalled();
      const jsonArg = mockRes.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.attachedToPage).toBe(false);
    });

    test('already-referenced filename does not append again but reports attached', async () => {
      mockGetPage.mockResolvedValue({
        name: 'P',
        content: "# Entry\n\n[{ATTACH src='report.pdf'}]\n",
        metadata: { title: 'P', uuid: 'page-uuid-1' }
      });
      const mockReq = createMockReq(authedUser, { page: 'P' }, {}, pdfFile);
      const mockRes = createMockRes();

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockSaveWithContext).not.toHaveBeenCalled();
      expect(mockRes.json.mock.calls[0][0].attachedToPage).toBe(true);
    });

    test('missing page-edit permission stores the file but reports not linked', async () => {
      mockPermits.mockImplementation((_user, action) =>
        Promise.resolve(action !== 'page-edit'));
      const mockReq = createMockReq(authedUser, { page: 'P' }, {}, pdfFile);
      const mockRes = createMockRes();

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockSaveWithContext).not.toHaveBeenCalled();
      const jsonArg = mockRes.json.mock.calls[0][0];
      expect(jsonArg.success).toBe(true);
      expect(jsonArg.attachedToPage).toBe(false);
      expect(jsonArg.attachNote).toContain('page-edit');
    });

    test('no page context means no attach attempt', async () => {
      const mockReq = createMockReq(authedUser, {}, {}, pdfFile);
      const mockRes = createMockRes();

      await wikiRoutes.uploadAttachment(mockReq, mockRes);

      expect(mockSaveWithContext).not.toHaveBeenCalled();
      expect(mockRes.json.mock.calls[0][0].attachedToPage).toBe(false);
    });
  });
});
