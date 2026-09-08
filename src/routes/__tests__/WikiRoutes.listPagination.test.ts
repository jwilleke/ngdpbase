/**
 * #1302 — the list surfaces that rendered every row, always.
 *
 * This is consistency work rather than scale work, and the tests say so: the
 * numbers here are large because the behaviour under a large list is what has
 * never been exercised, not because the instance that reported it is large.
 *
 * Page history and the log viewer are the two that grow on their own — history
 * without bound on an actively edited page, the log with every request — so
 * they get the detailed coverage. The rest share `pageOfList`, which the trash
 * tests already pin.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const makeReq = (query: Record<string, string> = {}, params: Record<string, string> = {}) => ({
  params, query, body: {}, session: { csrfToken: 't' },
  path: '/history/TestPage', originalUrl: '/history/TestPage', protocol: 'http',
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

const versions = (n: number) => Array.from({ length: n }, (_, i) => ({
  version: n - i,
  author: 'jim',
  date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
  changeNote: `edit ${i}`
}));

function makeRoutes(history: unknown[]) {
  const provider = {
    getVersionHistory: vi.fn().mockResolvedValue(history)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') {
        return {
          provider,
          pageExists: () => true,
          getPageMetadata: async () => ({ uuid: 'u1', title: 'TestPage' }),
          getPage: async () => ({ content: '', metadata: {} })
        };
      }
      if (name === 'UserManager') return { getCurrentUser: async () => admin, hasPermission: async () => true };
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<void>>;
  (routes as unknown as { createWikiContext: () => unknown }).createWikiContext = () => ({
    hasPermission: vi.fn().mockResolvedValue(true),
    // #714 gates history behind the same ACL evaluator the page itself uses.
    canAccess: vi.fn().mockResolvedValue(true),
    userContext: admin,
    CONTEXT: {}
  });
  (routes as unknown as { getCommonTemplateData: () => Promise<unknown> }).getCommonTemplateData = async () => ({});
  (routes as unknown as { renderError: (...a: unknown[]) => Promise<unknown> }).renderError =
    async (_rq: unknown, rs: { status: (n: number) => { send: (s: string) => unknown } }, code: number) => rs.status(code).send('err');
  return routes;
}

const rendered = (res: { render: { mock: { calls: unknown[][] } } }) =>
  res.render.mock.calls[0][1] as {
    versions: unknown[];
    versionCount: number;
    paginationHtml: string;
  };

describe('#1302 page history is paged', () => {
  test('a long history renders one page of it', async () => {
    const res = makeRes();
    await makeRoutes(versions(80)).pageHistory(makeReq({}, { page: 'TestPage' }), res);
    expect(rendered(res).versions.length).toBeLessThan(80);
  });

  test('the heading count stays the whole history, not the window', async () => {
    // "17 versions" is a fact about the page; "25 versions" would be a fact
    // about the screen, and the heading is not talking about the screen.
    const res = makeRes();
    await makeRoutes(versions(80)).pageHistory(makeReq({}, { page: 'TestPage' }), res);
    expect(rendered(res).versionCount).toBe(80);
  });

  test('the control addresses the rest of it', async () => {
    const res = makeRes();
    await makeRoutes(versions(80)).pageHistory(makeReq({}, { page: 'TestPage' }), res);
    const html = rendered(res).paginationHtml;
    expect(html).toContain('data-pagination');
    expect(html).toContain('data-total-pages="4"');
  });

  test('page 2 is a different set of versions', async () => {
    const first = makeRes();
    const second = makeRes();
    const routes = makeRoutes(versions(80));
    await routes.pageHistory(makeReq({}, { page: 'TestPage' }), first);
    await routes.pageHistory(makeReq({ page: '2' }, { page: 'TestPage' }), second);
    expect(rendered(second).versions[0]).not.toEqual(rendered(first).versions[0]);
  });

  test('a short history renders whole, with no control', async () => {
    const res = makeRes();
    await makeRoutes(versions(4)).pageHistory(makeReq({}, { page: 'TestPage' }), res);
    expect(rendered(res).versions).toHaveLength(4);
    expect(rendered(res).paginationHtml).toBe('');
  });
});

/**
 * The log viewer is the one surface here where the change is not only about
 * consistency: it showed the last 100 lines of the file and offered no way to
 * reach any of the rest from a browser.
 */
describe('#1302 the log viewer pages through the file', () => {
  const LINES = 250;

  function makeLogRoutes(lines: number) {
    const content = Array.from({ length: lines }, (_, i) => `line ${String(i).padStart(4, '0')}`).join('\n');
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') {
          return { getResolvedDataPath: () => tmpDir, getProperty: (_k: string, d: unknown) => d };
        }
        if (name === 'UserManager') return { getCurrentUser: async () => admin, hasPermission: async () => true };
        return null;
      })
    };
    fs.writeFileSync(path.join(tmpDir, 'app.log'), content);
    const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<void>>;
    (routes as unknown as { createWikiContext: () => unknown }).createWikiContext = () => ({ userContext: admin });
    (routes as unknown as { hasAdminViewAccess: () => Promise<boolean> }).hasAdminViewAccess = async () => true;
    (routes as unknown as { getCommonTemplateData: () => Promise<unknown> }).getCommonTemplateData = async () => ({});
    return routes;
  }

  const logArgs = (res: { render: { mock: { calls: unknown[][] } } }) =>
    res.render.mock.calls[0][1] as { logContent: string; logPaginationHtml: string; logLineCount: number };

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdp-logs-'));
  });

  afterEach(() => {
    // Only the directory this test made, and only its own files (#1093 rule:
    // teardown never removes a tree it did not create).
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('page 1 is still the newest lines, as the tail always was', async () => {
    const res = makeRes();
    await makeLogRoutes(LINES).adminLogs(makeReq(), res);
    const { logContent } = logArgs(res);
    expect(logContent).toContain('line 0249');
    expect(logContent).not.toContain('line 0000');
  });

  test('page 2 reaches lines the viewer could never show before', async () => {
    const res = makeRes();
    await makeLogRoutes(LINES).adminLogs(makeReq({ page: '2' }), res);
    const { logContent } = logArgs(res);
    expect(logContent).toContain('line 0100');
    expect(logContent).not.toContain('line 0249');
  });

  test('lines within a page stay oldest-first, which is how a log reads', async () => {
    const res = makeRes();
    await makeLogRoutes(LINES).adminLogs(makeReq(), res);
    const lines = logArgs(res).logContent.split('\n');
    expect(lines[0] < lines[lines.length - 1]).toBe(true);
  });

  test('the control and the whole line count are reported', async () => {
    const res = makeRes();
    await makeLogRoutes(LINES).adminLogs(makeReq(), res);
    const { logPaginationHtml, logLineCount } = logArgs(res);
    expect(logPaginationHtml).toContain('data-pagination');
    expect(logLineCount).toBe(LINES);
  });

  test('a short log renders whole, with no control', async () => {
    const res = makeRes();
    await makeLogRoutes(10).adminLogs(makeReq(), res);
    expect(logArgs(res).logPaginationHtml).toBe('');
  });
});
