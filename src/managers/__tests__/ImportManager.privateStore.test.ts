/**
 * A takeout handed back into its owner's private store, through the ICE
 * engine (#2118): the shim `core.takeout` into the receiver
 * `core.private-store`, end to end, on a real SEALED store.
 *
 * The real PageManager over the real VersioningFileProvider, and the real
 * AttachmentManager over the real BasicAttachmentProvider behind
 * FileManager's write door, in a temp directory, because that is where an
 * import can be wrong in a way nobody sees: pages and files that read back
 * fine and sit on disk in the clear. The takeout is built by the real
 * exporter and packed by the real writer, so the round trip is the one a
 * person makes. The upload goes through `enqueueUpload`, as `POST /import`
 * sends it, with the request's context holding the store's key.
 *
 * The cases of the takeout import's own door (#1472) are kept, as the
 * engine reports them.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import ImportManager from '../ImportManager';
import PageManager from '../PageManager';
import ValidationManager from '../ValidationManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import VersioningFileProvider from '../../providers/VersioningFileProvider';
import { withFilesDoor } from '../../test-support/filesDoor';
import { actor } from '../../test-support/actors';
import { FileIceLedger, MemoryIceLedger } from '../../ice/ledger';
import logger from '../../utils/logger';
import type { ActorContext } from '../../context/ActorContext';
import type { IceRunReport } from '../../ice/types';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { formatPrivatePageName, privateStoreRoot, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, isSealedBytes, unwrapDek } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { buildStoreTakeout } from '../../utils/privateStoreExport';
import { packZip } from '../../utils/zipArchive';
import { redactPrivateNamesDeep } from '../../utils/redactPrivateNames';

const VAULT = 'vault';
const OTHER = 'other';
const RECEIVER = 'core.private-store';
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** A distinctive page title and file name: never in a log, a notice or the audit record. */
const SECRET = 'Oncology-referral-Smith';

const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
/** Molly again, in a session that never unlocked her sealed store. */
const MOLLY_LOCKED: ActorContext = { ...actor('molly'), privateStoreHandle: 'other-sid' };

const LEVELS = ['info', 'warn', 'error', 'debug'] as const;
type MockFn = { mock: { calls: unknown[][] }; mockClear(): void };
/** Everything written to the logger, as text. */
const logged = (): string => LEVELS.flatMap(l => (logger[l] as unknown as MockFn).mock.calls)
  .map(args => args.map(a => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  .join('\n');

describe('a takeout into its owner\'s private store, through the engine (#2118)', () => {
  let testDir: string;
  let pagesDir: string;
  let storageDir: string;
  let provider: VersioningFileProvider;
  let pages: PageManager;
  let attachments: AttachmentManager;
  let importer: ImportManager;
  let visibleToMolly: Set<string>;
  let audit: { logAuditEvent: ReturnType<typeof vi.fn>; flushAuditQueue: () => Promise<void> };

  const build = async (): Promise<void> => {
    const config: Record<string, unknown> = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.versioning.indexfile': path.join(testDir, 'data', 'page-index.json'),
      'ngdpbase.page.provider.versioning.deltastorage': true,
      'ngdpbase.page.provider.versioning.compression': 'none',
      'ngdpbase.system-category': { general: { label: 'general', storageLocation: { defaultstore: 'pages/' } } },
      'ngdpbase.attachment.maxsize': 10485760,
      'ngdpbase.attachment.allowedtypes': ''
    };
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => (config[key] !== undefined ? config[key] : fallback)),
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        key === 'ngdpbase.page.provider.versioning.indexfile' ? path.join(testDir, 'data', 'page-index.json')
          : key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir
            : key === 'ngdpbase.page.provider.filesystem.requiredpagesdir' ? path.join(testDir, 'required-pages')
              : key === 'ngdpbase.attachment.provider.basic.storagedir' ? storageDir
                : key === 'ngdpbase.attachment.metadatafile' ? path.join(storageDir, 'attachment-metadata.json')
                  : fallback),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    audit = { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() };
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      // Everything, but `admin-system` only to an admin: Molly is not one (#1503).
      PolicyDecisionPoint: {
        permits: (ctx: ActorContext, permission: string) => Promise.resolve(permission !== 'admin-system' || !!ctx.roles?.includes('admin')),
        decide: () => Promise.resolve({ permit: true })
      },
      PolicyInformationPoint: {
        // Her own vault pages, as the real rule gives her, and the public pages a test lets her see.
        canUserAccessPage: vi.fn(async (_subject: unknown, name: string) => name.startsWith('vaults/molly/') || visibleToMolly.has(name)),
        // The same rule, asked without a record: whether to offer a link (`mayShowPage`).
        pageAffordanceFor: async (_subject: unknown, name: string) => name.startsWith('vaults/molly/') || visibleToMolly.has(name),
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner)
      },
      AuditManager: audit
    };
    const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
    managers['ValidationManager'] = new ValidationManager(engine);
    provider = new VersioningFileProvider(engine);
    await provider.initialize();
    pages = new PageManager(engine);
    (pages as unknown as { provider: unknown }).provider = provider;
    managers['PageManager'] = pages;

    attachments = withFilesDoor(new AttachmentManager(engine));
    const attachmentProvider = new BasicAttachmentProvider(engine);
    await attachmentProvider.initialize();
    (attachments as unknown as { attachmentProvider: unknown }).attachmentProvider = attachmentProvider;
    managers['AttachmentManager'] = attachments;

    importer = new ImportManager(engine);
    await importer.initialize();
    importer.setImportLedger(new MemoryIceLedger());
  };

  /**
   * Make `store` an encrypted store of Molly's, unlocked in her session. One
   * user key for all her stores and one unlock, as in life.
   */
  let kek: Buffer | undefined;
  const seal = async (store: string): Promise<void> => {
    if (!kek) {
      kek = (await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF })).kek;
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

  /** Empty a store of its pages and files, as if on a new instance, keeping its keys. */
  const emptyStore = async (store: string): Promise<void> => {
    const root = privateStoreRoot(pagesDir, 'molly', store);
    for (const entry of await fs.readdir(root)) {
      if (entry !== 'store.json') await fs.remove(path.join(root, entry));
    }
  };

  /** Every file under the temp directory whose bytes contain `needle`. */
  const filesContaining = async (needle: string): Promise<string[]> => {
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if ((await fs.readFile(full)).includes(needle)) hits.push(path.relative(testDir, full));
      }
    };
    await walk(testDir);
    return hits;
  };

  /** Upload `archive` on the import screen into `store`: the run ends in the request (`writesEncrypted`). */
  const upload = async (store: string, archive: Buffer, ctx: ActorContext = MOLLY): Promise<IceRunReport> => {
    const runId = await importer.enqueueUpload({
      source: { type: 'upload', files: [{ name: 'takeout-vault.zip', bytes: archive, mediaType: 'application/zip' }] },
      receiver: RECEIVER,
      target: store
    }, ctx);
    const run = importer.getImportRun(runId, ctx);
    if (!run) throw new Error('no run');
    return run;
  };

  /** A run's files by their path in the takeout, as `[status, message]`. */
  const byPath = (run: IceRunReport): Record<string, [string, string | undefined]> =>
    Object.fromEntries(run.files.map(f => [f.name.replace(/^takeout-vault\.zip\//, ''), [f.status, f.message]]));

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ice-takeout-'));
    pagesDir = path.join(testDir, 'pages');
    storageDir = path.join(testDir, 'attachments');
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(storageDir);
    visibleToMolly = new Set();
    clearUnlockedPrivateStores();
    await build();
    await seal(VAULT);
    for (const l of LEVELS) (logger[l] as unknown as MockFn).mockClear();
  });

  afterEach(async () => {
    provider.shutdown();
    clearUnlockedPrivateStores();
    kek = undefined;
    await fs.remove(testDir);
  });

  test('offered to the owner, into the stores this session can write, and confidential', async () => {
    await seal(OTHER);
    const offered = (await importer.receiversFor(MOLLY)).find(r => r.id === RECEIVER);
    // The default store too, which every person has before they write in it (#1472).
    expect(offered?.targets?.map(t => t.id).sort()).toEqual(['default', OTHER, VAULT].sort());
    expect(offered?.originals).toEqual({ allowed: ['none'], default: 'none' });
    expect(importer.isConfidential(RECEIVER)).toBe(true);
  });

  test('a sealed store round-trips: pages and files come back readable, links pointed at the files here, nothing plaintext on disk', async () => {
    const archive = await packZip([
      { path: `${VAULT}/${SECRET}.md`, bytes: Buffer.from(`---\ntitle: ${SECRET}\nuuid: ${UUID_A}\n---\n\nCholesterol 180. ![scan](/attachments/old-id) and /attachments/old-id-2 stays.\n`) },
      { path: `${VAULT}/attachments/${SECRET}.pdf`, bytes: Buffer.from('%PDF-1.4 lab scan 4471') },
      {
        path: `${VAULT}/files-index.json`,
        bytes: Buffer.from(JSON.stringify({
          version: 1,
          files: { 'old-id': { id: 'old-id', fileName: `attachments/${SECRET}.pdf`, name: `${SECRET}.pdf`, encodingFormat: 'application/pdf' } }
        }))
      }
    ]);

    const run = await upload(VAULT, archive);

    expect(run.state).toBe('done');
    expect(run.target).toBe(VAULT);
    expect(byPath(run)).toEqual({
      [`${VAULT}/${SECRET}.md`]: ['imported', undefined],
      [`${VAULT}/attachments/${SECRET}.pdf`]: ['imported', undefined],
      [`${VAULT}/files-index.json`]: ['noise', expect.stringContaining('file index')]
    });
    const back = await pages.getPage(name(VAULT, UUID_A), MOLLY);
    expect(back?.title).toBe(SECRET);
    const fileId = run.files.find(f => f.name.endsWith('.pdf'))?.refs[0];
    expect(fileId).toBeTruthy();
    expect(back?.content).toContain(`![scan](/attachments/${fileId})`);
    // A longer id that merely starts the same is a different file.
    expect(back?.content).toContain('/attachments/old-id-2 stays.');
    expect((await attachments.getPrivateStoreAttachment(String(fileId), MOLLY))?.buffer.toString()).toBe('%PDF-1.4 lab scan 4471');
    // Nothing plaintext reached the disk: not the page, not the file, not a staging copy.
    expect(await filesContaining('Cholesterol 180')).toEqual([]);
    expect(await filesContaining('lab scan 4471')).toEqual([]);
    const storeFiles = await fs.readdir(path.join(privateStoreRoot(pagesDir, 'molly', VAULT), 'attachments'));
    expect(storeFiles).toHaveLength(1);
    expect(isSealedBytes(await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', VAULT), 'attachments', storeFiles[0])))).toBe(true);
  });

  // Code review finding 1 of #2160: the engine unpacked it, and the old door imported it.
  test('a zip the store held, linked from no page, comes back as a file, whole', async () => {
    const inner = await packZip([{ path: 'letters/one.txt', bytes: Buffer.from('dear molly') }]);
    const archive = await packZip([
      { path: `${VAULT}/Medical notes.md`, bytes: Buffer.from(`---\ntitle: Medical notes\nuuid: ${UUID_A}\n---\n\nNo links.\n`) },
      { path: `${VAULT}/attachments/old.zip`, bytes: inner }
    ]);

    const run = await upload(VAULT, archive);

    expect(byPath(run)).toEqual({
      [`${VAULT}/Medical notes.md`]: ['imported', undefined],
      [`${VAULT}/attachments/old.zip`]: ['imported', undefined]
    });
    const id = run.files.find(f => f.name.endsWith('old.zip'))?.refs[0];
    expect((await attachments.getPrivateStoreAttachment(String(id), MOLLY))?.buffer.equals(inner)).toBe(true);
  });

  test('confidential: no page title or file name in any log, nor in the audit record, which counts the run', async () => {
    const archive = await packZip([
      { path: `${VAULT}/${SECRET}.md`, bytes: Buffer.from(`---\ntitle: ${SECRET}\nuuid: ${UUID_A}\n---\n\nx\n`) },
      { path: `${VAULT}/attachments/${SECRET}.pdf`, bytes: Buffer.from('%PDF-1.4 x') },
      // A page that cannot be imported (#1503): its failure names nothing in a log either.
      { path: `${VAULT}/${SECRET} 2.md`, bytes: Buffer.from(`---\ntitle: ${SECRET} 2\nsystem-category: documentation\n---\n\ny\n`) }
    ]);

    const run = await upload(VAULT, archive);

    // The uploader still sees every name on their own status.
    expect(run.files.map(f => f.name).join(' ')).toContain(SECRET);
    expect(logged()).not.toContain(SECRET);
    const events = audit.logAuditEvent.mock.calls.map(c => c[0] as Record<string, unknown>);
    const takeout = events.find(e => e.eventType === 'store-import');
    expect(takeout).toMatchObject({
      user: 'molly', action: 'store-import', resource: `private/molly/${VAULT}`,
      metadata: expect.objectContaining({ store: VAULT, pagesImported: 1, pagesFailed: 1, files: 1, fileErrors: 0, ownerUser: 'molly' })
    });
    // The file's own record is its door's, and names it by its id.
    const fileId = run.files.find(f => f.name.endsWith('.pdf'))?.refs[0];
    expect(fileId).toBeTruthy();
    expect(events.find(e => e.eventType === 'asset-upload')).toMatchObject({ metadata: expect.objectContaining({ attachmentId: fileId, store: VAULT, sealed: true }) });
    // As AuditManager stores them: a page's own record names it by its vault name, which it redacts (#1520).
    expect(JSON.stringify(redactPrivateNamesDeep(events))).not.toContain(SECRET);
  });

  // #2161: the ledger is plain JSON in the data directory, read by anyone with a backup.
  test('confidential: the file ledger on disk holds no page title or file name, and still skips a re-import', async () => {
    importer.setImportLedger(new FileIceLedger(path.join(testDir, 'import-ledger'), 1000));
    await pages.savePage(name(VAULT, 'Taken'), 'A different page.', { uuid: UUID_B }, MOLLY);
    const archive = await packZip([
      { path: `${VAULT}/${SECRET}.md`, bytes: Buffer.from(`---\ntitle: ${SECRET}\nuuid: ${UUID_A}\n---\n\nx\n`) },
      // Its title is held here by another page: the receiver's message names the title it was given.
      { path: `${VAULT}/Taken.md`, bytes: Buffer.from('---\ntitle: Taken\n---\n\nmine\n') },
      { path: `${VAULT}/attachments/${SECRET}.pdf`, bytes: Buffer.from('%PDF-1.4 x') },
      // Refused, with a message: that is not written either.
      { path: `${VAULT}/${SECRET} 2.md`, bytes: Buffer.from(`---\ntitle: ${SECRET} 2\nsystem-category: documentation\n---\n\ny\n`) }
    ]);

    const run = await upload(VAULT, archive);
    expect(run.files.map(f => f.status).sort()).toEqual(['imported', 'imported', 'imported', 'refused']);
    // The uploader's own status still names them.
    expect(run.files.find(f => f.name.endsWith('Taken.md'))?.message).toContain('Taken (imported)');

    expect(await filesContaining(SECRET)).toEqual([]);
    expect(await filesContaining('Taken')).toEqual([]);
    const again = await upload(VAULT, archive);
    // Pages and the file alike (code review of #2160, finding 6); the refused page is tried again.
    expect(byPath(again)).toMatchObject({
      [`${VAULT}/${SECRET}.md`]: ['unchanged', expect.anything()],
      [`${VAULT}/Taken.md`]: ['unchanged', expect.anything()],
      [`${VAULT}/attachments/${SECRET}.pdf`]: ['unchanged', expect.anything()],
      [`${VAULT}/${SECRET} 2.md`]: ['refused', expect.anything()]
    });
    const recent = await importer.recentImportsFor(MOLLY);
    expect(recent.length).toBeGreaterThan(0);
    expect(JSON.stringify(recent)).not.toContain(SECRET);
  });

  test('importing the same takeout again skips every file as unchanged, and changes nothing', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    const first = await upload(VAULT, archive);
    expect(first.files.filter(f => f.status === 'imported')).toHaveLength(1);
    const version = (await pages.getPage(name(VAULT, UUID_A), MOLLY))?.metadata?.version;

    const again = await upload(VAULT, archive);

    expect(again.files.map(f => f.status)).toEqual(['unchanged']);
    expect((await pages.getPage(name(VAULT, UUID_A), MOLLY))?.metadata?.version).toBe(version);
    // Another store is another place: the file is read again there, not skipped
    // (and its page, whose uuid is in the first store, is a duplicate).
    await seal(OTHER);
    const elsewhere = await upload(OTHER, archive);
    expect(elsewhere.files.map(f => f.status)).toEqual(['duplicate']);
  });

  // Code review of #2160, finding 2 (operator, 2026-10-30): the store's uuid check decides for a page, not the fingerprint.
  test('a page deleted since an import comes back when the same takeout is imported again', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    expect((await upload(VAULT, archive)).files.map(f => f.status)).toEqual(['imported']);

    expect(await pages.deletePage(name(VAULT, UUID_A), MOLLY)).toBe(true);
    expect(await pages.getPage(name(VAULT, UUID_A), MOLLY)).toBeNull();

    const again = await upload(VAULT, archive);

    expect(again.files.map(f => f.status)).toEqual(['imported']);
    const back = await pages.getPage(name(VAULT, UUID_A), MOLLY);
    expect(back?.content.trim()).toBe('Cholesterol 180.');
    expect(isSealedBytes(await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', VAULT), `${UUID_A}.md`)))).toBe(true);
    // Once it is back, a third import leaves it as it is.
    expect((await upload(VAULT, archive)).files.map(f => f.status)).toEqual(['unchanged']);
  });

  // #2171: a file, as a page (#2118): the store's own check decides, not the fingerprint.
  test('a file deleted since an import comes back when the same takeout is imported again', async () => {
    const archive = await packZip([
      { path: `${VAULT}/Medical notes.md`, bytes: Buffer.from(`---\ntitle: Medical notes\nuuid: ${UUID_A}\n---\n\nNo links.\n`) },
      { path: `${VAULT}/attachments/scan.pdf`, bytes: Buffer.from('%PDF-1.4 lab scan 4471') }
    ]);
    const first = await upload(VAULT, archive);
    expect(byPath(first)[`${VAULT}/attachments/scan.pdf`]).toEqual(['imported', undefined]);
    const id = String(first.files.find(f => f.name.endsWith('scan.pdf'))?.refs[0]);
    expect(await attachments.deleteAttachment(id, MOLLY)).toBe(true);
    expect(await attachments.getPrivateStoreAttachment(id, MOLLY)).toBeNull();

    const again = await upload(VAULT, archive);

    expect(byPath(again)).toMatchObject({
      [`${VAULT}/Medical notes.md`]: ['unchanged', expect.anything()],
      [`${VAULT}/attachments/scan.pdf`]: ['imported', undefined]
    });
    const back = String(again.files.find(f => f.name.endsWith('scan.pdf'))?.refs.find(ref => ref !== id));
    expect((await attachments.getPrivateStoreAttachment(back, MOLLY))?.buffer.toString()).toBe('%PDF-1.4 lab scan 4471');
    expect(await filesContaining('lab scan 4471')).toEqual([]);
    // Once it is back, a third import leaves it as it is.
    expect((await upload(VAULT, archive)).files.map(f => f.status)).toEqual(['unchanged', 'unchanged']);
  });

  // #2171: a re-import that finds everything still here writes no upload record for a file it did not store.
  test('importing the same takeout again records no upload for a file the store still holds, linked or not', async () => {
    const archive = await packZip([
      { path: `${VAULT}/Medical notes.md`, bytes: Buffer.from(`---\ntitle: Medical notes\nuuid: ${UUID_A}\n---\n\n![scan](/attachments/old-id)\n`) },
      { path: `${VAULT}/attachments/scan.pdf`, bytes: Buffer.from('%PDF-1.4 scan') },
      { path: `${VAULT}/attachments/loose.txt`, bytes: Buffer.from('a loose file') },
      {
        path: `${VAULT}/files-index.json`,
        bytes: Buffer.from(JSON.stringify({ version: 1, files: { 'old-id': { id: 'old-id', fileName: 'attachments/scan.pdf', name: 'scan.pdf' } } }))
      }
    ]);
    await upload(VAULT, archive);
    const uploads = (): number => audit.logAuditEvent.mock.calls.filter(c => (c[0] as { eventType?: string }).eventType === 'asset-upload').length;
    const before = uploads();

    const again = await upload(VAULT, archive);

    expect(again.files.filter(f => f.status !== 'noise').map(f => f.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(uploads()).toBe(before);
  });

  test('a page edited since the takeout is a duplicate, and the live page wins', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 150 now.', { uuid: UUID_A }, MOLLY);

    const run = await upload(VAULT, archive);

    expect(run.files.map(f => [f.status, f.message])).toEqual([['duplicate', 'changed since the download; the page here was kept']]);
    expect((await pages.getPage(name(VAULT, UUID_A), MOLLY))?.content.trim()).toBe('Cholesterol 150 now.');
  });

  test('a page already here, unchanged, is a duplicate', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);

    const run = await upload(VAULT, await takeoutOf(VAULT));

    expect(run.files.map(f => [f.status, f.message])).toEqual([['duplicate', 'already here, unchanged']]);
  });

  test('a uuid already in another of her stores is a duplicate, naming where it lives', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await seal(OTHER);

    const run = await upload(OTHER, archive);

    expect(run.files.map(f => [f.status, f.message])).toEqual([
      ['duplicate', `already on this site as ${name(VAULT, 'Medical notes')}; not imported`]
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

    const run = await upload(VAULT, await claiming(UUID_A));

    expect(run.files.map(f => [f.status, f.message])).toEqual([['duplicate', 'already on this site elsewhere; not imported']]);
    expect(await pages.getPage(name(VAULT, 'Medical notes'), MOLLY)).toBeNull();
  });

  test('a uuid held by a public page she CAN view is named', async () => {
    await pages.savePage('Recipes', 'Soup.', { uuid: UUID_A }, actor('root', ['admin']));
    visibleToMolly.add('Recipes');

    const run = await upload(VAULT, await claiming(UUID_A));

    expect(run.files[0].message).toBe('already on this site as Recipes; not imported');
  });

  test('a title held by a DIFFERENT page lands beside it as "(imported)"', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    await pages.savePage(name(VAULT, 'Medical notes'), 'A different page.', { uuid: UUID_B }, MOLLY);

    const run = await upload(VAULT, archive);

    expect(run.files[0]).toMatchObject({
      status: 'imported', refs: [name(VAULT, 'Medical notes (imported)')],
      message: 'a page here already had its title, so it was imported as "Medical notes (imported)"'
    });
    expect((await pages.getPage(name(VAULT, 'Medical notes'), MOLLY))?.content.trim()).toBe('A different page.');
    expect((await pages.getPage(name(VAULT, 'Medical notes (imported)'), MOLLY))?.uuid).toBe(UUID_A);
  });

  // #1503 (operator, 2026-10-29): only an administrator sets a page's system-category.
  test('a page naming another system-category is refused for a non-admin; the rest are imported', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    await pages.savePage(name(VAULT, 'Smuggled'), 'Not mine to class.', { uuid: UUID_B, 'system-category': 'documentation' }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);

    const run = await upload(VAULT, archive);

    const status = byPath(run);
    expect(status[`${VAULT}/Medical notes.md`]).toEqual(['imported', undefined]);
    expect(status[`${VAULT}/Smuggled.md`]).toEqual(['refused', "Only administrators can set a page's system category"]);
    expect(await pages.getPage(name(VAULT, 'Smuggled'), MOLLY)).toBeNull();
  });

  test('a LOCKED store is not offered, and an upload into it is refused before anything is written', async () => {
    const offered = (await importer.receiversFor(MOLLY_LOCKED)).find(r => r.id === RECEIVER);
    expect(offered?.targets?.map(t => t.id) ?? []).not.toContain(VAULT);
    const archive = await claiming(UUID_A);

    await expect(upload(VAULT, archive, MOLLY_LOCKED)).rejects.toThrow(/choose one of the places/);
    expect(await pages.getPage(name(VAULT, 'Medical notes'), MOLLY)).toBeNull();
  });

  test('a store she does not have is refused, rather than made', async () => {
    await expect(upload('nosuchstore', await claiming(UUID_A))).rejects.toThrow(/choose one of the places/);
  });

  // Security review of #2160 (Low): the receiver's door checks the store itself, whoever calls it.
  test('the receiver\'s own door refuses a store she cannot write now, or does not have', async () => {
    const receiver = (importer as unknown as { receiverRegistry: Map<string, { receive: (i: unknown, c: ActorContext, info: unknown) => Promise<{ status: string }> }> })
      .receiverRegistry.get(RECEIVER);
    const file = { kind: 'takeout', name: 'x.zip/vault/attachments/a.txt', bytes: Buffer.from('a'), data: { entry: 'file', name: 'a.txt' } };
    const info = (target: string): unknown => ({ runId: 'r', source: { name: 'x.zip', sha256: 'f' }, chain: [], target });

    expect(await receiver.receive(file, MOLLY_LOCKED, info(VAULT))).toMatchObject({ status: 'refused' });
    expect(await receiver.receive(file, MOLLY, info('nosuchstore'))).toMatchObject({ status: 'refused' });
    expect(await fs.pathExists(privateStoreRoot(pagesDir, 'molly', 'nosuchstore'))).toBe(false);
    expect(await receiver.receive(file, MOLLY, info(VAULT))).toMatchObject({ status: 'stored' });
  });

  test('a file that is not a takeout imports nothing, and says why', async () => {
    const run = await upload(VAULT, Buffer.from('not a zip'));
    expect(run.files.map(f => f.status)).toEqual(['failed']);
    const loose = await importer.enqueueUpload({
      source: { type: 'upload', files: [{ name: 'Medical notes.md', bytes: Buffer.from('Cholesterol 180.') }] }, receiver: RECEIVER, target: VAULT
    }, MOLLY);
    expect(importer.getImportRun(loose, MOLLY)?.files.map(f => f.status)).toEqual(['unreadable']);
  });

  /** The import report pages in `store`. */
  const reportsIn = async (store: string): Promise<Array<{ name: string; title: string; uuid: string }>> =>
    (await pages.listVaultPages(MOLLY, 'molly', store)).filter(p => p.title.includes('-import-report'));

  // Code review of #2160, finding 3 (operator, 2026-10-30): the report the old door kept (operator, 2026-09-25).
  test('a run keeps its report as a page in the store, sealed, counting the files no page links to', async () => {
    const archive = await packZip([
      { path: `${VAULT}/${SECRET}.md`, bytes: Buffer.from(`---\ntitle: ${SECRET}\nuuid: ${UUID_A}\n---\n\n![scan](/attachments/old-id)\n`) },
      { path: `${VAULT}/attachments/scan.pdf`, bytes: Buffer.from('%PDF-1.4 scan') },
      { path: `${VAULT}/attachments/${SECRET}.jpg`, bytes: Buffer.from('jpeg bytes') },
      {
        path: `${VAULT}/files-index.json`,
        bytes: Buffer.from(JSON.stringify({ version: 1, files: {
          'old-id': { id: 'old-id', fileName: 'attachments/scan.pdf', name: 'scan.pdf' },
          'old-2': { id: 'old-2', fileName: `attachments/${SECRET}.jpg`, name: `${SECRET}.jpg` }
        } }))
      }
    ]);

    await upload(VAULT, archive);

    const reports = await reportsIn(VAULT);
    expect(reports.map(r => r.title)).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}-import-report$/)]);
    const content = (await pages.getPage(reports[0].name, MOLLY))?.content ?? '';
    expect(content).toContain('**takeout-vault.zip**');
    expect(content).toContain('- Pages imported: 1');
    expect(content).toContain(`[${SECRET}|${VAULT}/${SECRET}] — imported`);
    expect(content).toContain('- Files stored: 2 (1 not linked from any page)');
    expect(content).toContain(`## Files no page links to\n\nStored in this store, but no page here links to them.\n\n- ${SECRET}.jpg\n`);
    // The file index is read, not left out.
    expect(content).not.toContain('Left out');
    // Counted in the audit record, as the old door counted it; named only in the report.
    expect(audit.logAuditEvent.mock.calls.map(c => c[0] as Record<string, unknown>).find(e => e.eventType === 'store-import'))
      .toMatchObject({ metadata: expect.objectContaining({ filesUnlinked: 1 }) });
    expect(logged()).not.toContain(SECRET);
    // Sealed as the store is: neither its title nor its words are anywhere on disk.
    expect(await filesContaining('import-report')).toEqual([]);
    expect(await filesContaining('no page links to')).toEqual([]);
    expect(isSealedBytes(await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', VAULT), `${reports[0].uuid}.md`)))).toBe(true);
  });

  test('a second run adds its own report; a run that reads no takeout writes none', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    await upload(VAULT, archive);
    await upload(VAULT, archive);

    const reports = await reportsIn(VAULT);
    expect(reports).toHaveLength(2);
    const contents = await Promise.all(reports.map(async r => (await pages.getPage(r.name, MOLLY))?.content ?? ''));
    expect(contents.filter(c => c.includes('- Pages imported: 1'))).toHaveLength(1);
    expect(contents.filter(c => c.includes('- Already here, unchanged: 1'))).toHaveLength(1);

    await upload(VAULT, Buffer.from('not a zip'));
    expect(await reportsIn(VAULT)).toHaveLength(2);
  });

  test('her recent imports list the takeout, with the store it went into, by fingerprint (#2161)', async () => {
    await pages.savePage(name(VAULT, 'Medical notes'), 'Cholesterol 180.', { uuid: UUID_A }, MOLLY);
    const archive = await takeoutOf(VAULT);
    await emptyStore(VAULT);
    await upload(VAULT, archive);

    const recent = await importer.recentImportsFor(MOLLY);

    // The ledger names nothing of a sealed store: no title, so no link by it either.
    expect(recent).toEqual([expect.objectContaining({ receiver: RECEIVER, target: VAULT, status: 'imported', name: expect.stringMatching(/^[0-9a-f]{12}$/), refs: 0 })]);
    expect(recent[0].link).toBeUndefined();
  });
});
