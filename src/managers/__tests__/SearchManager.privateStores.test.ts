/**
 * The owner's search merges their own stores in — #1458 (epic #1454).
 *
 * A private page is in no shared index (#1456). `searchWithContext` and
 * `advancedSearchWithContext` therefore return the public results plus, for
 * the REQUESTER'S OWN readable stores, the matches held in those stores' own
 * saved search indexes — read through the page door with the requester's
 * context, never by reading a store file here.
 *
 * The rule that matters most is the one that is easiest to lose: nobody
 * else's store is ever reached, an admin included, and a locked encrypted
 * store yields nothing rather than a plaintext read.
 */

vi.unmock('../SearchManager');
vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import SearchManager from '../SearchManager';
import PageManager from '../PageManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import {
  DEFAULT_PRIVATE_STORE,
  formatPrivatePageName,
  privateUserKeysPath,
  storeMetaPath
} from '../../utils/privateStorePath';
import {
  TEST_PRIVATE_STORE_KDF,
  createEncryptedStore,
  createUserKeys,
  unwrapDek
} from '../../utils/privateStoreCrypto';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VAULT_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEALED_STORE = 'vault';

const MOLLY: ActorContext = { ...actor('molly'), privateStoreHandle: 'sid' };
const DIARY = formatPrivatePageName('molly', DEFAULT_PRIVATE_STORE, 'Diary');
const VAULT_PAGE = formatPrivatePageName('molly', SEALED_STORE, 'Merger Notes');

/** One public row, as a search provider returns it. */
const PUBLIC_HIT = { name: 'Welcome', title: 'Welcome', score: 3, snippet: 'apricot orchard tour' };

describe('the owner\'s search merges their own private stores (#1458)', () => {
  let testDir: string;
  let pagesDir: string;
  let pageManager: PageManager;
  let searchManager: SearchManager;
  let providerSearch: ReturnType<typeof vi.fn>;
  let providerAdvanced: ReturnType<typeof vi.fn>;

  const build = async (): Promise<void> => {
    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
        };
        return config[key] !== undefined ? config[key] : fallback;
      }),
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback)),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    let validation: unknown = null;
    let pages: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        if (name === 'PageManager') return pages;
        return null;
      })
    };
    validation = new ValidationManager(engine);
    const provider = new FileSystemProvider(engine);
    await provider.initialize();
    pageManager = new PageManager(engine);
    (pageManager as unknown as { provider: unknown }).provider = provider;
    pages = pageManager;

    providerSearch = vi.fn().mockResolvedValue([PUBLIC_HIT]);
    providerAdvanced = vi.fn().mockResolvedValue([PUBLIC_HIT]);
    searchManager = new SearchManager(engine);
    (searchManager as unknown as { provider: unknown }).provider = {
      search: providerSearch,
      advancedSearch: providerAdvanced
    };
  };

  const sealVault = async (): Promise<void> => {
    const created = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const record = createEncryptedStore(created.kek);
    await fs.ensureDir(path.dirname(privateUserKeysPath(pagesDir, 'molly')));
    await fs.writeJson(privateUserKeysPath(pagesDir, 'molly'), created.envelope);
    await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', SEALED_STORE)));
    await fs.writeJson(storeMetaPath(pagesDir, 'molly', SEALED_STORE), record);
    unlockPrivateStores('sid', 'molly', created.kek);
    setUnlockedDek('sid', SEALED_STORE, unwrapDek(created.kek, record));
  };

  const names = (results: Array<{ name: string }>): string[] => results.map((r) => r.name);

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-private-'));
    pagesDir = path.join(testDir, 'pages');
    await fs.ensureDir(pagesDir);
    await build();
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(testDir);
  });

  test('the owner finds their private page in a plain store, by title and by body text', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);

    const byTitle = await searchManager.searchWithContext({ userContext: MOLLY }, 'Diary');
    expect(names(byTitle)).toContain(DIARY);

    const byText = await searchManager.searchWithContext({ userContext: MOLLY }, 'apricot');
    expect(names(byText)).toEqual(expect.arrayContaining([DIARY, 'Welcome']));
  });

  test('the owner finds their private page in a sealed store they have unlocked', async () => {
    await sealVault();
    await pageManager.savePage(VAULT_PAGE, 'The apricot merger closes on Friday.', { uuid: VAULT_UUID }, MOLLY);

    const byTitle = await searchManager.searchWithContext({ userContext: MOLLY }, 'Merger');
    expect(names(byTitle)).toContain(VAULT_PAGE);

    const byText = await searchManager.searchWithContext({ userContext: MOLLY }, 'apricot');
    expect(names(byText)).toContain(VAULT_PAGE);
  });

  test('a private row carries the page\'s private name, so a link to it works', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);
    const [hit] = (await searchManager.searchWithContext({ userContext: MOLLY }, 'apricot'))
      .filter((r) => r.name === DIARY);
    expect(hit.name).toBe('private/molly/default/Diary');
    expect(hit.title).toBe('Diary');
    expect(hit.isPrivate).toBe(true);
  });

  test('another user\'s search reaches none of it', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);
    const bob = actor('bob');
    const results = await searchManager.searchWithContext({ userContext: bob }, 'apricot');
    expect(names(results)).toEqual(['Welcome']);
  });

  test('an admin\'s search reaches none of it either — no role reaches into a container', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);
    const admin = { ...actor('root'), roles: ['admin'], principals: ['admin', 'Authenticated'] } as ActorContext;
    const results = await searchManager.searchWithContext({ userContext: admin }, 'apricot');
    expect(names(results)).toEqual(['Welcome']);
  });

  test('an anonymous search reaches none of it', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', { uuid: UUID }, MOLLY);
    const results = await searchManager.searchWithContext({}, 'apricot');
    expect(names(results)).toEqual(['Welcome']);
  });

  test('a locked encrypted store yields nothing to its own owner', async () => {
    await sealVault();
    await pageManager.savePage(VAULT_PAGE, 'The apricot merger closes on Friday.', { uuid: VAULT_UUID }, MOLLY);

    const locked: ActorContext = { ...actor('molly'), privateStoreHandle: 'no-such-handle' };
    const results = await searchManager.searchWithContext({ userContext: locked }, 'apricot');
    expect(names(results)).toEqual(['Welcome']);
  });

  test('advanced search merges the same way', async () => {
    await pageManager.savePage(DIARY, 'The apricot harvest was thin.', {
      uuid: UUID,
      'system-category': 'personal'
    }, MOLLY);

    const results = await searchManager.advancedSearchWithContext({ userContext: MOLLY }, { query: 'apricot' });
    expect(names(results)).toEqual(expect.arrayContaining([DIARY, 'Welcome']));

    // A category filter narrows the private rows as it narrows the public ones.
    const other = await searchManager.advancedSearchWithContext(
      { userContext: MOLLY },
      { query: 'apricot', categories: ['recipes'] }
    );
    expect(names(other)).toEqual(['Welcome']);
  });
});
