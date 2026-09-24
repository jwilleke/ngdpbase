/**
 * Reading a private store back out (#1387).
 *
 * The property that matters is byte fidelity. A sealed store's pages are
 * ciphertext, and the existing provider backup reads pages with an encoding —
 * which silently replaces every byte that is not valid UTF-8 with U+FFFD. A
 * file mangled that way still looks like a file in the backup and never
 * decrypts again, so the test below writes bytes that are NOT valid UTF-8 and
 * insists they come back identical.
 */

import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import {
  collectStore,
  collectUser,
  listStoreIds,
  listPrivateOwners
} from '../privateStoreTakeout';

let pagesDir: string;

/** Bytes that are not valid UTF-8 — what a sealed page actually looks like. */
const CIPHERTEXT = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01, 0x92, 0xc3, 0x28]);

beforeEach(async () => {
  // mkdtemp, never the live data directory.
  pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-takeout-'));
  const vault = path.join(pagesDir, 'private', 'molly', 'vault');
  await fs.ensureDir(path.join(vault, 'versions', 'uuid-1'));
  await fs.ensureDir(path.join(vault, 'attachments'));
  await fs.ensureDir(path.join(vault, 'deleted'));

  await fs.writeFile(path.join(vault, 'uuid-1.md'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'versions', 'uuid-1', '1.md'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'deleted', 'uuid-2.md'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'attachments', 'photo.jpg'), CIPHERTEXT);
  await fs.writeJson(path.join(vault, 'store.json'), { kind: 'vault', encrypt: true });
  await fs.writeFile(path.join(vault, 'pages-index.json'), CIPHERTEXT);

  await fs.writeJson(path.join(pagesDir, 'private', 'molly', 'user-keys.json'), { wrapped: 'xxx' });
  await fs.ensureDir(path.join(pagesDir, 'private', 'molly', 'default'));
  await fs.writeFile(path.join(pagesDir, 'private', 'molly', 'default', 'uuid-3.md'), '# plain\n');
});

afterEach(async () => {
  // Only the directory this test made.
  if (pagesDir) await fs.remove(pagesDir);
});

describe('collectStore (#1387)', () => {
  test('a sealed page survives byte for byte — the whole point', async () => {
    const takeout = await collectStore(pagesDir, 'molly', 'vault');
    const page = takeout.files.find(f => f.path === 'uuid-1.md');

    expect(page).toBeDefined();
    expect(Buffer.compare(page!.bytes, CIPHERTEXT)).toBe(0);
    expect(page!.bytes.length).toBe(CIPHERTEXT.length);

    // And this is the damage being avoided: had the file been read as text and
    // written back, as the provider's own backup does, the bytes would differ.
    const throughUtf8 = Buffer.from(CIPHERTEXT.toString('utf8'), 'utf8');
    expect(Buffer.compare(throughUtf8, CIPHERTEXT)).not.toBe(0);
  });

  test('it carries the whole store — pages, history, trash, attachments, indexes', async () => {
    const takeout = await collectStore(pagesDir, 'molly', 'vault');

    expect(takeout.files.map(f => f.path).sort()).toEqual([
      'attachments/photo.jpg',
      'deleted/uuid-2.md',
      'pages-index.json',
      'store.json',
      'uuid-1.md',
      'versions/uuid-1/1.md'
    ]);
  });

  test('paths are `/`-separated whatever the platform', async () => {
    const takeout = await collectStore(pagesDir, 'molly', 'vault');
    expect(takeout.files.every(f => !f.path.includes('\\'))).toBe(true);
  });

  test('it reports its size, so a caller can refuse an unreasonable one', async () => {
    const takeout = await collectStore(pagesDir, 'molly', 'vault');
    const summed = takeout.files.reduce((n, f) => n + f.bytes.length, 0);
    expect(takeout.totalBytes).toBe(summed);
    expect(takeout.totalBytes).toBeGreaterThan(0);
  });

  test('a store that does not exist is empty, not an error', async () => {
    const takeout = await collectStore(pagesDir, 'molly', 'no-such-store');
    expect(takeout.files).toEqual([]);
    expect(takeout.totalBytes).toBe(0);
  });

  test('a user who does not exist is empty, not an error', async () => {
    const takeout = await collectStore(pagesDir, 'nobody', 'vault');
    expect(takeout.files).toEqual([]);
  });
});

describe('collectUser (#1387)', () => {
  test('every store the user has, plus the user-level files beside them', async () => {
    const user = await collectUser(pagesDir, 'molly');

    expect(user.stores.map(s => s.store).sort()).toEqual(['default', 'vault']);
    expect(user.userFiles.map(f => f.path)).toEqual(['user-keys.json']);
  });

  test('the wrapped key travels with the data — without it a restore is unopenable', async () => {
    // Deliberate: user-keys.json is a WRAPPED key. Leaving it out of a backup
    // would mean a restored sealed store could never be opened by anyone,
    // including its owner. Carrying it makes nobody a keyholder.
    const user = await collectUser(pagesDir, 'molly');
    expect(user.userFiles.some(f => f.path === 'user-keys.json')).toBe(true);
  });

  test('a store directory is not mistaken for a user-level file', async () => {
    const user = await collectUser(pagesDir, 'molly');
    expect(user.userFiles.map(f => f.path)).not.toContain('vault');
    expect(user.userFiles.map(f => f.path)).not.toContain('default');
  });

  test('the total covers the user files and every store', async () => {
    const user = await collectUser(pagesDir, 'molly');
    const expected =
      user.userFiles.reduce((n, f) => n + f.bytes.length, 0) +
      user.stores.reduce((n, s) => n + s.totalBytes, 0);
    expect(user.totalBytes).toBe(expected);
  });

  test('a user with nothing private yields nothing, and does not throw', async () => {
    const user = await collectUser(pagesDir, 'ghost');
    expect(user.stores).toEqual([]);
    expect(user.userFiles).toEqual([]);
    expect(user.totalBytes).toBe(0);
  });
});

describe('listing what is on disk (#1387)', () => {
  test('the owners with a private directory', async () => {
    expect(await listPrivateOwners(pagesDir)).toEqual(['molly']);
  });

  test('the stores one owner has', async () => {
    expect((await listStoreIds(pagesDir, 'molly')).sort()).toEqual(['default', 'vault']);
  });

  test('a user-level FILE is not listed as a store', async () => {
    expect(await listStoreIds(pagesDir, 'molly')).not.toContain('user-keys.json');
  });

  test('no private root at all lists nobody, rather than throwing', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-takeout-empty-'));
    try {
      expect(await listPrivateOwners(empty)).toEqual([]);
    } finally {
      await fs.remove(empty);
    }
  });
});
