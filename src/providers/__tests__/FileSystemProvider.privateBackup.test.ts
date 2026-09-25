/**
 * Private stores in an instance backup (#1387).
 *
 * Until this, `backup()` contained no private store at all: `walkDir` skips
 * the private root (#1456, so private pages stay out of shared indexes), and
 * nothing else looked there. A disk failure lost every sealed store, and the
 * loss surfaced at restore — the one moment it is too late.
 *
 * The property under test is a ROUND TRIP of bytes. A sealed page is
 * ciphertext, and `pages` above it holds decoded text; anything that treats a
 * private file as text leaves a file that still looks like a file and never
 * decrypts again. So the tests write bytes that are deliberately not valid
 * UTF-8, back up, restore into an empty directory, and compare.
 */

vi.unmock('../FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import FileSystemProvider from '../FileSystemProvider';

/** Bytes no encoding survives — what a sealed store's pages look like. */
const CIPHERTEXT = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01, 0x92, 0xc3, 0x28, 0x7f]);

let tmp: string;
let pagesDir: string;
let requiredDir: string;

function makeProvider(dir: string, required: string): FileSystemProvider {
  const engine = {
    getManager: (name: string) =>
      name === 'ConfigurationManager'
        ? {
          getProperty: (_k: string, d: unknown) => d,
          getResolvedDataPath: (key: string, d: unknown) => {
            if (key === 'ngdpbase.page.provider.filesystem.storagedir') return dir;
            if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return required;
            return d;
          }
        }
        : null
  };
  const provider = new FileSystemProvider(engine);
  (provider as unknown as { pagesDirectory: string }).pagesDirectory = dir;
  (provider as unknown as { requiredPagesDirectory: string }).requiredPagesDirectory = required;
  (provider as unknown as { encoding: string }).encoding = 'utf8';
  return provider;
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-private-backup-'));
  pagesDir = path.join(tmp, 'pages');
  requiredDir = path.join(tmp, 'required-pages');
  await fs.ensureDir(pagesDir);
  await fs.ensureDir(requiredDir);

  // A public page, so the backup is not private-only.
  await fs.writeFile(path.join(pagesDir, 'public-1.md'), '---\ntitle: Public\n---\n\nHello\n');

  // A sealed store, its history, its trash, its indexes and the wrapped key.
  const vault = path.join(pagesDir, 'private', 'molly', 'vault');
  await fs.ensureDir(path.join(vault, 'versions', 'uuid-1'));
  await fs.ensureDir(path.join(vault, 'attachments'));
  await fs.writeFile(path.join(vault, 'uuid-1.md'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'versions', 'uuid-1', '1.md'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'attachments', 'abc-123.pdf'), CIPHERTEXT);
  await fs.writeFile(path.join(vault, 'pages-index.json'), CIPHERTEXT);
  await fs.writeJson(path.join(vault, 'store.json'), { kind: 'vault', encrypt: true });
  await fs.writeJson(path.join(pagesDir, 'private', 'molly', 'user-keys.json'), { wrapped: 'xxx' });
});

afterEach(async () => {
  if (tmp) await fs.remove(tmp);
});

describe('backup() carries the private tree (#1387)', () => {
  test('a sealed page is in the backup, as the bytes it is on disk', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();

    const entry = backup.privateFiles?.find(f => f.relativePath === 'private/molly/vault/uuid-1.md');
    expect(entry).toBeDefined();
    expect(Buffer.compare(Buffer.from(entry!.base64, 'base64'), CIPHERTEXT)).toBe(0);
  });

  test('the whole store travels — history, attachments, indexes and the wrapped key', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();
    const paths = (backup.privateFiles ?? []).map(f => f.relativePath).sort();

    expect(paths).toEqual([
      'private/molly/user-keys.json',
      'private/molly/vault/attachments/abc-123.pdf',
      'private/molly/vault/pages-index.json',
      'private/molly/vault/store.json',
      'private/molly/vault/uuid-1.md',
      'private/molly/vault/versions/uuid-1/1.md'
    ]);
  });

  test('a private page never leaks into `pages`, which holds decoded text', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();

    expect(backup.pages.some(p => p.relativePath.includes('private'))).toBe(false);
    expect(backup.pages.map(p => p.relativePath)).toContain('public-1.md');
  });

  test('an instance with no private store carries none, and does not fail', async () => {
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-nopriv-'));
    try {
      await fs.writeFile(path.join(bare, 'p.md'), '# hi');
      const backup = await makeProvider(bare, requiredDir).backup();
      expect(backup.privateFiles).toBeUndefined();
      expect(backup.privateOmitted).toBeUndefined();
    } finally {
      await fs.remove(bare);
    }
  });
});

describe('restore() puts the private tree back (#1387)', () => {
  test('a sealed page round-trips byte for byte into an empty instance', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();

    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-restore-'));
    try {
      const target = path.join(fresh, 'pages');
      await fs.ensureDir(target);
      await makeProvider(target, requiredDir).restore(backup);

      const restored = await fs.readFile(path.join(target, 'private', 'molly', 'vault', 'uuid-1.md'));
      expect(Buffer.compare(restored, CIPHERTEXT)).toBe(0);
    } finally {
      await fs.remove(fresh);
    }
  });

  test('the wrapped key comes back, or the restored store could never be opened', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();

    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-restore-keys-'));
    try {
      const target = path.join(fresh, 'pages');
      await fs.ensureDir(target);
      await makeProvider(target, requiredDir).restore(backup);

      expect(await fs.readJson(path.join(target, 'private', 'molly', 'user-keys.json')))
        .toEqual({ wrapped: 'xxx' });
    } finally {
      await fs.remove(fresh);
    }
  });

  test('a relative path that climbs out of the pages directory is refused', async () => {
    // A backup file is the operator's own, but a path inside it is still data.
    const backup = await makeProvider(pagesDir, requiredDir).backup();
    backup.privateFiles = [
      { relativePath: '../escaped.md', base64: Buffer.from('nope').toString('base64'), size: 4, mtime: new Date().toISOString() }
    ];

    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-restore-escape-'));
    try {
      const target = path.join(fresh, 'pages');
      await fs.ensureDir(target);
      await makeProvider(target, requiredDir).restore(backup);

      expect(await fs.pathExists(path.join(fresh, 'escaped.md'))).toBe(false);
    } finally {
      await fs.remove(fresh);
    }
  });

  test('a backup that carried no private stores says so, rather than restoring silence', async () => {
    const backup = await makeProvider(pagesDir, requiredDir).backup();
    delete backup.privateFiles;
    backup.privateOmitted = { reason: 'too large', bytes: 999, files: 3 };

    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-restore-omitted-'));
    try {
      const target = path.join(fresh, 'pages');
      await fs.ensureDir(target);
      // The point is that it completes and warns rather than appearing to work.
      await expect(makeProvider(target, requiredDir).restore(backup)).resolves.toBeUndefined();
      expect(await fs.pathExists(path.join(target, 'private'))).toBe(false);
    } finally {
      await fs.remove(fresh);
    }
  });
});
