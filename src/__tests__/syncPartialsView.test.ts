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

  test('the labels are the design\'s words, and never Modified, Current or User Edited', async () => {
    expect(await label({ status: 'current', syncState: 'same-as-shipped', userModified: false })).toBe('Same as shipped');
    expect(await label({ status: 'modified', syncState: 'update-ready', userModified: false })).toBe('Update ready');
    expect(await label({ status: 'modified', syncState: 'edited-not-confirmed', userModified: true })).toBe('Edited here, not confirmed');
    expect(await label({ status: 'modified', syncState: 'both-changed', userModified: true })).toBe('Edited here, and a newer version is available');
  });
});

describe('#2389 _sync-status: "Same as shipped" only for same-as-shipped', () => {
  test('a row with no syncState does not read as Same as shipped', async () => {
    expect(statuses(await partial('_sync-status', { status: 'modified', userModified: false }))).not.toContain('same-as-shipped');
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
  });
});
