import WikiRoutes from '../WikiRoutes';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock dependencies
const mockAttachmentManager = {
  uploadAttachment: vi.fn(),
  getAttachment: vi.fn(),
  getAttachmentMetadata: vi.fn().mockResolvedValue(null), // null = not private
  deleteAttachment: vi.fn(),
  getAttachmentPath: vi.fn()
};

const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'AttachmentManager') return mockAttachmentManager;
    return null;
  })
};

// Create request object with proper structure
const createMockReq = (userContext = null, params = {}, body = {}, file = null) => ({
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
      const mockReq = createMockReq(
        null,  // Not authenticated
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
        error: 'Authentication required to upload attachments'
      });
    });

    test('should deny access when user is not authenticated', async () => {
      // Setup - user context exists but isAuthenticated is false
      const mockReq = createMockReq(
        { username: 'guest', isAuthenticated: false },
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
        error: 'Authentication required to upload attachments'
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

      expect(mockAttachmentManager.uploadAttachment).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ originalName: 'photo.jpg' }),
        expect.objectContaining({ pageName: 'MyPage' })
      );
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
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

    test('should deny delete access for unauthenticated users', async () => {
      // Setup
      const mockReq = createMockReq(
        null,  // Not authenticated
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
    let mockHasPermission;
    let mockSyncPageMentions;
    let mockUpdatePageInIndex;

    const authedUser = { username: 'jim', isAuthenticated: true, roles: ['admin'] };
    const pdfFile = { buffer: Buffer.from('pdf'), originalname: 'report.pdf', mimetype: 'application/pdf', size: 3 };

    beforeEach(() => {
      mockSaveWithContext = vi.fn().mockResolvedValue(undefined);
      mockGetPage = vi.fn().mockResolvedValue({
        name: 'Journal — jim — 2026-06-22',
        content: '# Entry\n\nSome text\n',
        metadata: { title: 'Journal — jim — 2026-06-22', uuid: 'page-uuid-1', author: 'jim' }
      });
      mockHasPermission = vi.fn().mockResolvedValue(true);
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
            savePageWithContext: mockSaveWithContext,
            getPageUUID: vi.fn().mockReturnValue('page-uuid-1')
          };
        }
        if (name === 'UserManager') {
          return { hasPermission: mockHasPermission };
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
      const savedContext = mockSaveWithContext.mock.calls[0][0];
      expect(savedContext.content).toContain("[{ATTACH src='report.pdf'}]");
      expect(savedContext.content).toContain('Some text');
      expect(mockUpdatePageInIndex).toHaveBeenCalledTimes(1);
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
      mockHasPermission.mockImplementation((_user, action) =>
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
