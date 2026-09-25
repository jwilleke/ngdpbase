/**
 * Importing a takeout into the owner's own store (#1472).
 *
 * Exercised through the real PageManager and the real VersioningFileProvider
 * on a real SEALED store, because that is where an import can be wrong in a
 * way nobody sees: pages that read back fine and sit on disk in the clear.
 * The takeout is built by the real exporter and packed by the real writer, so
 * the round trip is the one a person makes.
 *
 * The upload door is a stand-in that keeps bytes in memory and, like the real
 * store upload, hands back the file it already holds for bytes it has seen.
 * Sealing a file at rest is the upload door's own concern and is tested there
 * (AttachmentManager.sealedFiles.test.ts).
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../providers/VersioningFileProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import ImportManager, { TakeoutImportRefused } from '../ImportManager';
import PageManager from '../PageManager';
import ValidationManager from '../ValidationManager';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { formatPrivatePageName, privateStoreRoot, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { buildStoreTakeout } from '../../utils/privateStoreExport';
import { packZip } from '../../utils/zipArchive';

const VAULT = 'vault';
const OTHER = 'other';
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LIMITS = { maxEntries: 1000, maxTotalBytes: 10 * 1024 * 1024 };

const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** Molly again, in a session that never unlocked her sealed store. */
const MOLLY_LOCKED: ActorContext = { ...actor('molly'), privateStoreHandle: 'other-sid' };

describe('ImportManager.importOwnStoreTakeout (#1472)', () => {
  let testDir: string;
  let pagesDir: string;
  let provider: VersioningFileProvider;
  let pages: PageManager;
  let importer: ImportManager;
  /** The stand-in upload door's store: fingerprint → id, and id → bytes. */
  let heldIds: Map<string, string>;
  let heldBytes: Map<string, Buffer>;
  let visibleToMolly: Set<string>;

  const build = async (): Promise<void> => {
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.versioning.indexfile': path.join(testDir, 'data', 'page-index.json'),
      'ngdpbase.page.provider.versioning.deltastorage': true,
      'ngdpbase.page.provider.versioning.compression': 'none',
      'ngdpbase.system-category': { general: { label: 'general', storageLocation: 'regular' } }
    };
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => (config[key] !== undefined ? config[key] : fallback)),
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        key === 'ngdpbase.page.provider.versioning.indexfile' ? path.join(testDir, 'data', 'page-index.json')
          : key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir
            : key === 'ngdpbase.page.provider.filesystem.requiredpagesdir' ? path.join(testDir, 'required-pages')
              : fallback),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const attachmentManager = {
      uploadAttachment: vi.fn(async (bytes: Buffer) => {
        const fingerprint = crypto.createHash('sha256').update(bytes).digest('hex');
        let id = heldIds.get(fingerprint);
        if (!id) {
          id = crypto.randomUUID();
          heldIds.set(fingerprint, id);
          heldBytes.set(id, bytes);
        }
        return { identifier: id };
      })
    };
    const pip = {
      canUserAccessPage: vi.fn(async (_subject: unknown, name: string) => visibleToMolly.has(name))
    };
    let validation: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        if (name === 'PageManager') return pages;
        if (name === 'AttachmentManager') return attachmentManager;
        if (name === 'PolicyInformationPoint') return pip;
        return null;
      })
    };
    validation = new ValidationManager(engine);
    provider = new VersioningFileProvider(engine);
    await provider.initialize();
    pages = new PageManager(engine);
    (pages as unknown as { provider: unknown }).provider = provider;
    importer = new ImportManager(engine);
    await importer.initialize();
  };

  /**
   * Make `store` an encrypted store of Molly's, unlocked in her session. One
   * user key for all her stores and one unlock, as in life: unlocking again
   * starts the session's key bag afresh, dropping the stores already open.
   */
  let kek: Buffer | undefined;
  const seal = async (store: string): Promise<void> => {
    if (!kek) {
      kek = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF }).kek;
      unlockPrivateStores('sid', 'molly', kek);
    }
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', store)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', store), record);
    setUnlockedDek('sid', store, unwrapDek(kek, record));
  };

  const name = (store: string, title: string): string => formatPrivatePageName('molly', store, title);

  /** A takeout of Molly's `store`, as the download route packs it. */
  const takeoutOf = async (store: string): Promise<Buffer> => {
    const t = await buildStoreTakeout(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store });
    return packZip(t.files.map(f => ({ path: f.path, bytes: f.bytes, mtime: f.mtime })));
  };

  /** Empty a store of its pages, as if on a new instance, keeping its keys. */
  const emptyStore = async (store: string): Promise<void> => {
    const root = privateStoreRoot(pagesDir, 'molly', store);
    for (const entry of await fs.readdir(root)) {
      if (entry !== 'store.json') await fs.remove(path.join(root, entry));
    }
  };

  /** Every file under the pages directory whose bytes contain `needle`. */
  const filesContaining = async (needle: string): Promise<string[]> => {
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if ((await fs.readFile(full)).includes(needle)) hits.push(path.relative(pagesDir, full));
      }
    };
    await walk(pagesDir);
    return hits;
  };

  const run = (store: string, archive: Buffer, ctx: ActorContext = MOLLY) =>
    importer.importOwnStoreTakeout(ctx, { store, archive, limits: LIMITS });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'takeout-import-'));
    pagesDir = path.join(testDir, 'pages');
    await fs.ensureDir(pagesDir);
    heldIds = new Map();
    heldBytes = new Map();
    visibleToMolly = new Set();
    await build();
    await seal(VAULT);
  });

  afterEach(async () => {
    provider.shutdown();
    clearUnlockedPrivateStores();
    kek = undefined;
    await fs.remove(testDir);
  });

  test('a sealed store round-trips: pages come back readable, and stay ciphertext on disk', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    await pages.savePage(name(VAULT, "Molly's Recipes"), 'Bread and soup.', { uuid: UUID_B }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);

    const report = await run(VAULT, archive);

    expect(report.pages.map(p => p.outcome)).toEqual(['imported', 'imported']);
    const back = await pages.getPage(name(VAULT, UUID_A), MOLLY);
    expect(back?.title).toBe('Medical notes');
    expect(back?.content.trim()).toBe('Cholesterol 180.');
    expect((await pages.getPage(name(VAULT, "Molly's Recipes"), MOLLY))?.uuid).toBe(UUID_B);
    // Nothing plaintext reached the disk: not the page, not a staging copy.
    expect(await filesContaining('Cholesterol 180')).toEqual([]);
  });

  test('importing the same takeout twice changes nothing the second time', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    await run(VAULT, archive);
    const version = (await pages.getPage(name(VAULT, UUID_A), MOLLY))?.metadata?.version;

    const again = await run(VAULT, archive);

    expect(again.pages).toEqual([{ title: 'Medical notes', outcome: 'unchanged' }]);
    expect((await pages.getPage(name(VAULT, UUID_A), MOLLY))?.metadata?.version).toBe(version);
  });

  test('a page edited since the takeout is skipped as changed, and the live page wins', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 150 now.', { uuid: UUID_A }, MOLLY);

    const report = await run(VAULT, archive);

    expect(report.pages).toEqual([{ title: 'Medical notes', outcome: 'changed-since-takeout' }]);
    expect((await pages.getPage(name(VAULT, UUID_A), MOLLY))?.content.trim()).toBe('Cholesterol 150 now.');
  });

  test('a uuid already in another of her stores is skipped, naming where it lives', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await seal(OTHER);

    const report = await run(OTHER, archive);

    expect(report.pages).toEqual([
      { title: 'Medical notes', outcome: 'uuid-elsewhere', where: name(VAULT, 'Medical notes') }
    ]);
    expect(await pages.getPage(name(OTHER, UUID_A), MOLLY)).toBeNull();
  });

  /** A one-page takeout whose page claims `uuid`. */
  const claiming = (uuid: string): Promise<Buffer> => packZip([{
    path: `${VAULT}/Medical notes.md`,
    bytes: Buffer.from(`---\ntitle: Medical notes\nuuid: ${uuid}\n---\n\nCholesterol 180.\n`)
  }]);

  test('a uuid held by a public page she cannot view is reported without naming it', async () => {
    await pages.savePage('Board minutes', 'Confidential.', { uuid: UUID_A }, actor('root', ['admin']));

    const report = await run(VAULT, await claiming(UUID_A));

    expect(report.pages).toEqual([{ title: 'Medical notes', outcome: 'uuid-elsewhere' }]);
    expect(await pages.getPage(name(VAULT, 'Medical notes'), MOLLY)).toBeNull();
  });

  test('a uuid held by a public page she CAN view is named', async () => {
    await pages.savePage('Recipes', 'Soup.', { uuid: UUID_A }, actor('root', ['admin']));
    visibleToMolly.add('Recipes');

    const report = await run(VAULT, await claiming(UUID_A));

    expect(report.pages).toEqual([{ title: 'Medical notes', outcome: 'uuid-elsewhere', where: 'Recipes' }]);
  });

  test('a title held by a DIFFERENT page lands beside it as "(imported)"', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    await pages.savePage(name(VAULT, 'Medical notes'), 'A different page.', { uuid: UUID_B }, MOLLY);

    const report = await run(VAULT, archive);

    expect(report.pages).toEqual([
      { title: 'Medical notes', outcome: 'imported', importedAs: name(VAULT, 'Medical notes (imported)') }
    ]);
    expect((await pages.getPage(name(VAULT, 'Medical notes'), MOLLY))?.content.trim()).toBe('A different page.');
    expect((await pages.getPage(name(VAULT, 'Medical notes (imported)'), MOLLY))?.uuid).toBe(UUID_A);
  });

  test('attachment links are pointed at the files as this store holds them', async () => {
    const archive = await packZip([
      { path: `${VAULT}/Labs.md`, bytes: Buffer.from(`---\ntitle: Labs\nuuid: ${UUID_A}\n---\n\n![scan](/attachments/old-id) and /attachments/old-id-2 stays.\n`) },
      { path: `${VAULT}/attachments/scan.pdf`, bytes: Buffer.from('%PDF lab scan') },
      {
        path: `${VAULT}/files-index.json`,
        bytes: Buffer.from(JSON.stringify({
          version: 1,
          files: { 'old-id': { id: 'old-id', fileName: 'attachments/scan.pdf', name: 'scan.pdf', encodingFormat: 'application/pdf' } }
        }))
      }
    ]);

    const report = await run(VAULT, archive);
    const newId = [...heldBytes.keys()][0];

    expect(report.files).toBe(1);
    const body = (await pages.getPage(name(VAULT, 'Labs'), MOLLY))?.content ?? '';
    expect(body).toContain(`![scan](/attachments/${newId})`);
    // A longer id that merely starts the same is a different file.
    expect(body).toContain('/attachments/old-id-2 stays.');
  });

  test('files no page in the store links to still come in, and are reported', async () => {
    // Its page is already on the site in another store, so it is skipped;
    // its file lands anyway (operator, 2026-09-25) and is named in the report.
    await pages.savePage(name(VAULT, 'Labs'), 'Kept here.', { uuid: UUID_A }, MOLLY);
    await seal(OTHER);
    const archive = await packZip([
      { path: `${VAULT}/Labs.md`, bytes: Buffer.from(`---\ntitle: Labs\nuuid: ${UUID_A}\n---\n\n![scan](/attachments/old-id)\n`) },
      { path: `${VAULT}/Notes.md`, bytes: Buffer.from(`---\ntitle: Notes\nuuid: ${UUID_B}\n---\n\n![photo](/attachments/old-2)\n`) },
      { path: `${VAULT}/attachments/scan.pdf`, bytes: Buffer.from('%PDF lab scan') },
      { path: `${VAULT}/attachments/photo.jpg`, bytes: Buffer.from('jpeg bytes') },
      {
        path: `${VAULT}/files-index.json`,
        bytes: Buffer.from(JSON.stringify({ version: 1, files: {
          'old-id': { id: 'old-id', fileName: 'attachments/scan.pdf', name: 'scan.pdf' },
          'old-2': { id: 'old-2', fileName: 'attachments/photo.jpg', name: 'photo.jpg' }
        } }))
      }
    ]);

    const report = await run(OTHER, archive);

    expect(report.files).toBe(2);
    expect(report.pages.map(p => p.outcome)).toEqual(['uuid-elsewhere', 'imported']);
    expect(report.unlinkedFiles).toEqual(['scan.pdf']);
  });

  test('a LOCKED store is refused before anything is written', async () => {
    const archive = await packZip([{ path: `${VAULT}/Page.md`, bytes: Buffer.from('---\ntitle: Page\n---\n\nx\n') }]);

    await expect(run(VAULT, archive, MOLLY_LOCKED)).rejects.toMatchObject({ reason: 'locked' });
    expect(heldBytes.size).toBe(0);
    expect(await pages.getPage(name(VAULT, 'Page'), MOLLY)).toBeNull();
  });

  test('a store she does not have is refused, rather than made', async () => {
    const archive = await packZip([{ path: 'x/Page.md', bytes: Buffer.from('x') }]);

    await expect(run('nosuchstore', archive)).rejects.toBeInstanceOf(TakeoutImportRefused);
    await expect(run('nosuchstore', archive)).rejects.toMatchObject({ reason: 'no-such-store' });
  });

  test('a file that is not a takeout is refused with a reason', async () => {
    await expect(run(VAULT, Buffer.from('not a zip'))).rejects.toMatchObject({ reason: 'unreadable' });
  });
});
