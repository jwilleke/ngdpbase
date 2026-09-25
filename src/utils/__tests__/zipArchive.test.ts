/**
 * The zip writer (#1387), checked against an independent implementation.
 *
 * A takeout lands on someone's laptop or phone and has to open by tapping it,
 * so "it extracts with a real tool" is the property under test — not whether
 * the headers match what this file believes about them. Every test writes the
 * archive, extracts it, and compares the bytes that come out.
 *
 * The extractor is Python's `zipfile`; see `extract()` for why it is not the
 * `unzip` binary.
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { packZip, readZip, crc32, type ZipEntry } from '../zipArchive';

const run = promisify(execFile);

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
 * test oracle that cannot read a correct archive is no oracle. `unzip -t` is
 * still used below for integrity, where its age does not matter.
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

describe('packZip — verified by extracting with the system unzip (#1387)', () => {
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

  test('unzip -t reports no errors, so the CRCs and the directory agree', async () => {
    const archive = await packZip([
      { path: 'a.md', bytes: Buffer.from('alpha') },
      { path: 'b/b.bin', bytes: BINARY }
    ]);
    const archivePath = path.join(dir, 'check.zip');
    await fs.writeFile(archivePath, archive);

    const { stdout } = await run('unzip', ['-t', archivePath]);
    expect(stdout).toMatch(/No errors detected/i);
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

    expect(() => readZip(archive, { maxEntries: 10, maxTotalBytes: 1024 * 1024 })).toThrow(/allowed/);
  });

  test('a member that understates its size is stopped at what it declared', async () => {
    const archive = await packZip([{ path: 'bomb.bin', bytes: Buffer.alloc(20 * 1024 * 1024) }]);
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt32LE(100, central + 24);  // claims 100 bytes uncompressed

    expect(() => readZip(archive, LIMITS)).toThrow(/more than it declares/);
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
