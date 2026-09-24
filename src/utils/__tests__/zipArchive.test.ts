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
import { packZip, crc32, type ZipEntry } from '../zipArchive';

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
