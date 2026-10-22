/**
 * The ICE engine's own file handling (#1979): fingerprints, the noise filter,
 * and unpacking zips.
 */
import { createHash } from 'node:crypto';
import { packZip } from '../../utils/zipArchive';
import { expandUploads, fingerprint, isNoise, isZip } from '../fileHandling';

const NOISE = ['__MACOSX/', '.DS_Store', 'Thumbs.db', 'desktop.ini', '._*'];
const LIMITS = { maxEntries: 100, maxTotalBytes: 1_000_000 };

describe('fingerprint', () => {
  test('is the SHA-256 of the bytes, hex', () => {
    const bytes = Buffer.from('hello');
    expect(fingerprint(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(fingerprint(Buffer.from('hello'))).toBe(fingerprint(bytes));
    expect(fingerprint(Buffer.from('hello!'))).not.toBe(fingerprint(bytes));
  });
});

describe('isNoise', () => {
  test.each([
    ['__MACOSX/a/b.xml', true],
    ['export.zip/__MACOSX/._b.xml', true],
    ['folder/.DS_Store', true],
    ['.ds_store', true],
    ['Thumbs.db', true],
    ['records/._note.xml', true],
    ['records/note.xml', false],
    ['MACOSX.xml', false],
    ['records/my.DS_Store.txt', false]
  ])('%s → %s', (p, expected) => {
    expect(isNoise(p, NOISE)).toBe(expected);
  });

  test('a suffix pattern matches the end of a file name', () => {
    expect(isNoise('a/b.tmp', ['*.tmp'])).toBe(true);
    expect(isNoise('a/b.tmpl', ['*.tmp'])).toBe(false);
  });

  test('no patterns, no noise', () => {
    expect(isNoise('.DS_Store', [])).toBe(false);
  });
});

describe('expandUploads', () => {
  test('passes non-zip files through and names zip members archive/path', async () => {
    const zip = await packZip([
      { path: 'a.md', bytes: Buffer.from('# A') },
      { path: 'sub/b.md', bytes: Buffer.from('# B') }
    ]);
    const { files, unreadable } = expandUploads([
      { name: 'plain.md', bytes: Buffer.from('# P') },
      { name: 'export.zip', bytes: zip }
    ], LIMITS, 3);
    expect(unreadable).toEqual([]);
    expect(files.map(f => f.name)).toEqual(['plain.md', 'export.zip/a.md', 'export.zip/sub/b.md']);
    expect(files[2].bytes.toString()).toBe('# B');
  });

  test('unpacks a zip inside a zip, up to the depth allowed', async () => {
    const inner = await packZip([{ path: 'deep.md', bytes: Buffer.from('# D') }]);
    const outer = await packZip([{ path: 'inner.zip', bytes: inner }]);
    expect(expandUploads([{ name: 'outer.zip', bytes: outer }], LIMITS, 3).files.map(f => f.name))
      .toEqual(['outer.zip/inner.zip/deep.md']);

    const tooDeep = expandUploads([{ name: 'outer.zip', bytes: outer }], LIMITS, 1);
    expect(tooDeep.files).toEqual([]);
    expect(tooDeep.unreadable[0]).toMatchObject({ name: 'outer.zip/inner.zip', message: expect.stringMatching(/nested more than 1/) });
  });

  test('an unreadable archive is reported, and the other uploads go on', () => {
    const { files, unreadable } = expandUploads([
      { name: 'broken.zip', bytes: Buffer.from('not a zip') },
      { name: 'ok.md', bytes: Buffer.from('# ok') }
    ], LIMITS, 3);
    expect(files.map(f => f.name)).toEqual(['ok.md']);
    expect(unreadable).toEqual([{ name: 'broken.zip', size: 9, message: expect.stringMatching(/not a zip archive/) }]);
  });

  test('an archive over its limits is refused, not read', async () => {
    const zip = await packZip([{ path: 'a', bytes: Buffer.alloc(10) }, { path: 'b', bytes: Buffer.alloc(10) }]);
    const { unreadable } = expandUploads([{ name: 'big.zip', bytes: zip }], { maxEntries: 1, maxTotalBytes: 1000 }, 3);
    expect(unreadable[0].message).toMatch(/exceeds the 1 allowed/);
  });

  test('a zip is known by its name or its media type', () => {
    expect(isZip({ name: 'a.ZIP', bytes: Buffer.alloc(0) })).toBe(true);
    expect(isZip({ name: 'upload', bytes: Buffer.alloc(0), mediaType: 'application/zip' })).toBe(true);
    expect(isZip({ name: 'a.md', bytes: Buffer.alloc(0) })).toBe(false);
  });
});
