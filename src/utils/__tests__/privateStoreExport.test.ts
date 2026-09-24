/**
 * A person's takeout of their own store (#1387).
 *
 * The tests that matter are about an ENCRYPTED store, because that is where a
 * takeout can be wrong in a way nobody notices: an archive of ciphertext looks
 * exactly like an archive, downloads exactly like one, and is discovered to be
 * unreadable long after the account it came from is gone. So a real sealed
 * store is built here — real keys, real wrapped DEK — and the assertions are
 * that the bytes on disk are sealed and the bytes in the takeout are not.
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  sealBytes,
  unwrapDek
} from '../privateStoreCrypto';
import { storeFileIndexPath, storeMetaPath, privateStoreRoot } from '../privateStorePath';
import {
  clearUnlockedPrivateStores,
  setUnlockedDek,
  unlockPrivateStores
} from '../privateStoreUnlock';
import { storeFileIO } from '../privateStoreFiles';
import { buildStoreTakeout } from '../privateStoreExport';
import type { ActorContext } from '../../context/ActorContext';

const STORE = 'vault';
const MOLLY = {
  username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'molly-sid'
} as ActorContext;
/** Molly, signed in, but her sealed store not unlocked in this session. */
const MOLLY_LOCKED = {
  username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'locked-sid'
} as ActorContext;

const page = (uuid: string, title: string, body: string) =>
  `---\ntitle: ${title}\nuuid: ${uuid}\nauthor: molly\nuser-keywords:\n  - private\n---\n\n${body}\n`;

let pagesDir: string;
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdp-export-'));
  pagesDir = path.join(tmp, 'pages');
  await fs.ensureDir(pagesDir);
  clearUnlockedPrivateStores();
});

afterEach(async () => {
  clearUnlockedPrivateStores();
  if (tmp) await fs.remove(tmp);
});

/** A PLAIN store with two pages, an attachment, history, trash and indexes. */
async function plainStore(): Promise<void> {
  const root = privateStoreRoot(pagesDir, 'molly', STORE);
  await fs.ensureDir(path.join(root, 'versions', 'uuid-1'));
  await fs.ensureDir(path.join(root, 'deleted'));
  await fs.ensureDir(path.join(root, 'attachments'));

  await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), { kind: 'vault', encrypt: false });
  await fs.writeFile(path.join(root, 'uuid-1.md'), page('uuid-1', "Molly's Recipes", 'Bread and soup.'));
  await fs.writeFile(path.join(root, 'uuid-2.md'), page('uuid-2', 'Shopping list', 'Eggs.'));

  // Everything a takeout must NOT carry.
  await fs.writeFile(path.join(root, 'versions', 'uuid-1', '1.md'), page('uuid-1', "Molly's Recipes", 'Older.'));
  await fs.writeFile(path.join(root, 'deleted', 'uuid-9.md'), page('uuid-9', 'Deleted page', 'Gone.'));
  await fs.writeJson(path.join(root, 'pages-index.json'), { version: 1, pages: {} });
  await fs.writeJson(path.join(root, 'search-index.json'), { version: 1 });
  await fs.writeJson(path.join(root, 'deleted-index.json'), { version: 1 });
  await fs.writeJson(path.join(pagesDir, 'private', 'molly', 'user-keys.json'), { wrapped: 'xxx' });

  // One attachment, stored under a uuid name, uploaded as something readable.
  await fs.writeFile(path.join(root, 'attachments', 'abc-123.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  await fs.writeJson(storeFileIndexPath(pagesDir, 'molly', STORE), {
    version: 1,
    files: {
      'abc-123': {
        id: 'abc-123', fileName: 'abc-123.jpg', name: 'kitchen photo.jpg',
        encodingFormat: 'image/jpeg', contentSize: 4, fingerprint: 'f', description: '',
        dateCreated: '2026-01-01T00:00:00.000Z', dateModified: '2026-01-01T00:00:00.000Z', mentions: []
      }
    }
  });
}

/** A SEALED store for molly, unlocked in her session, with one page and one file. */
async function sealedStore(): Promise<void> {
  const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
  const record = createEncryptedStore(kek);
  await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', STORE)));
  await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), record);
  unlockPrivateStores('molly-sid', 'molly', kek);
  setUnlockedDek('molly-sid', STORE, unwrapDek(kek, record));

  const io = await storeFileIO(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
  const root = privateStoreRoot(pagesDir, 'molly', STORE);
  await fs.ensureDir(path.join(root, 'attachments'));

  await io.writeText(path.join(root, 'uuid-1.md'), page('uuid-1', 'Medical notes', 'Cholesterol 180.'));
  await io.writeBytes(path.join(root, 'attachments', 'abc-123.pdf'), Buffer.from('%PDF-1.4 lab results'));
  await io.writeText(storeFileIndexPath(pagesDir, 'molly', STORE), JSON.stringify({
    version: 1,
    files: {
      'abc-123': {
        id: 'abc-123', fileName: 'abc-123.pdf', name: 'labs.pdf',
        encodingFormat: 'application/pdf', contentSize: 20, fingerprint: 'f', description: '',
        dateCreated: '2026-01-01T00:00:00.000Z', dateModified: '2026-01-01T00:00:00.000Z', mentions: []
      }
    }
  }));
}

const text = (t: { files: Array<{ path: string; bytes: Buffer }> }, p: string): string =>
  t.files.find(f => f.path === p).bytes.toString('utf8');

describe('buildStoreTakeout — an encrypted store (#1387)', () => {
  test('the takeout is DECRYPTED while the store on disk stays sealed', async () => {
    await sealedStore();

    const onDisk = await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', STORE), 'uuid-1.md'));
    expect(isSealedBytes(onDisk)).toBe(true);

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const body = text(takeout, `${STORE}/Medical notes.md`);

    expect(body).toContain('Cholesterol 180.');
    expect(body).toContain('title: Medical notes');
    expect(takeout.files.every(f => !isSealedBytes(f.bytes))).toBe(true);
  });

  test('an attachment comes out readable, under the name it was uploaded with', async () => {
    await sealedStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });

    expect(text(takeout, `${STORE}/attachments/labs.pdf`)).toContain('%PDF-1.4 lab results');
    expect(takeout.attachmentCount).toBe(1);
  });

  test('a LOCKED store refuses, rather than handing back an unreadable archive', async () => {
    await sealedStore();

    // Same person, a session that never unlocked the store.
    await expect(
      buildStoreTakeout(MOLLY_LOCKED, { pagesDirectory: pagesDir, owner: 'molly', store: STORE })
    ).rejects.toThrow();
  });
});

describe('buildStoreTakeout — what it carries (#1387)', () => {
  test('pages are named by their real titles, not their uuids', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const names = takeout.files.map(f => f.path).sort();

    expect(names).toContain(`${STORE}/Molly's Recipes.md`);
    expect(names).toContain(`${STORE}/Shopping list.md`);
    expect(names.some(n => n.includes('uuid-1'))).toBe(false);
  });

  test('full frontmatter is kept — uuid included, so a later import knows the page', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const body = text(takeout, `${STORE}/Shopping list.md`);

    expect(body).toContain('uuid: uuid-2');
    expect(body).toContain('author: molly');
    expect(body).toContain('title: Shopping list');
  });

  test('history, trash, indexes and the wrapped key are all left out', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const names = takeout.files.map(f => f.path);

    expect(names.some(n => n.includes('versions/'))).toBe(false);
    expect(names.some(n => n.includes('deleted'))).toBe(false);
    expect(names.some(n => n.endsWith('pages-index.json'))).toBe(false);
    expect(names.some(n => n.endsWith('search-index.json'))).toBe(false);
    expect(names.some(n => n.endsWith('store.json'))).toBe(false);
    expect(names.some(n => n.endsWith('user-keys.json'))).toBe(false);
  });

  test('everything sits under one folder named for the store', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });

    expect(takeout.files.every(f => f.path.startsWith(`${STORE}/`))).toBe(true);
  });

  test('pagesOnly leaves the attachments behind', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, {
      pagesDirectory: pagesDir, owner: 'molly', store: STORE, pagesOnly: true
    });

    expect(takeout.attachmentCount).toBe(0);
    expect(takeout.pageCount).toBe(2);
    expect(takeout.files.some(f => f.path.includes('attachments/'))).toBe(false);
  });

  test('it reports what it holds, so a caller can warn before a large download', async () => {
    await plainStore();

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });

    expect(takeout.pageCount).toBe(2);
    expect(takeout.attachmentCount).toBe(1);
    expect(takeout.totalBytes).toBe(takeout.files.reduce((n, f) => n + f.bytes.length, 0));
  });

  test('two pages with the same title both survive, rather than one overwriting the other', async () => {
    await plainStore();
    const root = privateStoreRoot(pagesDir, 'molly', STORE);
    await fs.writeFile(path.join(root, 'uuid-3.md'), page('uuid-3', 'Shopping list', 'A second one.'));

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const names = takeout.files.map(f => f.path);

    expect(names).toContain(`${STORE}/Shopping list.md`);
    expect(names).toContain(`${STORE}/Shopping list (2).md`);
    expect(takeout.pageCount).toBe(3);
  });

  test('an odd title still yields a sane, visible filename', async () => {
    // Hygiene, not a defence: the save door refuses `/` and `\\` in a title, so
    // this cannot arrive through it. A takeout is named from the frontmatter on
    // disk, which a hand-edited file or an old import could disagree with.
    await plainStore();
    const root = privateStoreRoot(pagesDir, 'molly', STORE);
    await fs.writeFile(path.join(root, 'uuid-4.md'), page('uuid-4', '../../etc/passwd', 'nope'));

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });

    // Every entry stays under the store folder, with no `..` segment.
    for (const f of takeout.files) {
      expect(f.path.startsWith(`${STORE}/`)).toBe(true);
      expect(f.path.split('/').includes('..')).toBe(false);
    }
    // And the escaping title is still present as a readable, visible file.
    expect(takeout.files.some(f => f.path === `${STORE}/etc-passwd.md`)).toBe(true);
  });

  test('ciphertext reaching the archive is refused — the guarantee is enforced, not assumed', async () => {
    // A takeout is NEVER encrypted. Everything reads through `storeFileIO`,
    // which decrypts, so this cannot happen without a bug — and a bug here
    // ships an archive that looks fine and is unreadable, discovered long
    // after the store is gone. So the invariant is checked, and this test
    // makes the I/O layer misbehave to prove the check is live.
    await plainStore();
    const files = await import('../privateStoreFiles');
    const spy = vi.spyOn(files, 'storeFileIO').mockResolvedValue({
      sealed: true,
      readText: async () => '',
      writeText: async () => undefined,
      readBytes: async () => sealBytes(Buffer.alloc(32), Buffer.from('secret')),
      writeBytes: async () => undefined
    });

    try {
      await expect(
        buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE })
      ).rejects.toThrow(/never encrypted/i);
    } finally {
      spy.mockRestore();
    }
  });

  test('an uploaded name that is a path elsewhere is reduced to a leaf', async () => {
    // Reachable: the uploaded name is stored as-is and a takeout puts it in the
    // archive, where it becomes a path on the machine that extracts it. On
    // Linux `\\` is an ordinary character, so this is one odd filename here and
    // a climb out of the folder on Windows.
    await plainStore();
    await fs.writeJson(storeFileIndexPath(pagesDir, 'molly', STORE), {
      version: 1,
      files: {
        a: {
          id: 'a', fileName: 'abc-123.jpg', name: 'x.\\..\\..\\etc\\passwd',
          encodingFormat: 'image/jpeg', contentSize: 4, fingerprint: 'f', description: '',
          dateCreated: '2026-01-01T00:00:00.000Z', dateModified: '2026-01-01T00:00:00.000Z', mentions: []
        },
        b: {
          id: 'b', fileName: 'abc-123.jpg', name: '../../etc/passwd',
          encodingFormat: 'image/jpeg', contentSize: 4, fingerprint: 'g', description: '',
          dateCreated: '2026-01-01T00:00:00.000Z', dateModified: '2026-01-01T00:00:00.000Z', mentions: []
        }
      }
    });

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: STORE });
    const attachments = takeout.files.filter(f => f.path.includes('/attachments/'));

    expect(attachments).toHaveLength(2);
    for (const f of attachments) {
      expect(f.path.includes('\\')).toBe(false);
      expect(f.path.split('/').includes('..')).toBe(false);
      expect(f.path.startsWith(`${STORE}/attachments/`)).toBe(true);
      // One leaf under attachments/ — never a nested path.
      expect(f.path.split('/')).toHaveLength(3);
    }
  });

  test('a store with nothing in it is an empty takeout, not an error', async () => {
    await fs.ensureDir(privateStoreRoot(pagesDir, 'molly', 'empty'));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'empty'), { kind: 'default', encrypt: false });

    const takeout = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store: 'empty' });

    expect(takeout.files).toEqual([]);
    expect(takeout.totalBytes).toBe(0);
  });
});
