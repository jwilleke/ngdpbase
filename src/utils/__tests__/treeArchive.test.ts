/**
 * #1876 — a folder of a site's files as a `.tar` beside the backup document:
 * bytes as stored, streamed both ways, and an archive's paths treated as data.
 * Each test works in its own temp directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { create as createTar } from 'tar';
import { extractTreeArchive, writeTreeArchive } from '../treeArchive';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-tree-archive-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('writeTreeArchive / extractTreeArchive (#1876)', () => {
  test('bytes no text encoding survives come back unchanged, with the folder shape', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'a', 'b'), { recursive: true });
    const bytes = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28]);
    fs.writeFileSync(path.join(src, 'a', 'b', 'x.bin'), bytes);
    fs.writeFileSync(path.join(src, 'top.json'), '{}');
    const archive = path.join(dir, 'out.tar');
    expect(await writeTreeArchive(archive, src)).toEqual({ files: 2, bytes: bytes.length + 2, skipped: [], vanished: [] });
    expect(fs.statSync(archive).mode & 0o077).toBe(0);
    const dest = path.join(dir, 'dest');
    expect(await extractTreeArchive(archive, dest)).toEqual({ files: 2, bytes: bytes.length + 2 });
    expect(fs.readFileSync(path.join(dest, 'a', 'b', 'x.bin')).equals(bytes)).toBe(true);
  });

  test('a folder that is not there is an empty archive, which extracts to an empty folder', async () => {
    const archive = path.join(dir, 'empty.tar');
    expect(await writeTreeArchive(archive, path.join(dir, 'missing'))).toEqual({ files: 0, bytes: 0, skipped: [], vanished: [] });
    const dest = path.join(dir, 'dest');
    await extractTreeArchive(archive, dest);
    expect(fs.readdirSync(dest)).toEqual([]);
  });

  test('a symbolic link is left out of a backup and named, never followed', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'real.txt'), 'real');
    fs.symlinkSync('/etc/hosts', path.join(src, 'link'));
    const outcome = await writeTreeArchive(path.join(dir, 'out.tar'), src);
    expect(outcome.skipped).toEqual(['link']);
    expect(outcome.files).toBe(1);
  });

  test('#1563: a folder deleted while the archive is written is skipped and named, not a failure', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'gone'), { recursive: true });
    fs.writeFileSync(path.join(src, 'kept.txt'), 'kept');
    fs.writeFileSync(path.join(src, 'gone', 'page.md'), 'deleted mid-backup');
    let deleted = false;
    // The tar walk calls `exclude` on each entry once it has been listed and stat'ed: the
    // first one it reaches deletes the folder, as a page delete would while the site is backed up.
    const exclude = (rel: string): boolean => {
      if (!deleted && rel === 'kept.txt' && fs.existsSync(path.join(src, 'gone'))) {
        fs.rmSync(path.join(src, 'gone'), { recursive: true });
        deleted = true;
      }
      return false;
    };
    const archive = path.join(dir, 'out.tar');
    const outcome = await writeTreeArchive(archive, src, { exclude });
    expect(deleted).toBe(true);
    expect(outcome).toMatchObject({ files: 1, skipped: [] });
    expect(outcome.vanished.length).toBe(1);
    expect(outcome.vanished[0]).toMatch(/^gone/);
    const dest = path.join(dir, 'dest');
    await extractTreeArchive(archive, dest);
    expect(fs.readdirSync(dest)).toEqual(['kept.txt']);
  });

  test('#1563: a file that can not be read (EACCES) still fails the archive, and leaves nothing behind', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'locked'), { recursive: true });
    fs.writeFileSync(path.join(src, 'locked', 'page.md'), 'x');
    fs.chmodSync(path.join(src, 'locked'), 0o000);
    const archive = path.join(dir, 'out.tar');
    try {
      await expect(writeTreeArchive(archive, src)).rejects.toMatchObject({ code: 'EACCES' });
      expect(fs.existsSync(archive)).toBe(false);
    } finally {
      fs.chmodSync(path.join(src, 'locked'), 0o700);
    }
  });

  test('a backup never overwrites an archive', async () => {
    const archive = path.join(dir, 'out.tar');
    fs.writeFileSync(archive, 'already here');
    await expect(writeTreeArchive(archive, dir)).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(archive, 'utf8')).toBe('already here');
  });

  test('an archive entry that climbs out of its folder is refused, and nothing is written', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'evil.txt'), 'x');
    const archive = path.join(dir, 'evil.tar');
    await createTar({ file: archive, cwd: src, portable: true, prefix: '../../' }, ['evil.txt']);
    const dest = path.join(dir, 'deep', 'dest');
    await expect(extractTreeArchive(archive, dest)).rejects.toThrow(/could not be read/);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(path.join(dir, 'evil.txt'))).toBe(false);
  });

  test('an archive holding a symbolic link is refused', async () => {
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.symlinkSync('/etc/hosts', path.join(src, 'link'));
    const archive = path.join(dir, 'link.tar');
    await createTar({ file: archive, cwd: src, portable: true }, ['link']);
    const dest = path.join(dir, 'dest');
    await expect(extractTreeArchive(archive, dest)).rejects.toThrow(/not files or folders: link \(SymbolicLink\)/);
    expect(fs.existsSync(dest)).toBe(false);
  });

  test('a large file streams through in bounded reads: it is never read whole', async () => {
    const SIZE = 96 * 1024 * 1024;
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    const big = path.join(src, 'big.bin');
    // Written in pieces, so the test itself never holds it either.
    const fd = fs.openSync(big, 'w');
    const chunk = Buffer.alloc(1024 * 1024, 0xab);
    for (let i = 0; i < SIZE / chunk.length; i++) fs.writeSync(fd, chunk);
    fs.closeSync(fd);

    // Every read the archive makes, both ways. A whole-file read — readFile,
    // or one read the size of the file — would show here.
    const reads: number[] = [];
    const original = fs.read;
    const read = vi.spyOn(fs, 'read').mockImplementation(((...args: unknown[]) => {
      reads.push(Number(args[3]));
      return Reflect.apply(original, fs, args) as unknown;
    }));
    const readFile = vi.spyOn(fs, 'readFile');
    const readFileSync = vi.spyOn(fs, 'readFileSync');
    try {
      const archive = path.join(dir, 'big.tar');
      expect((await writeTreeArchive(archive, src)).bytes).toBe(SIZE);
      const written = reads.length;
      const dest = path.join(dir, 'dest');
      expect((await extractTreeArchive(archive, dest)).bytes).toBe(SIZE);
      expect(fs.statSync(path.join(dest, 'big.bin')).size).toBe(SIZE);
      expect(written).toBeGreaterThan(2);
      expect(reads.length - written).toBeGreaterThan(2);
      expect(Math.max(...reads)).toBeLessThanOrEqual(16 * 1024 * 1024);
      expect(readFile).not.toHaveBeenCalled();
      expect(readFileSync).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      readFile.mockRestore();
      readFileSync.mockRestore();
    }
  }, 60_000);
});
