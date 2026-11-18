/**
 * #2389 / #2414 — each table on Admin -> Required Pages counts its own pages.
 *
 * The line at the top of the page added the required pages and the add-on pages
 * together, but each table's Sync All counts only its own table: the page said
 * "Sync All updates only pages marked Update ready (8)" beside buttons reading (6)
 * and (2). Each table's header now says "N need a decision; Sync All updates M"
 * next to its own Sync All button, in the same scope as the button and the toast.
 *
 * Renders the real page (header and footer stubbed) and runs its own script.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../routes/WikiRoutes';
import { syncRowState, type ShippedPageStateName } from '../utils/addonPageSync';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../views');
const includer = (original: string): { template: string } | undefined =>
  original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Row {
  source: string;
  addonName?: string;
  uuid: string;
  title: string;
  slug: string;
  lastModified: string;
  status: string;
  userModified: boolean;
  syncState: ShippedPageStateName;
  headerUnreadable?: boolean;
  bulkOutdated?: boolean;
}

function row(n: number, syncState: ShippedPageStateName, extra: Partial<Row> = {}): Row {
  return { source: 'required-pages', uuid: uuid(n), title: `Page ${n}`, slug: `page${n}`, lastModified: '', syncState, ...syncRowState(syncState), ...extra };
}

function countsOf(rows: Row[]) {
  return {
    uuidMismatch: 0,
    new: 0,
    modified: rows.filter((r) => r.status === 'modified').length,
    current: rows.filter((r) => r.status === 'current').length,
    titleDrift: 0,
    ...WikiRoutes.markBulkOutdated(rows)
  };
}

/** 6 core and 2 add-on pages are Update ready; 3 core and 1 add-on page were edited here. */
function seed() {
  const core = [
    ...[1, 2, 3, 4, 5, 6].map((n) => row(n, 'update-ready')),
    row(7, 'edited-not-confirmed'),
    row(8, 'edited-not-confirmed'),
    row(9, 'both-changed'),
    row(10, 'same-as-shipped')
  ];
  const addon = [
    row(21, 'update-ready', { source: 'addon:demo', addonName: 'demo' }),
    row(22, 'update-ready', { source: 'addon:demo', addonName: 'demo' }),
    row(23, 'both-changed', { source: 'addon:demo', addonName: 'demo' })
  ];
  return { core, addon };
}

async function renderPage(core: Row[], addon: Row[]): Promise<string> {
  return ejs.renderFile(
    path.join(VIEWS, 'admin-required-pages.ejs'),
    {
      title: 'Required Pages Sync',
      comparison: core,
      counts: countsOf(core),
      addonComparison: addon,
      addonCounts: countsOf(addon),
      orphanedAddonPages: [],
      declined: [],
      notInSource: [],
      csrfToken: 'tok',
      successMessage: null,
      errorMessage: null,
      locals: {}
    },
    { includer }
  );
}

const text = (el: { textContent: string | null } | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('#2414 each table says what needs a decision and what its Sync All updates', () => {
  test('6 core and 2 add-on pages Update ready: each header has its own numbers, beside its own button', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;

    const coreButton = doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLElement;
    const addonButton = doc.querySelector('[data-testid="sync-addon-outdated"]') as HTMLElement;
    expect(text(coreButton)).toBe('Sync All (6)');
    expect(text(addonButton)).toBe('Sync All (2)');

    const coreSummary = doc.querySelector('[data-testid="core-sync-summary"]') as HTMLElement;
    const addonSummary = doc.querySelector('[data-testid="addon-sync-summary"]') as HTMLElement;
    expect(text(coreSummary)).toBe('3 need a decision; Sync All updates 6');
    expect(text(addonSummary)).toBe('1 needs a decision; Sync All updates 2');

    // In the table's own header, next to its own button.
    expect(coreButton.closest('.card-header')?.contains(coreSummary)).toBe(true);
    expect(addonButton.closest('.card-header')?.contains(addonSummary)).toBe(true);
    expect(coreButton.closest('.card-header')?.contains(addonSummary)).toBe(false);
  });

  test('the top-of-page line carries no number, and no combined count appears anywhere', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;

    const top = text(doc.querySelector('[data-testid="sync-summary"]'));
    expect(top).toContain('To act on an edited page, open Diff, then Use shipped version.');
    expect(top).not.toMatch(/\d/);
    // The old combined figures: 8 = 6 + 2 update-ready, 4 = 3 + 1 edited.
    const page = text(doc.body) ?? '';
    expect(page).not.toContain('(8)');
    expect(page).not.toMatch(/\b4 pages need a decision/);
    expect(page).not.toMatch(/Sync All updates only pages marked Update ready \(/);
  });

  test('every number sits in the scope of the button beside it', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    const rows = (table: string, attr: string) => doc.querySelectorAll(`${table} tr[${attr}="true"]`).length;
    expect(rows('#pagesTable', 'data-bulk-outdated')).toBe(6);
    expect(rows('#pagesTable', 'data-user-modified')).toBe(3);
    expect(rows('#addonPagesTable', 'data-bulk-outdated')).toBe(2);
    expect(rows('#addonPagesTable', 'data-user-modified')).toBe(1);
  });

  test('after the core table syncs, only the core line changes and its button greys out', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(
      core.map((r) => (r.syncState === 'update-ready' ? { ...row(Number(r.uuid.slice(-12)), 'same-as-shipped') } : r)),
      addon
    )).window.document;
    expect(text(doc.querySelector('[data-testid="core-sync-summary"]'))).toBe('3 need a decision; Sync All has nothing to update');
    const coreButton = doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLButtonElement;
    expect(coreButton.disabled).toBe(true);
    expect(text(coreButton)).toBe('Sync All');
    expect(text(doc.querySelector('[data-testid="addon-sync-summary"]'))).toBe('1 needs a decision; Sync All updates 2');
    expect(text(doc.querySelector('[data-testid="sync-addon-outdated"]'))).toBe('Sync All (2)');
  });

  test('clicking the core Sync All updates the core line in place, and the toast counts match it', async () => {
    const { core, addon } = seed();
    const html = await renderPage(core, addon);
    const posted: Array<{ uuids: string[]; leftAlone: string[] }> = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      beforeParse(window) {
        const w = window as unknown as Record<string, unknown>;
        w.csrfFetch = async (_url: string, init: { body: string }) => {
          const body = JSON.parse(init.body);
          posted.push(body);
          return { json: async () => ({ success: true, message: `${body.uuids.length} synced; ${body.leftAlone.length} edited pages left alone`, uuids: body.uuids, protected: body.leftAlone }) };
        };
        w.bootstrap = { Toast: class { show() { /* no toast in jsdom */ } }, Modal: class {} };
      }
    });
    const doc = dom.window.document;
    (doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(posted).toHaveLength(1);
    expect(posted[0].uuids).toHaveLength(6);
    expect(posted[0].leftAlone).toHaveLength(3);
    // The line says what the toast says: 3 edited pages left alone.
    expect(text(doc.querySelector('[data-testid="core-sync-summary"]'))).toBe('3 need a decision; Sync All has nothing to update');
    const button = doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(text(button)).toBe('Sync All');
    // The add-on table is untouched.
    expect(text(doc.querySelector('[data-testid="addon-sync-summary"]'))).toBe('1 needs a decision; Sync All updates 2');
    expect(text(doc.querySelector('[data-testid="sync-addon-outdated"]'))).toBe('Sync All (2)');
    dom.window.close();
  });

  test('a Use shipped version on an edited row lowers that table\'s count', async () => {
    const { core, addon } = seed();
    const dom = new JSDOM(await renderPage(core, addon), {
      runScripts: 'dangerously',
      beforeParse(window) {
        const w = window as unknown as Record<string, unknown>;
        w.csrfFetch = async (_url: string, init: { body: string }) => {
          const body = JSON.parse(init.body);
          return { json: async () => ({ success: true, message: '1 page synced', uuids: body.uuids }) };
        };
        w.confirm = () => true;
        w.bootstrap = { Toast: class { show() { /* no toast in jsdom */ } }, Modal: class {} };
      }
    });
    const doc = dom.window.document;
    (doc.querySelector(`#pagesTable tr[data-uuid="${uuid(7)}"] [data-action="force-sync"]`) as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(text(doc.querySelector('[data-testid="core-sync-summary"]'))).toBe('2 need a decision; Sync All updates 6');
    dom.window.close();
  });
});

describe('#2414 lows', () => {
  test('a page whose header could not be read says so on its row; others do not', async () => {
    const { core, addon } = seed();
    core[0].headerUnreadable = true;
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    const notes = [...doc.querySelectorAll('[data-sync-note="header-unreadable"]')];
    expect(notes).toHaveLength(1);
    expect(text(notes[0])).toMatch(/header couldn't be read/i);
    expect(notes[0].closest('tr')?.getAttribute('data-uuid')).toBe(uuid(1));
  });

  test('the explanation of an unreadable header is visible, not inside the collapsed list', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    const sentence = "A page whose header can't be read also shows as Update ready; updating it repairs it.";
    expect(text(doc.querySelector('#updateProtectionInfo'))).not.toContain(sentence);
    expect(text(doc.querySelector('[data-testid="sync-summary"]'))).toContain(sentence);
  });

  test('the header Sync All buttons never wrap, and are the same small size as the row buttons', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    for (const id of ['sync-all-outdated', 'sync-addon-outdated']) {
      const button = doc.querySelector(`[data-testid="${id}"]`) as HTMLElement;
      expect(button.classList.contains('text-nowrap')).toBe(true);
      expect(button.classList.contains('btn-sm')).toBe(true);
      expect(button.closest('.card-header')).not.toBeNull();
    }
  });

  test('the page sizes the Update and Use shipped version buttons like Diff, over the theme\'s own button padding', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    // The theme's .btn-outline-primary sets padding 0.375rem 1rem, which beats btn-sm.
    expect(css).toMatch(/#pagesTable td:last-child \.btn-sm[^{]*\{[^}]*padding:\s*0?\.25rem 0?\.5rem/);
    expect(css).toMatch(/#addonPagesTable td:last-child \.btn-sm/);
  });

  test('status badges are at least 12px, and the Status column has room for the long label', async () => {
    const { core, addon } = seed();
    const doc = new JSDOM(await renderPage(core, addon)).window.document;
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const rule = css.match(/[^{}]*\[data-sync-status\][^{]*\{([^}]*)\}/)?.[1] ?? '';
    const size = rule.match(/font-size:\s*([\d.]+)rem/);
    expect(size).not.toBeNull();
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(0.75);
    for (const table of ['#pagesTable', '#addonPagesTable']) {
      const header = [...doc.querySelectorAll(`${table} thead th`)].find((th) => text(th) === 'Status') as HTMLElement;
      expect(header.getAttribute('style')).toMatch(/min-width:\s*\d+(\.\d+)?rem/);
    }
    // The labels are not renamed.
    expect(text(doc.querySelector('[data-sync-status="both-changed"]'))).toBe('Edited here, and a newer version is available');
  });
});
