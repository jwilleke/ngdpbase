/**
 * A vault whose kind is sealed is never written in the clear — #1834.
 *
 * The system-category says `encrypt: true`; before the fix, a vault with no
 * `store.json` (its owner had never opened the door) was handed plain I/O and
 * the page, its `pages-index.json` and its `search-index.json` landed on disk
 * in plaintext. Exercised through the real PageManager and FileSystemProvider,
 * so what is asserted is what a save writes to disk.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import {
  formatPrivatePageName,
  privateStoreRoot,
  privateUserKeysPath,
  storeMetaPath,
  storePageIndexPath,
  storeSearchIndexPath
} from '../../utils/privateStorePath';
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

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };

/** `phr` is sealed by its kind; `notes` is a vault kind that is not. */
const SYSTEM_CATEGORIES = {
  general: { label: 'general', default: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
  phr: { label: 'phr', owner: 'admin', encrypt: true, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/phr/' } },
  notes: { label: 'notes', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/notes/' } }
};

const LABS = formatPrivatePageName('molly', 'phr', 'Lab Results');
const NOTE = formatPrivatePageName('molly', 'notes', 'Shopping');

describe('a sealed kind\'s vault is never written in the clear (#1834)', () => {
  let testDir: string;
  let pagesDir: string;
  let manager: PageManager;
  let notifications: Array<Record<string, unknown>>;

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
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback)),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const notificationManager = { addNotification: vi.fn(async (n: Record<string, unknown>) => { notifications.push(n); return 'id'; }) };
    const searchManager = { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() };
    let validation: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        if (name === 'SearchManager') return searchManager;
        if (name === 'NotificationManager') return notificationManager;
        return null;
      })
    };
    validation = new ValidationManager(engine);
    return engine;
  };

  const build = async (): Promise<void> => {
    const engine = engineFor();
    const provider = new FileSystemProvider(engine);
    await provider.initialize();
    manager = new PageManager(engine);
    (manager as unknown as { provider: unknown }).provider = provider;
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

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sealed-kind-'));
    pagesDir = path.join(testDir, 'pages');
    notifications = [];
    await fs.ensureDir(pagesDir);
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('no store.json: the save is refused and nothing is written — no page, no page index, no search index', async () => {
    await expect(manager.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY))
      .rejects.toBeInstanceOf(SealedVaultRefusedError);

    const root = privateStoreRoot(pagesDir, 'molly', 'phr');
    expect(await fs.pathExists(path.join(root, `${UUID}.md`))).toBe(false);
    expect(await fs.pathExists(storePageIndexPath(pagesDir, 'molly', 'phr'))).toBe(false);
    expect(await fs.pathExists(storeSearchIndexPath(pagesDir, 'molly', 'phr'))).toBe(false);
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'phr'))).toBe(false);
  });

  test('the refusal tells the owner to open the vault', async () => {
    await expect(manager.savePage(LABS, 'x', { uuid: UUID }, MOLLY)).rejects.toThrow(/has not been opened yet: open it at \/stores\/phr/);
  });

  test('a sealed store with the DEK in session: ciphertext on disk', async () => {
    const dek = await openSealedVault();
    await manager.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY);

    const page = await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), `${UUID}.md`));
    expect(isSealedBytes(page)).toBe(true);
    expect(openBytes(dek, page).toString('utf8')).toContain('Cholesterol 240');
    for (const file of [storePageIndexPath(pagesDir, 'molly', 'phr'), storeSearchIndexPath(pagesDir, 'molly', 'phr')]) {
      const bytes = await fs.readFile(file);
      expect(isSealedBytes(bytes)).toBe(true);
      expect(bytes.toString('latin1')).not.toContain('Cholesterol');
    }
  });

  test('a vault kind that is not sealed is unchanged: plain, with no store.json needed', async () => {
    await manager.savePage(NOTE, 'eggs and milk', { uuid: UUID }, MOLLY);
    const text = await fs.readFile(path.join(privateStoreRoot(pagesDir, 'molly', 'notes'), `${UUID}.md`), 'utf8');
    expect(text).toContain('eggs and milk');
  });

  test('store.json says encrypt:false under a sealed kind: refused, never honoured', async () => {
    await fs.ensureDir(privateStoreRoot(pagesDir, 'molly', 'phr'));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'phr'), { kind: 'phr', encrypt: false });

    await expect(manager.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY))
      .rejects.toMatchObject({ reason: 'mismatch' });
    expect(await fs.pathExists(path.join(privateStoreRoot(pagesDir, 'molly', 'phr'), `${UUID}.md`))).toBe(false);
    expect(await fs.pathExists(storePageIndexPath(pagesDir, 'molly', 'phr'))).toBe(false);
  });

  test('startup names every sealed-kind vault holding plaintext, and changes nothing on disk', async () => {
    // The state #1834 left behind: a page and its indexes in the clear, no store.json.
    const leaked = privateStoreRoot(pagesDir, 'molly', 'phr');
    await fs.ensureDir(leaked);
    await fs.writeFile(path.join(leaked, `${UUID}.md`), '---\ntitle: Lab Results\n---\nCholesterol 240\n');
    await fs.writeJson(storePageIndexPath(pagesDir, 'molly', 'phr'), { version: 1, pages: {} });
    // A mismatch, and two vaults that are fine.
    await fs.ensureDir(privateStoreRoot(pagesDir, 'bob', 'phr'));
    await fs.writeJson(storeMetaPath(pagesDir, 'bob', 'phr'), { kind: 'phr', encrypt: false });
    await fs.ensureDir(privateStoreRoot(pagesDir, 'carol', 'notes'));
    await fs.writeFile(path.join(privateStoreRoot(pagesDir, 'carol', 'notes'), 'n.md'), 'plain is fine here');
    await fs.ensureDir(privateStoreRoot(pagesDir, 'dave', 'phr')); // empty: nothing leaked
    const before = (await fs.readdir(leaked)).sort();

    const engine = engineFor();
    const fresh = new PageManager(engine);
    await fresh.initialize();

    const status = fresh.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.reason).toContain('molly/phr (files but no store.json)');
    expect(status.reason).toContain('bob/phr (store.json not sealed)');
    expect(status.reason).not.toContain('carol');
    expect(status.reason).not.toContain('dave');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'system', level: 'error' });
    expect(String(notifications[0].message)).toContain('molly/phr');

    // Read only: no file moved, sealed, indexed or deleted.
    expect((await fs.readdir(leaked)).sort()).toEqual(before);
    expect(await fs.readFile(path.join(leaked, `${UUID}.md`), 'utf8')).toContain('Cholesterol 240');
    expect(await fs.pathExists(storeMetaPath(pagesDir, 'molly', 'phr'))).toBe(false);
  });

  test('startup names a sealed vault holding plaintext history or attachments, and changes nothing on disk (#1836)', async () => {
    const dek = await openSealedVault();
    await manager.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY);
    const root = privateStoreRoot(pagesDir, 'molly', 'phr');
    // What #1836's fs.move left behind: history and an attachment in the clear.
    const history = path.join(root, 'versions', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'v1');
    await fs.ensureDir(history);
    await fs.writeFile(path.join(history, 'content.md'), 'Cholesterol 300 mg/dL');
    await fs.ensureDir(path.join(root, 'attachments'));
    await fs.writeFile(path.join(root, 'attachments', 'scan.pdf'), '%PDF-1.4 plain');
    // A sealed vault whose files are all sealed is not reported.
    await fs.ensureDir(privateStoreRoot(pagesDir, 'molly', 'notes'));
    await fs.writeFile(path.join(privateStoreRoot(pagesDir, 'molly', 'notes'), 'n.md'), 'plain is fine here');
    const before = await fs.readFile(path.join(history, 'content.md'), 'utf8');
    void dek;

    const fresh = new PageManager(engineFor());
    await fresh.initialize();

    const status = fresh.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.reason).toContain('molly/phr (2 file(s) in attachments, versions)');
    expect(status.reason).not.toContain('notes');
    expect(notifications).toHaveLength(1);
    expect(String(notifications[0].message)).toContain('#1836');
    expect(await fs.readFile(path.join(history, 'content.md'), 'utf8')).toBe(before);
    expect(await fs.pathExists(path.join(root, 'attachments', 'scan.pdf'))).toBe(true);
  });

  test('a sealed vault whose every file is sealed is not reported', async () => {
    await openSealedVault();
    await manager.savePage(LABS, 'Cholesterol 240 mg/dL', { uuid: UUID }, MOLLY);
    await manager.savePage(LABS, 'Cholesterol 200 mg/dL', { uuid: UUID }, MOLLY);

    const fresh = new PageManager(engineFor());
    await fresh.initialize();

    expect(fresh.getManagerStatus().state).not.toBe('degraded');
    expect(notifications).toHaveLength(0);
  });

  test('a plaintext page left in a sealed kind\'s vault is not served as if it were sealed', async () => {
    const leaked = privateStoreRoot(pagesDir, 'molly', 'phr');
    await fs.ensureDir(leaked);
    await fs.writeFile(path.join(leaked, `${UUID}.md`), '---\ntitle: Lab Results\n---\nCholesterol 240\n');
    await fs.writeJson(storePageIndexPath(pagesDir, 'molly', 'phr'), {
      version: 1,
      pages: { [UUID]: { title: 'Lab Results', uuid: UUID, filename: `${UUID}.md`, location: 'private', creator: 'molly', store: 'phr', isPrivate: true } }
    });
    await build();

    expect(await manager.getPage(LABS, MOLLY).catch(() => null)).toBeNull();
  });
});
