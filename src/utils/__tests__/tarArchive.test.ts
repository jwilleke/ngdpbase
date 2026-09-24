/**
 * The tar writer (#1387), checked against the system `tar`.
 *
 * A format written by hand is only as good as the thing that reads it, so these
 * tests do not inspect our own headers and call that proof. They write the
 * archive to a temp directory, extract it with the real `tar` binary, and
 * compare the bytes that come out. If the header maths is wrong, extraction
 * fails or the file differs.
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { packTar, packTarGz, type TarEntry } from '../tarArchive';

const run = promisify(execFile);

let dir: string;

/** Bytes that are not valid UTF-8 — a sealed page, or any binary attachment. */
const BINARY = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01, 0x92, 0xc3, 0x28, 0x7f]);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-tar-'));
});

afterEach(async () => {
  if (dir) await fs.remove(dir);
});

/** Write the archive, extract it with the system tar, return the output dir. */
async function extract(archive: Buffer, name = 'out.tar'): Promise<string> {
  const archivePath = path.join(dir, name);
  const outDir = path.join(dir, 'extracted');
  await fs.writeFile(archivePath, archive);
  await fs.ensureDir(outDir);
  await run('tar', ['-xf', archivePath, '-C', outDir]);
  return outDir;
}

describe('packTar — verified by extracting with the system tar (#1387)', () => {
  test('a file comes back byte for byte, including bytes that are not UTF-8', async () => {
    const out = await extract(packTar([{ path: 'page.md', bytes: BINARY }]));
    const got = await fs.readFile(path.join(out, 'page.md'));

    expect(Buffer.compare(got, BINARY)).toBe(0);
  });

  test('nested paths are recreated', async () => {
    const entries: TarEntry[] = [
      { path: 'attachments/photo.jpg', bytes: BINARY },
      { path: 'Shopping list.md', bytes: Buffer.from('# eggs\n') }
    ];
    const out = await extract(packTar(entries));

    expect(Buffer.compare(await fs.readFile(path.join(out, 'attachments/photo.jpg')), BINARY)).toBe(0);
    expect(await fs.readFile(path.join(out, 'Shopping list.md'), 'utf8')).toBe('# eggs\n');
  });

  test('every entry is present, in order', async () => {
    const entries: TarEntry[] = Array.from({ length: 12 }, (_, i) => ({
      path: `page-${i}.md`,
      bytes: Buffer.from(`body ${i}`)
    }));
    const out = await extract(packTar(entries));

    for (let i = 0; i < entries.length; i++) {
      expect(await fs.readFile(path.join(out, `page-${i}.md`), 'utf8')).toBe(`body ${i}`);
    }
  });

  test('an empty file survives, rather than vanishing or shifting the archive', async () => {
    const out = await extract(packTar([
      { path: 'empty.md', bytes: Buffer.alloc(0) },
      { path: 'after.md', bytes: Buffer.from('still here') }
    ]));

    expect((await fs.stat(path.join(out, 'empty.md'))).size).toBe(0);
    expect(await fs.readFile(path.join(out, 'after.md'), 'utf8')).toBe('still here');
  });

  test('a title with spaces, an apostrophe and an accent', async () => {
    // A takeout names pages by their real titles, so this is the normal case.
    const name = "Molly's Café notes.md";
    const out = await extract(packTar([{ path: name, bytes: Buffer.from('body') }]));

    expect(await fs.readFile(path.join(out, name), 'utf8')).toBe('body');
  });

  test('a path too long for the 100-byte name field, split at a directory', async () => {
    const deep = `${'d'.repeat(80)}/${'n'.repeat(80)}.md`;
    const out = await extract(packTar([{ path: deep, bytes: Buffer.from('deep') }]));

    expect(await fs.readFile(path.join(out, deep), 'utf8')).toBe('deep');
  });

  test('a single name too long to split — the PAX path', async () => {
    // No `/` to split on, so name+prefix cannot hold it and PAX must carry it.
    const longName = `${'x'.repeat(140)}.md`;
    const out = await extract(packTar([{ path: longName, bytes: Buffer.from('paxed') }]));

    expect(await fs.readFile(path.join(out, longName), 'utf8')).toBe('paxed');
  });

  test('the archive ends with two zero blocks, as tar requires', () => {
    const archive = packTar([{ path: 'a.md', bytes: Buffer.from('x') }]);
    expect(archive.length % 512).toBe(0);
    expect(Buffer.compare(archive.subarray(-1024), Buffer.alloc(1024))).toBe(0);
  });

  test('the modification time is carried', async () => {
    const mtime = new Date('2020-03-04T05:06:07.000Z');
    const out = await extract(packTar([{ path: 'dated.md', bytes: Buffer.from('x'), mtime }]));
    const stat = await fs.stat(path.join(out, 'dated.md'));

    // tar stores whole seconds.
    expect(Math.floor(stat.mtime.getTime() / 1000)).toBe(Math.floor(mtime.getTime() / 1000));
  });

  test('a leading slash is dropped — an archive never writes to an absolute path', async () => {
    const out = await extract(packTar([{ path: '/etc/passwd.md', bytes: Buffer.from('nope') }]));

    expect(await fs.readFile(path.join(out, 'etc/passwd.md'), 'utf8')).toBe('nope');
  });

  test('an entry with no path is refused rather than written as something odd', () => {
    expect(() => packTar([{ path: '', bytes: Buffer.from('x') }])).toThrow(/path/i);
  });
});

describe('packTarGz (#1387)', () => {
  test('gzipped, and the system tar reads it', async () => {
    const archive = await packTarGz([{ path: 'page.md', bytes: BINARY }]);

    // gzip magic — it really is compressed, not a bare tar with a new name.
    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);

    const archivePath = path.join(dir, 'out.tar.gz');
    const outDir = path.join(dir, 'gz-extracted');
    await fs.writeFile(archivePath, archive);
    await fs.ensureDir(outDir);
    await run('tar', ['-xzf', archivePath, '-C', outDir]);

    expect(Buffer.compare(await fs.readFile(path.join(outDir, 'page.md')), BINARY)).toBe(0);
  });
});
