/**
 * Admin → Audit Log: the event details pane shows every recorded value as
 * text, exactly as it was recorded, with the pane's layout unchanged.
 *
 * Renders the real view (header left out) and runs its own script.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEW = path.join(__dirname, '../../views/admin-audit.ejs');

const MARKUP = '<b>name</b> & "quoted"';

/** The DOM pieces these tests touch; the project has no DOM types. */
interface El {
  textContent: string | null;
  className: string;
  tagName: string;
  querySelector(selector: string): El | null;
  querySelectorAll(selector: string): Iterable<El> & ArrayLike<El>;
}
interface Win { document: { getElementById(id: string): El | null }; viewLogDetails(id: string): void }

function auditPage(details: Record<string, unknown>) {
  const template = fs.readFileSync(VIEW, 'utf8').replace(/<%- include\('header'[^%]*%>/g, '');
  const html = ejs.render(template, {
    cspNonce: 'n', statFiltersHtml: '', paginationHtml: '', auditAvailable: true,
    auditLogs: { results: [], offset: 0, total: 0 }, filters: {}, limit: 50,
    eventTypeOptions: [], resultOptions: []
  }, { filename: VIEW });
  const fetched: string[] = [];
  const shown: string[] = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/admin/audit',
    beforeParse(w: unknown) {
      const win = w as Record<string, unknown>;
      win.$ = (selector: unknown) => ({
        ready() {},
        val() { return ''; },
        modal(action: string) { shown.push(`${String(selector)} ${action}`); }
      });
      win.fetch = async (url: string) => { fetched.push(url); return { json: async () => details }; };
    }
  });
  const win = dom.window as unknown as Win;
  const pane = win.document.getElementById('logDetailsContent');
  return { win, pane, fetched, shown };
}

const cellText = (pane: El): Record<string, string> => Object.fromEntries(
  [...pane.querySelectorAll('tr')].map(tr => {
    const [label, value] = [...tr.querySelectorAll('td')].map(td => td.textContent ?? '');
    return [label.trim(), value.trim()];
  })
);

describe('Admin → Audit Log details pane', () => {
  test('every recorded value appears as literal text, and none of it becomes an element', async () => {
    const context = { note: MARKUP };
    const metadata = { [MARKUP]: MARKUP };
    const { win, pane, fetched, shown } = auditPage({
      id: MARKUP, timestamp: '2026-11-10T08:00:00.000Z', user: MARKUP, actor: MARKUP,
      eventType: MARKUP, severity: MARKUP, resource: MARKUP, action: MARKUP,
      result: MARKUP, reason: MARKUP, duration: MARKUP, context, metadata
    });
    win.viewLogDetails(MARKUP);
    await vi.waitFor(() => expect(shown).toEqual(['#logDetailsModal show']));

    expect(fetched).toEqual([`/admin/audit/details/${encodeURIComponent(MARKUP)}`]);
    expect(cellText(pane)).toEqual({
      'ID:': MARKUP,
      'Timestamp:': new Date('2026-11-10T08:00:00.000Z').toLocaleString(),
      'User:': MARKUP,
      'Acted by:': MARKUP,
      'Event Type:': MARKUP,
      'Severity:': MARKUP,
      'Resource:': MARKUP,
      'Action:': MARKUP,
      'Result:': MARKUP,
      'Reason:': MARKUP,
      'Duration:': `${MARKUP}ms`
    });
    const codes = [...pane.querySelectorAll('pre code')].map(c => c.textContent);
    expect(codes).toEqual([JSON.stringify(context, null, 2), JSON.stringify(metadata, null, 2)]);

    // No element was made from a recorded value.
    expect(pane.querySelector('b')).toBeNull();
    const tags = new Set([...pane.querySelectorAll('*')].map(e => e.tagName.toLowerCase()));
    expect([...tags].sort()).toEqual(['code', 'div', 'h6', 'i', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'tr']);
    // A severity outside the known list gets no class from its value.
    const severity = pane.querySelector('td span');
    expect(severity.className).toBe('');
  });

  test('keeps the same layout: two tables, the severity colour, the context block, and no metadata block when there is none', async () => {
    const { win, pane, shown } = auditPage({
      id: 'a1', timestamp: '2026-11-10T08:00:00.000Z', user: 'jim', eventType: 'page.view',
      severity: 'high', result: 'allow', reason: 'ok', context: { a: 1 }
    });
    win.viewLogDetails('a1');
    await vi.waitFor(() => expect(shown).toHaveLength(1));

    expect([...pane.querySelectorAll(':scope > .row > .col-md-6 > h6')].map(h => h.textContent)).toEqual(['Basic Information', 'Event Details']);
    expect(pane.querySelectorAll('table.table.table-sm > tbody > tr > td > strong')).toHaveLength(10);
    expect(cellText(pane)['Acted by:']).toBeUndefined();
    expect(cellText(pane)['Resource:']).toBe('-');
    expect(cellText(pane)['Duration:']).toBe('-');
    const severity = pane.querySelector('td span');
    expect(severity.className).toBe('severity-high');
    expect(severity.querySelector('i.fas.fa-circle')).not.toBeNull();
    expect([...pane.querySelectorAll('.row.mt-3 h6')].map(h => h.textContent)).toEqual(['Additional Context']);
    expect(pane.querySelector('pre.bg-body-secondary.p-2.rounded > code')?.textContent).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
});
