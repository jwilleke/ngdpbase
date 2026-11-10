/**
 * #2319 — GET /diff/:page renders the Compare Versions page. The view reads a
 * bare `pageName`, so the route has to pass it; without it every compare was a
 * server error ("pageName is not defined").
 *
 * Runs the real VersioningFileProvider and the real views/page-diff.ejs
 * against a temp directory, with two saved versions of one page.
 */

vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';
import { JSDOM } from 'jsdom';
import os from 'os';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import ValidationManager from '../../managers/ValidationManager';
import WikiRoutes from '../WikiRoutes';
import { actor } from '../../test-support/actors';
import { pageUrl } from '../../utils/pageUrl';
import { jsonForScript } from '../../utils/jsonForScript';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const PAGE = 'PCSK9';

describe('GET /diff/:page renders Compare Versions (#2319)', () => {
  let testDir: string;
  let provider: VersioningFileProvider;
  let routes: WikiRoutes;
  const ctx = actor('ada');

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-diff-render-'));
    const pagesDir = path.join(testDir, 'pages');
    const indexPath = path.join(testDir, 'data', 'page-index.json');
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.filesystem.autosave': true,
      'ngdpbase.page.provider.filesystem.pluralmatching': false,
      'ngdpbase.page.provider.versioning.indexfile': indexPath,
      'ngdpbase.page.provider.versioning.maxversions': 50,
      'ngdpbase.page.provider.versioning.retentiondays': 365,
      'ngdpbase.page.provider.versioning.compression': 'gzip',
      'ngdpbase.page.provider.versioning.deltastorage': true,
      'ngdpbase.page.provider.versioning.checkpointinterval': 10,
      'ngdpbase.page.provider.versioning.cachesize': 50
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config[key] !== undefined ? config[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir),
      isBaseUrlExplicit: vi.fn(() => true),
      getBaseURL: vi.fn(() => 'https://wiki.example.org/')
    };
    let validationManager: unknown = null;
    const providerEngine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validationManager;
        return null;
      })
    };
    validationManager = new ValidationManager(providerEngine);
    provider = new VersioningFileProvider(providerEngine);
    await provider.initialize();

    const pageManager = {
      provider,
      readVersionHistory: vi.fn(async (name: string, c: unknown) => {
        const value = await provider.getVersionHistory(name, c);
        return { ok: true, value, metadata: { uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
      }),
      readVersionDiff: vi.fn(async (name: string, v1: number, v2: number, c: unknown) => {
        const value = await provider.compareVersions(name, v1, v2, c);
        return { ok: true, value, metadata: { uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
      })
    };
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'PageManager') return pageManager;
        if (name === 'ConfigurationManager') return configManager;
        // pageHistory pages its list through PluginManager's formatters.
        if (name === 'PluginManager') {
          return {
            formatters: {
              parsePageParam: () => 1,
              applyPagination: (items: unknown[]) => ({ items, currentPage: 1, totalPages: 1 }),
              formatPaginationNav: () => ''
            }
          };
        }
        return null;
      })
    };
    routes = new WikiRoutes(engine);
    // The routes' own helpers need managers this test does not build.
    vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({ user: null, appName: 'ngdpbase', userContext: { isAuthenticated: true } });
    vi.spyOn(routes as never, 'getLeftMenu').mockResolvedValue('');
  });

  afterEach(async () => {
    // Only this test's own temp directory under os.tmpdir().
    await fs.remove(testDir);
  });

  function appFor(): express.Express {
    const app = express();
    app.set('views', path.join(process.cwd(), 'views'));
    app.set('view engine', 'ejs');
    app.locals.pageUrl = pageUrl;
    app.locals.jsonForScript = jsonForScript;
    app.use((req, _res, next) => {
      (req as unknown as { userContext: unknown }).userContext = ctx;
      next();
    });
    app.get('/history/:page', (req, res) => routes.pageHistory(req, res));
    app.get('/diff/:page', (req, res) => routes.pageDiff(req, res));
    return app;
  }

  test('two saved versions compare to a 200 page that names the page', async () => {
    const fm = { title: PAGE, uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'system-category': 'general', author: 'ada', editor: 'ada' };
    await provider.savePage(PAGE, 'first body', fm, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'second body with more words', fm, ctx as never);
    expect((await provider.getVersionHistory(PAGE, ctx as never)).length).toBe(2);

    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(`Comparing Versions: ${PAGE}`);
    expect(res.text).not.toContain('pageName is not defined');
    // The version boxes: both numbers, a real date, and the author.
    expect(res.text).toContain('Version 1');
    expect(res.text).toContain('Version 2');
    expect(res.text).not.toContain('Invalid Date');
    expect(res.text).not.toMatch(/Version\s*(<|undefined)/);
    expect(res.text).toMatch(/<strong>Date:<\/strong>\s*\d/);
    expect(res.text).toContain('<strong>Author:</strong> ada');
  });

  // #2326: three more defects in the same flow.
  const fm = { title: PAGE, uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'system-category': 'general', author: 'ada', editor: 'ada' };
  async function saveThree(): Promise<void> {
    await provider.savePage(PAGE, 'Line A\nLine B\nLine C', { ...fm, comment: 'first save' }, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'Line A\nLine B reworded\nLine C', { ...fm, comment: 'reword B' }, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'Line A\nLine B reworded\nLine C\nLine D', { ...fm, comment: 'add D' }, ctx as never);
  }

  test('bug 1: added and removed spans survive highlight.js on Compare Versions', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    expect(res.status).toBe(200);

    const dom = new JSDOM(res.text, { runScripts: 'dangerously' });
    const { window } = dom;
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const before = window.document.querySelectorAll('#unifiedDiff .diff-line-added, #unifiedDiff .diff-line-deleted');
    expect(before.length).toBeGreaterThan(0);

    // What views/footer.ejs does on every page: hljs.highlightAll(). Run the
    // real highlight.js (a dependency of diff2html) against this document.
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { window: g.window, document: g.document };
    g.window = window;
    g.document = window.document;
    try {
      const hljs = createRequire(import.meta.url)('highlight.js');
      hljs.highlightAll();
    } finally {
      g.window = saved.window;
      g.document = saved.document;
    }

    expect(window.document.querySelectorAll('#unifiedDiff .diff-line-added').length).toBeGreaterThan(0);
    expect(window.document.querySelectorAll('#unifiedDiff .diff-line-deleted').length).toBeGreaterThan(0);
    expect(window.document.querySelectorAll('#oldVersion .diff-line-deleted').length).toBeGreaterThan(0);
    expect(window.document.querySelectorAll('#newVersion .diff-line-added').length).toBeGreaterThan(0);
  });

  test('bug 1: the diff is by line, not by character', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    const dom = new JSDOM(res.text, { runScripts: 'dangerously' });
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    const text = (sel: string) => Array.from(dom.window.document.querySelectorAll(sel)).map(e => e.textContent ?? '');
    expect(text('#unifiedDiff .diff-line-deleted').join('|')).toContain('Line B');
    expect(text('#unifiedDiff .diff-line-added').join('|')).toContain('Line B reworded');
  });

  test('bug 2: the From/To form opens v1=From and v2=To', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/history/${PAGE}`);
    expect(res.status).toBe(200);
    // Run just the page's own inline script so the
    // form handler is the one under test; jsdom cannot navigate, so capture the href.
    const dom = new JSDOM(res.text, { runScripts: 'outside-only', url: 'https://wiki.example.org/history/PCSK9' });
    const { document } = dom.window;
    (document.getElementById('version1') as HTMLSelectElement).value = '2';
    (document.getElementById('version2') as HTMLSelectElement).value = '3';
    const script = Array.from(document.querySelectorAll('script')).map(e => e.textContent ?? '').find(t => t.includes('function compareVersions')) ?? '';
    dom.window.eval(script.replace('window.location.href =', 'window.__nav ='));
    document.getElementById('compareForm')?.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    const hrefs = [(dom.window as unknown as { __nav?: string }).__nav ?? ''];
    expect(hrefs[0]).toBe(`/diff/${PAGE}?v1=2&v2=3`);
  });

  test('bug 3: Page History shows each version comment', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/history/${PAGE}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<td>first save</td>');
    expect(res.text).toContain('<td>reword B</td>');
    expect(res.text).toContain('<td>add D</td>');
  });
  // Review fixes on #2327.
  async function diffDom(v1: number, v2: number): Promise<JSDOM> {
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=${v1}&v2=${v2}`);
    expect(res.status).toBe(200);
    const dom = new JSDOM(res.text, { runScripts: 'dangerously' });
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return dom;
  }
  const lines = (dom: JSDOM, cls: string) =>
    Array.from(dom.window.document.querySelectorAll(`#unifiedDiff .diff-line-${cls}`)).map(e => (e.textContent ?? '').slice(1));

  test('M1: appending to a page with no trailing newline leaves the old last line unchanged', async () => {
    await provider.savePage(PAGE, 'Line A\nLine B', fm, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'Line A\nLine B\nLine C', fm, ctx as never);
    const dom = await diffDom(1, 2);
    expect(lines(dom, 'deleted')).toEqual([]);
    expect(lines(dom, 'added')).toEqual(['Line C']);
    expect(lines(dom, 'unchanged')).toEqual(['Line A', 'Line B']);
  });

  test('M1: CRLF against LF is no change and leaves no carriage return', async () => {
    await provider.savePage(PAGE, 'Line A\r\nLine B', fm, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'Line A\nLine B\nLine C', fm, ctx as never);
    const dom = await diffDom(1, 2);
    expect(lines(dom, 'deleted')).toEqual([]);
    expect(lines(dom, 'added')).toEqual(['Line C']);
    expect(dom.window.document.getElementById('unifiedDiff')?.textContent).not.toContain('\r');
  });

  test('M2: Change Summary counts the lines the diff shows', async () => {
    await saveThree();
    const dom = await diffDom(2, 3);
    const summary = dom.window.document.querySelector('.alert-info')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(lines(dom, 'added').length).toBe(1);
    expect(summary).toMatch(/Additions:\s*1\b/);
    expect(summary).toMatch(/Deletions:\s*0\b/);
    expect(summary).toMatch(/Unchanged:\s*3\b/);
  });

  test('M2: summary matches the lines when lines were both added and removed', async () => {
    await saveThree();
    const dom = await diffDom(1, 2);
    const summary = dom.window.document.querySelector('.alert-info')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(summary).toMatch(new RegExp(`Additions:\\s*${lines(dom, 'added').length}\\b`));
    expect(summary).toMatch(new RegExp(`Deletions:\\s*${lines(dom, 'deleted').length}\\b`));
    expect(summary).toMatch(new RegExp(`Unchanged:\\s*${lines(dom, 'unchanged').length}\\b`));
  });

  test('L1/L2: dark mode has its own diff colours', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    expect(res.text).toMatch(/\[data-bs-theme="dark"\][^{]*\.diff-line-deleted/);
  });

  test('versions that differ only in line endings say there are no changes to the text', async () => {
    await provider.savePage(PAGE, 'Line A\r\nLine B', fm, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, 'Line A\nLine B', fm, ctx as never);
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    expect(res.status).toBe(200);
    const doc = new JSDOM(res.text).window.document;
    expect(doc.getElementById('diffNoChanges')?.textContent?.trim()).toBe('No changes to the text.');
    expect(doc.getElementById('unifiedDiff')).toBeNull();
    const summary = doc.querySelector('.alert-info')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(summary).toMatch(/Additions:\s*0\b/);
    expect(summary).toMatch(/Deletions:\s*0\b/);
  });

  test('a compare with changes does not show the no-changes note', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    expect(res.text).not.toContain('diffNoChanges');
  });

  test('L3: a rewrite too large to diff by line shows a note with both sizes', async () => {
    const mk = (tag: string) => Array.from({ length: 6000 }, (_, i) => `${tag}${i * 7919 % 6007}`).join('\n');
    const oldText = mk('a');
    const newText = mk('b');
    const out = (routes as unknown as { lineDiffForDisplay(d: Array<[number, string]>): { tooLarge?: { oldBytes: number; newBytes: number } } })
      .lineDiffForDisplay([[-1, oldText], [1, newText]]);
    expect(out.tooLarge).toEqual({ oldBytes: oldText.length, newBytes: newText.length });
  }, 20000);

  test('L4: Page History defaults From to the second-newest version', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/history/${PAGE}`);
    const doc = new JSDOM(res.text).window.document;
    expect((doc.getElementById('version1') as HTMLSelectElement).value).toBe('2');
    expect((doc.getElementById('version2') as HTMLSelectElement).value).toBe('3');
  });

  // #2352: side by side pairs removed and added lines, padding the short side.
  async function sideBySide(before: string, after: string) {
    await provider.savePage(PAGE, before, fm, ctx as never);
    await sleep(15);
    await provider.savePage(PAGE, after, fm, ctx as never);
    const dom = await diffDom(1, 2);
    const rows = (id: string) => Array.from(dom.window.document.querySelectorAll(`#${id} > span`)).map(e => ({
      cls: e.className,
      text: e.textContent ?? ''
    }));
    return { dom, oldRows: rows('oldVersion'), newRows: rows('newVersion') };
  }

  test('#2352: a removed line with no replacement gets a filler on the new side', async () => {
    const { oldRows, newRows } = await sideBySide('A\nB\nC\nD', 'A\nC\nD');
    expect(oldRows.length).toBe(newRows.length);
    expect(oldRows.map(r => r.cls)).toEqual(['diff-line-unchanged', 'diff-line-deleted', 'diff-line-unchanged', 'diff-line-unchanged']);
    expect(newRows.map(r => r.cls)).toEqual(['diff-line-unchanged', 'diff-line-filler', 'diff-line-unchanged', 'diff-line-unchanged']);
    expect(oldRows[2].text).toBe(newRows[2].text);
  });

  test('#2352: two lines replaced by three pair row by row with one filler', async () => {
    const { oldRows, newRows } = await sideBySide('A\nb1\nb2\nZ', 'A\nn1\nn2\nn3\nZ');
    expect(oldRows.length).toBe(5);
    expect(newRows.length).toBe(5);
    expect(oldRows.map(r => r.cls)).toEqual(['diff-line-unchanged', 'diff-line-deleted', 'diff-line-deleted', 'diff-line-filler', 'diff-line-unchanged']);
    expect(newRows.map(r => r.cls)).toEqual(['diff-line-unchanged', 'diff-line-added', 'diff-line-added', 'diff-line-added', 'diff-line-unchanged']);
    expect(oldRows[4].text).toBe('Z');
    expect(newRows[4].text).toBe('Z');
  });

  test('#2352: a long replaced line stays one row in each pane, inside a shared grid', async () => {
    const long = 'word '.repeat(80).trim();
    const { dom, oldRows, newRows } = await sideBySide('A\nshort\nZ', `A\n${long}\nZ`);
    expect(oldRows.length).toBe(3);
    expect(newRows.length).toBe(3);
    expect(newRows[1].text).toBe(long);
    const grid = dom.window.document.getElementById('sbsGrid') as HTMLElement;
    expect(grid.style.getPropertyValue('--sbs-rows')).toBe('3');
    expect(dom.window.document.body.innerHTML).toMatch(/\.sbs-pane \.diff-pre[^{]*\{[^}]*grid-template-rows:\s*subgrid/);
  });

  test('#2352: fillers are hidden from assistive tech, empty, and not counted as changes', async () => {
    const { dom } = await sideBySide('A\nB\nC', 'A\nC');
    const filler = dom.window.document.querySelector('#newVersion .diff-line-filler') as HTMLElement;
    expect(filler.getAttribute('aria-hidden')).toBe('true');
    expect(filler.textContent).toBe('');
    const summary = dom.window.document.querySelector('.alert-info')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(summary).toMatch(/Additions:\s*0\b/);
    expect(summary).toMatch(/Deletions:\s*1\b/);
    // Copying a pane gives its own lines only.
    expect(dom.window.document.getElementById('newVersion')?.textContent).toBe('AC');
  });

  test('#2352: row height follows the padding: no row class uses calc(), blank rows get the zero-width line', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    const css = res.text.slice(res.text.indexOf('<style'), res.text.indexOf('</style>'));
    expect(css).toMatch(/\.diff-line-filler::before,[^{]*\.diff-line-added:empty::before,[^{]*\.diff-line-deleted:empty::before,[^{]*\.diff-line-unchanged:empty::before\s*\{[^}]*width:\s*0/);
    for (const cls of ['filler', 'added', 'deleted', 'unchanged']) {
      expect(css).not.toMatch(new RegExp(`\\.diff-line-${cls}\\s*\\{[^}]*calc\\(`));
    }
  });

  test('#2352: below 768px the panes stack and the fillers are hidden', async () => {
    await saveThree();
    const res = await request(appFor()).get(`/diff/${PAGE}?v1=1&v2=2`);
    expect(res.text).toMatch(/@media \(max-width: 767\.98px\) \{[^@]*\.sbs \.diff-line-filler \{ display: none; \}/);
  });

  describe('pairSideBySide', () => {
    type Part = [number, string];
    type Row = { oldText: string | null; newText: string | null; changed: boolean };
    let pair: (parts: Part[]) => Row[];
    beforeEach(async () => {
      await saveThree();
      const dom = await diffDom(1, 2);
      const fn = (dom.window as unknown as { pairSideBySide: (p: Part[]) => Row[] }).pairSideBySide;
      pair = parts => JSON.parse(JSON.stringify(fn(parts)));
    });
    const row = (oldText: string | null, newText: string | null, changed = true): Row => ({ oldText, newText, changed });

    test.each([
      ['an added line with no partner', [[0, 'A'], [1, 'B'], [0, 'C']], [row('A', 'A', false), row(null, 'B'), row('C', 'C', false)]],
      ['3 removed, 1 added', [[-1, 'x1'], [-1, 'x2'], [-1, 'x3'], [1, 'y']], [row('x1', 'y'), row('x2', null), row('x3', null)]],
      ['1 removed, 3 added', [[-1, 'x'], [1, 'y1'], [1, 'y2'], [1, 'y3']], [row('x', 'y1'), row(null, 'y2'), row(null, 'y3')]],
      ['a change at the very start', [[-1, 'a'], [1, 'b'], [0, 'C']], [row('a', 'b'), row('C', 'C', false)]],
      ['a change at the very end', [[0, 'C'], [-1, 'a'], [1, 'b']], [row('C', 'C', false), row('a', 'b')]],
      ['two change blocks one unchanged line apart', [[-1, 'a'], [1, 'b'], [0, 'M'], [-1, 'c'], [1, 'd']],
        [row('a', 'b'), row('M', 'M', false), row('c', 'd')]],
      ['an empty removed line against a non-empty added one', [[-1, ''], [1, 'x']], [row('', 'x')]],
      ['a non-empty removed line against an empty added one', [[-1, 'x'], [1, '']], [row('x', '')]],
      ['an added line added before the removed one is listed', [[1, 'n'], [-1, 'o']], [row('o', 'n')]]
    ] as Array<[string, Part[], Row[]]>)('%s', (_name, parts, expected) => {
      expect(pair(parts)).toEqual(expected);
    });
  });

  test('#2352: the inline view is unchanged by pairing', async () => {
    const { dom } = await sideBySide('A\nB\nC', 'A\nC');
    expect(dom.window.document.querySelectorAll('#unifiedDiff .diff-line-filler').length).toBe(0);
    expect(lines(dom, 'deleted')).toEqual(['B']);
  });
});
