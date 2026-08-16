/**
 * Export routes must not be a second path to page content (#1060).
 *
 * The four export routes had no authorization check, and no layer below them
 * had one either: `ExportManager.exportPageToHtml` ignores its `user` argument,
 * `PageManager.getPage` takes no context, and `FileSystemProvider` indexes
 * `private/` — so a private page resolved by UUID, slug or title for any
 * caller who could name it.
 *
 * The gate is read access and ONLY read access. A `page-export` check was
 * written first and removed: for a page the caller can already read, exporting
 * returns words they are looking at on screen, so a second permission is
 * friction rather than protection. The read/export split would matter against
 * a bulk surface, but no route reaches `ExportManager`'s array-taking methods.
 *
 * So these tests pin two things that pull in opposite directions, and both
 * matter: an unreadable page is never extractable, AND a readable one always
 * is. A regression toward "deny" here is not a safe failure — it is the export
 * feature quietly breaking for ordinary readers.
 *
 * A denial returns 404, not 403: a 403 confirms the page exists, which for a
 * private page is itself the disclosure.
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
  // NOTE: the manager's method is `exportToMarkdown`, not
  // `exportPageToMarkdown`. Naming it wrong here made an assertion below
  // vacuous — it can only ever pass.
  exportToMarkdown: vi.fn().mockResolvedValue('# SECRET'),
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
      expect(exportManager.exportToMarkdown).not.toHaveBeenCalled();
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

  test('read access is sufficient — no second permission is required', async () => {
    // Holds NO permissions at all. If this ever goes red, someone has added a
    // permission check back onto content the caller can already read.
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPageHtml(createMockReq(reader), res);

    expect(exportManager.exportPageToHtml).toHaveBeenCalledWith('SecretPlans');
    expect(res.download).toHaveBeenCalled();
  });

  test('an anonymous caller can export a page they are allowed to read', async () => {
    // The public-site case. Anonymous holds no permissions and never will; a
    // public page is readable, so it is exportable.
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPageMarkdown(createMockReq(anonymous), res);

    expect(exportManager.exportToMarkdown).toHaveBeenCalledWith('SecretPlans');
    expect(res.download).toHaveBeenCalled();
  });
});

describe('#1060 — the export picker and the saved-export listing', () => {
  test('the picker is open — the per-page gate is what protects content', async () => {
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
      string, (a: unknown, b: unknown) => Promise<void>
    >;

    await routes.exportPage(createMockReq(anonymous), res);

    expect(res.render).toHaveBeenCalled();
  });

  test('the saved-export listing is admin-only — a different question entirely', async () => {
    // This directory holds files saved by every user who ever exported, so it
    // is not governed by what the caller may read now. That is why it keeps a
    // permission check when the export routes do not.
    const res = createMockRes();
    const routes = makeRoutes(true, []) as unknown as Record<
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
