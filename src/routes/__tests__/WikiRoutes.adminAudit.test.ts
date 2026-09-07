/**
 * #1113 — the admin audit page was unreachable AND broken.
 *
 * Four handlers and views/admin-audit.ejs existed with no route registration
 * anywhere, so `/admin/audit` was a 404. They also called
 * `ACLManager.getAccessControlStats()` and `getAccessLog()`, which do not
 * exist: a local interface in WikiRoutes declared them so `tsc` passed, and a
 * test mock supplied them so the suite passed. Registering them as written
 * would have shipped 500s.
 *
 * ACLManager holding its own access log was a second door to "what happened".
 * AuditManager is the first, and two managers owning one resource means
 * neither is a chokepoint — so these read AuditManager.
 */
import WikiRoutes from '../WikiRoutes';

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const makeReq = (query: Record<string, unknown> = {}, params: Record<string, string> = {}) => ({
  params, query, body: {}, session: { csrfToken: 't' },
  path: '/admin/audit', originalUrl: '/admin/audit', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: admin
});

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis()
});

function makeRoutes(audit: unknown, hasPermission = true) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'AuditManager') return audit;
      if (name === 'UserManager') return { getCurrentUser: vi.fn().mockResolvedValue(admin) };
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<void>>;
  (routes as unknown as { createWikiContext: () => unknown }).createWikiContext =
    () => ({ hasPermission: vi.fn().mockResolvedValue(hasPermission), userContext: admin });
  (routes as unknown as { getCommonTemplateData: () => Promise<unknown> }).getCommonTemplateData =
    async () => ({});
  (routes as unknown as { renderError: (...a: unknown[]) => Promise<unknown> }).renderError =
    async (_rq: unknown, rs: { status: (n: number) => { send: (s: string) => unknown } }, code: number) => rs.status(code).send('denied');
  return routes;
}

const stats = { totalEvents: 3, eventsByType: {}, eventsByResult: { allow: 2, deny: 1 }, eventsBySeverity: {}, eventsByUser: {}, recentActivity: [], securityIncidents: 1 };
const page = { results: [{ id: 'e1', eventType: 'token-mint', user: 'alice' }], total: 1, limit: 50, offset: 0, hasMore: false };

const workingAudit = () => ({
  getAuditStats: vi.fn().mockResolvedValue(stats),
  searchAuditLogs: vi.fn().mockResolvedValue(page),
  exportAuditLogs: vi.fn().mockResolvedValue('[]')
});

describe('#1113 admin audit routes', () => {
  test('the page renders stats AND rows — the template needs both', async () => {
    // The old handler passed only auditStats, so the template would have thrown
    // on auditLogs.results even once it was reachable.
    const res = makeRes();
    await makeRoutes(workingAudit()).adminAuditLogs(makeReq(), res);

    expect(res.render).toHaveBeenCalledWith('admin-audit', expect.objectContaining({
      auditStats: stats, auditLogs: page, auditAvailable: true
    }));
  });

  test('query parameters become filters, and all three endpoints read them the same way', async () => {
    const audit = workingAudit();
    const routes = makeRoutes(audit);
    const query = { user: 'alice', eventType: 'token-mint', severity: 'high' };

    await routes.adminAuditLogsApi(makeReq(query), makeRes());
    await routes.adminAuditExport(makeReq(query), makeRes());

    const expected = { user: 'alice', eventType: 'token-mint', severity: 'high' };
    expect(audit.searchAuditLogs).toHaveBeenCalledWith(expected, expect.anything(), expect.objectContaining({ username: expect.any(String) }));
    expect(audit.exportAuditLogs).toHaveBeenCalledWith(expected, 'json', expect.objectContaining({ username: expect.any(String) }));
  });

  test('blank and absent parameters are not passed as filters', async () => {
    // An empty string filter matches nothing, so a blank form field would
    // silently return zero rows rather than everything.
    const audit = workingAudit();
    await makeRoutes(audit).adminAuditLogsApi(makeReq({ user: '   ', eventType: '' }), makeRes());
    expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.anything(), expect.anything());
  });

  test('newest first, because an audit reader is looking at what just happened', async () => {
    const audit = workingAudit();
    await makeRoutes(audit).adminAuditLogsApi(makeReq(), makeRes());
    expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ sortBy: 'timestamp', sortOrder: 'desc' }), expect.anything());
  });

  test('details finds an event by id', async () => {
    const res = makeRes();
    await makeRoutes(workingAudit()).adminAuditLogDetails(makeReq({}, { id: 'e1' }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  test('details 404s for an unknown id rather than returning something else', async () => {
    const res = makeRes();
    await makeRoutes(workingAudit()).adminAuditLogDetails(makeReq({}, { id: 'nope' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('export sets a filename and honours csv', async () => {
    const res = makeRes();
    await makeRoutes(workingAudit()).adminAuditExport(makeReq({ format: 'csv' }), res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('.csv'));
  });

  test('unconfigured auditing renders an empty page, it does not 500', async () => {
    // "Auditing is off" and "auditing is broken" must not look alike to an
    // operator trying to work out why the page is empty.
    const res = makeRes();
    await makeRoutes(null).adminAuditLogs(makeReq(), res);
    expect(res.render).toHaveBeenCalledWith('admin-audit', expect.objectContaining({ auditAvailable: false }));
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test('unconfigured auditing refuses an export loudly rather than sending nothing', async () => {
    const res = makeRes();
    await makeRoutes(null).adminAuditExport(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  /**
   * #1237 — the page nav linked to `?page=N` and the handler read only `limit`
   * and `offset`, so every one of 166 page links re-rendered page 1. These pin
   * the contract the view now depends on: `page` is the address of a page, and
   * the control that navigates it is emitted by the server.
   */
  describe('#1237 paging', () => {
    test('page is read and becomes an offset', async () => {
      const audit = workingAudit();
      await makeRoutes(audit).adminAuditLogs(makeReq({ page: '3' }), makeRes());
      expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 50, offset: 100 }), expect.anything());
    });

    test('page is relative to limit, not to a fixed page size', async () => {
      const audit = workingAudit();
      await makeRoutes(audit).adminAuditLogs(makeReq({ page: '3', limit: '25' }), makeRes());
      expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 25, offset: 50 }), expect.anything());
    });

    test.each([['0'], ['-4'], ['abc'], ['']])('a page of %s is page 1, not a negative offset', async (bad) => {
      const audit = workingAudit();
      await makeRoutes(audit).adminAuditLogs(makeReq({ page: bad }), makeRes());
      expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ offset: 0 }), expect.anything());
    });

    test('an explicit offset still works when no page is given', async () => {
      // The API contract predates `page` and other callers may rely on it.
      const audit = workingAudit();
      await makeRoutes(audit).adminAuditLogsApi(makeReq({ offset: '200' }), makeRes());
      expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ offset: 200 }), expect.anything());
    });

    test('the API reads page the same way the page does', async () => {
      // One paging contract, for the same reason auditFiltersFromQuery is shared:
      // two endpoints answering one query string differently is the bug itself.
      const audit = workingAudit();
      await makeRoutes(audit).adminAuditLogsApi(makeReq({ page: '2', limit: '10' }), makeRes());
      expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 10, offset: 10 }), expect.anything());
    });

    test('the page renders the canonical control, marked for the enhancer', async () => {
      const audit = workingAudit();
      audit.searchAuditLogs.mockResolvedValue({ results: [], total: 500, limit: 50, offset: 100, hasMore: true });
      const res = makeRes();
      await makeRoutes(audit).adminAuditLogs(makeReq({ page: '3' }), res);

      const html = (res.render.mock.calls[0][1] as { paginationHtml: string }).paginationHtml;
      expect(html).toContain('data-pagination');
      expect(html).toContain('data-current-page="3"');
      expect(html).toContain('data-total-pages="10"');
    });

    test('every page link carries the filters and the page size', async () => {
      // Losing the filter on page 2 is how the old control behaved: changePage()
      // re-sent a currentFilters that a full page load had already reset to {}.
      const audit = workingAudit();
      audit.searchAuditLogs.mockResolvedValue({ results: [], total: 500, limit: 25, offset: 0, hasMore: true });
      const res = makeRes();
      await makeRoutes(audit).adminAuditLogs(makeReq({ user: 'alice', severity: 'high', limit: '25' }), res);

      const html = (res.render.mock.calls[0][1] as { paginationHtml: string }).paginationHtml;
      expect(html).toContain('/admin/audit?');
      expect(html).toContain('user=alice');
      expect(html).toContain('severity=high');
      expect(html).toContain('limit=25');
      expect(html).toContain('page=2');
    });

    test('a single page of results renders no control at all', async () => {
      const audit = workingAudit();
      const res = makeRes();
      await makeRoutes(audit).adminAuditLogs(makeReq(), res);
      expect((res.render.mock.calls[0][1] as { paginationHtml: string }).paginationHtml).toBe('');
    });

    test('the Result options come from the vocabulary, not a hand-kept list', async () => {
      // The first draft of this filter listed allow/deny/error. The log holds
      // success, deny and failure — two options matched zero records, and the
      // value on most of the log could not be filtered for at all. Same defect
      // as #1115, one field over.
      const res = makeRes();
      await makeRoutes(workingAudit()).adminAuditLogs(makeReq(), res);
      const data = res.render.mock.calls[0][1] as { resultOptions: string[] };
      expect(data.resultOptions).toContain('success');
      expect(data.resultOptions).toContain('deny');
      expect(data.resultOptions).toContain('failure');
    });

    test('the view is told the current page and page size it is displaying', async () => {
      // The page-size control has to render its own current value, and it is
      // the server that resolved it.
      const audit = workingAudit();
      const res = makeRes();
      await makeRoutes(audit).adminAuditLogs(makeReq({ page: '2', limit: '100' }), res);
      expect(res.render).toHaveBeenCalledWith('admin-audit', expect.objectContaining({ currentPage: 2, limit: 100 }));
    });
  });

  test.each(['adminAuditLogs', 'adminAuditLogsApi', 'adminAuditLogDetails', 'adminAuditExport'])(
    '%s refuses a caller without admin-system',
    async (handler) => {
      const res = makeRes();
      await makeRoutes(workingAudit(), false)[handler](makeReq({}, { id: 'e1' }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
  );
});
