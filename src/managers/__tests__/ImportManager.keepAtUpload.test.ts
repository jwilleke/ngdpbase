/**
 * Keeping an original in an ENCRYPTED store during the upload (#2034).
 *
 * A real ImportManager and BackgroundJobManager over a real AttachmentManager
 * and BasicAttachmentProvider, in a temp directory, with an encrypted store
 * unlocked in the user's session. The receiver keeps originals in that store
 * through the upload door (`uploadAttachment(..., { private: true, store })`),
 * which seals the bytes and the store's own index with the store's key.
 *
 * - the original is kept during `enqueueUpload`, with the request's context,
 *   while the key is live; the queued run reuses it and keeps no second copy;
 * - the run itself carries a job context, which never holds the key: signing
 *   out right after the upload still imports;
 * - a keep refused at upload refuses the upload, and nothing is queued;
 * - without the request's context the run cannot keep (the key is not there).
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import BackgroundJobManager from '../BackgroundJobManager';
import ImportManager, { ImportUploadRefused } from '../ImportManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import logger from '../../utils/logger';
import { MemoryIceLedger } from '../../ice/ledger';
import type { IceItem, IceRunRequest } from '../../ice/types';
import { jobContextFromRequest } from '../../context/JobContext';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, isSealedBytes, unwrapDek } from '../../utils/privateStoreCrypto';
import { storeMetaPath } from '../../utils/privateStorePath';
import { clearUnlockedPrivateStores, lockPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const STORE = 'vault';
/** The request's context: a password session's subject carries its key handle. */
const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'molly-sid' } as ActorContext;
const XML = Buffer.from('<ClinicalDocument>cholesterol 180</ClinicalDocument>');

describe('ImportManager — keeping an original in an encrypted store at upload (#2034)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let attachments: AttachmentManager;
  let jobs: BackgroundJobManager;
  let importManager: ImportManager;
  let dek: Buffer;
  let kek: Buffer;
  /** Every keep, with the context it ran with. */
  let keeps: Array<{ ctx: ActorContext }>;
  /** What the receiver's door was handed. */
  let received: Array<{ ctx: ActorContext; original?: string }>;

  const request = (bytes = XML): IceRunRequest => ({
    source: { type: 'upload', files: [{ name: 'labs.xml', bytes }] },
    receiver: 'vaultrec.records',
    original: 'keep'
  });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ice-keep-at-upload-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();

    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => {
          if (key === 'ngdpbase.attachment.maxsize') return 10485760;
          if (key === 'ngdpbase.attachment.allowedtypes') return '';
          return def;
        },
        getResolvedDataPath: (key: string, def: unknown) => {
          if (key === 'ngdpbase.attachment.provider.basic.storagedir') return storageDir;
          if (key === 'ngdpbase.attachment.metadatafile') return path.join(storageDir, 'attachment-metadata.json');
          if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
          return def;
        }
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true), decide: () => Promise.resolve({ permit: true }) },
      AuditManager: { logAuditEvent: vi.fn().mockResolvedValue('evt'), flushAuditQueue: () => Promise.resolve() },
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner)
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;

    attachments = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (attachments as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    managers['AttachmentManager'] = attachments;
    jobs = new BackgroundJobManager(engine);
    managers['BackgroundJobManager'] = jobs;
    importManager = new ImportManager(engine);
    await importManager.initialize();
    importManager.setImportLedger(new MemoryIceLedger());

    // Molly's encrypted store, unlocked in her session.
    const keys = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    kek = keys.kek;
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', STORE), record);
    dek = unwrapDek(kek, record);
    unlockPrivateStores('molly-sid', 'molly', kek);
    setUnlockedDek('molly-sid', STORE, dek);

    // phr's shape: a receiver that keeps originals in the user's encrypted store, through the upload door.
    keeps = [];
    received = [];
    importManager.registerReceiver('vaultrec', {
      name: 'records',
      accepts: ['file'],
      keepsEncrypted: true,
      mayUse: async () => true,
      receive: async (_item: IceItem, ctx, info) => {
        received.push({ ctx, ...(info.original ? { original: info.original.ref } : {}) });
        return { status: 'stored', ref: `record-${received.length}` };
      },
      keepOriginal: async (item: IceItem, ctx: ActorContext) => {
        keeps.push({ ctx });
        const bytes = item.bytes ?? Buffer.alloc(0);
        const stored = await attachments.uploadAttachment(
          bytes, { originalName: path.basename(item.name), mimeType: 'application/xml', size: bytes.length }, ctx,
          { private: true, store: STORE, description: 'original' }
        );
        return { status: 'stored', ref: stored.identifier };
      }
    });
  });

  afterEach(async () => {
    await jobs.whenIdle();
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  const storeFiles = () => fs.readdir(path.join(pagesDir, 'vaults', 'molly', STORE, 'attachments')).catch(() => [] as string[]);

  test('kept at upload with the request context; the run reuses it, keeps no second copy, and needs no key', async () => {
    const runId = await importManager.enqueueUpload(request(), MOLLY);
    // Kept before enqueueUpload returned, with the request's own context.
    expect(keeps).toHaveLength(1);
    expect(keeps[0].ctx).toBe(MOLLY);
    // Signing out right after the upload: the key is gone before the run starts.
    lockPrivateStores('molly-sid');

    await jobs.whenIdle();
    await vi.waitFor(() => expect(importManager.getImportRun(runId, MOLLY)?.state).toBe('done'));
    const run = importManager.getImportRun(runId, MOLLY);
    expect(run?.files[0]).toMatchObject({ status: 'imported', original: { name: 'labs.xml' } });
    const ref = run?.files[0].original?.ref;
    expect(keeps).toHaveLength(1);
    expect(received).toHaveLength(1);
    expect(received[0].original).toBe(ref);
    expect(received[0].ctx).not.toHaveProperty('privateStoreHandle');

    // One sealed file in the store, listed in its sealed index: readable once the store is unlocked again.
    const files = await storeFiles();
    expect(files).toHaveLength(1);
    expect(isSealedBytes(await fs.readFile(path.join(pagesDir, 'vaults', 'molly', STORE, 'attachments', files[0])))).toBe(true);
    unlockPrivateStores('molly-sid', 'molly', kek);
    setUnlockedDek('molly-sid', STORE, dek);
    expect((await attachments.getPrivateStoreAttachment(String(ref), MOLLY))?.buffer.equals(XML)).toBe(true);
  });

  test('a confidential import: the sealed store\'s upload door and the run log no file name (#2110)', async () => {
    const levels = ['info', 'warn', 'error', 'debug'] as const;
    const calls = () => levels.flatMap(l => (logger[l] as unknown as { mock: { calls: unknown[][] } }).mock.calls);
    const before = calls().length;
    const runId = await importManager.enqueueUpload(request(), MOLLY);
    await jobs.whenIdle();
    await vi.waitFor(() => expect(importManager.getImportRun(runId, MOLLY)?.state).toBe('done'));
    expect(importManager.isConfidential('vaultrec.records')).toBe(true);
    const logged = calls().slice(before).map(args => args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join('\n')).not.toContain('labs');
  });

  test('without the request context the run cannot keep: a job context holds no key', async () => {
    const runId = await importManager.enqueueImport(request(), jobContextFromRequest(MOLLY));
    await jobs.whenIdle();
    await vi.waitFor(() => expect(importManager.getImportRun(runId, MOLLY)?.state).toBe('done'));
    expect(importManager.getImportRun(runId, MOLLY)?.files[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/locked/) });
    expect(await storeFiles()).toEqual([]);
    expect(received).toEqual([]);
  });

  test('a keep refused at upload refuses the upload, and nothing is queued', async () => {
    lockPrivateStores('molly-sid');
    const enqueue = vi.spyOn(jobs, 'enqueue');
    const attempt = importManager.enqueueUpload(request(), MOLLY);
    await expect(attempt).rejects.toBeInstanceOf(ImportUploadRefused);
    await expect(attempt).rejects.toThrow(/The original of "labs.xml" could not be kept: .*locked.*\. Nothing was imported\./);
    expect(enqueue).not.toHaveBeenCalled();
    expect(importManager.importRunsFor(MOLLY)).toEqual([]);
    expect(await storeFiles()).toEqual([]);
  });
});
