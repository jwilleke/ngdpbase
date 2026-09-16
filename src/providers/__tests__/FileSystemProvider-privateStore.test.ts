/**
 * FileSystemProvider encrypt-on write gate — #1394 (epic #1382)
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';
import { TEST_ACTOR, actor } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_PRIVATE_STORE, storeMetaPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// The owner writes her own private pages; the handle reaches her unlocked keys (#1382).
const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };


describe('FileSystemProvider encrypt-on write (#1394)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;

  const newProvider = async (extra: Record<string, unknown> = {}): Promise<FileSystemProvider> => {
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
          ...extra
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
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' }, MOLLY);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
  });

  test('encrypt-on save refuses without a session DEK', async () => {
    const { kek } = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(kek);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', DEFAULT_PRIVATE_STORE), record);

    const provider = await newProvider();
    await expect(
      provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' }, MOLLY)
    ).rejects.toThrow(/locked|DEK/i);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
  });

  test('a markdown file in {store}/attachments/ is an attachment, never scanned as a page (#1386)', async () => {
    const storeDir = path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE);
    await fs.ensureDir(path.join(storeDir, 'attachments'));
    await fs.writeFile(
      path.join(storeDir, `${UUID}.md`),
      `---\ntitle: Diary\nuuid: ${UUID}\nprivate: true\nauthor: molly\n---\nreal page`
    );
    // An uploaded .md is stored content-addressed; frontmatter makes it look like a page.
    await fs.writeFile(
      path.join(storeDir, 'attachments', `${'a'.repeat(64)}.md`),
      '---\ntitle: Uploaded Notes\n---\nnot a page'
    );
    // A user literally named "attachments" still has its pages scanned.
    const oddUserStore = path.join(pagesDir, 'private', 'attachments', DEFAULT_PRIVATE_STORE);
    await fs.ensureDir(oddUserStore);
    await fs.writeFile(
      path.join(oddUserStore, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.md'),
      '---\ntitle: Odd User Page\nuuid: cccccccc-cccc-4ccc-8ccc-cccccccccccc\nprivate: true\nauthor: attachments\n---\nx'
    );

    const provider = await newProvider();
    const titles = await provider.getAllPages();
    expect(titles).toContain('Diary');
    expect(titles).toContain('Odd User Page');
    expect(titles).not.toContain('Uploaded Notes');
  });

  test('a page file under private/ that is not at a store page path is skipped, never listed as a page', async () => {
    const storeDir = path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE);
    await fs.ensureDir(path.join(storeDir, 'notes'));
    await fs.writeFile(
      path.join(storeDir, 'notes', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.md'),
      '---\ntitle: Stray Note\nuuid: dddddddd-dddd-4ddd-8ddd-dddddddddddd\n---\nx'
    );
    const badStore = path.join(pagesDir, 'private', 'molly', 'Bad Store');
    await fs.ensureDir(badStore);
    await fs.writeFile(
      path.join(badStore, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.md'),
      '---\ntitle: Bad Store Page\nuuid: eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee\n---\nx'
    );

    const provider = await newProvider();
    const titles = await provider.getAllPages();
    expect(titles).not.toContain('Stray Note');
    expect(titles).not.toContain('Bad Store Page');
  });

  test('config privateroot sealed writes under sealed/, not private/', async () => {
    const provider = await newProvider({
      'ngdpbase.page.provider.filesystem.privateroot': 'sealed'
    });
    await provider.savePage('Diary', 'secret', { uuid: UUID, private: true, author: 'molly' }, MOLLY);
    expect(await fs.pathExists(path.join(pagesDir, 'sealed', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
  });
});
