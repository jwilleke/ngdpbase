/**
 * The media types a receiver keeps, beyond the site's allow-list (#2061).
 *
 * A real ImportManager over a real AttachmentManager and
 * BasicAttachmentProvider, in a temp directory, on a site with the shipped
 * allow-list (`image/*,text/*,application/pdf`). Molly has two encrypted
 * vaults, both unlocked: `vault`, which the receiver's add-on (`vaultrec`)
 * declares, and `othervault`, which another add-on declares. The receiver
 * keeps originals at upload and declares `originals.types: ['application/json']`.
 *
 * - its declared type is kept into its own vault, and marked a download;
 * - the same type is refused into the shared pool, into another vault, by an
 *   ordinary upload, and through another receiver's keep;
 * - a type it did not declare is refused;
 * - a keep used after its call returned, or a copy of one, is not honoured;
 * - a wildcard in `originals.types` is refused at registration.
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager, { type UploadOptions } from '../AttachmentManager';
import FileManager from '../FileManager';
import BackgroundJobManager from '../BackgroundJobManager';
import ImportManager, { ImportUploadRefused } from '../ImportManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import { MemoryIceLedger } from '../../ice/ledger';
import type { IceItem, IceReceiver, IceRunRequest, OriginalKeep } from '../../ice/types';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys, unwrapDek } from '../../utils/privateStoreCrypto';
import { storeMetaPath } from '../../utils/privateStorePath';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { packZip } from '../../utils/zipArchive';
import type { ActorContext } from '../../context/ActorContext';

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'molly-sid' } as ActorContext;
const PATIENT = Buffer.from('{"resourceType":"Patient","id":"p1"}');
const NDJSON = Buffer.from('{"resourceType":"Observation"}\n');

const category = (owner: string, vault: string): Record<string, unknown> => ({
  label: owner, owner, enabled: true, encrypt: true, defaultPrivate: true,
  storageLocation: { defaultstore: 'pages/', privatestore: `pages/vaults/{user}/${vault}/` }
});

describe('ImportManager — the media types a receiver keeps (#2061)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let attachments: AttachmentManager;
  let jobs: BackgroundJobManager;
  let importManager: ImportManager;
  /** Where the receiver's keep writes, and with what keep; each test sets it. */
  let target: (keep?: OriginalKeep) => UploadOptions;
  /** The keeps the receiver was handed (each call's third argument). */
  let handed: unknown[];

  const keepInto = (owner: string) => async (item: IceItem, ctx: ActorContext, keep?: OriginalKeep) => {
    handed.push(keep);
    const bytes = item.bytes ?? Buffer.alloc(0);
    const stored = await attachments.uploadAttachment(
      bytes, { originalName: path.basename(item.name), mimeType: item.mediaType ?? '', size: bytes.length }, ctx,
      { description: `original kept by ${owner}`, ...target(keep) }
    );
    return { status: 'stored' as const, ref: stored.identifier };
  };

  const receiver = (owner: string, types: string[]): IceReceiver => ({
    name: 'records',
    accepts: ['file'],
    keepsEncrypted: true,
    originals: { allowed: ['keep', 'none'], default: 'keep', types },
    mayUse: async () => true,
    receive: async () => ({ status: 'stored', ref: 'record' }),
    keepOriginal: keepInto(owner)
  });

  const request = (files: IceRunRequest['source']['files'], to = 'vaultrec.records'): IceRunRequest =>
    ({ source: { type: 'upload', files }, receiver: to, original: 'keep' });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ice-kept-types-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();

    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => {
          if (key === 'ngdpbase.attachment.maxsize') return 10485760;
          if (key === 'ngdpbase.attachment.allowedtypes') return 'image/*,text/*,application/pdf';
          if (key === 'ngdpbase.system-category') return { vaultrec: category('vaultrec', 'vault'), otheraddon: category('otheraddon', 'othervault') };
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
    // #2148: every upload goes through FileManager's door.
    managers['FileManager'] = new FileManager(engine);
    jobs = new BackgroundJobManager(engine);
    managers['BackgroundJobManager'] = jobs;
    importManager = new ImportManager(engine);
    await importManager.initialize();
    importManager.setImportLedger(new MemoryIceLedger());

    // Molly's two encrypted vaults, unlocked in her session.
    const keys = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    unlockPrivateStores('molly-sid', 'molly', keys.kek);
    for (const store of ['vault', 'othervault']) {
      const record = createEncryptedStore(keys.kek);
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', store)));
      await fs.writeJson(storeMetaPath(pagesDir, 'molly', store), record);
      setUnlockedDek('molly-sid', store, unwrapDek(keys.kek, record));
    }

    handed = [];
    target = (keep) => ({ private: true, store: 'vault', ...(keep ? { keep } : {}) });
    importManager.registerReceiver('vaultrec', receiver('vaultrec', ['application/json']));
  });

  afterEach(async () => {
    await jobs.whenIdle();
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  const storeFiles = (store: string) => fs.readdir(path.join(pagesDir, 'vaults', 'molly', store, 'attachments')).catch(() => [] as string[]);
  const refusedAsNotAllowed = expect.objectContaining({ message: expect.stringMatching(/'application\/json' not allowed/) });

  test('the declared type is kept into the receiver\'s own vault, from a zip, and served as a download', async () => {
    const zip = await packZip([{ path: 'Patient.json', bytes: PATIENT }]);
    await importManager.enqueueUpload(request([{ name: 'export.zip', bytes: zip }]), MOLLY);
    expect(handed).toHaveLength(1);
    expect(handed[0]).toMatchObject({ receiver: 'vaultrec.records', addon: 'vaultrec', user: 'molly', types: ['application/json'] });
    expect(await storeFiles('vault')).toHaveLength(1);

    const [entry] = await attachments.getPrivateStoreAttachments(MOLLY);
    expect(entry).toMatchObject({ encodingFormat: 'application/json', download: true });
    const served = await attachments.getPrivateStoreAttachment(entry.identifier, MOLLY);
    expect(served?.buffer.equals(PATIENT)).toBe(true);
    expect(served?.metadata.download).toBe(true);
  });

  test('a file the site allows anyway is still marked a download when kept', async () => {
    await importManager.enqueueUpload(request([{ name: 'note.txt', bytes: Buffer.from('hello'), mediaType: 'text/plain' }]), MOLLY);
    const [entry] = await attachments.getPrivateStoreAttachments(MOLLY);
    expect(entry).toMatchObject({ encodingFormat: 'text/plain', download: true });
  });

  test('an ordinary vault upload is not marked a download', async () => {
    await attachments.uploadAttachment(Buffer.from('hello'), { originalName: 'n.txt', mimeType: 'text/plain', size: 5 }, MOLLY, { private: true, store: 'vault' });
    const [entry] = await attachments.getPrivateStoreAttachments(MOLLY);
    expect(entry.download).toBeUndefined();
  });

  test('the same type is refused into the shared pool', async () => {
    target = (keep) => ({ ...(keep ? { keep } : {}) });
    await expect(importManager.enqueueUpload(request([{ name: 'Patient.json', bytes: PATIENT, mediaType: 'application/json' }]), MOLLY))
      .rejects.toThrow(/'application\/json' not allowed/);
    expect(handed[0]).toBeDefined();
  });

  test('the same type is refused into another add-on\'s vault', async () => {
    target = (keep) => ({ private: true, store: 'othervault', ...(keep ? { keep } : {}) });
    await expect(importManager.enqueueUpload(request([{ name: 'Patient.json', bytes: PATIENT, mediaType: 'application/json' }]), MOLLY))
      .rejects.toBeInstanceOf(ImportUploadRefused);
    expect(await storeFiles('othervault')).toEqual([]);
  });

  test('the same type is refused for an ordinary upload into that vault', async () => {
    await expect(attachments.uploadAttachment(PATIENT, { originalName: 'Patient.json', mimeType: 'application/json', size: PATIENT.length }, MOLLY,
      { private: true, store: 'vault' })).rejects.toThrow(/'application\/json' not allowed/);
    expect(await storeFiles('vault')).toEqual([]);
  });

  test('the same type is refused through another receiver\'s keep into this receiver\'s vault', async () => {
    importManager.registerReceiver('otheraddon', receiver('otheraddon', ['application/json']));
    await expect(importManager.enqueueUpload(request([{ name: 'Patient.json', bytes: PATIENT, mediaType: 'application/json' }], 'otheraddon.records'), MOLLY))
      .rejects.toThrow(/'application\/json' not allowed/);
    expect(handed[0]).toMatchObject({ addon: 'otheraddon' });
    expect(await storeFiles('vault')).toEqual([]);
  });

  test('a type the receiver did not declare is refused, even into its own vault', async () => {
    await expect(importManager.enqueueUpload(request([{ name: 'obs.ndjson', bytes: NDJSON, mediaType: 'application/x-ndjson' }]), MOLLY))
      .rejects.toThrow(/'application\/x-ndjson' not allowed/);
    expect(await storeFiles('vault')).toEqual([]);
  });

  test('a keep is honoured only during its call, and a copy of one never', async () => {
    await importManager.enqueueUpload(request([{ name: 'note.txt', bytes: Buffer.from('hello'), mediaType: 'text/plain' }]), MOLLY);
    const keep = handed[0];
    expect(keep).toBeDefined();
    const upload = (k: OriginalKeep) => attachments.uploadAttachment(PATIENT, { originalName: 'Patient.json', mimeType: 'application/json', size: PATIENT.length }, MOLLY,
      { private: true, store: 'vault', keep: k });
    await expect(upload(keep as OriginalKeep)).rejects.toEqual(refusedAsNotAllowed);
    const forged: OriginalKeep = { receiver: 'vaultrec.records', addon: 'vaultrec', user: 'molly', types: ['application/json'] };
    await expect(upload(forged)).rejects.toEqual(refusedAsNotAllowed);
  });

  test('a wildcard in originals.types is refused at registration', () => {
    expect(() => importManager.registerReceiver('wild', receiver('wild', ['*/*']))).toThrow(/no wildcard/);
    expect(() => importManager.registerReceiver('wild', receiver('wild', ['application/*']))).toThrow(/no wildcard/);
  });
});
