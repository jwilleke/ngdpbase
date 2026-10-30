/**
 * The takeout shim (#2118): a download of a private store, read member by
 * member as the engine unpacks it, through the archive beside each member.
 * The cases of the takeout reader it replaces (#1472) are kept.
 */
import { packZip } from '../../../utils/zipArchive';
import { expandUploads } from '../../fileHandling';
import { freeImportTitle, linksToAttachment, rewriteAttachmentLinks, takeoutRoot, takeoutShim, type TakeoutData } from '../takeout';
import type { IceItem, ShimReadResult } from '../../types';

const PAGE = '---\ntitle: Medical notes\nuuid: aaaa-1\nauthor: molly\n---\n\nCholesterol 180. ![labs](/attachments/id-1)\n';
const INDEX = JSON.stringify({
  version: 1,
  files: { 'id-1': { id: 'id-1', fileName: 'attachments/labs.pdf', name: 'labs.pdf', encodingFormat: 'application/pdf', description: 'June labs' } }
});
const LIMITS = { maxEntries: 100, maxTotalBytes: 1_000_000 };
const TOOLS = { options: {}, fetch: async () => { throw new Error('no network in this test'); } };

/** Every member of a zip of `entries`, as the engine hands them to shims, read by the takeout shim: by path in the archive. */
async function readAll(entries: Array<[string, string]>, name = 'takeout-vault.zip'): Promise<Record<string, ShimReadResult>> {
  const zip = await packZip(entries.map(([p, text]) => ({ path: p, bytes: Buffer.from(text) })));
  const { files } = expandUploads([{ name, bytes: zip }], LIMITS, 3);
  const out: Record<string, ShimReadResult> = {};
  for (const f of files) {
    const item: IceItem = { kind: 'file', name: f.name, bytes: f.bytes, text: f.bytes.toString('utf8'), ...(f.mediaType ? { mediaType: f.mediaType } : {}), ...(f.archive ? { archive: f.archive } : {}) };
    expect(takeoutShim.accepts.canRead?.(item)).toBe(true);
    out[f.archive!.path] = await takeoutShim.read!(item, TOOLS);
  }
  return out;
}

const dataOf = (r: ShimReadResult): TakeoutData => r.items[0].data as TakeoutData;

describe('the takeout shim (#2118)', () => {
  test('reads pages and files as the exporter writes them; the index is read through them', async () => {
    const read = await readAll([
      ['vault/Medical notes.md', PAGE],
      ['vault/attachments/labs.pdf', '%PDF-1.4 labs'],
      ['vault/files-index.json', INDEX]
    ]);

    const page = read['vault/Medical notes.md'];
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ kind: 'takeout', text: expect.stringContaining('Cholesterol 180.') });
    expect(dataOf(page)).toMatchObject({
      entry: 'page', title: 'Medical notes', uuid: 'aaaa-1', metadata: expect.objectContaining({ author: 'molly' }),
      files: [{ oldId: 'id-1', path: 'vault/attachments/labs.pdf', name: 'labs.pdf', encodingFormat: 'application/pdf', description: 'June labs' }]
    });
    // The page carries the archive, so its receiver can read the files it links to.
    expect(page.items[0].archive?.read('vault/attachments/labs.pdf')?.toString()).toBe('%PDF-1.4 labs');

    const file = read['vault/attachments/labs.pdf'];
    expect(file.items[0]).toMatchObject({ kind: 'takeout', mediaType: 'application/pdf' });
    expect(file.items[0].bytes?.toString()).toBe('%PDF-1.4 labs');
    expect(dataOf(file)).toEqual({ entry: 'file', oldId: 'id-1', name: 'labs.pdf', encodingFormat: 'application/pdf', description: 'June labs' });

    expect(read['vault/files-index.json']).toEqual({ items: [], skip: expect.stringContaining('file index') });
  });

  // #2162: once per archive, not once per member: a large index times many members held the event loop.
  test('reads the file index and finds the root once per archive, whatever its member count', async () => {
    const entries: Array<[string, string]> = [['vault/files-index.json', INDEX], ['vault/Medical notes.md', PAGE]];
    for (let i = 0; i < 50; i++) entries.push([`vault/attachments/f${i}.txt`, `file ${i}`]);
    const zip = await packZip(entries.map(([p, text]) => ({ path: p, bytes: Buffer.from(text) })));
    const { files } = expandUploads([{ name: 'takeout-vault.zip', bytes: zip }], LIMITS, 3);
    const parse = vi.spyOn(JSON, 'parse');
    try {
      for (const f of files) {
        await takeoutShim.read!({ kind: 'file', name: f.name, bytes: f.bytes, archive: f.archive }, TOOLS);
      }
      expect(parse).toHaveBeenCalledTimes(1);
    } finally {
      parse.mockRestore();
    }
  });

  test('a takeout zipped again inside another folder is still found', async () => {
    const read = await readAll([
      ['takeout-vault-2026-09-25/vault/Medical notes.md', PAGE],
      ['takeout-vault-2026-09-25/vault/files-index.json', INDEX],
      ['takeout-vault-2026-09-25/vault/attachments/labs.pdf', '%PDF']
    ]);

    expect(dataOf(read['takeout-vault-2026-09-25/vault/Medical notes.md'])).toMatchObject({ title: 'Medical notes' });
    expect(dataOf(read['takeout-vault-2026-09-25/vault/attachments/labs.pdf'])).toMatchObject({ oldId: 'id-1' });
  });

  test('its contents zipped with no folder at all are read too', async () => {
    const read = await readAll([['Medical notes.md', PAGE], ['attachments/x.jpg', 'jpg']]);

    expect(dataOf(read['Medical notes.md'])).toMatchObject({ entry: 'page', title: 'Medical notes', files: [] });
    expect(dataOf(read['attachments/x.jpg'])).toEqual({ entry: 'file', name: 'x.jpg' });
  });

  test('a page with no frontmatter is named by its file and keeps its whole text', async () => {
    const read = await readAll([['vault/Shopping list.md', 'Eggs.\n']]);

    const page = read['vault/Shopping list.md'];
    expect(page.items[0].text).toBe('Eggs.\n');
    expect(dataOf(page)).toMatchObject({ title: 'Shopping list' });
    expect((dataOf(page) as { uuid?: string }).uuid).toBeUndefined();
  });

  test('anything else in the archive is left out, not imported', async () => {
    const read = await readAll([
      ['vault/Page.md', PAGE],
      ['vault/versions/aaaa-1/1.md', 'old'],
      ['vault/notes.txt', 'x'],
      ['vault/footnotes/aaaa-1.json', '{}']
    ]);

    expect(read['vault/Page.md'].items).toHaveLength(1);
    for (const p of ['vault/versions/aaaa-1/1.md', 'vault/notes.txt', 'vault/footnotes/aaaa-1.json']) {
      expect(read[p]).toEqual({ items: [], skip: expect.stringContaining('left out') });
    }
  });

  test('an unreadable file index costs the links, not the files', async () => {
    const read = await readAll([['vault/files-index.json', '{nope'], ['vault/attachments/a.jpg', 'x'], ['vault/P.md', PAGE]]);

    expect(dataOf(read['vault/attachments/a.jpg'])).toEqual({ entry: 'file', name: 'a.jpg' });
    expect(dataOf(read['vault/P.md'])).toMatchObject({ files: [] });
  });

  test('a page links only to files the archive holds', async () => {
    const read = await readAll([['vault/P.md', PAGE], ['vault/files-index.json', INDEX]]);
    expect(dataOf(read['vault/P.md'])).toMatchObject({ files: [] });
  });

  test('a file on its own, not from a zip, is not read as a takeout', async () => {
    const item: IceItem = { kind: 'file', name: 'Medical notes.md', bytes: Buffer.from(PAGE), text: PAGE };
    expect(takeoutShim.accepts.canRead?.(item)).toBe(false);
  });

  test('a zip the store held, left packed as its receiver asks, is one of its files (#2118)', async () => {
    const inner = await packZip([{ path: 'Other.md', bytes: Buffer.from(PAGE) }]);
    const zip = await packZip([{ path: 'vault/P.md', bytes: Buffer.from(PAGE) }, { path: 'vault/attachments/old.zip', bytes: inner }]);
    const { files } = expandUploads([{ name: 'takeout.zip', bytes: zip }], LIMITS, 3, { innerZipsAsFiles: true });
    const kept = files.find(f => f.name === 'takeout.zip/vault/attachments/old.zip')!;
    const result = await takeoutShim.read!({ kind: 'file', name: kept.name, bytes: kept.bytes, mediaType: kept.mediaType, archive: kept.archive }, TOOLS);
    expect(result.items).toHaveLength(1);
    expect(dataOf(result)).toEqual({ entry: 'file', name: 'old.zip' });
    expect(result.items[0].bytes?.equals(inner)).toBe(true);
  });

  test('a zip inside the takeout, were it unpacked, is left out, not read as a takeout of its own', async () => {
    const inner = await packZip([{ path: 'Other.md', bytes: Buffer.from(PAGE) }]);
    const zip = await packZip([{ path: 'vault/P.md', bytes: Buffer.from(PAGE) }, { path: 'vault/attachments/old.zip', bytes: inner }]);
    const { files } = expandUploads([{ name: 'takeout.zip', bytes: zip }], LIMITS, 3);
    const nested = files.find(f => f.name === 'takeout.zip/vault/attachments/old.zip/Other.md')!;
    const result = await takeoutShim.read!({ kind: 'file', name: nested.name, bytes: nested.bytes, archive: nested.archive }, TOOLS);
    expect(result).toEqual({ items: [], skip: expect.stringContaining('inside a zip') });
  });
});

describe('takeoutRoot', () => {
  test('the folder of the file index, else of the shallowest page, else the archive itself', () => {
    expect(takeoutRoot(['a/b/vault/files-index.json', 'a/b/vault/P.md', 'x.md'])).toBe('a/b/vault');
    expect(takeoutRoot(['deep/er/P.md', 'deep/Q.md'])).toBe('deep');
    expect(takeoutRoot(['P.md'])).toBe('');
    expect(takeoutRoot([])).toBe('');
  });
});

describe('rewriteAttachmentLinks (#1472)', () => {
  test('points each old id at its new one, whole ids only', () => {
    const ids = new Map([['abc', 'NEW']]);

    expect(rewriteAttachmentLinks('![x](/attachments/abc) [y](/attachments/abc-2) /attachments/abc.', ids))
      .toBe('![x](/attachments/NEW) [y](/attachments/abc-2) /attachments/NEW.');
    expect(linksToAttachment('[y](/attachments/abc-2)', 'abc')).toBe(false);
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
