/**
 * The "Page building speed" admin page (#2468): who may open it, and what it says.
 * Opened by the `admin-read` permission check, the same as the other read-only admin screens.
 */
import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import type { PerformanceReport, MeasureStats } from '../../parsers/ParserPerformanceHistory';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

const stats = (over: Partial<MeasureStats> = {}): MeasureStats => ({ count: 58, p50: 80, p95: 119.5, max: 240, mean: 85.2, ...over });
const report = (over: Partial<PerformanceReport> = {}): PerformanceReport => ({
  rollup: {
    hour: { parse: stats(), hit: stats({ p50: 0.5, p95: 0.192, max: 0.9, mean: 0.45 }), err: stats({ p50: 0, p95: 0.065, max: 0.1, mean: 0.01 }) },
    day: { parse: null, hit: null, err: null },
    week: { parse: null, hit: null, err: null },
    month: { parse: null, hit: null, err: null }
  },
  legacy: { parse: stats({ count: 7, max: 310 }), hit: null, err: null },
  limits: { parseTime: 150, cacheHitRatio: 0.2, errorRate: 0.05 },
  recording: true,
  ...over
});

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const createMockReq = (userContext: unknown = null) => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' },
  path: '/admin/parser-performance', originalUrl: '/admin/parser-performance', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'), userContext
});
const createMockRes = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

function makeRoutes(granted: string[]) {
  const getPerformanceReport = vi.fn(async () => report());
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'PolicyDecisionPoint') {
        return { permits: vi.fn((_u: string, p: string) => Promise.resolve(granted.includes(p))) };
      }
      if (name === 'MarkupParser') return { getPerformanceReport };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as { adminParserPerformance: (a: unknown, b: unknown) => Promise<void> };
  vi.spyOn(routes as unknown as { getCommonTemplateData: () => Promise<object> }, 'getCommonTemplateData').mockResolvedValue({});
  return { routes, getPerformanceReport };
}
const rendered = (res: ReturnType<typeof createMockRes>) => res.render.mock.calls.some((c) => c[0] === 'admin-parser-performance');

beforeEach(() => vi.clearAllMocks());

describe('who may open the Page building speed page (#2468)', () => {
  test.each([['admin-read'], ['admin-system']])('a caller holding %s gets the page', async (permission) => {
    const res = createMockRes();
    const { routes, getPerformanceReport } = makeRoutes([permission]);
    await routes.adminParserPerformance(createMockReq(admin), res);

    expect(rendered(res)).toBe(true);
    expect(getPerformanceReport).toHaveBeenCalledTimes(1);
    const data = res.render.mock.calls.find((c) => c[0] === 'admin-parser-performance')?.[1] as { report: PerformanceReport };
    expect(data.report.limits.parseTime).toBe(150);
  });

  test('a signed-in caller with neither permission is refused with a 403 and nothing is read', async () => {
    const res = createMockRes();
    const { routes, getPerformanceReport } = makeRoutes(['page-edit']);
    await routes.adminParserPerformance(createMockReq({ username: 'jo', isAuthenticated: true, roles: ['editor'] }), res);

    expect(rendered(res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getPerformanceReport).not.toHaveBeenCalled();
  });

  test('a signed-out visitor is refused the same way', async () => {
    const res = createMockRes();
    const { routes, getPerformanceReport } = makeRoutes([]);
    await routes.adminParserPerformance(createMockReq(ANONYMOUS_SUBJECT), res);

    expect(rendered(res)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getPerformanceReport).not.toHaveBeenCalled();
  });

  test('the admin dashboard has a button to it, beside Logs', () => {
    const dashboard = fs.readFileSync(path.join(VIEWS, 'admin-dashboard.ejs'), 'utf8');
    expect(dashboard).toContain('href="/admin/parser-performance"');
  });
});

describe('what the Page building speed page says (#2468)', () => {
  async function page(r: PerformanceReport): Promise<string> {
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-parser-performance.ejs'), {
      pageName: '', csrfToken: 'csrf', title: 'Page building speed', report: r,
      jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => ''
    });
    const doc = new JSDOM(html).window.document;
    doc.querySelectorAll('script, style').forEach((e) => e.remove());
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ');
  }

  test('has the title, the plain-words intro and the three measures with their limits from the settings', async () => {
    const text = await page(report());

    expect(text).toContain('Page building speed');
    expect(text).toContain('How quickly the site turns page text into what you read.');
    expect(text).toContain('Time to build a page, in milliseconds (pages not already stored). Limit: 150.');
    expect(text).toContain('Pages served from stored copies, in percent. Lower than 20 is flagged.');
    expect(text).toContain('Pages that failed to build, in percent. Higher than 5 is flagged.');
    for (const label of ['Last hour', 'Last 24 hours', 'Last 7 days', 'Last 30 days', 'Typical', 'Slowest 1 in 20', 'Slowest', 'Average', 'Checks counted']) {
      expect(text).toContain(label);
    }
  });

  test('shows the numbers in the unit each measure uses', async () => {
    const text = await page(report());

    expect(text).toContain('119.5'); // milliseconds
    expect(text).toContain('19.2%'); // a ratio shown as percent
    expect(text).toContain('6.5%');
    expect(text).toContain('58'); // checks counted
  });

  test('an empty period says so', async () => {
    const text = await page(report());
    expect(text).toContain('No checks recorded in this period yet.');
  });

  test('the earlier warnings table appears only when there are earlier warnings', async () => {
    const withLegacy = await page(report());
    expect(withLegacy).toContain('Earlier warnings (over-limit samples only)');
    expect(withLegacy).toContain('Before this page existed, the site saved only the minutes when a number went over its limit.');
    expect(withLegacy).toContain('310');

    const without = await page(report({ legacy: { parse: null, hit: null, err: null } }));
    expect(without).not.toContain('Earlier warnings');
  });

  test('a site with no folder to keep the checks in says so', async () => {
    const text = await page(report({ recording: false }));
    expect(text).toContain('This site is not keeping these checks.');
  });

  test.each([
    ['with data', () => report()],
    ['with nothing recorded', () => report({
      rollup: { hour: { parse: null, hit: null, err: null }, day: { parse: null, hit: null, err: null }, week: { parse: null, hit: null, err: null }, month: { parse: null, hit: null, err: null } },
      legacy: { parse: null, hit: null, err: null }, recording: false
    })]
  ])('the visible text has no issue number, file path, "see the log" or the word role (%s)', async (_label, make) => {
    const text = await page(make());

    expect(text).not.toMatch(/#\s*\d/);
    expect(text).not.toMatch(/\b(docs|src|views|config)\//i);
    expect(text).not.toMatch(/\.(md|ts|js|json|jsonl|ejs)\b/i);
    expect(text).not.toMatch(/see the log/i);
    expect(text).not.toMatch(/\brole/i);
    expect(text).not.toMatch(/github/i);
  });
});
