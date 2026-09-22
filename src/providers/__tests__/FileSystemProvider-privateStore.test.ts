/**
 * FileSystemProvider encrypt-on write gate — #1394 (epic #1382)
 */

vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import FileSystemProvider from '../FileSystemProvider';
import ValidationManager from '../../managers/ValidationManager';
import { TEST_ACTOR, actor } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DEFAULT_PRIVATE_STORE, formatPrivatePageName, storeMetaPath, storePageIndexPath } from '../../utils/privateStorePath';
import { TEST_PRIVATE_STORE_KDF, createEncryptedStore, createUserKeys } from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// The owner writes her own private pages; the handle reaches her unlocked keys (#1382).
const MOLLY = { ...actor('molly'), privateStoreHandle: 'sid' };
// #1456: a private page is named by its path, which names its owner and store.
const DIARY = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Diary');


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
    // A private page's slug is ValidationManager's to make (#1456).
    let validationManager: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validationManager;
        return null;
      })
    };
    validationManager = new ValidationManager(engine);
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

  const storePages = async (owner = 'molly', store = DEFAULT_PRIVATE_STORE): Promise<Record<string, { title: string; slug?: string }>> => {
    const file = storePageIndexPath(pagesDir, owner, store);
    return (await fs.pathExists(file)) ? ((await fs.readJson(file)) as { pages: Record<string, { title: string }> }).pages : {};
  };

  test('missing store.json (default encrypt off) still saves', async () => {
    const provider = await newProvider();
    await provider.savePage(DIARY, 'secret', { uuid: UUID }, MOLLY);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    // Listed in the store's own index, never in the global one (#1456).
    expect((await storePages())[UUID]).toMatchObject({ title: 'Diary', slug: 'private--molly-default-diary' });
    expect(await provider.getAllPages()).not.toContain('Diary');
    await expect(provider.getPageMetadata(DIARY, MOLLY)).resolves.toMatchObject({ uuid: UUID, private: true });
    await expect(provider.getPageMetadata('Diary', MOLLY)).resolves.toBeNull();
  });

  test('the owner comes from the name, never from frontmatter author (#1456)', async () => {
    const provider = await newProvider();
    await provider.savePage(DIARY, 'secret', { uuid: UUID, author: 'bob' }, MOLLY);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'bob'))).toBe(false);
    const raw = await fs.readFile(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`), 'utf8');
    expect(raw).toMatch(/^author: molly$/m);
    expect(raw).toMatch(/^private: true$/m);
  });

  test('a public page never carries `private` in its frontmatter, even when the save says false (#1456)', async () => {
    const provider = await newProvider();
    await provider.savePage('Notes', 'body', { uuid: UUID, private: false, author: 'molly' }, MOLLY);
    const raw = await fs.readFile(path.join(pagesDir, `${UUID}.md`), 'utf8');
    expect(raw).not.toMatch(/^private:/m);
    expect(await fs.pathExists(path.join(pagesDir, 'private'))).toBe(false);
  });

  test('a page moved out of its store takes a public slug, and one moved in a private slug (#1456)', async () => {
    const provider = await newProvider();
    await provider.savePage(DIARY, 'secret', { uuid: UUID }, MOLLY);
    // The editor carries the stored slug forward; the provider re-derives it.
    await provider.savePage(DIARY, 'now public', { uuid: UUID, private: false, slug: 'private--molly-default-diary' }, MOLLY);
    const publicRaw = await fs.readFile(path.join(pagesDir, `${UUID}.md`), 'utf8');
    expect(publicRaw).toMatch(/^slug: diary$/m);
    await provider.savePage('Diary', 'private again', { uuid: UUID, private: true, author: 'molly', slug: 'diary' }, MOLLY);
    expect(Object.values(await storePages('molly', DEFAULT_PRIVATE_STORE)).map((p) => p.slug)).toEqual(['private--molly-default-diary']);
    expect(await fs.pathExists(path.join(pagesDir, `${UUID}.md`))).toBe(false);
  });

  test('a private page cannot be named without ValidationManager (#1456)', async () => {
    const provider = await newProvider();
    (provider as unknown as { engine: { getManager: (n: string) => unknown } }).engine.getManager =
      vi.fn(() => null);
    await expect(provider.savePage(DIARY, 'secret', { uuid: UUID }, MOLLY)).rejects.toThrow(/ValidationManager/);
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
    // #1456: store pages are listed in each store's own index, built from the
    // store's page files — never from its attachments — and never globally.
    await provider.indexPlainStorePages();
    expect(Object.values(await storePages()).map((p) => p.title)).toEqual(['Diary']);
    expect(Object.values(await storePages('attachments')).map((p) => p.title)).toEqual(['Odd User Page']);
    const titles = await provider.getAllPages();
    expect(titles).not.toContain('Uploaded Notes');
    expect(titles).not.toContain('Diary');
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
    await provider.indexPlainStorePages();
    expect(await storePages()).toEqual({});
    const titles = await provider.getAllPages();
    expect(titles).not.toContain('Stray Note');
    expect(titles).not.toContain('Bad Store Page');
  });

  test('config privateroot sealed writes under sealed/, not private/', async () => {
    const provider = await newProvider({
      'ngdpbase.page.provider.filesystem.privateroot': 'sealed'
    });
    await provider.savePage(DIARY, 'secret', { uuid: UUID }, MOLLY);
    expect(await fs.pathExists(path.join(pagesDir, 'sealed', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'private', 'molly', DEFAULT_PRIVATE_STORE, `${UUID}.md`))).toBe(false);
  });
});
