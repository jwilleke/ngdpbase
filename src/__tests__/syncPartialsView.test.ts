/**
 * #1918 — one look and one Sync flow for shipped content: Admin → Required
 * Pages draws its status words, badges and Sync / Force Sync through core's
 * shared partials. Force Sync always asks first; nothing carries an inline
 * handler. (Forms an add-on provides no longer sync: #1973.)
 *
 * Renders the real partials, as Express does.
 */
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const VIEWS = path.join(ROOT, 'views');

async function partial(name: string, syncItem: Record<string, unknown>): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, `${name}.ejs`), { syncItem });
  return new JSDOM(`<body>${html}</body>`).window.document;
}

/** The words a status cell shows, in order. */
function statuses(doc: { querySelectorAll(selectors: string): ArrayLike<{ getAttribute(name: string): string | null }> }): string[] {
  return Array.from(doc.querySelectorAll('[data-sync-status]')).map((el) => el.getAttribute('data-sync-status') ?? '');
}

describe('#2389 _sync-status: the plain state words', () => {
  const label = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();

  test('New, and the four states slice 1 can tell', async () => {
    expect(statuses(await partial('_sync-status', { status: 'new', userModified: false }))).toEqual(['new']);
    expect(statuses(await partial('_sync-status', { status: 'current', syncState: 'same-as-shipped', userModified: false }))).toEqual(['same-as-shipped']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false }))).toEqual(['update-ready']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'edited-not-confirmed', userModified: true }))).toEqual(['edited-not-confirmed']);
    expect(statuses(await partial('_sync-status', { status: 'modified', syncState: 'both-changed', userModified: true }))).toEqual(['both-changed']);
  });

  test("the labels are the design's words, and never Modified, Current or User Edited", async () => {
    expect(await label({ status: 'current', syncState: 'same-as-shipped', userModified: false })).toBe('Same as shipped');
    expect(await label({ status: 'modified', syncState: 'update-ready', userModified: false })).toBe('Update ready');
    expect(await label({ status: 'modified', syncState: 'edited-not-confirmed', userModified: true })).toBe('Edited here, not confirmed');
    expect(await label({ status: 'modified', syncState: 'both-changed', userModified: true })).toBe('Edited here, and a newer version is available');
  });
});

describe('#2389 slice 2 _sync-status: the two kept states', () => {
  const label = async (item: Record<string, unknown>) => (await partial('_sync-status', item)).body.textContent?.replace(/\s+/g, ' ').trim();

  test('Kept for this site, and the quiet "newer version available" line only when one shipped', async () => {
    const plain = { status: 'modified', syncState: 'kept-for-site', userModified: true };
    expect(statuses(await partial('_sync-status', plain))).toEqual(['kept-for-site']);
    expect(await label(plain)).toBe('Kept for this site');
    expect(await label({ ...plain, newerAvailable: true })).toBe('Kept for this site A newer version is available');
  });

  test('Kept, needs your review, lists what the newer version changes', async () => {
    const item = { status: 'modified', syncState: 'kept-needs-review', userModified: true, workingChanges: ['This page now calls Calendar with calendars=family.'] };
    expect(statuses(await partial('_sync-status', item))).toEqual(['kept-needs-review']);
    const text = await label(item);
    expect(text).toContain('Kept, needs your review');
    expect(text).toContain('This page now calls Calendar with calendars=family.');
  });
});

describe('#2389 _sync-status: "Same as shipped" only for same-as-shipped', () => {
  test('a row with no syncState does not read as Same as shipped', async () => {
    expect(statuses(await partial('_sync-status', { status: 'modified', userModified: false }))).not.toContain('same-as-shipped');
  });
});

describe('#2389 _sync-counts: Update ready and Edited here are counted apart', () => {
  test('two badges, no "Not same as shipped"', async () => {
    const html = await ejs.renderFile(path.join(VIEWS, '_sync-counts.ejs'), {
      syncCounts: { new: 1, outdatedSyncable: 2, outdatedUserEdited: 3, current: 4 }
    });
    const doc = new JSDOM(`<body>${html}</body>`).window.document;
    const text = (kind: string) => doc.querySelector(`[data-sync-count="${kind}"]`)?.textContent?.trim();
    expect(text('new')).toBe('1 New');
    expect(text('update-ready')).toBe('2 Update ready');
    expect(text('edited-here')).toBe('3 Edited here');
    expect(text('current')).toBe('4 Same as shipped');
    expect(doc.body.textContent).not.toContain('Not same as shipped');
  });
});

describe('#2414 _sync-summary: what needs a decision and what Sync All updates, per table', () => {
  const line = async (outdatedUserEdited: number, outdatedSyncable: number) => {
    const html = await ejs.renderFile(path.join(VIEWS, '_sync-summary.ejs'), {
      syncSummary: { counts: { outdatedSyncable, outdatedUserEdited }, testId: 'x-summary' }
    });
    const el = new JSDOM(`<body>${html}</body>`).window.document.querySelector('[data-testid="x-summary"]');
    return el?.textContent?.replace(/\s+/g, ' ').trim();
  };

  test('says "N need a decision; Sync All updates M"', async () => {
    expect(await line(3, 6)).toBe('3 need a decision; Sync All updates 6');
    expect(await line(1, 1)).toBe('1 needs a decision; Sync All updates 1');
  });

  test('says so when nothing needs a decision or nothing is ready, never "(0)"', async () => {
    expect(await line(0, 2)).toBe('Nothing needs a decision; Sync All updates 2');
    expect(await line(2, 0)).toBe('2 need a decision; Sync All has nothing to update');
    expect(await line(0, 0)).toBe('Nothing needs a decision; Sync All has nothing to update');
  });
});

describe('#2414 _sync-status: an unreadable header', () => {
  test('Update ready on such a page carries a short note, other pages do not', async () => {
    const withNote = await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false, headerUnreadable: true });
    expect(statuses(withNote)).toEqual(['update-ready']);
    const note = withNote.querySelector('[data-sync-note="header-unreadable"]');
    expect(note?.textContent?.trim()).toBe("Page header couldn't be read");
    expect(note?.getAttribute('title')).toContain('Updating the page repairs it');

    const without = await partial('_sync-status', { status: 'modified', syncState: 'update-ready', userModified: false });
    expect(without.querySelector('[data-sync-note]')).toBeNull();
  });
});

describe('#1918 _sync-button', () => {
  test('Sync carries the id and asks nothing', async () => {
    const b = (await partial('_sync-button', { userModified: false, id: 'u-1', name: 'Page' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('sync');
    expect(b.getAttribute('data-sync-id')).toBe('u-1');
    expect(b.hasAttribute('data-confirm')).toBe(false);
    expect(b.textContent?.trim()).toBe('Update');
  });

  test('a page that is not on the site yet still reads Sync', async () => {
    const b = (await partial('_sync-button', { userModified: false, status: 'new', id: 'u-1', name: 'Page' })).querySelector('button')!;
    expect(b.textContent?.trim()).toBe('Sync');
  });

  test('Use shipped version for an edited copy always asks first, naming the item', async () => {
    const b = (await partial('_sync-button', { userModified: true, id: 'u-1', name: 'Page "A"' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('force-sync');
    expect(b.textContent?.trim()).toBe('Use shipped version');
    expect(b.getAttribute('data-confirm')).toBe('Replace the changes made to "Page "A"" on this site with the shipped version? Your version stays in the page history.');
  });

  test('names are escaped and no inline handler is drawn', async () => {
    const doc = await partial('_sync-button', { userModified: true, id: 'x"onclick="y', name: '<img src=x onerror=alert(1)>' });
    expect(doc.querySelector('img')).toBeNull();
    const attributes = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.name));
    expect(attributes.filter((name) => name.startsWith('on'))).toEqual([]);
    expect(doc.querySelector('button')?.getAttribute('data-sync-id')).toBe('x"onclick="y');
  });
});

describe('#1918 Admin → Required Pages draws shipped content through the partials', () => {
  test('it includes them', () => {
    const uses = (file: string, name: string) => (fs.readFileSync(file, 'utf8').match(new RegExp(`include\\('${name}'`, 'g')) ?? []).length;
    const required = path.join(VIEWS, 'admin-required-pages.ejs');
    expect(uses(required, '_sync-status')).toBe(2);
    expect(uses(required, '_sync-button')).toBe(2);
    expect(uses(required, '_sync-counts')).toBe(1);
    // #2414: one summary line per table, drawn by the same partial.
    expect(uses(required, '_sync-summary')).toBe(2);
  });
});
