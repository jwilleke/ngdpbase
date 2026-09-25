/**
 * Reading a takeout handed back for import (#1472).
 */

import { freeImportTitle, readTakeout, rewriteAttachmentLinks } from '../privateStoreImport';
import type { ZipEntry } from '../zipArchive';

const entry = (p: string, text: string): ZipEntry => ({ path: p, bytes: Buffer.from(text) });
const PAGE = '---\ntitle: Medical notes\nuuid: aaaa-1\nauthor: molly\n---\n\nCholesterol 180.\n';
const INDEX = JSON.stringify({
  version: 1,
  files: { 'id-1': { id: 'id-1', fileName: 'attachments/labs.pdf', name: 'labs.pdf', encodingFormat: 'application/pdf', description: 'June labs' } }
});

describe('readTakeout (#1472)', () => {
  test('reads pages and files as the exporter writes them', () => {
    const t = readTakeout([
      entry('vault/Medical notes.md', PAGE),
      entry('vault/attachments/labs.pdf', '%PDF'),
      entry('vault/files-index.json', INDEX)
    ]);

    expect(t.pages).toEqual([expect.objectContaining({
      title: 'Medical notes', uuid: 'aaaa-1', body: expect.stringContaining('Cholesterol 180.')
    })]);
    expect(t.pages[0].metadata.author).toBe('molly');
    expect(t.files).toEqual([expect.objectContaining({
      oldId: 'id-1', name: 'labs.pdf', encodingFormat: 'application/pdf', description: 'June labs'
    })]);
    expect(t.ignored).toEqual([]);
  });

  test('a takeout zipped again inside another folder is still found', () => {
    const t = readTakeout([
      entry('takeout-vault-2026-09-25/vault/Medical notes.md', PAGE),
      entry('takeout-vault-2026-09-25/vault/files-index.json', INDEX),
      entry('takeout-vault-2026-09-25/vault/attachments/labs.pdf', '%PDF')
    ]);

    expect(t.pages.map(p => p.title)).toEqual(['Medical notes']);
    expect(t.files[0].oldId).toBe('id-1');
  });

  test('its contents zipped with no folder at all are read too', () => {
    const t = readTakeout([entry('Medical notes.md', PAGE), entry('attachments/x.jpg', 'jpg')]);

    expect(t.pages).toHaveLength(1);
    expect(t.files).toEqual([expect.objectContaining({ name: 'x.jpg' })]);
    expect(t.files[0].oldId).toBeUndefined();
  });

  test('a page with no frontmatter is named by its file and keeps its whole text', () => {
    const t = readTakeout([entry('vault/Shopping list.md', 'Eggs.\n')]);

    expect(t.pages[0]).toMatchObject({ title: 'Shopping list', body: 'Eggs.\n' });
    expect(t.pages[0].uuid).toBeUndefined();
  });

  test('anything else in the archive is listed as ignored, not imported', () => {
    const t = readTakeout([
      entry('vault/Page.md', PAGE),
      entry('vault/versions/aaaa-1/1.md', 'old'),
      entry('vault/notes.txt', 'x')
    ]);

    expect(t.pages).toHaveLength(1);
    expect(t.ignored.sort()).toEqual(['vault/notes.txt', 'vault/versions/aaaa-1/1.md']);
  });

  test('an unreadable file index costs the links, not the files', () => {
    const t = readTakeout([entry('vault/files-index.json', '{nope'), entry('vault/attachments/a.jpg', 'x')]);

    expect(t.files).toEqual([expect.objectContaining({ name: 'a.jpg' })]);
    expect(t.files[0].oldId).toBeUndefined();
  });
});

describe('rewriteAttachmentLinks (#1472)', () => {
  test('points each old id at its new one, whole ids only', () => {
    const ids = new Map([['abc', 'NEW']]);

    expect(rewriteAttachmentLinks('![x](/attachments/abc) [y](/attachments/abc-2) /attachments/abc.', ids))
      .toBe('![x](/attachments/NEW) [y](/attachments/abc-2) /attachments/NEW.');
  });
});

describe('freeImportTitle (#1472)', () => {
  test('the title itself when free, else "(imported)", then "(imported 2)"', async () => {
    const taken = new Set(['notes', 'notes (imported)']);
    const isTaken = async (t: string): Promise<boolean> => taken.has(t.toLowerCase());

    expect(await freeImportTitle('Fresh', isTaken)).toBe('Fresh');
    expect(await freeImportTitle('Notes', isTaken)).toBe('Notes (imported 2)');
  });
});
