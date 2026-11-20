/**
 * The zip writer (#1387), checked against an independent implementation.
 *
 * A takeout lands on someone's laptop or phone and has to open by tapping it,
 * so "it extracts with a real tool" is the property under test — not whether
 * the headers match what this file believes about them. Every test writes the
 * archive, extracts it, and compares the bytes that come out.
 *
 * The extractor is Python's `zipfile`; see `extract()` for why it is not the
 * `unzip` binary. No test here needs `unzip` installed.
 */

import path from 'path';
import { randomBytes } from 'crypto';
import os from 'os';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { packZip, readZip, crc32, ZipBudgetError, type ZipEntry } from '../zipArchive';

const run = promisify(execFile);

/**
 * The name of the first member whose data fails its CRC, or null if none does.
 * Not `python3 -m zipfile -t`: that exits 0 on a corrupt archive and only
 * words the problem on stdout, which is not an interface.
 */
async function testzip(archivePath: string): Promise<string | null> {
  const { stdout } = await run('python3', [
    '-c',
    'import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).testzip()))',
    archivePath
  ]);
  return JSON.parse(stdout) as string | null;
}

let dir: string;

/** Bytes that are not valid UTF-8 — a decrypted attachment, an image. */
const BINARY = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01, 0x92, 0xc3, 0x28, 0x7f]);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-zip-'));
});

afterEach(async () => {
  if (dir) await fs.remove(dir);
});

/**
 * Write the archive, extract it with an independent implementation, return the
 * output directory.
 *
 * Python's `zipfile` rather than the `unzip` binary: macOS ships Info-ZIP 6.00,
 * which predates the UTF-8 filename flag and mangles any non-ASCII name into
 * CP437 — it reported `Caf+?` for a correctly flagged `Café` and failed. That
 * is the extractor being twenty years old, not the archive being wrong, but a
 * test oracle that cannot read a correct archive is no oracle. The integrity
 * tests below use Python's `zipfile` for the same reason, and so that no
 * test needs the `unzip` binary (#2184).
 */
async function extract(archive: Buffer): Promise<string> {
  const archivePath = path.join(dir, 'takeout.zip');
  const outDir = path.join(dir, 'extracted');
  await fs.writeFile(archivePath, archive);
  await fs.ensureDir(outDir);
  await run('python3', [
    '-c',
    'import sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n    bad = z.testzip()\n    assert bad is None, bad\n    z.extractall(sys.argv[2])',
    archivePath,
    outDir
  ]);
  return outDir;
}

describe("packZip — verified by extracting with Python's zipfile (#1387)", () => {
  test('a file comes back byte for byte, including bytes that are not UTF-8', async () => {
    const out = await extract(await packZip([{ path: 'photo.jpg', bytes: BINARY }]));

    expect(Buffer.compare(await fs.readFile(path.join(out, 'photo.jpg')), BINARY)).toBe(0);
  });

  test('text is deflated, and comes back identical', async () => {
    // Markdown compresses well and the destination is often a phone on mobile
    // data, so this path matters — but only if it round-trips exactly.
    const body = Buffer.from('# Shopping list\n\n- eggs\n'.repeat(200));
    const archive = await packZip([{ path: 'Shopping list.md', bytes: body }]);

    expect(archive.length).toBeLessThan(body.length);

    const out = await extract(archive);
    expect(Buffer.compare(await fs.readFile(path.join(out, 'Shopping list.md')), body)).toBe(0);
  });

  test('incompressible bytes are stored rather than grown', async () => {
    // Deflating random data makes it bigger; the writer must notice.
    const random = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 2654435761) % 256));
    const archive = await packZip([{ path: 'random.bin', bytes: random }]);

    expect(archive.length).toBeLessThan(random.length + 512);
    const out = await extract(archive);
    expect(Buffer.compare(await fs.readFile(path.join(out, 'random.bin')), random)).toBe(0);
  });

  test('nested paths are recreated', async () => {
    const entries: ZipEntry[] = [
      { path: 'attachments/photo.jpg', bytes: BINARY },
      { path: 'Recipes.md', bytes: Buffer.from('# Recipes\n') }
    ];
    const out = await extract(await packZip(entries));

    expect(Buffer.compare(await fs.readFile(path.join(out, 'attachments/photo.jpg')), BINARY)).toBe(0);
    expect(await fs.readFile(path.join(out, 'Recipes.md'), 'utf8')).toBe('# Recipes\n');
  });

  test('a title with spaces, an apostrophe and an accent', async () => {
    // A takeout names pages by their real titles, so this is the normal case.
    const name = "Molly's Café notes.md";
    const out = await extract(await packZip([{ path: name, bytes: Buffer.from('body') }]));

    expect(await fs.readFile(path.join(out, name), 'utf8')).toBe('body');
  });

  test('an empty file survives', async () => {
    const out = await extract(await packZip([
      { path: 'empty.md', bytes: Buffer.alloc(0) },
      { path: 'after.md', bytes: Buffer.from('still here') }
    ]));

    expect((await fs.stat(path.join(out, 'empty.md'))).size).toBe(0);
    expect(await fs.readFile(path.join(out, 'after.md'), 'utf8')).toBe('still here');
  });

  test('many entries all arrive', async () => {
    const entries: ZipEntry[] = Array.from({ length: 60 }, (_, i) => ({
      path: `notes/page-${i}.md`,
      bytes: Buffer.from(`body ${i}`)
    }));
    const out = await extract(await packZip(entries));

    for (let i = 0; i < entries.length; i++) {
      expect(await fs.readFile(path.join(out, `notes/page-${i}.md`), 'utf8')).toBe(`body ${i}`);
    }
  });

  test('ZipFile.testzip() finds no bad member, so the data and the directory CRCs agree', async () => {
    const archive = await packZip([
      { path: 'a.md', bytes: Buffer.from('alpha') },
      { path: 'b/b.bin', bytes: BINARY }
    ]);
    const archivePath = path.join(dir, 'check.zip');
    await fs.writeFile(archivePath, archive);

    expect(await testzip(archivePath)).toBeNull();
  });

  test('ZipFile.testzip() names the member when one byte of its data is corrupted', async () => {
    const archive = await packZip([{ path: 'a.md', bytes: Buffer.from('alpha beta gamma') }]);
    // The first entry's data starts after its 30-byte local header and name.
    archive[30 + 'a.md'.length] ^= 0xff;
    const archivePath = path.join(dir, 'corrupt.zip');
    await fs.writeFile(archivePath, archive);

    expect(await testzip(archivePath)).toBe('a.md');
  });

  test("each local header's CRC equals the one in the central directory", async () => {
    const archive = await packZip([
      { path: 'a.md', bytes: Buffer.from('alpha') },
      { path: 'b/b.bin', bytes: BINARY }
    ]);
    const archivePath = path.join(dir, 'headers.zip');
    await fs.writeFile(archivePath, archive);

    // `testzip()` reads the central directory, so it cannot see a bad local
    // header; read both CRCs and compare them.
    const script = [
      'import json, struct, sys, zipfile',
      'out = []',
      'with zipfile.ZipFile(sys.argv[1]) as z, open(sys.argv[1], "rb") as f:',
      '    for i in z.infolist():',
      '        f.seek(i.header_offset)',
      '        out.append([i.filename, struct.unpack("<I", f.read(30)[14:18])[0], i.CRC])',
      'print(json.dumps(out))'
    ].join('\n');
    const { stdout } = await run('python3', ['-c', script, archivePath]);
    const rows = JSON.parse(stdout) as Array<[string, number, number]>;

    expect(rows.map(([name]) => name)).toEqual(['a.md', 'b/b.bin']);
    for (const [, local, central] of rows) {
      expect(local).toBe(central);
    }
  });

  test('a leading slash is dropped — an archive never writes to an absolute path', async () => {
    const out = await extract(await packZip([{ path: '/etc/passwd.md', bytes: Buffer.from('nope') }]));

    expect(await fs.readFile(path.join(out, 'etc/passwd.md'), 'utf8')).toBe('nope');
  });

  test('an entry with no path is refused', async () => {
    await expect(packZip([{ path: '', bytes: Buffer.from('x') }])).rejects.toThrow(/path/i);
  });

  test('more members than a plain zip can index is refused, not silently wrong', async () => {
    const tooMany: ZipEntry[] = Array.from({ length: 0x10000 }, (_, i) => ({
      path: `p${i}`,
      bytes: Buffer.alloc(0)
    }));

    await expect(packZip(tooMany)).rejects.toThrow(/zip64/i);
  });

  test('a date before 1980 is clamped rather than written as garbage', async () => {
    // MS-DOS timestamps cannot express it; the archive must still be valid.
    const out = await extract(await packZip([
      { path: 'old.md', bytes: Buffer.from('x'), mtime: new Date('1969-07-20T20:17:00Z') }
    ]));

    expect(await fs.readFile(path.join(out, 'old.md'), 'utf8')).toBe('x');
  });
});

describe('crc32 (#1387)', () => {
  test('matches the published check value for "123456789"', () => {
    // The IEEE CRC-32 check value every implementation agrees on.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  test('an empty buffer is zero', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

/**
 * The zip reader (#1472), checked against an independent WRITER.
 *
 * An archive handed back for import may have been written by anything: this
 * system, an OS re-zipping the extracted folder, a phone. So archives are
 * written by Python's `zipfile` — to a file, and to a pipe, which forces the
 * data-descriptor form streaming writers produce — and the bytes read back
 * are compared with the bytes that went in.
 */
const LIMITS = { maxEntries: 1000, maxTotalBytes: 10 * 1024 * 1024 };

/** Write an archive with Python from `[name, bytes]` pairs. */
async function pythonZip(members: Array<[string, Buffer]>, opts: { stream?: boolean } = {}): Promise<Buffer> {
  const script = [
    'import sys, json, base64, zipfile, io',
    'members = json.loads(sys.argv[1])',
    'class Pipe(io.RawIOBase):',
    '    def __init__(s): s.buf = bytearray()',
    '    def writable(s): return True',
    '    def seekable(s): return False',
    '    def write(s, b): s.buf += b; return len(b)',
    'out = Pipe() if sys.argv[2] == "stream" else io.BytesIO()',
    'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:',
    '    for name, data in members:',
    '        z.writestr(name, base64.b64decode(data))',
    'sys.stdout.buffer.write(bytes(out.buf) if sys.argv[2] == "stream" else out.getvalue())'
  ].join('\n');
  const { stdout } = await run('python3', [
    '-c', script,
    JSON.stringify(members.map(([n, b]) => [n, b.toString('base64')])),
    opts.stream ? 'stream' : 'file'
  ], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

describe('readZip — verified against archives Python wrote (#1472)', () => {
  test('reads back exactly what was written, text and binary', async () => {
    const archive = await pythonZip([
      ['vault/Café notes.md', Buffer.from('---\ntitle: Café notes\n---\n\nHello.\n')],
      ['vault/attachments/photo.jpg', BINARY]
    ]);

    const entries = readZip(archive, LIMITS);

    expect(entries.map(e => e.path)).toEqual(['vault/Café notes.md', 'vault/attachments/photo.jpg']);
    expect(entries[0].bytes.toString('utf8')).toContain('title: Café notes');
    expect(entries[1].bytes.equals(BINARY)).toBe(true);
  });

  test('a streamed archive (data descriptors) reads the same', async () => {
    const archive = await pythonZip([['a.md', Buffer.from('one')], ['b.bin', BINARY]], { stream: true });
    // The flag bit that says sizes follow the data, not the header.
    expect(archive.readUInt16LE(6) & 0x0008).toBe(0x0008);

    const entries = readZip(archive, LIMITS);

    expect(entries.map(e => e.bytes.toString('base64'))).toEqual([
      Buffer.from('one').toString('base64'), BINARY.toString('base64')
    ]);
  });

  test('what this system writes, it reads', async () => {
    const written: ZipEntry[] = [
      { path: 'vault/Page.md', bytes: Buffer.from('x'.repeat(5000)) },
      { path: 'vault/attachments/a.bin', bytes: BINARY }
    ];

    const entries = readZip(await packZip(written), LIMITS);

    expect(entries.map(e => [e.path, e.bytes.toString('base64')])).toEqual(
      written.map(e => [e.path, e.bytes.toString('base64')])
    );
  });

  test('directories and macOS folder litter are dropped', async () => {
    const archive = await pythonZip([
      ['vault/', Buffer.alloc(0)],
      ['vault/Page.md', Buffer.from('x')],
      ['__MACOSX/vault/._Page.md', Buffer.from('junk')],
      ['vault/.DS_Store', Buffer.from('junk')]
    ]);

    expect(readZip(archive, LIMITS).map(e => e.path)).toEqual(['vault/Page.md']);
  });

  test.each([
    ['../escape.md'],
    ['vault/../../escape.md'],
    ['vault\\..\\..\\escape.md'],
    ['/etc/passwd'],
    ['C:/Windows/evil.md']
  ])('a member named %s is refused — it would land outside the folder', async (name) => {
    const archive = await pythonZip([[name, Buffer.from('x')]]);

    expect(() => readZip(archive, LIMITS)).toThrow(/absolute|climbs/);
  });

  test('an archive that expands past the budget stops at the budget', async () => {
    // 20 MB of zeros deflates to a few kilobytes.
    const archive = await packZip([{ path: 'bomb.bin', bytes: Buffer.alloc(20 * 1024 * 1024) }]);
    expect(archive.length).toBeLessThan(100 * 1024);

    expect(() => readZip(archive, { maxEntries: 10, maxTotalBytes: 1024 * 1024 })).toThrow(/more than 1 MB in all/);
  });

  test('a member that understates its size is stopped at what it declared', async () => {
    const archive = await packZip([{ path: 'bomb.bin', bytes: Buffer.alloc(20 * 1024 * 1024) }]);
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt32LE(100, central + 24);  // claims 100 bytes uncompressed

    expect(() => readZip(archive, LIMITS)).toThrow(/more than it declares/);
  });

  describe('members may not share data', () => {
    /** The offsets of each central directory record in an archive. */
    const centralRecords = (archive: Buffer): number[] => {
      const found: number[] = [];
      for (let i = archive.length - 4; i >= 0; i--) if (archive.readUInt32LE(i) === 0x02014b50) found.unshift(i);
      return found;
    };

    test('several members whose records point at the same data are refused', async () => {
      const same = Buffer.alloc(2000, 'x');
      const archive = await packZip(['a', 'b', 'c'].map(name => ({ path: name, bytes: same })));
      const [first, ...others] = centralRecords(archive);
      for (const at of others) archive.writeUInt32LE(archive.readUInt32LE(first + 42), at + 42);

      expect(() => readZip(archive, LIMITS)).toThrow(/share data/);
    });

    test('a member whose stored length reaches into the next member is refused', async () => {
      const archive = await packZip([{ path: 'a', bytes: randomBytes(100) }, { path: 'b', bytes: randomBytes(100) }]);
      const [first] = centralRecords(archive);
      // Stored, so the stated size and the stored length move together; the data now runs past where the next member starts.
      archive.writeUInt32LE(150, first + 20);
      archive.writeUInt32LE(150, first + 24);

      expect(() => readZip(archive, LIMITS)).toThrow(/share data/);
    });

    test('an archive with many members, each with its own data, is read in full', async () => {
      const entries = Array.from({ length: 300 }, (_, i) => ({ path: `m${i}.txt`, bytes: Buffer.from(`member ${i}`.repeat(20)) }));
      const read = readZip(await packZip(entries), { maxEntries: 1000, maxTotalBytes: 10 * 1024 * 1024 });
      expect(read.map(e => e.path)).toEqual(entries.map(e => e.path));
      expect(read[299].bytes.equals(entries[299].bytes)).toBe(true);
    });

    test('an archive inside an archive is read, and so are its members', async () => {
      const inner = await packZip([{ path: 'x.txt', bytes: Buffer.from('inner') }, { path: 'y.txt', bytes: Buffer.from('inner too') }]);
      const outer = readZip(await packZip([{ path: 'inner.zip', bytes: inner }]), LIMITS);
      expect(readZip(outer[0].bytes, LIMITS).map(e => e.path)).toEqual(['x.txt', 'y.txt']);
    });

    test('a stored member whose stated size differs from its stored length is refused', async () => {
      const archive = await packZip([{ path: 'a.bin', bytes: randomBytes(100) }]);
      const [central] = centralRecords(archive);
      expect(archive.readUInt16LE(central + 10)).toBe(0);   // stored
      archive.writeUInt32LE(50, central + 24);

      expect(() => readZip(archive, LIMITS)).toThrow(/stored size/);
    });
  });

  describe('member paths count toward the budget', () => {
    test('a member path may be at most 1,024 bytes', async () => {
      const ok = 'p'.repeat(1020) + '.txt';   // 1,024 bytes
      expect(readZip(await packZip([{ path: ok, bytes: Buffer.from('x') }]), LIMITS).map(e => e.path)).toEqual([ok]);

      const tooLong = await packZip([{ path: 'p'.repeat(1021) + '.txt', bytes: Buffer.from('x') }]);
      expect(() => readZip(tooLong, LIMITS)).toThrow(/at most 1,024 bytes/);
    });

    test('the length is in UTF-8 bytes, not characters', async () => {
      const archive = await packZip([{ path: 'é'.repeat(600), bytes: Buffer.from('x') }]);   // 600 characters, 1,200 bytes
      expect(() => readZip(archive, LIMITS)).toThrow(/at most 1,024 bytes/);
    });

    test('each member is charged its path as well as its size', async () => {
      const archive = await packZip([{ path: 'folder/note.txt', bytes: Buffer.alloc(10, 'x') }]);
      const budget = { remaining: 1000 };
      readZip(archive, LIMITS, budget);
      expect(budget.remaining).toBe(1000 - 10 - 'folder/note.txt'.length);
    });

    test('the name of the archive that holds it is charged too, with the separator', async () => {
      const archive = await packZip([{ path: 'note.txt', bytes: Buffer.alloc(10, 'x') }]);
      const budget = { remaining: 1000 };
      readZip(archive, LIMITS, budget, undefined, 20);
      expect(budget.remaining).toBe(1000 - 10 - 'note.txt'.length - 20 - 1);
    });

    test('a member left out for its size is charged its path too', async () => {
      const archive = await packZip([{ path: 'big.bin', bytes: Buffer.alloc(100) }]);
      const budget = { remaining: 1000 };
      readZip(archive, { ...LIMITS, maxFileBytes: 10 }, budget, []);
      expect(budget.remaining).toBe(1000 - 'big.bin'.length);
    });

    test('an archive written with data descriptors still reads through the range check', async () => {
      const archive = await pythonZip([['a.txt', Buffer.from('one '.repeat(100))], ['b.bin', BINARY], ['c.txt', Buffer.from('three')]], { stream: true });
      expect(archive.readUInt16LE(6) & 0x0008).toBe(0x0008);
      expect(readZip(archive, LIMITS).map(e => e.path)).toEqual(['a.txt', 'b.bin', 'c.txt']);
    });

    test('an archive with a comment after the directory still reads through the range check', async () => {
      const archive = await packZip([{ path: 'a.txt', bytes: Buffer.from('one') }, { path: 'b.txt', bytes: Buffer.from('two') }]);
      const comment = Buffer.from('made by a test');
      archive.writeUInt16LE(comment.length, archive.length - 2);
      expect(readZip(Buffer.concat([archive, comment]), LIMITS).map(e => e.path)).toEqual(['a.txt', 'b.txt']);
    });
  });

  describe('one budget for the unpacked size', () => {
    /** A zip of one member of random bytes, so its stored size is about its real size. */
    const randomZip = (name: string, size: number): Promise<Buffer> => packZip([{ path: name, bytes: randomBytes(size) }]);

    test('a budget passed in is spent by what each archive unpacks to, and shared across archives', async () => {
      const budget = { remaining: 1000 };
      readZip(await randomZip('a', 600), LIMITS, budget);
      expect(budget.remaining).toBe(400 - 1);   // the size, and the one byte of the path

      const second = await randomZip('b', 600);
      expect(() => readZip(second, LIMITS, budget)).toThrow(ZipBudgetError);
      expect(() => readZip(second, LIMITS, budget)).toThrow(/in all/);
    });

    test('a member whose declared size is over what is left is refused before it is inflated', async () => {
      const archive = await packZip([{ path: 'x.bin', bytes: Buffer.alloc(100) }]);
      const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      archive.writeUInt32LE(5000, central + 24);   // declares 5000 bytes; the data holds 100

      // Inflating first would end in "does not match its declared size"; the budget answers first.
      expect(() => readZip(archive, LIMITS, { remaining: 1000 })).toThrow(/in all/);
    });

    test('a member whose declared size is over the per-file cap is left out, not inflated', async () => {
      const archive = await packZip([{ path: 'small.txt', bytes: Buffer.from('ok') }, { path: 'big.bin', bytes: Buffer.alloc(100) }]);
      const central = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      archive.writeUInt32LE(5000, central + 24);   // declares 5000 bytes; the data holds 100

      const budget = { remaining: 100_000 };
      const skipped: Array<{ path: string; size: number }> = [];
      const entries = readZip(archive, { ...LIMITS, maxFileBytes: 1000 }, budget, skipped);

      expect(entries.map(e => e.path)).toEqual(['small.txt']);
      expect(skipped).toEqual([{ path: 'big.bin', size: 5000 }]);
      expect(budget.remaining).toBe(100_000 - 2 - 'small.txt'.length - 'big.bin'.length);
    });

    test('a member that understates its size still stops at what it declared, and its stated size is charged', async () => {
      const archive = await packZip([{ path: 'bomb.bin', bytes: Buffer.alloc(20 * 1024 * 1024) }]);
      const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      archive.writeUInt32LE(100, central + 24);

      const budget = { remaining: 1_000_000 };
      expect(() => readZip(archive, { ...LIMITS, maxFileBytes: 1000 }, budget, [])).toThrow(/more than it declares/);
      expect(budget.remaining).toBe(1_000_000 - 100 - 'bomb.bin'.length);
    });

    test('a member that fails its CRC is still charged its stated size', async () => {
      const archive = await randomZip('a.bin', 600);
      archive[30 + 'a.bin'.length] ^= 0xff;   // stored, so the data is still a valid stream

      const budget = { remaining: 1000 };
      expect(() => readZip(archive, LIMITS, budget)).toThrow(/CRC/);
      expect(budget.remaining).toBe(400 - 'a.bin'.length);
    });

    test('the stated size is charged before unpacking, so a failed member counts against the next archive', async () => {
      const bad = await randomZip('a.bin', 600);
      bad[30 + 'a.bin'.length] ^= 0xff;
      const budget = { remaining: 1000 };
      expect(() => readZip(bad, LIMITS, budget)).toThrow(/CRC/);

      const next = await randomZip('b.bin', 600);
      expect(() => readZip(next, LIMITS, budget)).toThrow(ZipBudgetError);
    });

    test('without a budget argument an archive gets maxTotalBytes of its own, as before', async () => {
      const archive = await randomZip('a', 600);
      expect(readZip(archive, { maxEntries: 10, maxTotalBytes: 1000 })).toHaveLength(1);
      expect(readZip(archive, { maxEntries: 10, maxTotalBytes: 1000 })).toHaveLength(1);
    });
  });

  test('more members than allowed is refused', async () => {
    const archive = await pythonZip([['a', Buffer.from('1')], ['b', Buffer.from('2')], ['c', Buffer.from('3')]]);

    expect(() => readZip(archive, { maxEntries: 2, maxTotalBytes: 1024 })).toThrow(/members/);
  });

  test('a corrupted member fails its CRC rather than importing damaged bytes', async () => {
    // Stored, not deflated, so one flipped byte is still a valid stream.
    const archive = await packZip([{ path: 'a.bin', bytes: BINARY }]);
    const dataStart = 30 + 'a.bin'.length;
    archive[dataStart] ^= 0xff;

    expect(() => readZip(archive, LIMITS)).toThrow(/CRC/);
  });

  test('an encrypted member is refused, not read as garbage', async () => {
    const archive = await packZip([{ path: 'a.md', bytes: Buffer.from('x') }]);
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt16LE(archive.readUInt16LE(central + 8) | 0x0001, central + 8);

    expect(() => readZip(archive, LIMITS)).toThrow(/encrypted/);
  });

  test('something that is not a zip says so', () => {
    expect(() => readZip(Buffer.from('not an archive at all'), LIMITS)).toThrow(/not a zip/);
  });
});
