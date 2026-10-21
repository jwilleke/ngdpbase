/**
 * #1918 — one look and one Sync flow for shipped content: Admin → Required
 * Pages and the forms admin's shipped forms draw their status words, badges
 * and Sync / Force Sync through the same core partials. Force Sync always asks
 * first; nothing carries an inline handler.
 *
 * Renders the real partials and the real forms admin view, as Express does
 * (header and footer stubbed).
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
const FORMS_ADMIN = path.join(ROOT, 'addons/forms/views/forms-admin.ejs');

const includer = (original: string): { template: string } | undefined =>
  original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

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

  test('a required change waiting is flagged', async () => {
    const doc = await partial('_sync-status', { status: 'modified', userModified: true, required: true });
    expect(statuses(doc)).toEqual(['modified', 'user-edited', 'required']);
    expect(doc.querySelector('[data-sync-status="required"]')?.textContent?.trim()).toBe('Required');
    expect(doc.querySelector('[data-sync-status="required"]')?.getAttribute('title')).toContain('Force Sync');
  });
});

describe('#1918 _sync-button', () => {
  test('in-page mode (Required Pages): Sync carries the id and asks nothing', async () => {
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

  test('form mode (forms admin): a POST form with the CSRF token; Force Sync sends overwrite=1', async () => {
    const plain = await partial('_sync-button', { userModified: false, name: 'F', action: '/addons/forms/f/sync', csrfToken: 'tok' });
    expect(plain.querySelector('form')?.getAttribute('action')).toBe('/addons/forms/f/sync');
    expect((plain.querySelector('input[name="_csrf"]') as HTMLInputElement).value).toBe('tok');
    expect(plain.querySelector('input[name="overwrite"]')).toBeNull();
    expect(plain.querySelector('button')?.getAttribute('type')).toBe('submit');

    const force = await partial('_sync-button', { userModified: true, name: 'F', action: '/addons/forms/f/sync', csrfToken: 'tok' });
    expect((force.querySelector('input[name="overwrite"]') as HTMLInputElement).value).toBe('1');
    expect(force.querySelector('button')?.getAttribute('data-confirm')).toContain('Replace the edits made to "F"');
  });

  test('a plain Sync asks when the caller passes a question', async () => {
    const b = (await partial('_sync-button', { userModified: false, name: 'F', confirm: 'Sure?', action: '/x', csrfToken: 't' })).querySelector('button')!;
    expect(b.getAttribute('data-confirm')).toBe('Sure?');
  });

  test('names are escaped and no inline handler is drawn', async () => {
    const doc = await partial('_sync-button', { userModified: true, id: 'x"onclick="y', name: '<img src=x onerror=alert(1)>' });
    expect(doc.querySelector('img')).toBeNull();
    const attributes = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.name));
    expect(attributes.filter((name) => name.startsWith('on'))).toEqual([]);
    expect(doc.querySelector('button')?.getAttribute('data-sync-id')).toBe('x"onclick="y');
  });
});

describe('#1918 both screens draw shipped content through the same partials', () => {
  test('Admin → Required Pages and the forms admin include them', () => {
    const uses = (file: string, name: string) => (fs.readFileSync(file, 'utf8').match(new RegExp(`include\\('${name}'`, 'g')) ?? []).length;
    const required = path.join(VIEWS, 'admin-required-pages.ejs');
    expect(uses(required, '_sync-status')).toBe(2);
    expect(uses(required, '_sync-button')).toBe(2);
    expect(uses(required, '_sync-counts')).toBe(1);
    expect(uses(FORMS_ADMIN, '_sync-status')).toBe(1);
    expect(uses(FORMS_ADMIN, '_sync-button')).toBe(1);
    expect(uses(FORMS_ADMIN, '_sync-counts')).toBe(1);
  });

  test('the forms admin renders its shipped forms with them: status words, Required flag, Sync and Force Sync', async () => {
    const row = (id: string, state: Record<string, unknown>) => ({ id, title: `T ${id}`, addon: 'accounting', stamped: true, required: false, ...state });
    const shippedForms = [
      row('cur', syncRowState('current')),
      row('out', { ...syncRowState('outdated'), required: true }),
      row('ed', { ...syncRowState('locally-modified'), required: true }),
      row('legacy', { ...syncRowState('outdated'), stamped: false })
    ];
    const html = await ejs.renderFile(FORMS_ADMIN, {
      currentUser: null, forms: [], query: {}, csrfToken: 'tok', locals: {},
      shippedForms, shippedCounts: { modified: 3, current: 1, required: 2 }
    }, { views: [VIEWS], includer });
    const doc = new JSDOM(html).window.document;
    const r = (id: string) => doc.querySelector(`tr[data-form-id="${id}"]`)!;

    expect(statuses(r('cur'))).toEqual(['current']);
    expect(r('cur').querySelector('button')).toBeNull();
    expect(statuses(r('out'))).toEqual(['modified', 'required']);
    expect(r('out').querySelector('button')?.getAttribute('data-action')).toBe('sync');
    expect(statuses(r('ed'))).toEqual(['modified', 'user-edited', 'required']);
    expect(r('ed').querySelector('button')?.getAttribute('data-action')).toBe('force-sync');
    expect(r('ed').querySelector('button')?.getAttribute('data-confirm')).toContain('Those edits are lost');
    expect(r('legacy').querySelector('button')?.getAttribute('data-confirm')).toContain('saved before edits were tracked');
    expect(doc.querySelector('[data-testid="shipped-required"]')?.textContent).toContain('2 shipped forms need an update');
    expect(doc.querySelector('[data-sync-count="required"]')?.textContent).toBe('2 Required');
  });
});
