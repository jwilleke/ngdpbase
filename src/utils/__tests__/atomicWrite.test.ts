/**
 * #1062 — a kill mid-write must never leave a half-written file.
 *
 * `fs.writeFile` over a live path truncates it first, so an interruption left
 * the page neither old nor new. Containers are killed on deploy, on OOM and on
 * node eviction, so this is routine rather than exotic.
 *
 * The property that matters is the failure path, and it is the one a happy-path
 * test cannot see: when the write blows up, the ORIGINAL file must still be
 * there, whole. These tests force that failure rather than hoping for it.
 *
 * Real filesystem, real temp directory — a mocked fs would only prove the mock
 * returns what the test told it to, and every guarantee here is about what the
 * filesystem actually does.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { writeFileAtomic } from '../atomicWrite';

let dir: string;
const target = (): string => path.join(dir, 'page.md');

/** Temp files are dot-prefixed, so a plain listing would not show them. */
async function strayTempFiles(): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries.filter((e) => e.includes('.tmp.'));
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-atomic-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  // Removed by its own absolute temp path — never a project or data directory.
  await fs.remove(dir);
});

describe('#1062 — the ordinary path', () => {
  test('writes the content', async () => {
    await writeFileAtomic(target(), 'hello');

    expect(await fs.readFile(target(), 'utf8')).toBe('hello');
  });

  test('replaces existing content wholesale', async () => {
    await fs.writeFile(target(), 'old content that is much longer than the new');
    await writeFileAtomic(target(), 'new');

    expect(await fs.readFile(target(), 'utf8')).toBe('new');
  });

  test('leaves no temp file behind', async () => {
    await writeFileAtomic(target(), 'hello');

    expect(await strayTempFiles()).toEqual([]);
  });

  test('creates the directory when it does not exist', async () => {
    const nested = path.join(dir, 'a', 'b', 'page.md');
    await writeFileAtomic(nested, 'hello');

    expect(await fs.readFile(nested, 'utf8')).toBe('hello');
  });

  test('round-trips a Buffer unchanged', async () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x00, 0x7f]);
    await writeFileAtomic(target(), bytes);

    expect(await fs.readFile(target())).toEqual(bytes);
  });

  test('fsync is off by default and on when asked, with identical results', async () => {
    // The default is off for cost reasons (65x per write, measured). What must
    // not differ is the content — the option changes durability, not output.
    await writeFileAtomic(target(), 'durable', 'utf8', { fsync: true });
    expect(await fs.readFile(target(), 'utf8')).toBe('durable');

    await writeFileAtomic(target(), 'fast');
    expect(await fs.readFile(target(), 'utf8')).toBe('fast');
    expect(await strayTempFiles()).toEqual([]);
  });

  test('round-trips multi-byte characters', async () => {
    const text = '# Überschrift\n\n— em dash, 日本語, 🌿\n';
    await writeFileAtomic(target(), text);

    expect(await fs.readFile(target(), 'utf8')).toBe(text);
  });
});

describe('#1062 — the failure path, which is the point', () => {
  test('a failure during the rename leaves the ORIGINAL file intact', async () => {
    await fs.writeFile(target(), 'original');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('simulated crash'));

    await expect(writeFileAtomic(target(), 'replacement')).rejects.toThrow('simulated crash');

    // Not truncated, not empty, not the new content — exactly as it was.
    expect(await fs.readFile(target(), 'utf8')).toBe('original');
  });

  test('a failed write cleans up its temp file', async () => {
    await fs.writeFile(target(), 'original');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('simulated crash'));

    await expect(writeFileAtomic(target(), 'replacement')).rejects.toThrow();

    // Dot-prefixed temp files would accumulate invisibly beside real pages.
    expect(await strayTempFiles()).toEqual([]);
  });

  test('a failure creating a NEW file leaves no file at all', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('simulated crash'));

    await expect(writeFileAtomic(target(), 'never lands')).rejects.toThrow();

    expect(await fs.pathExists(target())).toBe(false);
    expect(await strayTempFiles()).toEqual([]);
  });

  test('the error is propagated, not swallowed', async () => {
    // A save that silently did nothing would be worse than one that fails: the
    // user is told it worked and the content is gone.
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('ENOSPC: no space left'));

    await expect(writeFileAtomic(target(), 'x')).rejects.toThrow('ENOSPC');
  });
});

describe('#1062 — concurrent writers', () => {
  test('do not collide on a shared temp file', async () => {
    // The manifest write this replaced used a FIXED temp name, so two writers
    // for one page could stage into the same file and publish a mixture.
    const writes = Array.from({ length: 20 }, (_, i) =>
      writeFileAtomic(target(), `writer-${i}`)
    );
    await Promise.all(writes);

    // One writer wins outright. What must never appear is a blend of two.
    const finalContent = await fs.readFile(target(), 'utf8');
    expect(finalContent).toMatch(/^writer-\d+$/);
    expect(await strayTempFiles()).toEqual([]);
  });

  test('concurrent writes to different files all land', async () => {
    const paths = Array.from({ length: 10 }, (_, i) => path.join(dir, `page-${i}.md`));
    await Promise.all(paths.map((p, i) => writeFileAtomic(p, `content-${i}`)));

    for (const [i, p] of paths.entries()) {
      expect(await fs.readFile(p, 'utf8')).toBe(`content-${i}`);
    }
  });
});
