/**
 * The ICE engine's own file handling (#1979): fingerprints, the noise filter,
 * and unpacking zips.
 */
import { createHash, randomBytes } from 'node:crypto';
import { packZip, ZipBudgetError } from '../../utils/zipArchive';
import { expandUploads, fingerprint, isNoise, isZip, memberMediaType } from '../fileHandling';

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

  test('with innerZipsAsFiles, a zip inside the upload is passed on as a file, not unpacked (#2118)', async () => {
    const inner = await packZip([{ path: 'deep.md', bytes: Buffer.from('# D') }]);
    const outer = await packZip([{ path: 'inner.zip', bytes: inner }]);
    const { files } = expandUploads([{ name: 'outer.zip', bytes: outer }], LIMITS, 3, { innerZipsAsFiles: true });
    expect(files.map(f => [f.name, f.mediaType, f.archive?.path])).toEqual([['outer.zip/inner.zip', 'application/zip', 'inner.zip']]);
    expect(files[0].bytes.equals(inner)).toBe(true);
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

  describe('unpacked size is counted across the whole upload', () => {
    const TOTAL = { maxEntries: 100, maxTotalBytes: 1000 };
    /** A zip of one member of random bytes, so its stored size is about its real size. */
    const zipOf = (name: string, size: number): Promise<Buffer> => packZip([{ path: name, bytes: randomBytes(size) }]);

    test('each of several archives is under the total, and together they are over it: the upload is refused', async () => {
      const a = await zipOf('a.bin', 400);
      const b = await zipOf('b.bin', 400);
      const c = await zipOf('c.bin', 400);
      for (const one of [a, b, c]) expect(expandUploads([{ name: 'one.zip', bytes: one }], TOTAL, 3).files).toHaveLength(1);

      const upload = [{ name: 'a.zip', bytes: a }, { name: 'b.zip', bytes: b }, { name: 'c.zip', bytes: c }];
      expect(() => expandUploads(upload, TOTAL, 3)).toThrow(ZipBudgetError);
      expect(() => expandUploads(upload, TOTAL, 3)).toThrow(/more than 1000 bytes in all/);
    });

    test('archives inside an archive are counted toward the same total', async () => {
      const inner = await packZip([{ path: 'deep.bin', bytes: randomBytes(600) }]);
      const outer = await packZip([{ path: 'inner.zip', bytes: inner }]);
      // The outer's one member (the inner zip, ~700 bytes) and the inner's file (600 bytes): each under 1000, 1300 together.
      expect(expandUploads([{ name: 'inner.zip', bytes: inner }], TOTAL, 3).files).toHaveLength(1);
      expect(() => expandUploads([{ name: 'outer.zip', bytes: outer }], TOTAL, 3)).toThrow(ZipBudgetError);
    });

    describe('members are counted across the whole upload', () => {
      const LIMIT = { maxEntries: 5, maxTotalBytes: 1_000_000 };
      /** A zip of `n` empty members: they cost no bytes, so only a count can bound them. */
      const emptyZip = (prefix: string, n: number): Promise<Buffer> => packZip(Array.from({ length: n }, (_, i) => ({ path: `${prefix}${i}.txt`, bytes: Buffer.alloc(0) })));

      test('archives that are each under the entry limit and together over it are refused as a whole', async () => {
        const a = await emptyZip('a', 3);
        const b = await emptyZip('b', 3);
        expect(expandUploads([{ name: 'a.zip', bytes: a }], LIMIT, 3).files).toHaveLength(3);

        const upload = [{ name: 'a.zip', bytes: a }, { name: 'b.zip', bytes: b }];
        expect(() => expandUploads(upload, LIMIT, 3)).toThrow(ZipBudgetError);
        expect(() => expandUploads(upload, LIMIT, 3)).toThrow(/more than 5 files in all/);
      });

      test('members of archives inside an archive are counted with the rest', async () => {
        const outer = await packZip([
          { path: 'one.zip', bytes: await emptyZip('a', 3) },
          { path: 'two.zip', bytes: await emptyZip('b', 3) }
        ]);
        expect(() => expandUploads([{ name: 'outer.zip', bytes: outer }], LIMIT, 3)).toThrow(/more than 5 files in all/);
      });

      test('a count within the limit across several archives is unpacked', async () => {
        const { files } = expandUploads([
          { name: 'a.zip', bytes: await emptyZip('a', 2) },
          { name: 'b.zip', bytes: await emptyZip('b', 2) }
        ], LIMIT, 3);
        expect(files).toHaveLength(4);
      });

      test('a very large number of members is returned without error', async () => {
        const per = 60_000;
        const outer = await packZip([
          { path: 'one.zip', bytes: await emptyZip('a', per) },
          { path: 'two.zip', bytes: await emptyZip('b', per) },
          { path: 'three.zip', bytes: await emptyZip('c', per) }
        ]);
        const { files, unreadable } = expandUploads([{ name: 'outer.zip', bytes: outer }], { maxEntries: 1_000_000, maxTotalBytes: 100_000_000 }, 3);
        expect(unreadable).toEqual([]);
        expect(files).toHaveLength(3 * per);
      }, 120_000);
    });

    test('plain files and archives under the total in one upload are unpacked as before', async () => {
      const a = await zipOf('a.bin', 300);
      const b = await zipOf('b.bin', 300);
      const { files, unreadable } = expandUploads([
        { name: 'note.md', bytes: randomBytes(5000) },
        { name: 'a.zip', bytes: a },
        { name: 'b.zip', bytes: b }
      ], TOTAL, 3);
      expect(unreadable).toEqual([]);
      expect(files.map(f => f.name)).toEqual(['note.md', 'a.zip/a.bin', 'b.zip/b.bin']);
    });

    test('with innerZipsAsFiles, only the upload\'s own archives are unpacked, so only their members count', async () => {
      const inner = await packZip([{ path: 'deep.bin', bytes: randomBytes(600) }]);
      const outer = await packZip([{ path: 'inner.zip', bytes: inner }]);
      const { files } = expandUploads([{ name: 'outer.zip', bytes: outer }], TOTAL, 3, { innerZipsAsFiles: true });
      expect(files.map(f => f.name)).toEqual(['outer.zip/inner.zip']);
    });

    test('a member over the per-file cap is reported on its own, unread, and the rest of its archive goes on', async () => {
      const archive = await packZip([{ path: 'ok.txt', bytes: Buffer.from('fine') }, { path: 'big.bin', bytes: Buffer.alloc(100) }]);
      const central = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      archive.writeUInt32LE(900, central + 24);   // declares 900 bytes; the data holds 100

      const { files, unreadable } = expandUploads([{ name: 'x.zip', bytes: archive }], { ...TOTAL, maxFileBytes: 500 }, 3);
      expect(files.map(f => f.name)).toEqual(['x.zip/ok.txt']);
      expect(unreadable).toEqual([{ name: 'x.zip/big.bin', size: 900, message: 'larger than the 500 bytes allowed' }]);
    });

    test('a member that understates its size makes its archive unreadable, and the other uploads go on', async () => {
      const liar = await packZip([{ path: 'bomb.bin', bytes: Buffer.alloc(5 * 1024 * 1024) }]);
      liar.writeUInt32LE(100, liar.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);

      const { files, unreadable } = expandUploads([
        { name: 'liar.zip', bytes: liar },
        { name: 'ok.md', bytes: Buffer.from('# ok') }
      ], { ...TOTAL, maxTotalBytes: 100_000, maxFileBytes: 500 }, 3);
      expect(files.map(f => f.name)).toEqual(['ok.md']);
      expect(unreadable).toEqual([{ name: 'liar.zip', size: liar.length, message: expect.stringMatching(/more than it declares/) }]);
    });
  });

  test('a zip is known by its name or its media type', () => {
    expect(isZip({ name: 'a.ZIP', bytes: Buffer.alloc(0) })).toBe(true);
    expect(isZip({ name: 'upload', bytes: Buffer.alloc(0), mediaType: 'application/zip' })).toBe(true);
    expect(isZip({ name: 'a.md', bytes: Buffer.alloc(0) })).toBe(false);
  });
});

describe('media types of unpacked files (#2061)', () => {
  test('every file from a zip carries a media type; an upload on its own keeps its request type', async () => {
    const zip = await packZip([
      { path: 'Patient.json', bytes: Buffer.from('{"resourceType":"Patient"}') },
      { path: 'export/Observation.ndjson', bytes: Buffer.from('{"resourceType":"Observation"}\n{"resourceType":"Observation"}\n') },
      { path: 'ccda.xml', bytes: Buffer.from('<ClinicalDocument xmlns="urn:hl7-org:v3"/>') },
      { path: 'prolog.xml', bytes: Buffer.from('<?xml version="1.0"?><ClinicalDocument/>') },
      { path: 'scan.png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]) },
      { path: 'README', bytes: Buffer.from('notes') }
    ]);
    const { files } = expandUploads([
      { name: 'alone.json', bytes: Buffer.from('{}'), mediaType: 'application/fhir+json' },
      { name: 'unlabelled.json', bytes: Buffer.from('{}') },
      { name: 'export.zip', bytes: zip }
    ], LIMITS, 3);
    expect(files.map(f => [f.name, f.mediaType])).toEqual([
      ['alone.json', 'application/fhir+json'],
      ['unlabelled.json', undefined],
      ['export.zip/Patient.json', 'application/json'],
      ['export.zip/export/Observation.ndjson', 'application/x-ndjson'],
      ['export.zip/ccda.xml', 'application/xml'],
      ['export.zip/prolog.xml', 'text/xml'],
      ['export.zip/scan.png', 'image/png'],
      ['export.zip/README', 'application/octet-stream']
    ]);
  });

  test('a file whose bytes do not bear out its extension is application/octet-stream', () => {
    expect(memberMediaType('a.json', Buffer.from('not json'))).toBe('application/octet-stream');
    expect(memberMediaType('a.ndjson', Buffer.from('[1]'))).toBe('application/octet-stream');
    expect(memberMediaType('a.xml', Buffer.from('plain text'))).toBe('application/octet-stream');
    expect(memberMediaType('a.png', Buffer.from('not a png'))).toBe('application/octet-stream');
  });

  test('the bytes decide when they show a type: HTML named .xml is text/html', () => {
    expect(memberMediaType('page.xml', Buffer.from('<html><script>x</script></html>'))).toBe('text/html');
    expect(memberMediaType('a.json', Buffer.from('﻿  {"a":1}'))).toBe('application/json');
  });
});
