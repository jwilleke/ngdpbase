/**
 * FileSystemProvider encrypt-on write gate — #1394 (epic #1382)
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('FileSystemProvider encrypt-on write (#1394)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;

  const newProvider = async (): Promise<FileSystemProvider> => {
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
        };
        return config[key] !== undefined ? config[key] : def;
      }),
      getResolvedDataPath: vi.fn((key: string, def: unknown) =>
        key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : def
      ),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    const engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };
    const p = new FileSystemProvider(engine);
    await p.initialize();
    return p;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fsp-priv-enc-'));
    pagesDir = path.join(testDir, 'pages');
    requiredDir = path.join(testDir, 'required-pages');
    await fs.ensureDir(pagesDir);
    await fs.ensureDir(requiredDir);
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('missing store.json (default encrypt off) still saves', async () => {
    const provider = await newProvider();
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' });
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
  });

  test('encrypt-on save refuses without a session DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const provider = await newProvider();
    await expect(
      provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' })
    ).rejects.toThrow(/locked|DEK/i);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
  });
});
