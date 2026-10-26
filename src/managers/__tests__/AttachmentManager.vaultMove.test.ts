/**
 * A page's files go where the page goes — #1842.
 *
 * Operator rule (2026-10-16): an upload is either an attachment (on a page)
 * or a saved file, and every attachment of a vault page is stored in that
 * vault. Before the fix a page made private kept its files in the shared
 * pool, served like any public attachment, and a shared-pool file attached to
 * a vault page stayed there too.
 *
 * Exercised through the real PageManager, FileSystemProvider,
 * AttachmentManager and BasicAttachmentProvider, so what is asserted is what
 * lands on disk.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../providers/BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import AttachmentManager from '../AttachmentManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { formatPrivatePageName, privateStoreRoot, privateUserKeysPath, storeMetaPath } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
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

const UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** Molly in a session that holds no key: signed in again after a restart, not yet unlocked. */
const MOLLY_LOCKED: ActorContext = actor('molly');
const BOB: ActorContext = actor('bob');

const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', owner: 'admin', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  notes: { label: 'notes', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/notes/' } }
};

const LABS = formatPrivatePageName('molly', 'phr', 'Lab Results');
const NOTE = formatPrivatePageName('molly', 'notes', 'Lab Results');
const BYTES = Buffer.from('cholesterol 240 mg/dL — keep this private');
const ID = crypto.createHash('sha256').update(BYTES).digest('hex');
const FILE = { originalName: 'labs.txt', mimeType: 'text/plain', size: BYTES.length };
const CONTENT = "Results: [{ATTACH src='labs.txt'}]";

/** Every regular file under `dir`, recursively. */
async function filesUnder(dir: string): Promise<string[]> {
  if (!await fs.pathExists(dir)) return [];
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out;
}

describe('a page\'s files go where the page goes (#1842)', () => {
  let testDir: string;
  let pagesDir: string;
  let storageDir: string;
  let notifications: Array<Record<string, unknown>>;
  let pages: PageManager;
  let attachments: AttachmentManager;
  let pool: BasicAttachmentProvider;

  const engineFor = () => {
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
          'ngdpbase.page.provider': 'filesystemprovider',
          'ngdpbase.system-category': SYSTEM_CATEGORIES,
          'ngdpbase.attachment.maxsize': 10485760,
          'ngdpbase.attachment.allowedtypes': ''
        };
        return config[key] !== undefined ? config[key] : fallback;
      }),
      getResolvedDataPath: vi.fn((key: string, fallback: string) => {
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
        if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
        return fallback;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      SearchManager: { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() },
      NotificationManager: { notifyAdmins: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); return 'id'; }) },
      PolicyDecisionPoint: { decide: () => Promise.resolve({ permit: true }) },
      // The container rule itself — owner or delegate, never a role.
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner),
        canUserAccessPage: (subject: ActorContext, name: string) =>
          Promise.resolve(name.startsWith('vaults/molly/') ? mayActInPrivateContainer(subject, 'molly') : true)
      }
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
    attachments = new AttachmentManager(engine);
    pool = new BasicAttachmentProvider(engine);
    await pool.initialize();
    (attachments as unknown as { attachmentProvider: unknown }).attachmentProvider = pool;
    managers.PageManager = pages;
    managers.AttachmentManager = attachments;
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

  /** A shared-pool file used by the pages named. */
  const poolFile = async (...usedBy: string[]): Promise<void> => {
    await pool.storeAttachment(BYTES, FILE, {}, { username: 'molly' });
    if (usedBy.length > 0) await pool.setPoolMentions(ID, usedBy);
  };

  const vaultAttachments = (store: string) => path.join(privateStoreRoot(pagesDir, 'molly', store), 'attachments');
  const poolBytes = async () => (await fs.readdir(storageDir)).filter((f) => f.startsWith(ID));

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-page-files-'));
    pagesDir = path.join(testDir, 'pages');
    storageDir = path.join(testDir, 'attachments');
    notifications = [];
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(storageDir);
    clearUnlockedPrivateStores();
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('a public page made private into a sealed vault takes its own file with it, sealed, and no public copy is left', async () => {
    const dek = await openSealedVault();
    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly' }, MOLLY);
    await poolFile('Lab Results');
    // Before the move anyone with asset-read could fetch it from the pool.
    expect((await attachments.getAttachment(ID))?.buffer.equals(BYTES)).toBe(true);

    const saved = await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY);
    expect(saved.name).toBe(LABS);

    // In the vault, sealed with its DEK, under the same id.
    const [inVault] = await filesUnder(vaultAttachments('phr'));
    expect(path.basename(inVault)).toBe(`${ID}.txt`);
    const sealed = await fs.readFile(inVault);
    expect(isSealedBytes(sealed)).toBe(true);
    expect(sealed.toString('latin1')).not.toContain('cholesterol');
    expect(openBytes(dek, sealed).equals(BYTES)).toBe(true);

    // Nothing left in the shared pool: no record, no bytes, no name.
    expect(await poolBytes()).toEqual([]);
    expect(await pool.getAttachmentMetadata(ID)).toBeNull();
    expect(await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8')).not.toContain('labs.txt');
    expect(await attachments.getAttachment(ID)).toBeNull();

    // The vault page uses the vault's copy: its owner sees it on the page and downloads it.
    expect((await attachments.getAttachmentsForPage(LABS, MOLLY)).map((a) => a.identifier)).toEqual([ID]);
    expect((await attachments.getPrivateStoreAttachment(ID, MOLLY))?.buffer.equals(BYTES)).toBe(true);
    expect(await attachments.resolveAttachmentSrc('labs.txt', LABS, MOLLY)).toEqual({ url: `/attachments/${ID}`, mimeType: 'text/plain' });
    // Nobody else reaches it.
    expect(await attachments.getPrivateStoreAttachment(ID, BOB)).toBeNull();
    expect(await attachments.getAttachmentByFilename('labs.txt', BOB)).toBeNull();
  });

  test('a file other public pages use is copied in; the public copy stays for them, without the vault page', async () => {
    const dek = await openSealedVault();
    await pages.savePage('Cholesterol Guide', CONTENT, { uuid: 'abababab-abab-4bab-8bab-abababababab', author: 'molly' }, MOLLY);
    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly' }, MOLLY);
    await poolFile('Lab Results', 'Cholesterol Guide');

    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY);

    const [inVault] = await filesUnder(vaultAttachments('phr'));
    expect(openBytes(dek, await fs.readFile(inVault)).equals(BYTES)).toBe(true);
    expect(await poolBytes()).toEqual([`${ID}.txt`]);
    expect((await pool.getAttachmentMetadata(ID))?.mentions?.map((m) => m.name)).toEqual(['Cholesterol Guide']);
    // The vault page's file is the vault's.
    expect((await attachments.getAttachmentsForPage(LABS, MOLLY)).map((a) => a.identifier)).toEqual([ID]);
    expect(await attachments.isOwnPrivateStoreFile(ID, MOLLY)).toBe(true);
  });

  test('a mention naming no public page that exists now (a former title) keeps no public copy', async () => {
    await openSealedVault();
    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly' }, MOLLY);
    await poolFile('Lab Results', 'Lab Results 2025', UUID);

    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY);

    expect(await filesUnder(vaultAttachments('phr'))).toHaveLength(1);
    expect(await poolBytes()).toEqual([]);
    expect(await pool.getAttachmentMetadata(ID)).toBeNull();
    expect(await attachments.getAttachment(ID)).toBeNull();
  });

  test('a file the page references but no mention names as its alone is copied in and left in the pool', async () => {
    await openSealedVault();
    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly' }, MOLLY);
    await poolFile();

    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY);

    expect(await filesUnder(vaultAttachments('phr'))).toHaveLength(1);
    expect(await poolBytes()).toEqual([`${ID}.txt`]);
    expect(await attachments.isOwnPrivateStoreFile(ID, MOLLY)).toBe(true);
  });

  test('attaching a shared-pool file to a vault page copies it into the vault', async () => {
    const dek = await openSealedVault();
    await pages.savePage(LABS, 'private', { uuid: UUID }, MOLLY);
    await poolFile('Cholesterol Guide');

    expect(await attachments.attachToPage(ID, LABS, MOLLY)).toBe(true);

    const [inVault] = await filesUnder(vaultAttachments('phr'));
    expect(openBytes(dek, await fs.readFile(inVault)).equals(BYTES)).toBe(true);
    expect((await attachments.getAttachmentsForPage(LABS, MOLLY)).map((a) => a.identifier)).toEqual([ID]);
    // The shared record never learns of the vault page.
    expect((await pool.getAttachmentMetadata(ID))?.mentions?.map((m) => m.name)).toEqual(['Cholesterol Guide']);
    expect(await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8')).not.toContain('vaults/');
    // Someone who can't open the vault can't put a file into it.
    await expect(attachments.attachToPage(ID, LABS, BOB)).rejects.toThrow();
  });

  test('a vault page made public takes its file out, opened, readable by its new audience', async () => {
    await openSealedVault();
    await pages.savePage(LABS, CONTENT, { uuid: UUID }, MOLLY);
    const uploaded = await attachments.uploadAttachment(BYTES, FILE, MOLLY, { pageName: LABS });
    const id = String(uploaded.identifier);

    const saved = await pages.savePage(LABS, CONTENT, { uuid: UUID, private: false }, MOLLY);
    expect(saved.name).toBe('Lab Results');

    expect(await filesUnder(vaultAttachments('phr'))).toEqual([]);
    const served = await attachments.getAttachment(id);
    expect(served?.buffer.equals(BYTES)).toBe(true);
    expect((await pool.getAttachmentMetadata(id))?.mentions?.map((m) => m.name)).toEqual(['Lab Results']);
    expect(await attachments.resolveAttachmentSrc('labs.txt', 'Lab Results', BOB)).toEqual({ url: `/attachments/${id}`, mimeType: 'text/plain' });
  });

  test('a page moved from a plain vault to a sealed one takes its file, sealed', async () => {
    const dek = await openSealedVault();
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    const uploaded = await attachments.uploadAttachment(BYTES, FILE, MOLLY, { pageName: NOTE });

    await pages.movePageToVault(NOTE, 'phr', MOLLY);

    expect(await filesUnder(vaultAttachments('notes'))).toEqual([]);
    const [inVault] = await filesUnder(vaultAttachments('phr'));
    expect(openBytes(dek, await fs.readFile(inVault)).equals(BYTES)).toBe(true);
    expect((await attachments.getAttachmentsForPage(LABS, MOLLY)).map((a) => a.identifier)).toEqual([uploaded.identifier]);
  });

  test('without the vault\'s key the move is refused and nothing moves', async () => {
    await pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly' }, MOLLY);
    await poolFile('Lab Results');
    const before = (await filesUnder(testDir)).sort();
    const metadata = await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8');

    // A sealed kind's vault not yet opened: the page's own save refuses first.
    await expect(pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY))
      .rejects.toBeInstanceOf(SealedVaultRefusedError);
    // The files' own move asks the same question before moving anything.
    await expect(attachments.movePageAttachments('Lab Results', LABS, CONTENT, MOLLY)).rejects.toBeInstanceOf(SealedVaultRefusedError);

    // An opened vault, but a session that holds no key.
    await openSealedVault();
    const opened = (await filesUnder(testDir)).sort();
    await expect(pages.savePage('Lab Results', CONTENT, { uuid: UUID, author: 'molly', private: true, store: 'phr' }, MOLLY_LOCKED))
      .rejects.toThrow();
    await expect(attachments.movePageAttachments('Lab Results', LABS, CONTENT, MOLLY_LOCKED)).rejects.toThrow();

    expect(before.every((f) => opened.includes(f))).toBe(true);
    expect((await filesUnder(testDir)).sort()).toEqual(opened);
    expect(await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8')).toBe(metadata);
    expect(await poolBytes()).toEqual([`${ID}.txt`]);
  });

  test('startup names vault pages still using shared-pool files, and changes nothing', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    // What a move before #1842 left: the file in the pool, and a mention naming a vault page.
    await poolFile(formatPrivatePageName('molly', 'phr', 'Old Secret'));
    await pages.savePage('Public Page', "[{ATTACH src='other.txt'}]", { uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, MOLLY);
    const before = (await filesUnder(testDir)).sort();

    await attachments.reportVaultPagesUsingPoolFilesAtBoot();

    const status = attachments.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.reason).toContain(`molly/notes page ${UUID}`);
    expect(status.reason).toContain('molly/phr pages named by shared records');
    expect(status.reason).not.toContain('Old Secret');
    expect(status.reason).not.toContain('labs.txt');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ level: 'error' });
    expect((await filesUnder(testDir)).sort()).toEqual(before);
  });

  test('a vault whose pages use only its own files is not reported', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await attachments.uploadAttachment(BYTES, FILE, MOLLY, { pageName: NOTE });
    await poolFile('Some Public Page');

    expect(await attachments.findVaultPagesUsingPoolFiles()).toEqual([]);
    await attachments.reportVaultPagesUsingPoolFilesAtBoot();
    expect(attachments.getManagerStatus().state).not.toBe('degraded');
    expect(notifications).toEqual([]);
  });
});
