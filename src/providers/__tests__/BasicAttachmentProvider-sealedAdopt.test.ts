/**
 * A shared-pool file adopted into a sealed store is sealed — #1836.
 *
 * `adoptRecordIntoStore` moved the shared pool's bytes into the store's
 * `attachments/` folder with `fs.move`, so a sealed store got plaintext. The
 * bytes now go through the location's I/O. The one caller today (the boot
 * migration) skips sealed stores; this is the provider's own guarantee.
 */

vi.unmock('../BasicAttachmentProvider');

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import BasicAttachmentProvider from '../BasicAttachmentProvider';
import { formatPrivatePageName, resolvePrivateStoreLayout, storeFileIndexPath, storeMetaPath } from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  isSealedBytes,
  openBytes,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { PLAIN_FILE_IO, storeFileIO } from '../../utils/privateStoreFiles';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import type { ActorContext } from '../../context/ActorContext';

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'], privateStoreHandle: 'sid' } as ActorContext;
const PDF = Buffer.from('%PDF-1.4 lab results: cholesterol 240');
const ID = crypto.createHash('sha256').update(PDF).digest('hex');
const FILE = `${ID}.pdf`;

describe('adopting a shared-pool file into a store (#1836)', () => {
  let tmp: string;
  let storageDir: string;
  let pagesDir: string;
  let provider: BasicAttachmentProvider;

  const engine = () => {
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
    return { getManager: (name: string) => (name === 'ConfigurationManager' ? configManager : null) } as never;
  };

  /** A record in the shared index, its bytes in the shared pool (or already in the store folder). */
  const sharedRecord = async (store: string, { inStore = false } = {}): Promise<string> => {
    const bytesAt = inStore ? path.join(pagesDir, 'vaults', 'molly', store, 'attachments', FILE) : path.join(storageDir, FILE);
    await fs.ensureDir(path.dirname(bytesAt));
    await fs.writeFile(bytesAt, PDF);
    await fs.writeJson(path.join(storageDir, 'attachment-metadata.json'), {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      attachments: [{
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        identifier: ID,
        name: 'labs.pdf',
        description: 'labs',
        dateCreated: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-01-02T00:00:00.000Z',
        encodingFormat: 'application/pdf',
        contentSize: PDF.length,
        url: `/attachments/${ID}`,
        storageLocation: bytesAt,
        mentions: [{ '@type': 'Thing', name: formatPrivatePageName('molly', store, 'Diary') }],
        // #1398's flag says the bytes are already in the store folder; a
        // record without it has them in the shared pool.
        ...(inStore ? { isPrivate: true, creator: 'molly', store } : {})
      }]
    });
    provider = new BasicAttachmentProvider(engine());
    await provider.initialize();
    return bytesAt;
  };

  const sealedStore = async (store: string): Promise<Buffer> => {
    const { kek } = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', store)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', store), { kind: store, ...record });
    const dek = unwrapDek(kek, record);
    unlockPrivateStores('sid', 'molly', kek);
    setUnlockedDek('sid', store, dek);
    return dek;
  };

  const sealedIO = (store: string) =>
    storeFileIO(MOLLY, { pagesDirectory: pagesDir, owner: 'molly', store, layout: resolvePrivateStoreLayout() });

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-sealed-adopt-'));
    storageDir = path.join(tmp, 'attachments');
    pagesDir = path.join(tmp, 'pages');
    await fs.ensureDir(storageDir);
    await fs.ensureDir(pagesDir);
    clearUnlockedPrivateStores();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(tmp);
  });

  test('into a sealed store: the bytes land sealed with its DEK, and the shared copy is gone', async () => {
    const dek = await sealedStore('phr');
    const source = await sharedRecord('phr');
    const io = await sealedIO('phr');
    expect(io.sealed).toBe(true);

    const entry = await provider.adoptRecordIntoStore({ owner: 'molly', store: 'phr', io }, ID);

    expect(entry?.id).toBe(ID);
    const target = path.join(pagesDir, 'vaults', 'molly', 'phr', 'attachments', FILE);
    const bytes = await fs.readFile(target);
    expect(isSealedBytes(bytes)).toBe(true);
    expect(bytes.toString('latin1')).not.toContain('cholesterol');
    expect(openBytes(dek, bytes).equals(PDF)).toBe(true);
    expect(await fs.pathExists(source)).toBe(false);
    // The store's index is sealed too, and the owner reads the file back.
    expect(isSealedBytes(await fs.readFile(storeFileIndexPath(pagesDir, 'molly', 'phr')))).toBe(true);
    expect((await provider.getFileInStore({ owner: 'molly', store: 'phr', io }, ID))?.bytes.equals(PDF)).toBe(true);
  });

  test('bytes already in a sealed store\'s folder in the clear are sealed where they are', async () => {
    const dek = await sealedStore('phr');
    const at = await sharedRecord('phr', { inStore: true });

    await provider.adoptRecordIntoStore({ owner: 'molly', store: 'phr', io: await sealedIO('phr') }, ID);

    expect(openBytes(dek, await fs.readFile(at)).equals(PDF)).toBe(true);
  });

  test('into a store that is not sealed: moved as they are, unchanged', async () => {
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'notes')));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'notes'), { kind: 'notes', encrypt: false });
    const source = await sharedRecord('notes');

    await provider.adoptRecordIntoStore({ owner: 'molly', store: 'notes', io: PLAIN_FILE_IO }, ID);

    expect((await fs.readFile(path.join(pagesDir, 'vaults', 'molly', 'notes', 'attachments', FILE))).equals(PDF)).toBe(true);
    expect(await fs.pathExists(source)).toBe(false);
  });
});
