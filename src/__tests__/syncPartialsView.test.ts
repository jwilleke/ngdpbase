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
import { syncRowState } from '../utils/addonPageSync';

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

describe('#1918 syncRowState: the one mapping to the admin screen\'s words', () => {
  test('current, outdated and locally-modified read as Required Pages reads them', () => {
    expect(syncRowState('current')).toEqual({ status: 'current', userModified: false });
    expect(syncRowState('outdated')).toEqual({ status: 'modified', userModified: false });
    expect(syncRowState('locally-modified')).toEqual({ status: 'modified', userModified: true });
    expect(syncRowState('current', true)).toEqual({ status: 'current', userModified: true });
  });
});

describe('#1918 _sync-status', () => {
  test('the Required Pages words: New, Modified, User Edited, Current', async () => {
    expect(statuses(await partial('_sync-status', { status: 'new', userModified: false }))).toEqual(['new']);
    expect(statuses(await partial('_sync-status', { status: 'modified', userModified: false }))).toEqual(['modified']);
    expect(statuses(await partial('_sync-status', { status: 'modified', userModified: true }))).toEqual(['modified', 'user-edited']);
    expect(statuses(await partial('_sync-status', { status: 'current', userModified: false }))).toEqual(['current']);
  });
});

describe('#1918 _sync-button', () => {
  test('Sync carries the id and asks nothing', async () => {
    const b = (await partial('_sync-button', { userModified: false, id: 'u-1', name: 'Page' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('sync');
    expect(b.getAttribute('data-sync-id')).toBe('u-1');
    expect(b.hasAttribute('data-confirm')).toBe(false);
    expect(b.textContent?.trim()).toBe('Sync');
  });

  test('Force Sync for an edited copy always asks first, naming the item and the caller\'s note', async () => {
    const b = (await partial('_sync-button', { userModified: true, id: 'u-1', name: 'Page "A"', forceNote: 'Kept in history.' })).querySelector('button')!;
    expect(b.getAttribute('data-action')).toBe('force-sync');
    expect(b.textContent?.trim()).toBe('Force Sync');
    expect(b.getAttribute('data-confirm')).toBe('Replace the edits made to "Page "A"" on this site with the version that ships?\n\nKept in history.');
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
