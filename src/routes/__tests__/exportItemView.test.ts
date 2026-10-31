/**
 * views/export-item.ejs (#2120): the page's own script, run in jsdom against
 * stand-in answers. Waiting for a file ends: after its last check the page
 * says the export is taking longer than expected and lets the user try
 * again, rather than saying "Preparing…" with the button off for good. An
 * export that needs a fresh sign-in sends the browser to the prompt.
 * Includes are left out: they are not this view's, and jsdom does not
 * navigate, so where the page sends the browser is caught as `__went`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';

const VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/export-item.ejs');
const TEMPLATE = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\([^%]*%>/g, '').replace(/window\.location\.href = /g, 'window.__went = ');

/** The DOM pieces these tests touch; the project has no DOM types. */
interface El { textContent: string | null; className: string; disabled: boolean; click(): void }
interface Win {
  document: { getElementById(id: string): El | null };
  fetch: (url: string) => Promise<{ json(): Promise<unknown> }>;
  csrfFetch: (url: string, init: unknown) => Promise<{ json(): Promise<unknown> }>;
  setTimeout: (fn: () => void, ms: number) => number;
  __went?: string;
}

/**
 * The page with `status` as every status answer and `started` as the start's.
 * Its timers fire at once, so 400 checks take no time.
 */
function exportPage(started: unknown, status: () => unknown) {
  const html = ejs.render(TEMPLATE, {
    exportName: 'Trip Notes', exportBack: '/view/Trip%20Notes', exportAction: '/export/page/Trip%20Notes',
    formats: [{ id: 'core.pdf', label: 'PDF (.pdf)' }], locals: { cspNonce: 'n' }
  });
  const polls: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/export/page/Trip%20Notes',
    beforeParse(w: unknown) {
      const win = w as Win;
      win.setTimeout = (fn) => { setImmediate(fn); return 0; };
      win.fetch = async (url) => { polls.push(url); return { json: async () => status() }; };
      win.csrfFetch = async () => ({ json: async () => started });
    }
  });
  const win = dom.window as unknown as Win;
  const el = (id: string) => win.document.getElementById(id);
  return { el, polls, went: () => win.__went };
}

describe('export page: waiting for the file (#2120)', () => {
  test('an export still running after the last check says so, and the button works again', async () => {
    const page = exportPage({ success: true, runId: 'r-1' }, () => ({ success: true, run: { state: 'running' } }));
    page.el('exportStart').click();
    expect(page.el('exportStart').disabled).toBe(true);
    await vi.waitFor(() => expect(page.el('exportStatus').textContent).toBe('This export is taking longer than expected. Try again later.'));
    expect(page.el('exportStatus').className).toContain('alert-warning');
    expect(page.el('exportStart').disabled).toBe(false);
    expect(page.polls).toHaveLength(400);
  });

  test('a status that cannot be read is retried the same number of times, then the same message', async () => {
    const page = exportPage({ success: true, runId: 'r-1' }, () => { throw new Error('offline'); });
    page.el('exportStart').click();
    await vi.waitFor(() => expect(page.el('exportStatus').textContent).toBe('This export is taking longer than expected. Try again later.'));
    expect(page.el('exportStart').disabled).toBe(false);
    expect(page.polls).toHaveLength(400);
  });

  test('a failed export shows its reason at once', async () => {
    const page = exportPage({ success: true, runId: 'r-1' }, () => ({ success: true, run: { state: 'failed', error: 'PDF export is not available on this site right now.' } }));
    page.el('exportStart').click();
    await vi.waitFor(() => expect(page.el('exportStatus').textContent).toBe('PDF export is not available on this site right now.'));
    expect(page.el('exportStart').disabled).toBe(false);
    expect(page.polls).toHaveLength(1);
  });

  test('an export that needs a fresh sign-in goes to the prompt', async () => {
    const page = exportPage({ success: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fexport%2Fpage%2FTrip%2520Notes' }, () => ({}));
    page.el('exportStart').click();
    await vi.waitFor(() => expect(page.went()).toBe('/auth/reauth?next=%2Fexport%2Fpage%2FTrip%2520Notes'));
    expect(page.polls).toEqual([]);
  });
});
