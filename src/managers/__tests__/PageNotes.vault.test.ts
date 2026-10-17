/**
 * A vault page's footnotes and comments live in its vault — #1839.
 *
 * Before the fix both were kept by uuid in the managers' own folders
 * (`data/footnotes/{uuid}.json`, `data/comments/{uuid}/`), in the clear, while
 * the page itself was sealed. Operator decision (2026-10-16): they live IN the
 * vault, written through its store I/O, so they are sealed exactly when the
 * page is, and no plaintext copy is kept outside it.
 *
 * Exercised through the real FootnoteManager, CommentManager, PageManager and
 * FileSystemProvider, so what is asserted is what lands on disk.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import FootnoteManager from '../FootnoteManager';
import CommentManager from '../CommentManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { formatPrivatePageName, privateStoreRoot, privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  openBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { SealedVaultRefusedError } from '../../utils/privateStoreMeta';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** Molly in a session that holds no key: signed in again after a restart, not yet unlocked. */
const MOLLY_LOCKED: ActorContext = actor('molly');

const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', owner: 'admin', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  notes: { label: 'notes', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/notes/' } }
};

const LABS = formatPrivatePageName('molly', 'phr', 'Lab Results');
const NOTE = formatPrivatePageName('molly', 'notes', 'Shopping');
const FOOTNOTE = { display: 'LDL reference', url: 'https://example.org/ldl', note: 'cholesterol 240 secret' };
const COMMENT = 'ask the doctor about the 240 result';

/** Every regular file under `dir`, recursively. */
async function filesUnder(dir: string): Promise<string[]> {
  if (!await fs.pathExists(dir)) return [];
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out;
}

describe('a vault page\'s footnotes and comments live in its vault (#1839)', () => {
  let testDir: string;
  let pagesDir: string;
  let footnotesDir: string;
  let commentsDir: string;
  let notifications: Array<Record<string, unknown>>;
  let pages: PageManager;
  let footnotes: FootnoteManager;
  let comments: CommentManager;

  const engineFor = () => {
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
          'ngdpbase.page.provider': 'filesystemprovider',
          'ngdpbase.system-category': SYSTEM_CATEGORIES
        };
        return config[key] !== undefined ? config[key] : fallback;
      }),
      getResolvedDataPath: vi.fn((key: string, fallback: string) => {
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.footnotes.storagedir') return footnotesDir;
        if (key === 'ngdpbase.comments.storagedir') return commentsDir;
        return fallback;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const notificationManager = { addNotification: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); return 'id'; }) };
    const searchManager = { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      SearchManager: searchManager,
      NotificationManager: notificationManager
    };
    const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
    managers.ValidationManager = new ValidationManager(engine);
    return { engine, managers };
  };

  const build = async (): Promise<void> => {
    const { engine, managers } = engineFor();
    const provider = new FileSystemProvider(engine);
    await provider.initialize();
    pages = new PageManager(engine);
    (pages as unknown as { provider: unknown }).provider = provider;
    footnotes = new FootnoteManager(engine);
    comments = new CommentManager(engine);
    await footnotes.initialize();
    await comments.initialize();
    managers.PageManager = pages;
    managers.FootnoteManager = footnotes;
    managers.CommentManager = comments;
  };

  /** Molly walks through the `phr` door: a sealed `store.json`, its DEK in her session. */
  const openSealedVault = async (): Promise<Buffer> => {
    const created = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'phr')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'phr'), { kind: 'phr', ...record });
    unlockPrivateStores('sid', 'molly', created.kek);
    const dek = unwrapDek(created.kek, record);
    setUnlockedDek('sid', 'phr', dek);
    return dek;
  };

  const vaultFootnotes = () => path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), 'footnotes', `${UUID}.json`);
  const vaultComments = () => path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), 'comments', UUID);

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-page-notes-'));
    pagesDir = path.join(testDir, 'pages');
    footnotesDir = path.join(testDir, 'footnotes');
    commentsDir = path.join(testDir, 'comments');
    notifications = [];
    await fs.ensureDir(pagesDir);
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a footnote and a comment on a sealed vault page are sealed in the vault, and nothing is written outside it', async () => {
    const dek = await openSealedVault();
    await pages.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY);
    const page = { name: LABS, uuid: UUID };

    await footnotes.addFootnote(page, FOOTNOTE, MOLLY);
    const added = await comments.addComment(page, MOLLY, COMMENT);

    const fnBytes = await fs.readFile(vaultFootnotes());
    expect(isSealedBytes(fnBytes)).toBe(true);
    expect(fnBytes.toString('latin1')).not.toContain('cholesterol');
    expect(openBytes(dek, fnBytes).toString('utf8')).toContain('cholesterol 240 secret');

    const commentFiles = await filesUnder(vaultComments());
    expect(commentFiles).toHaveLength(1);
    const cBytes = await fs.readFile(commentFiles[0]);
    expect(isSealedBytes(cBytes)).toBe(true);
    expect(openBytes(dek, cBytes).toString('utf8')).toContain(COMMENT);

    expect(await filesUnder(footnotesDir)).toEqual([]);
    expect(await filesUnder(commentsDir)).toEqual([]);

    // The owner reads them back through the vault.
    expect((await footnotes.getFootnotes(page, MOLLY)).map((f) => f.note)).toEqual(['cholesterol 240 secret']);
    expect((await comments.getComments(page, MOLLY)).map((c) => c.id)).toEqual([added.id]);
    // Delete goes through the vault too.
    expect(await comments.deleteComment(page, added.id, MOLLY)).toBe(true);
    expect(isSealedBytes(await fs.readFile(commentFiles[0]))).toBe(true);
  });

  test('without the vault\'s key, reads and writes are refused and nothing is written', async () => {
    await openSealedVault();
    await pages.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY);
    const page = { name: LABS, uuid: UUID };
    await footnotes.addFootnote(page, FOOTNOTE, MOLLY);

    await expect(footnotes.getFootnotes(page, MOLLY_LOCKED)).rejects.toThrow();
    await expect(footnotes.addFootnote(page, FOOTNOTE, MOLLY_LOCKED)).rejects.toThrow();
    await expect(comments.getComments(page, MOLLY_LOCKED)).rejects.toThrow();
    await expect(comments.addComment(page, MOLLY_LOCKED, COMMENT)).rejects.toThrow();
    expect(await filesUnder(vaultComments())).toEqual([]);
    expect(await filesUnder(footnotesDir)).toEqual([]);
    expect(await filesUnder(commentsDir)).toEqual([]);
  });

  test('a sealed kind\'s vault that has not been opened refuses them, as it refuses the page', async () => {
    const page = { name: LABS, uuid: UUID };
    await expect(footnotes.addFootnote(page, FOOTNOTE, MOLLY)).rejects.toBeInstanceOf(SealedVaultRefusedError);
    await expect(comments.addComment(page, MOLLY, COMMENT)).rejects.toBeInstanceOf(SealedVaultRefusedError);
    expect(await filesUnder(testDir)).toEqual([]);
  });

  test('a page in a vault that is not sealed keeps them in the vault, in the clear', async () => {
    await pages.savePage(NOTE, 'eggs', { uuid: UUID }, MOLLY);
    await footnotes.addFootnote({ name: NOTE, uuid: UUID }, FOOTNOTE, MOLLY);
    const file = path.join(privateStoreRoot(pagesDir, 'molly', 'notes'), 'footnotes', `${UUID}.json`);
    expect(await fs.readFile(file, 'utf8')).toContain('cholesterol 240 secret');
    expect(await filesUnder(footnotesDir)).toEqual([]);
  });

  test('a public page is unchanged: its footnotes and comments stay in the managers\' folders, in the clear', async () => {
    await pages.savePage('Labs', 'public', { uuid: UUID }, MOLLY);
    const page = { name: 'Labs', uuid: UUID };
    await footnotes.addFootnote(page, FOOTNOTE, MOLLY);
    await comments.addComment(page, MOLLY, COMMENT);

    expect(await fs.readFile(path.join(footnotesDir, `${UUID}.json`), 'utf8')).toContain('cholesterol 240 secret');
    const [commentFile] = await filesUnder(path.join(commentsDir, UUID));
    expect(await fs.readFile(commentFile, 'utf8')).toContain(COMMENT);
    // A reader with no key at all reads a public page's.
    expect(await footnotes.getFootnotes(page, actor('someone-else'))).toHaveLength(1);
  });

  test('a public page made private into a sealed vault takes them with it, sealed, and leaves none outside', async () => {
    const dek = await openSealedVault();
    await pages.savePage('Lab Results', 'public for now', { uuid: UUID, author: 'molly' }, MOLLY);
    const before = { name: 'Lab Results', uuid: UUID };
    await footnotes.addFootnote(before, FOOTNOTE, MOLLY);
    await comments.addComment(before, MOLLY, COMMENT);
    expect(await filesUnder(footnotesDir)).toHaveLength(1);

    const saved = await pages.savePage('Lab Results', 'now private', { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY);
    expect(saved.name).toBe(LABS);

    expect(await filesUnder(footnotesDir)).toEqual([]);
    expect(await filesUnder(commentsDir)).toEqual([]);
    const fnBytes = await fs.readFile(vaultFootnotes());
    expect(isSealedBytes(fnBytes)).toBe(true);
    expect(openBytes(dek, fnBytes).toString('utf8')).toContain('cholesterol 240 secret');
    const [commentFile] = await filesUnder(vaultComments());
    expect(isSealedBytes(await fs.readFile(commentFile))).toBe(true);

    const page = { name: LABS, uuid: UUID };
    expect(await footnotes.getFootnotes(page, MOLLY)).toHaveLength(1);
    expect(await comments.getComments(page, MOLLY)).toHaveLength(1);
  });

  test('a sealed vault page made public takes them with it, opened, and readable where it went', async () => {
    await openSealedVault();
    await pages.savePage(LABS, 'private', { uuid: UUID }, MOLLY);
    const inVault = { name: LABS, uuid: UUID };
    await footnotes.addFootnote(inVault, FOOTNOTE, MOLLY);
    await comments.addComment(inVault, MOLLY, COMMENT);

    const saved = await pages.savePage(LABS, 'public now', { uuid: UUID, private: false }, MOLLY);
    expect(saved.name).toBe('Lab Results');

    expect(await fs.pathExists(vaultFootnotes())).toBe(false);
    expect(await fs.pathExists(vaultComments())).toBe(false);
    expect(await fs.readFile(path.join(footnotesDir, `${UUID}.json`), 'utf8')).toContain('cholesterol 240 secret');
    const page = { name: 'Lab Results', uuid: UUID };
    expect((await comments.getComments(page, actor('someone-else'))).map((c) => c.content)).toEqual([COMMENT]);
  });

  test('startup names every vault page whose footnotes or comments are outside its vault, and changes nothing', async () => {
    await openSealedVault();
    await pages.savePage(LABS, 'private', { uuid: UUID }, MOLLY);
    // What the code before #1839 left: the vault page's notes in the public folders, in the clear.
    await fs.ensureDir(footnotesDir);
    await fs.writeJson(path.join(footnotesDir, `${UUID}.json`), { 1: { id: '1', note: 'cholesterol 240 secret' } });
    await fs.ensureDir(path.join(commentsDir, UUID));
    await fs.writeJson(path.join(commentsDir, UUID, 'c1.json'), { id: 'c1', content: COMMENT });
    // A public page's notes are where they belong.
    await fs.writeJson(path.join(footnotesDir, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.json'), {});
    const before = (await filesUnder(testDir)).sort();

    await build();

    for (const manager of [footnotes, comments]) {
      const status = manager.getManagerStatus();
      expect(status.state).toBe('degraded');
      expect(status.reason).toContain(`molly/phr page ${UUID}`);
      expect(status.reason).not.toContain('dddddddd');
      expect(status.reason).not.toContain('cholesterol');
    }
    expect(notifications).toHaveLength(2);
    expect(notifications.map((n) => n.level)).toEqual(['error', 'error']);
    // Read only: nothing moved, sealed or deleted.
    expect((await filesUnder(testDir)).sort()).toEqual(before);
  });

  test('a vault whose pages\' notes are all inside it is not reported', async () => {
    await openSealedVault();
    await pages.savePage(LABS, 'private', { uuid: UUID }, MOLLY);
    await footnotes.addFootnote({ name: LABS, uuid: UUID }, FOOTNOTE, MOLLY);

    await build();

    expect(footnotes.getManagerStatus().state).not.toBe('degraded');
    expect(comments.getManagerStatus().state).not.toBe('degraded');
    expect(notifications).toHaveLength(0);
  });
});
