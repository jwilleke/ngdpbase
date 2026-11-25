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

const stats = (over: Partial<MeasureStats> = {}): MeasureStats => ({ count: 58, p50: 80, p95: 119.5, max: 240, p5: 30.5, min: 12, mean: 85.2, ...over });
const report = (over: Partial<PerformanceReport> = {}): PerformanceReport => ({
  rollup: {
    hour: { parse: stats(), hit: stats({ p50: 0.5, p95: 0.192, max: 0.9, p5: 0.083, min: 0.021, mean: 0.45 }), err: stats({ p50: 0, p95: 0.065, max: 0.1, mean: 0.01 }) },
    day: { parse: null, hit: null, err: null },
    week: { parse: null, hit: null, err: null },
    month: { parse: null, hit: null, err: null }
  },
  checks: { hour: 58, day: 58, week: 58, month: 58 },
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

  test('the route is registered: GET /admin/parser-performance reaches the handler', async () => {
    const { routes } = makeRoutes(['admin-read']);
    const gets = new Map<string, (req: unknown, res: unknown) => unknown>();
    const app = new Proxy({}, {
      get: (_t, method: string) => (route: string, handler: (req: unknown, res: unknown) => unknown) => {
        if (method === 'get' && typeof route === 'string') gets.set(route, handler);
      }
    });
    (routes as unknown as { registerRoutes: (a: unknown) => void }).registerRoutes(app);

    const handler = gets.get('/admin/parser-performance');
    expect(handler).toBeDefined();
    const res = createMockRes();
    await handler?.(createMockReq(admin), res);
    expect(rendered(res)).toBe(true);
  });
});

describe('what the Page building speed page says (#2468)', () => {
  const empty = () => ({ parse: null, hit: null, err: null });
  const nothing = (over: Partial<PerformanceReport> = {}) => report({
    rollup: { hour: empty(), day: empty(), week: empty(), month: empty() },
    checks: { hour: 0, day: 0, week: 0, month: 0 },
    legacy: empty(),
    ...over
  });

  async function dom(r: PerformanceReport): Promise<Document> {
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-parser-performance.ejs'), {
      pageName: '', csrfToken: 'csrf', title: 'Page building speed', report: r,
      jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => ''
    });
    const doc = new JSDOM(html).window.document;
    doc.querySelectorAll('script, style').forEach((e) => e.remove());
    return doc;
  }
  const squash = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();
  async function page(r: PerformanceReport): Promise<string> {
    return squash((await dom(r)).body.textContent);
  }

  test('has the title with its unit, a one-sentence intro and the three measures with their limits from the settings', async () => {
    const text = await page(report());

    expect(text).toContain('Page building speed');
    expect(text).toContain('How quickly the site turns page text into what you read.');
    expect(text).toContain('Page build time (ms)');
    expect(text).toContain('Limit: 150 ms. Slower is too slow.');
    expect(text).toContain('Below 20 is too low.');
    expect(text).toContain('Above 5 is too high.');
    for (const label of ['Last hour', 'Last 24 hours', 'Last 7 days', 'Last 30 days', 'Typical', 'Slowest 1 in 20', 'Slowest', 'Average']) {
      expect(text).toContain(label);
    }
  });

  test('promises no flag the page does not show, and uses "checks", not "samples" or "minutes"', async () => {
    const text = await page(report());

    expect(text).not.toMatch(/flagged/i);
    expect(text).not.toMatch(/samples?\b/i);
    expect(text).not.toMatch(/\bminutes\b/i);
    expect(text).not.toMatch(/over-limit/i);
  });

  test('the meaning of Typical, Slowest 1 in 20 and Slowest is behind a details control, not in the first view', async () => {
    const doc = await dom(report());
    const details = doc.querySelector('details');

    expect(squash(details?.querySelector('summary')?.textContent)).toBe('What Typical, Slowest 1 in 20 and Slowest mean');
    expect(squash(details?.textContent)).toContain('once a minute');
    expect(squash(details?.textContent)).toContain('19 of 20');
    expect(details?.hasAttribute('open')).toBe(false);
  });

  test('fewer than 111 words greet the reader outside the tables and the details control', async () => {
    for (const r of [report(), report({ recording: false }), nothing()]) {
      const doc = await dom(r);
      doc.querySelectorAll('details > :not(summary), table').forEach((e) => e.remove());
      const words = squash(doc.querySelector('h1')?.closest('.col-12')?.textContent).split(' ').filter(Boolean).length;
      expect(words).toBeLessThan(111);
    }
  });

  test('shows the numbers in the unit each measure uses', async () => {
    const text = await page(report());

    expect(text).toContain('119.5'); // milliseconds
    expect(text).toContain('8.3%'); // a ratio shown as percent
    expect(text).toContain('6.5%');
  });

  test('on the stored-copies table the two Slowest rows are the lowest values; the other tables keep the highest', async () => {
    const doc = await dom(report());
    const row = (key: string, label: string) => {
      const tr = [...doc.querySelectorAll(`[data-testid="parser-performance-${key}"] tbody tr`)].find((r) => squash(r.querySelector('th')?.textContent) === label);
      return squash(tr?.querySelector('td')?.textContent);
    };

    expect(row('hit', 'Slowest 1 in 20')).toBe('8.3%');
    expect(row('hit', 'Slowest')).toBe('2.1%');
    expect(row('parse', 'Slowest 1 in 20')).toBe('119.5');
    expect(row('parse', 'Slowest')).toBe('240.0');
    expect(row('err', 'Slowest 1 in 20')).toBe('6.5%');
    expect(row('err', 'Slowest')).toBe('10.0%');
  });

  test('says the Slowest rows of the stored-copies table are its lowest values', async () => {
    const doc = await dom(report());

    expect(squash(doc.querySelector('details')?.textContent)).toContain('lowest');
    expect(squash(doc.querySelector('[data-testid="parser-performance-hit"]')?.textContent)).toContain('Slowest rows show the lowest');
  });

  test('says how many checks each period holds once, in its column heading, not in every table', async () => {
    const doc = await dom(report({ checks: { hour: 58, day: 1210, week: 7840, month: 30120 } }));
    const heads = [...doc.querySelectorAll('[data-testid="parser-performance-parse"] thead th')].map((th) => squash(th.textContent));

    expect(heads).toEqual(['', 'Last hour 58 checks', 'Last 24 hours 1210 checks', 'Last 7 days 7840 checks', 'Last 30 days 30120 checks']);
    expect(squash(doc.querySelector('[data-testid="parser-performance-parse"]')?.textContent)).not.toContain('Checks counted');
    expect(squash(doc.querySelector('[data-testid="parser-performance-hit"]')?.textContent)).not.toContain('Checks counted');
  });

  test('a table whose count differs from the period total says so on its own row', async () => {
    const doc = await dom(report({
      rollup: {
        hour: { parse: stats({ count: 40 }), hit: stats({ count: 58 }), err: stats({ count: 58 }) },
        day: { parse: null, hit: null, err: null }, week: { parse: null, hit: null, err: null }, month: { parse: null, hit: null, err: null }
      }
    }));

    expect(squash(doc.querySelector('[data-testid="parser-performance-parse"] tbody')?.textContent)).toContain('Checks with this number 40');
    expect(squash(doc.querySelector('[data-testid="parser-performance-hit"] tbody')?.textContent)).not.toContain('Checks with this number');
  });

  test('a period with no checks says so once, without "yet"', async () => {
    const text = await page(report());
    expect(text).toContain('No checks in this period.');
    expect(text).not.toMatch(/period yet/);
  });

  test('the earlier warnings table appears only when there are earlier warnings, says they are not comparable, and says "checks"', async () => {
    const withLegacy = await page(report());
    expect(withLegacy).toContain('Earlier warnings (only checks over the limit)');
    expect(withLegacy).toContain('Saved before this page existed, for checks over the limit only.');
    expect(withLegacy).toContain('Not a view of the whole site.');
    expect(withLegacy).toMatch(/totals since start-up.*do not compare/);
    expect(withLegacy).toContain('310');

    const without = await page(report({ legacy: { parse: null, hit: null, err: null } }));
    expect(without).not.toContain('Earlier warnings');
  });

  describe('a site that is not keeping checks', () => {
    test('shows the cause and the step, and no tables', async () => {
      const doc = await dom(nothing({ recording: false }));
      const banner = squash(doc.querySelector('.alert')?.textContent);

      expect(banner).toContain('Page checks are not being saved because the site has no folder it can write them to.');
      expect(banner).toContain('Admin → Configuration');
      expect(banner).toContain('ngdpbase.markup.performance.history.dir');
      expect(banner).toContain('restart');
      expect(doc.querySelectorAll('table')).toHaveLength(0);
      expect(squash(doc.body.textContent)).not.toContain('No checks');
    });
  });

  describe('a site that is keeping checks but has none yet', () => {
    test('has no banner, no tables, and one line saying when they appear', async () => {
      const doc = await dom(nothing());
      const text = squash(doc.body.textContent);

      expect(doc.querySelector('.alert-warning')).toBeNull();
      expect(doc.querySelectorAll('table')).toHaveLength(0);
      expect(text.match(/No checks recorded yet\./g)).toHaveLength(1);
      expect(text).toContain('They appear within a minute of pages being viewed.');
    });

    test('a measure with nothing at all shows one line in place of its table; the others keep theirs', async () => {
      const doc = await dom(report({
        rollup: {
          hour: { parse: stats(), hit: null, err: null }, day: { parse: stats(), hit: null, err: null },
          week: { parse: stats(), hit: null, err: null }, month: { parse: stats(), hit: null, err: null }
        }
      }));

      expect(doc.querySelectorAll('[data-testid="parser-performance-parse"] table')).toHaveLength(1);
      expect(doc.querySelectorAll('[data-testid="parser-performance-hit"] table')).toHaveLength(0);
      expect(squash(doc.querySelector('[data-testid="parser-performance-hit"]')?.textContent)).toContain('No checks recorded yet.');
    });
  });

  test('column headings may wrap and the row names do not force a sideways scroll on a phone', async () => {
    const html = fs.readFileSync(path.join(VIEWS, 'admin-parser-performance.ejs'), 'utf8');
    expect(html).not.toMatch(/<th scope="col"[^>]*text-nowrap/);
    expect(html).not.toMatch(/<th scope="row"[^>]*text-nowrap/);
  });

  test.each([
    ['with data', () => report()],
    ['with nothing recorded', () => nothing()],
    ['not recording', () => nothing({ recording: false })]
  ])('the visible text has no issue number, file path, "see the log" or the word role (%s)', async (_label, make) => {
    const text = (await page(make())).replace('ngdpbase.markup.performance.history.dir', 'THE-SETTING');

    expect(text).not.toMatch(/#\s*\d/);
    expect(text).not.toMatch(/\b(docs|src|views|config)\//i);
    expect(text).not.toMatch(/\.(md|ts|js|json|jsonl|ejs)\b/i);
    expect(text).not.toMatch(/see the log/i);
    expect(text).not.toMatch(/\brole/i);
    expect(text).not.toMatch(/github/i);
  });
});
