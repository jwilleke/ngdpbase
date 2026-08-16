/**
 * Export routes must not be a second path to page content (#1060).
 *
 * The four export routes had no authorization check, and no layer below them
 * had one either: `ExportManager.exportPageToHtml` ignores its `user` argument,
 * `PageManager.getPage` takes no context, and `FileSystemProvider` indexes
 * `private/` — so a private page resolved by UUID, slug or title for any
 * caller who could name it.
 *
 * `page-export` was declared in the registry and granted to five roles the
 * whole time. It was checked nowhere. That is the shape #1058's drift test
 * exists to catch, and this is the one orphan that was a hole rather than
 * bookkeeping.
 *
 * These tests pin the ORDER of the two checks as well as their presence. Read
 * access is evaluated first and denies with 404, because a 403 confirms the
 * page exists — a disclosure in itself for a private page.
 */

import WikiRoutes from '../WikiRoutes';

const anonymous = null;
const reader = { username: 'reader', isAuthenticated: true, roles: ['reader'] };

const createMockReq = (userContext: unknown, page = 'SecretPlans') => ({
  params: { page },
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: `/export/html/${page}`,
  originalUrl: `/export/html/${page}`,
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  download: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
});

const exportManager = {
  exportPageToHtml: vi.fn().mockResolvedValue('<html>SECRET</html>'),
  exportPageToMarkdown: vi.fn().mockResolvedValue('# SECRET'),
  saveExport: vi.fn().mockResolvedValue('/exports/SecretPlans_2026-08-16.html'),
  getExports: vi.fn().mockResolvedValue([{ filename: 'SecretPlans_2026-08-16.html' }])
};

/**
 * @param canView   ACL decision for reading the page
 * @param granted   permissions the caller holds
 */
function makeRoutes(canView: boolean, granted: string[]) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'ExportManager') return exportManager;
      if (name === 'ACLManager') {
        return { checkPagePermissionWithContext: vi.fn().mockResolvedValue(canView) };
      }
      if (name === 'PageManager') {
        return {
          getPageMetadata: vi.fn().mockResolvedValue({ 'system-category': 'private' }),
          getAllPages: vi.fn().mockResolvedValue(['SecretPlans', 'PublicNotes'])
        };
      }
      if (name === 'UserManager') {
        return { hasPermission: vi.fn((_u: string, p: string) => Promise.resolve(granted.includes(p))) };
      }
      if (name === 'ConfigurationManager') {
        return { getProperty: vi.fn((_k: string, d: unknown) => d) };
      }
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  vi.spyOn(routes, 'renderError').mockImplementation(
    async (_req: unknown, res: { status: (n: number) => unknown }, code: number) => {
      res.status(code);
      return undefined;
    }
  );
  return routes;
}

beforeEach(() => vi.clearAllMocks());

describe('#1060 — per-page export requires read access', () => {
  test.each(['exportPageHtml', 'exportPageMarkdown'])(
    '%s: an anonymous caller cannot export a page they cannot read',
    async (handler) => {
      const res = createMockRes();
      const routes = makeRoutes(false, []) as unknown as Record<
        string, (a: unknown, b: unknown) => Promise<void>
      >;

      await routes[handler](createMockReq(anonymous), res);

      // The content must never be produced — not produced and then withheld.
      expect(exportManager.exportPageToHtml).not.toHaveBeenCalled();
      expect(exportManager.exportPageToMarkdown).not.toHaveBeenCalled();
      expect(res.download).not.toHaveBeenCalled();
      // 404, not 403: a 403 tells an anonymous caller the private page exists.
      expect(res.status).toHaveBeenCalledWith(404);
    }
  );

  test.each(['exportPageHtml', 'exportPageMarkdown'])(
    '%s: nothing is written to the export directory on a denial',
    async (handler) => {
      const res = createMockRes();
      const routes = makeRoutes(false, []) as unknown as Record<
        string, (a: unknown, b: unknown) => Promise<void>
      >;

      await routes[handler](createMockReq(anonymous), res);

      // saveExport persists into a directory that is itself listable. A denial
      // that still wrote the file would leak by the back door.
      expect(exportManager.saveExport).not.toHaveBeenCalled();
    }
  );

  test('a reader who CAN view the page still needs page-export', async () => {
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPageHtml(createMockReq(reader), res);

    expect(exportManager.exportPageToHtml).not.toHaveBeenCalled();
    // 403 here is correct — read access is already established, so the
    // existence of the page is not the secret being protected.
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('a reader with both read access and page-export gets the export', async () => {
    const res = createMockRes();
    const routes = makeRoutes(true, ['page-export']) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPageHtml(createMockReq(reader), res);

    expect(exportManager.exportPageToHtml).toHaveBeenCalledWith('SecretPlans');
    expect(res.download).toHaveBeenCalled();
  });
});

describe('#1060 — the export picker and the saved-export listing', () => {
  test('the picker is closed to a caller without page-export', async () => {
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPage(createMockReq(anonymous), res);

    expect(res.render).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('the saved-export listing is admin-only, not merely export-only', async () => {
    // The directory holds files saved by every user who ever exported. Holding
    // page-export says nothing about the right to read someone else's export.
    const res = createMockRes();
    const routes = makeRoutes(true, ['page-export']) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.listExports(createMockReq(reader), res);

    expect(exportManager.getExports).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('an admin can list saved exports', async () => {
    const res = createMockRes();
    const routes = makeRoutes(true, ['admin-system']) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.listExports(createMockReq({ username: 'admin', isAuthenticated: true, roles: ['admin'] }), res);

    expect(res.render).toHaveBeenCalled();
  });
});
