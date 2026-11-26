/**
 * #2534 — the words on the Delete button's confirm box and failure message,
 * from the shipped `public/js/asset-delete.js` (not a copy of it).
 *
 * Plain language for a home user: no ids, no codes. The pages come from the
 * search response's `usedBy`, which the server has already filtered to the
 * pages this person may open; the browser only words what it was given.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(path.resolve(__dirname, '../../public/js/asset-delete.js'), 'utf8');

interface Row { id: string; filename?: string; description?: string; usedBy?: { pages: string[]; more: number; hidden: number } }
interface AssetDeleteApi { confirmText(row: Row): string; failureText(status: number): string }

function load(): AssetDeleteApi {
  const window: { AssetDelete?: AssetDeleteApi } = {};
  vm.runInNewContext(CODE, { window });
  if (!window.AssetDelete) throw new Error('asset-delete.js did not define window.AssetDelete');
  return window.AssetDelete;
}

const row = (usedBy?: Row['usedBy'], extra: Partial<Row> = {}): Row => ({ id: 'abc123', filename: 'report.pdf', usedBy, ...extra });

describe('AssetDelete.confirmText (#2534)', () => {
  it('names the pages that use the file', () => {
    expect(load().confirmText(row({ pages: ['Home', 'Garden'], more: 0, hidden: 0 }))).toBe(
      'Delete "report.pdf"?\n\nPages that use it: Home, Garden.\n\nThis can\'t be undone, and those pages will show a missing file.'
    );
  });

  it('says "and N more" past the ten the server named', () => {
    expect(load().confirmText(row({ pages: ['A', 'B'], more: 3, hidden: 0 }))).toContain('Pages that use it: A, B and 3 more.');
  });

  it('counts pages the viewer cannot open, without naming them', () => {
    const text = load().confirmText(row({ pages: ['Home'], more: 0, hidden: 2 }));
    expect(text).toContain('Pages that use it: Home. Also used on 2 pages you can\'t open.');
  });

  it('one page you cannot open is singular, and may be all of them', () => {
    const text = load().confirmText(row({ pages: [], more: 0, hidden: 1 }));
    expect(text).toContain('Used on 1 page you can\'t open.');
    expect(text).toContain('those pages will show a missing file');
  });

  it('a file no page uses says so, and does not warn about missing files', () => {
    const text = load().confirmText(row({ pages: [], more: 0, hidden: 0 }));
    expect(text).toBe('Delete "report.pdf"?\n\nNo page uses this file.\n\nThis can\'t be undone.');
  });

  it('with no page information it makes no claim about pages', () => {
    expect(load().confirmText(row(undefined))).toBe('Delete "report.pdf"?\n\nThis can\'t be undone.');
  });

  it('names the file as the row does: description, then filename, then id', () => {
    const none = { pages: [], more: 0, hidden: 0 };
    expect(load().confirmText(row(none, { description: 'Tax return' }))).toContain('Delete "Tax return"?');
    expect(load().confirmText({ id: 'abc123', usedBy: none })).toContain('Delete "abc123"?');
  });
});

describe('AssetDelete.failureText (#2534)', () => {
  it.each([
    [403, 'You can\'t delete this file.'],
    [404, 'This file is already gone.'],
    [503, 'The file was not deleted because the record of the change could not be saved. Please try again.'],
    [500, 'The file could not be deleted.']
  ])('%i', (status, text) => {
    expect(load().failureText(status)).toBe(text);
  });
});
