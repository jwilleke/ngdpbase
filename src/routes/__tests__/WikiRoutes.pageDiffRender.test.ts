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
});
