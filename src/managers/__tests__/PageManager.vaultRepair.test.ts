/**
 * "Move into vault": repairing what moves before #1839 / #1842 left outside a
 * vault — #1842.
 *
 * The startup checks report vault pages whose files are still in the shared
 * pool and whose footnotes and comments are still in the public folders.
 * `PageManager.repairVaultPage` moves them in through each owning manager's
 * existing move code and store I/O, then runs the checks again so the
 * subsystem banner clears.
 *
 * Exercised through the real PageManager, FileSystemProvider,
 * AttachmentManager, BasicAttachmentProvider, FootnoteManager and
 * CommentManager, so what is asserted is what lands on disk. Uses its own
 * mkdtemp directory and removes only that.
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
import FootnoteManager from '../FootnoteManager';
import CommentManager from '../CommentManager';
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
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'abababab-abab-4bab-8bab-abababababab';
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** Holds admin-system (see the PDP below); owns none of Molly's vaults. */
const ADMIN: ActorContext = actor('admin', ['admin']);
const BOB: ActorContext = actor('bob');

const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', owner: 'admin', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  notes: { label: 'notes', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/notes/' } }
};

const NOTE = formatPrivatePageName('molly', 'notes', 'Lab Results');
const LABS = formatPrivatePageName('molly', 'phr', 'Lab Results');
const BYTES = Buffer.from('cholesterol 240 mg/dL — keep this private');
const ID = crypto.createHash('sha256').update(BYTES).digest('hex');
const FILE = { originalName: 'labs.txt', mimeType: 'text/plain', size: BYTES.length };
const CONTENT = "Results: [{ATTACH src='labs.txt'}]";
const FOOTNOTES = { 1: { id: '1', display: 'LDL', url: 'https://example.org/ldl', note: 'cholesterol 240 secret', createdBy: 'molly', createdAt: '2026-01-01T00:00:00.000Z' } };
const COMMENT = { id: 'c1', content: 'ask the doctor about the 240 result' };

/** Every regular file under `dir`, recursively. */
async function filesUnder(dir: string): Promise<string[]> {
  if (!await fs.pathExists(dir)) return [];
  const out: string[] = [];
  for (const ent of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (ent.isFile()) out.push(path.join(ent.parentPath, ent.name));
  }
  return out.sort();
}

describe('moving a vault page\'s leftovers into its vault (#1842)', () => {
  let testDir: string;
  let pagesDir: string;
  let storageDir: string;
  let footnotesDir: string;
  let commentsDir: string;
  let audit: Array<Record<string, unknown>>;
  let failAudit: boolean;
  let pages: PageManager;
  let attachments: AttachmentManager;
  let footnotes: FootnoteManager;
  let comments: CommentManager;
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
        if (key === 'ngdpbase.footnotes.storagedir') return footnotesDir;
        if (key === 'ngdpbase.comments.storagedir') return commentsDir;
        return fallback;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const adminSystem = (subject: { username?: string }, action: string) =>
      Promise.resolve(action === 'admin-system' && subject?.username === 'admin');
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      SearchManager: { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() },
      NotificationManager: { addNotification: vi.fn(async () => 'id') },
      AuditManager: {
        logAuditEvent: vi.fn(async (e: Record<string, unknown>) => {
          if (failAudit) throw new Error('disk full');
          audit.push(e);
          return 'id';
        }),
        flushAuditQueue: vi.fn(async () => {})
      },
      // Inside a vault: vault-owner gives page-edit (the container rule is asked first, by permitsInVault).
      PolicyDecisionPoint: { decide: () => Promise.resolve({ permit: true }), permits: adminSystem, holds: adminSystem },
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

  /** Builds the managers; the notes managers run their startup check as they initialise. */
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
    footnotes = new FootnoteManager(engine);
    comments = new CommentManager(engine);
    await footnotes.initialize();
    await comments.initialize();
    managers.FootnoteManager = footnotes;
    managers.CommentManager = comments;
    await attachments.reportVaultPagesUsingPoolFilesAtBoot();
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

  /** What a move before #1839 / #1842 left: the page's file in the pool, its notes in the public folders. */
  const leaveOutside = async (pageName: string, ...alsoUsedBy: string[]): Promise<void> => {
    await pool.storeAttachment(BYTES, FILE, {}, null);
    await pool.setPoolMentions(ID, [pageName, ...alsoUsedBy]);
    await fs.ensureDir(footnotesDir);
    await fs.writeJson(path.join(footnotesDir, `${UUID}.json`), FOOTNOTES);
    await fs.ensureDir(path.join(commentsDir, UUID));
    await fs.writeJson(path.join(commentsDir, UUID, 'c1.json'), COMMENT);
  };

  const vaultDir = (store: string, sub: string) => path.join(privateStoreRoot(pagesDir, 'molly', store), sub);
  const poolBytes = async () => (await fs.readdir(storageDir)).filter((f) => f.startsWith(ID));
  const degraded = () => [attachments, footnotes, comments].filter((m) => m.getManagerStatus().state === 'degraded');

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-repair-'));
    pagesDir = path.join(testDir, 'pages');
    storageDir = path.join(testDir, 'attachments');
    footnotesDir = path.join(testDir, 'footnotes');
    commentsDir = path.join(testDir, 'comments');
    audit = [];
    failAudit = false;
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(storageDir);
    clearUnlockedPrivateStores();
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('an administrator moves an unsealed vault page\'s file and notes in, and the checks then report nothing', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(NOTE);
    await build();
    expect(degraded()).toHaveLength(3);
    const listed = await pages.listVaultRepairs(ADMIN);
    // The page by uuid (its content references the file), and the vault by the shared record naming it.
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: 'molly', vault: 'notes', page: UUID, files: 1, footnotes: true, comments: true, may: true }),
      expect.objectContaining({ owner: 'molly', vault: 'notes', page: null, files: 1, may: true })
    ]));

    const result = await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, ADMIN);

    expect(result).toEqual({ ok: true, as: 'admin', filesMoved: 1, filesCopied: 0, footnotes: 1, comments: 1 });
    // The file is the vault's, under the same id; no public copy, record or name is left.
    expect((await filesUnder(vaultDir('notes', 'attachments'))).map((f) => path.basename(f))).toEqual([`${ID}.txt`]);
    expect(await poolBytes()).toEqual([]);
    expect(await pool.getAttachmentMetadata(ID)).toBeNull();
    expect((await attachments.getAttachmentsForPage(NOTE, MOLLY)).map((a) => a.identifier)).toEqual([ID]);
    // The notes are in the vault, and read back on the page.
    expect(await fs.pathExists(path.join(footnotesDir, `${UUID}.json`))).toBe(false);
    expect(await fs.pathExists(path.join(commentsDir, UUID))).toBe(false);
    expect((await footnotes.getFootnotes({ name: NOTE, uuid: UUID }, MOLLY)).map((f) => f.note)).toEqual(['cholesterol 240 secret']);
    expect((await comments.getComments({ name: NOTE, uuid: UUID }, MOLLY)).map((c) => c.content)).toEqual([COMMENT.content]);
    // Re-checked: nothing left, the banner state is cleared without a restart.
    expect(attachments.vaultPagesUsingPoolFiles()).toEqual([]);
    expect(footnotes.vaultPageNotesOutside()).toEqual([]);
    expect(comments.vaultPageNotesOutside()).toEqual([]);
    expect(degraded()).toEqual([]);
    expect(await pages.listVaultRepairs(ADMIN)).toEqual([]);
  });

  // Sabotaged once: emitting the repair as footnote-edit (on-failure continue)
  // turned this test and the refuse test below red.
  test('every repair is recorded as vault-repair: who, which vault page, and the counts', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(NOTE);
    await build();

    await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, ADMIN);

    const records = audit.filter((e) => e.eventType === 'vault-repair');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      user: 'admin',
      action: 'repair',
      resource: UUID,
      resourceType: 'page',
      metadata: expect.objectContaining({ owner: 'molly', vault: 'notes', pageUuid: UUID, as: 'admin', filesMoved: 1, filesCopied: 0, footnotes: 1, comments: 1 })
    });
    expect(JSON.stringify(records[0])).not.toContain('Lab Results');
    expect(JSON.stringify(records[0])).not.toContain('labs.txt');
  });

  test('a repair that cannot be recorded does not happen (on-failure refuse)', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(NOTE);
    await build();
    const before = await filesUnder(testDir);
    failAudit = true;

    await expect(pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, ADMIN)).rejects.toThrow(/vault-repair/);

    expect(await filesUnder(testDir)).toEqual(before);
    expect(await poolBytes()).toEqual([`${ID}.txt`]);
  });

  test('a file other public pages use is copied in and left in the pool for them', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(NOTE, 'Cholesterol Guide');
    await build();

    const result = await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, ADMIN);

    expect(result).toMatchObject({ ok: true, filesMoved: 0, filesCopied: 1 });
    expect(await filesUnder(vaultDir('notes', 'attachments'))).toHaveLength(1);
    expect(await poolBytes()).toEqual([`${ID}.txt`]);
    expect((await pool.getAttachmentMetadata(ID))?.mentions?.map((m) => m.name)).toEqual(['Cholesterol Guide']);
    expect(attachments.vaultPagesUsingPoolFiles()).toEqual([]);
  });

  test('the owner repairs a sealed vault in their open session: the file and the notes are sealed with its key', async () => {
    const dek = await openSealedVault();
    await pages.savePage(LABS, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(LABS);
    await build();
    // A sealed vault's pages can't be read without its key: the file is found through the shared record.
    const own = await pages.listVaultRepairs(MOLLY);
    expect(own).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: 'molly', vault: 'phr', page: null, files: 1, may: true }),
      expect.objectContaining({ owner: 'molly', vault: 'phr', page: UUID, footnotes: true, comments: true, may: true })
    ]));

    const total = await pages.repairAllVaultPages(MOLLY, { ownOnly: true });

    expect(total).toMatchObject({ repaired: 2, refused: 0, failed: 0, filesMoved: 1, footnotes: 1, comments: 1 });
    const [file] = await filesUnder(vaultDir('phr', 'attachments'));
    const sealed = await fs.readFile(file);
    expect(isSealedBytes(sealed)).toBe(true);
    expect(sealed.toString('latin1')).not.toContain('cholesterol');
    expect(openBytes(dek, sealed).equals(BYTES)).toBe(true);
    const sealedFootnotes = await fs.readFile(path.join(vaultDir('phr', 'footnotes'), `${UUID}.json`));
    expect(isSealedBytes(sealedFootnotes)).toBe(true);
    expect(openBytes(dek, sealedFootnotes).toString()).toContain('cholesterol 240 secret');
    const [comment] = await filesUnder(vaultDir('phr', path.join('comments', UUID)));
    expect(isSealedBytes(await fs.readFile(comment))).toBe(true);
    expect(await poolBytes()).toEqual([]);
    expect(await fs.pathExists(path.join(footnotesDir, `${UUID}.json`))).toBe(false);
    expect(await fs.pathExists(path.join(commentsDir, UUID))).toBe(false);
    expect(degraded()).toEqual([]);
  });

  test('a sealed vault asked for by an administrator who is not its owner is refused, and nothing changes', async () => {
    await openSealedVault();
    await pages.savePage(LABS, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(LABS);
    await build();
    const before = await filesUnder(testDir);
    const metadata = await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8');

    const listed = await pages.listVaultRepairs(ADMIN);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((r) => !r.may && /only molly can/.test(r.refusal ?? ''))).toBe(true);
    for (const page of [UUID, null]) {
      const result = await pages.repairVaultPage({ owner: 'molly', vault: 'phr', page }, ADMIN);
      expect(result).toMatchObject({ ok: false, refusal: 'owner-only' });
    }
    expect(await pages.repairAllVaultPages(ADMIN)).toMatchObject({ repaired: 0 });

    expect(await filesUnder(testDir)).toEqual(before);
    expect(await fs.readFile(path.join(storageDir, 'attachment-metadata.json'), 'utf8')).toBe(metadata);
    expect(audit.filter((e) => e.eventType === 'vault-repair')).toEqual([]);
    expect(degraded()).toHaveLength(3);
  });

  test('someone who is neither the owner nor holds admin-system is refused, and sees nothing to repair', async () => {
    await pages.savePage(NOTE, CONTENT, { uuid: UUID }, MOLLY);
    await leaveOutside(NOTE);
    await build();
    const before = await filesUnder(testDir);

    expect(await pages.listVaultRepairs(BOB)).toEqual([]);
    expect(await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, BOB)).toMatchObject({ ok: false, refusal: 'denied' });

    expect(await filesUnder(testDir)).toEqual(before);
  });

  test('a public page\'s notes cannot be pulled into a vault by naming its uuid', async () => {
    const PUBLIC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await pages.savePage(NOTE, 'note', { uuid: UUID }, MOLLY);
    await fs.ensureDir(footnotesDir);
    await fs.writeJson(path.join(footnotesDir, `${PUBLIC}.json`), FOOTNOTES);

    const result = await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: PUBLIC }, MOLLY);

    expect(result).toMatchObject({ ok: false, refusal: 'not-found' });
    expect(await fs.pathExists(path.join(footnotesDir, `${PUBLIC}.json`))).toBe(true);
  });

  test('footnotes the vault already holds are kept when the outside ones are merged in', async () => {
    await pages.savePage(NOTE, 'note', { uuid: UUID }, MOLLY);
    await footnotes.addFootnote({ name: NOTE, uuid: UUID }, { display: 'New', url: 'https://example.org/new', note: 'written since #1839' }, MOLLY);
    await fs.ensureDir(footnotesDir);
    await fs.writeJson(path.join(footnotesDir, `${UUID}.json`), { old: { ...FOOTNOTES[1], id: 'old' } });
    await build();

    await pages.repairVaultPage({ owner: 'molly', vault: 'notes', page: UUID }, MOLLY);

    expect((await footnotes.getFootnotes({ name: NOTE, uuid: UUID }, MOLLY)).map((f) => f.note).sort())
      .toEqual(['cholesterol 240 secret', 'written since #1839']);
    expect(await fs.pathExists(path.join(footnotesDir, `${UUID}.json`))).toBe(false);
  });
});
