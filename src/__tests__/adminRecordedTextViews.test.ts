/**
 * Admin pages whose scripts put recorded or server-supplied values on the
 * page show those values as text, exactly as they were recorded: Attachments,
 * Import, Calendar, Keywords, Required Pages, Dashboard and Media.
 *
 * Each test renders the real view (header and footer left out), runs its own
 * script in jsdom against stand-in answers, and checks that a value made of
 * markup-like characters comes out as the same literal text, with no element
 * made from it.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { TextDecoder, TextEncoder } from 'util';
import { JSDOM, VirtualConsole } from 'jsdom';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../views');

const MARKUP = '<b>name</b> & "quoted"';

/** The DOM pieces these tests touch; the project has no DOM types. */
interface El {
  textContent: string | null;
  innerHTML: string;
  value: string;
  getAttribute(name: string): string | null;
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): Iterable<El> & ArrayLike<El>;
  click(): void;
  dispatchEvent(event: unknown): boolean;
}
interface Win {
  document: { getElementById(id: string): El | null; querySelector(selector: string): El | null; dispatchEvent(event: unknown): boolean };
  Event: new (type: string, init?: { bubbles?: boolean; cancelable?: boolean }) => unknown;
  [name: string]: unknown;
}

type Answer = { ok?: boolean; status?: number; body?: unknown; json?: unknown };
type Responder = (url: string) => Answer;

/** A fetch stand-in: each call gets the responder's answer for its URL. */
function fetcher(respond: Responder) {
  return async (url: string) => {
    const answer = respond(url);
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      body: answer.body,
      json: async () => answer.json
    };
  };
}

/** Render a view and run its script, with fetch and csrfFetch answered by `respond`. */
function runPage(view: string, locals: Record<string, unknown>, respond: Responder = () => ({ json: {} })): Win {
  const file = path.join(VIEWS, view);
  const template = fs.readFileSync(file, 'utf8').replace(/<%- include\('(header|footer)'[^%]*%>/g, '');
  const html = ejs.render(template, {
    cspNonce: 'n', csrfToken: 'csrf-value', lockedUnless: () => '',
    jsonForScript: (v: unknown) => JSON.stringify(v ?? null).replace(/</g, '\\u003c'),
    ...locals
  }, { filename: file });
  // A script that fails while loading would fail every check below for the wrong reason.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { throw error; });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    virtualConsole,
    url: 'http://localhost/admin',
    beforeParse(w: unknown) {
      const win = w as Record<string, unknown>;
      class Modal { show() {} hide() {} static getInstance() { return null; } static getOrCreateInstance() { return new Modal(); } }
      win.bootstrap = { Modal, Toast: Modal, Tooltip: Modal, Popover: Modal };
      win.$ = () => ({ ready() {}, val() { return ''; }, modal() {} });
      win.confirm = () => true;
      win.alert = () => {};
      win.TextDecoder = TextDecoder;
      win.TextEncoder = TextEncoder;
      win.WikiPagination = new Proxy({}, { get: () => () => {} });
      // Job polls run at once; a message's later dismissal never comes, so it can be read.
      win.setTimeout = (fn: () => void, ms = 0) => { if (ms <= 1500) setImmediate(fn); return 0; };
      win.fetch = fetcher(respond);
      win.csrfFetch = fetcher(respond);
      win.followReauth = () => false;
    }
  });
  const win = dom.window as unknown as Win;
  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  return win;
}

const byId = (win: Win, id: string): El => win.document.getElementById(id);
/** No `<b>` was made from a recorded value. */
const noMarkupIn = (el: El) => expect(el.querySelector('b')).toBeNull();

describe('Admin → Attachments', () => {
  const attachment = {
    id: MARKUP, filename: MARKUP, description: MARKUP, mimeType: MARKUP, size: 10,
    uploadedBy: MARKUP, uploadedAt: '2026-11-10T08:00:00.000Z', pageUuid: MARKUP, documentTitle: MARKUP
  };

  test('the list shows every recorded value as text, and the delete button carries the name exactly', () => {
    const win = runPage('admin-attachments.ejs', { attachments: [attachment], can: () => true });
    const tbody = byId(win, 'attachments-tbody');
    noMarkupIn(tbody);
    const cells = [...tbody.querySelectorAll('td')].map(td => td.textContent);
    expect(cells[0]).toBe(`${MARKUP}${MARKUP}Title: ${MARKUP}`);
    expect(cells[1]).toBe(MARKUP);
    expect(cells[3]).toBe(MARKUP);
    expect(cells[5]).toBe(MARKUP);
    const del = tbody.querySelector('.delete-btn');
    expect(del.getAttribute('data-id')).toBe(MARKUP);
    expect(del.getAttribute('data-name')).toBe(MARKUP);
  });

  test('the health report shows recorded names as text and links to the recorded identifier', async () => {
    const report = {
      totals: { records: 1, diskFiles: 1, pagesScanned: 1 },
      orphans: [{ identifier: MARKUP, name: MARKUP, contentSize: 1, dateCreated: '2026-11-10', author: MARKUP }],
      brokenRefs: [{ ref: MARKUP, pages: [MARKUP] }],
      recordlessFiles: [MARKUP], missingFiles: [{ name: MARKUP }], looseTextRefs: [MARKUP]
    };
    const win = runPage('admin-attachments.ejs', { attachments: [], can: () => true }, () => ({ json: { success: true, report } }));
    byId(win, 'healthScanBtn').click();
    const out = byId(win, 'healthResults');
    await vi.waitFor(() => expect(out.querySelector('table')).not.toBeNull());
    noMarkupIn(out);
    const orphan = out.querySelector('tbody tr a');
    expect(orphan.getAttribute('href')).toBe(`/attachments/${MARKUP}`);
    expect(orphan.textContent).toBe(MARKUP);
    expect([...out.querySelectorAll('code')].map(c => c.textContent)).toEqual([MARKUP, MARKUP, MARKUP, MARKUP, MARKUP]);
  });
});

describe('Admin → Import', () => {
  const preview = { success: true, files: [{ sourcePath: MARKUP, targetPath: MARKUP, format: MARKUP, warnings: [] }] };

  test('the preview shows each file\'s paths and format as text, and a failed file\'s reason exactly', async () => {
    const event = `data: ${JSON.stringify({ type: 'progress', index: 0, status: 'failed', error: MARKUP })}\n\n`;
    let sent = false;
    const win = runPage('admin-import.ejs', { converters: [] }, (url) => url.endsWith('/stream')
      ? { body: { getReader: () => ({ read: async () => (sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(event) })) }) } }
      : { json: preview });
    byId(win, 'import-form').dispatchEvent(new win.Event('submit', { cancelable: true }));
    const tbody = byId(win, 'preview-tbody');
    await vi.waitFor(() => expect(tbody.querySelectorAll('tr')).toHaveLength(1));
    noMarkupIn(tbody);
    expect([...tbody.querySelectorAll('td')].slice(0, 3).map(td => td.textContent)).toEqual([MARKUP, MARKUP, MARKUP]);

    byId(win, 'execute-btn').click();
    await vi.waitFor(() => expect(tbody.querySelector('.bg-danger')).not.toBeNull());
    expect(tbody.querySelector('.bg-danger')?.getAttribute('title')).toBe(MARKUP);
    noMarkupIn(tbody);
  });
});

describe('Admin → Calendar', () => {
  test('a save error is shown as text', async () => {
    const win = runPage('admin-calendar.ejs', { successMessage: '', errorMessage: '', calendarSections: [] },
      () => ({ ok: false, status: 400, json: { error: MARKUP } }));
    byId(win, 'calEventForm').dispatchEvent(new win.Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(win.document.querySelector('.alert-danger')).not.toBeNull());
    const toast = win.document.querySelector('.alert-danger');
    expect(toast.textContent).toBe(MARKUP);
    noMarkupIn(toast);
    expect(toast.querySelector('.btn-close')).not.toBeNull();
  });
});

describe('Admin → Keywords', () => {
  test('the pages using a keyword are listed as text', async () => {
    const keyword = { id: 'k1', label: 'K', category: 'c', enabled: true, usageCount: 1, mediaCount: 0, hasPage: false };
    const win = runPage('admin-keywords.ejs', { successMessage: '', errorMessage: '', keywordStatsHtml: '', keywords: [keyword] },
      () => ({ json: { success: true, count: 1, pages: [MARKUP] } }));
    (win.document.querySelector('.delete-keyword-btn')).click();
    const list = byId(win, 'deletePagesList');
    await vi.waitFor(() => expect(list.querySelector('li')).not.toBeNull());
    expect([...list.querySelectorAll('ul.list-group > li.list-group-item.list-group-item-sm')].map(li => li.textContent)).toEqual([MARKUP]);
    noMarkupIn(list);
  });
});

describe('Admin → Required Pages', () => {
  test('a diff error is shown as text', async () => {
    const win = runPage('admin-required-pages.ejs', { counts: {}, comparison: [] }, () => ({ json: { success: false, error: MARKUP } }));
    (win.showDiff as (uuid: string, title: string) => Promise<void>)('u1', 'T');
    const box = byId(win, 'modalDiffContainer');
    await vi.waitFor(() => expect(box.querySelector('.alert-danger')).not.toBeNull());
    expect(box.querySelector('.alert.alert-danger.m-3')?.textContent).toBe(`Error: ${MARKUP}`);
    noMarkupIn(box);
  });
});

/** Answers for a job that is enqueued and then finishes with `run`. */
const job = (run: Record<string, unknown>): Responder => (url) => url.endsWith('/enqueue') ? { json: { runId: 'r1' } } : { json: run };

describe('Admin → Dashboard', () => {
  const dashboard = (respond?: Responder) => runPage('admin-dashboard.ejs', {
    can: () => true, catalogSources: [], stats: {}, capabilities: { media: true }, addonsSummary: {}, currentUser: {}, recentActivity: [], notifications: undefined, lastRuns: {}, requiredPages: [], maintenanceMode: false
  }, respond);

  test('a message is shown as text', () => {
    const win = dashboard();
    (win.showMessage as (m: string, t: string) => void)(MARKUP, 'error');
    const body = win.document.querySelector('#admin-message .card-body');
    expect(body.textContent).toBe(MARKUP);
    noMarkupIn(body);
  });

  test('a media reindex summary and error are shown as text, after their icon', async () => {
    const win = dashboard(job({ status: 'completed', result: { summary: MARKUP } }));
    const status = byId(win, 'dashboard-media-status');
    await (win.dashboardMediaRescan as () => Promise<void>)();
    expect(status.textContent).toBe(` ${MARKUP}`);
    expect(status.querySelector('i.fas.fa-check-circle')).not.toBeNull();
    noMarkupIn(status);

    const failed = dashboard(job({ status: 'failed', result: { error: MARKUP } }));
    await (failed.dashboardMediaRebuild as () => Promise<void>)();
    const failedStatus = byId(failed, 'dashboard-media-status');
    expect(failedStatus.textContent).toBe(` ${MARKUP}`);
    expect(failedStatus.querySelector('i.fas.fa-exclamation-triangle')).not.toBeNull();
    noMarkupIn(failedStatus);
  });
});

describe('Admin → Media', () => {
  test('job progress, summary and error are shown as text, after their icon', async () => {
    const seen: string[] = [];
    const win = runPage('admin-media.ejs', { mediaEnabled: true, years: [] }, job({ status: 'completed', progress: MARKUP, result: { summary: MARKUP } }));
    const btn = byId(win, 'rescan-btn');
    const status = byId(win, 'rescan-status');
    new (win.MutationObserver as new (cb: () => void) => { observe(t: El, o: unknown): void })(() => {
      if (btn.querySelector('i.fa-spinner') && btn.textContent?.includes('name')) seen.push(btn.textContent ?? '');
      noMarkupIn(btn);
    }).observe(btn, { childList: true, subtree: true });
    btn.click();
    await vi.waitFor(() => expect(status.textContent).toBe(` ${MARKUP}`));
    expect(seen).toContain(` ${MARKUP}`);
    expect(status.querySelector('i.fas.fa-check-circle')).not.toBeNull();
    noMarkupIn(status);

    const failed = runPage('admin-media.ejs', { mediaEnabled: true, years: [] }, job({ status: 'failed', result: { error: MARKUP } }));
    byId(failed, 'rebuild-btn').click();
    const failedStatus = byId(failed, 'rebuild-status');
    await vi.waitFor(() => expect(failedStatus.textContent).toBe(` ${MARKUP}`));
    expect(failedStatus.querySelector('i.fas.fa-exclamation-triangle')).not.toBeNull();
    noMarkupIn(failedStatus);
  });
});
