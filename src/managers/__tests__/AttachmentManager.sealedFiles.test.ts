/**
 * Files in an encrypted private store — #1400 (epic #1382).
 *
 * A real AttachmentManager over a real BasicAttachmentProvider, in a temp
 * directory. The store is self-contained: the file is sealed, named {uuid}.ext,
 * and listed only in the store's own sealed index — never the global
 * attachment-metadata.json. Only the owner's session, holding the store DEK,
 * reaches it; duplicates are found in the same store only.
 */

vi.unmock('../../providers/BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import AttachmentManager from '../AttachmentManager';
import BasicAttachmentProvider from '../../providers/BasicAttachmentProvider';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { storeFileIndexPath, storeMetaPath } from '../../utils/privateStorePath';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
import {
  clearUnlockedPrivateStores,
  lockPrivateStores,
  setUnlockedDek,
  unlockPrivateStores
} from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const STORE = 'vault';
const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'molly-sid' } as ActorContext;
const BOB = { username: 'bob', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'bob-sid' } as ActorContext;
const PDF = Buffer.from('%PDF-1.4 lab results: cholesterol 180');
const FILE = { originalName: 'labs.pdf', mimeType: 'application/pdf', size: PDF.length };

describe('AttachmentManager — files in an encrypted store (#1400)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let manager: AttachmentManager;
  let audit: ReturnType<typeof vi.fn>;

  function makeEngine() {
    const configManager = {
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
    };
    audit = vi.fn().mockResolvedValue('evt');
    const managers: Record<string, unknown> = {
      ConfigurationManager: configManager,
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      AuditManager: { logAuditEvent: audit, flushAuditQueue: () => Promise.resolve() },
      // The container rule itself — owner or delegate, never a role.
      PolicyInformationPoint: {
        canAccessPrivateContainer: (subject: ActorContext, owner: string) => mayActInPrivateContainer(subject, owner)
      }
    };
    return { getManager: (name: string) => managers[name] ?? null } as never;
  }

  /** An encrypted store for `user`, unlocked in `handle`'s session. */
  async function sealedStoreFor(user: string, handle: string) {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, user, STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, user, STORE), record);
    unlockPrivateStores(handle, user, kek);
    setUnlockedDek(handle, STORE, unwrapDek(kek, record));
  }

  const upload = (bytes = PDF, ctx = MOLLY, pageName?: string) =>
    manager.uploadAttachment(bytes, { ...FILE, size: bytes.length }, ctx, {
      private: true,
      store: STORE,
      description: 'labs',
      ...(pageName ? { pageName } : {})
    });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-sealed-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
    const engine = makeEngine();
    manager = new AttachmentManager(engine);
    const provider = new BasicAttachmentProvider(engine);
    await provider.initialize();
    (manager as unknown as { attachmentProvider: unknown }).attachmentProvider = provider;
    await sealedStoreFor('molly', 'molly-sid');
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  const attachmentsDir = (user = 'molly') => path.join(pagesDir, 'private', user, STORE, 'attachments');

  test('upload then read back in the same session — the bytes match', async () => {
    const stored = await upload();
    const read = await manager.getSealedAttachment(stored.identifier, MOLLY);
    expect(read?.buffer.equals(PDF)).toBe(true);
    expect(read?.metadata).toMatchObject({ name: 'labs.pdf', encodingFormat: 'application/pdf', isPrivate: true, creator: 'molly' });
  });

  test('on disk: a {uuid}.ext name, sealed bytes — never the plaintext, never a content hash', async () => {
    const stored = await upload();
    expect(stored.identifier).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const files = await fs.readdir(attachmentsDir());
    expect(files).toEqual([`${stored.identifier}.pdf`]);
    const onDisk = await fs.readFile(path.join(attachmentsDir(), files[0]));
    expect(isSealedBytes(onDisk)).toBe(true);
    expect(onDisk.includes(Buffer.from('cholesterol'))).toBe(false);
    const contentHash = crypto.createHash('sha256').update(PDF).digest('hex');
    expect(files[0].includes(contentHash)).toBe(false);
  });

  test('the name is in no global file — and the store\'s own index is sealed', async () => {
    await upload();
    const globalFile = path.join(storageDir, 'attachment-metadata.json');
    const global = (await fs.pathExists(globalFile)) ? await fs.readFile(globalFile, 'utf8') : '';
    expect(global.includes('labs.pdf')).toBe(false);
    const indexRaw = await fs.readFile(storeFileIndexPath(pagesDir, 'molly', STORE));
    expect(isSealedBytes(indexRaw)).toBe(true);
    expect(indexRaw.includes(Buffer.from('labs.pdf'))).toBe(false);
  });

  test('after logout the same read finds nothing', async () => {
    const stored = await upload();
    lockPrivateStores('molly-sid');
    expect(await manager.getSealedAttachment(stored.identifier, MOLLY)).toBeNull();
  });

  test('another user finds nothing, even with their own unlocked store', async () => {
    const stored = await upload();
    await sealedStoreFor('bob', 'bob-sid');
    expect(await manager.getSealedAttachment(stored.identifier, BOB)).toBeNull();
  });

  test('the same bytes twice in one store: one file, one id', async () => {
    const first = await upload();
    const second = await upload();
    expect(second.identifier).toBe(first.identifier);
    expect(await fs.readdir(attachmentsDir())).toHaveLength(1);
  });

  test('bytes already in the public pool still land in the store — duplicates never cross the boundary', async () => {
    await manager.uploadAttachment(PDF, FILE, MOLLY, { description: 'public copy' });
    const sealed = await upload();
    expect((await fs.readdir(attachmentsDir())).map((f) => f.replace(/\.pdf$/, ''))).toEqual([sealed.identifier]);
    expect((await manager.getSealedAttachment(sealed.identifier, MOLLY))?.buffer.equals(PDF)).toBe(true);
  });

  test('uploaded onto a page: listed for that page, and ATTACH resolves its name — for the owner only', async () => {
    const stored = await upload(PDF, MOLLY, 'Diary');
    expect((await manager.getSealedAttachmentsForPage('Diary', MOLLY)).map((a) => a.identifier)).toEqual([stored.identifier]);
    expect(await manager.resolveAttachmentSrc('labs.pdf', 'Diary', MOLLY)).toEqual({
      url: `/attachments/${stored.identifier}`,
      mimeType: 'application/pdf'
    });
    expect(await manager.getSealedAttachmentsForPage('Diary', BOB)).toEqual([]);
  });

  test('delete removes the bytes and the index entry, recorded first', async () => {
    const stored = await upload();
    audit.mockClear();
    expect(await manager.deleteAttachment(stored.identifier, MOLLY)).toBe(true);
    expect(await fs.readdir(attachmentsDir())).toEqual([]);
    expect(await manager.getSealedAttachment(stored.identifier, MOLLY)).toBeNull();
    expect(audit).toHaveBeenCalled();
  });

  test('another user cannot delete it', async () => {
    const stored = await upload();
    await sealedStoreFor('bob', 'bob-sid');
    expect(await manager.deleteAttachment(stored.identifier, BOB)).toBe(false);
    expect(await fs.readdir(attachmentsDir())).toHaveLength(1);
  });
});
