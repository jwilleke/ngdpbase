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
const page = { results: [{ id: 'e1', eventType: 'token.mint', user: 'alice' }], total: 1, limit: 50, offset: 0, hasMore: false };

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
    const query = { user: 'alice', eventType: 'token.mint', severity: 'high' };

    await routes.adminAuditLogsApi(makeReq(query), makeRes());
    await routes.adminAuditExport(makeReq(query), makeRes());

    const expected = { user: 'alice', eventType: 'token.mint', severity: 'high' };
    expect(audit.searchAuditLogs).toHaveBeenCalledWith(expected, expect.anything());
    expect(audit.exportAuditLogs).toHaveBeenCalledWith(expected, 'json');
  });

  test('blank and absent parameters are not passed as filters', async () => {
    // An empty string filter matches nothing, so a blank form field would
    // silently return zero rows rather than everything.
    const audit = workingAudit();
    await makeRoutes(audit).adminAuditLogsApi(makeReq({ user: '   ', eventType: '' }), makeRes());
    expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.anything());
  });

  test('newest first, because an audit reader is looking at what just happened', async () => {
    const audit = workingAudit();
    await makeRoutes(audit).adminAuditLogsApi(makeReq(), makeRes());
    expect(audit.searchAuditLogs).toHaveBeenCalledWith({}, expect.objectContaining({ sortBy: 'timestamp', sortOrder: 'desc' }));
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

  test.each(['adminAuditLogs', 'adminAuditLogsApi', 'adminAuditLogDetails', 'adminAuditExport'])(
    '%s refuses a caller without admin-system',
    async (handler) => {
      const res = makeRes();
      await makeRoutes(workingAudit(), false)[handler](makeReq({}, { id: 'e1' }), res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
  );
});
