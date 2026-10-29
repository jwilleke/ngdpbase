/**
 * Shared folders hold pages through the page door, sealed with the folder's
 * key, searchable only by their readers (#2125, epic #1775 decisions 6 and 7).
 *
 * Exercised through the real PageManager and the real FileSystemProvider, so
 * what is asserted is what a save actually writes to disk. The PDP is a
 * stand-in that permits by `user:shared/<folder>`; the folder keys come from
 * the source SharedFolderManager sets (`setSharedFolderKeySource`). A request
 * opens the folders it may read before it reaches the door, as the session
 * middleware does (`permitsInSharedFolder`).
 *
 * Sabotaged once (then restored): the key gate (`sharedFolderKeyFor` handing
 * the key to any context): "a reader of one folder", "a grant removed" and
 * "a context nothing asked about" went red — the provider read the other
 * folder's page for a reader the PDP never permitted.
 */

vi.unmock('../PageManager');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import PageManager from '../PageManager';
import ValidationManager from '../../managers/ValidationManager';
import FileSystemProvider from '../../providers/FileSystemProvider';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { formatPrivatePageName, SHARED_FOLDER_OWNER, storeMetaPath, storeSearchIndexPath } from '../../utils/privateStorePath';
import { isSealedBytes } from '../../utils/privateStoreCrypto';
import { permitsInSharedFolder, setSharedFolderKeySource } from '../../utils/sharedFolderAccess';

const MINUTES = formatPrivatePageName(SHARED_FOLDER_OWNER, 'default', 'Minutes');
const BOARD = formatPrivatePageName(SHARED_FOLDER_OWNER, 'executive', 'Board pack');
const MINUTES_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOARD_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('shared folders hold pages through the page door (#2125)', () => {
  let testDir: string;
  let pagesDir: string;
  let manager: PageManager;
  let searchManager: { updatePageInIndex: ReturnType<typeof vi.fn>; removePageFromIndex: ReturnType<typeof vi.fn> };
  /** `user:shared/<folder>` pairs the policies grant. */
  let grants: Set<string>;
  const keys: Record<string, Buffer> = {};
  const pdp = {
    decide: (s: { username: string }, r: { attributes: Record<string, unknown> }) =>
      Promise.resolve({ permit: grants.has(`${s.username}:${String(r.attributes['shared-folder'])}`) })
  };

  /** A request's subject, with the folders it may read opened as the middleware opens them. */
  const request = async (username: string): Promise<ActorContext> => {
    const ctx = actor(username);
    for (const folder of ['default', 'executive']) await permitsInSharedFolder(pdp, ctx, 'shared-folder-read', folder);
    return ctx;
  };

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-folder-pages-'));
    pagesDir = path.join(testDir, 'pages');
    for (const folder of ['default', 'executive']) {
      keys[folder] = randomBytes(32);
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, folder)));
      await fs.writeJson(storeMetaPath(pagesDir, SHARED_FOLDER_OWNER, folder), { kind: 'shared-folder', encrypt: true });
    }
    setSharedFolderKeySource((folder) => (keys[folder] ? Buffer.from(keys[folder]) : undefined));
    grants = new Set(['ann:shared/default', 'ann:shared/executive', 'rita:shared/default']);

    const configManager = {
      getProperty: vi.fn((key: string, fallback: unknown) => {
        const config: Record<string, unknown> = {
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8'
        };
        return config[key] !== undefined ? config[key] : fallback;
      }),
      getResolvedDataPath: vi.fn((key: string, fallback: string) => (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback)),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    searchManager = { updatePageInIndex: vi.fn(), removePageFromIndex: vi.fn() };
    let validation: unknown = null;
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return validation;
        if (name === 'SearchManager') return searchManager;
        if (name === 'PolicyDecisionPoint') return pdp;
        return null;
      })
    };
    validation = new ValidationManager(engine);
    const provider = new FileSystemProvider(engine);
    await provider.initialize();
    manager = new PageManager(engine);
    (manager as unknown as { provider: unknown }).provider = provider;
  });

  afterEach(async () => {
    setSharedFolderKeySource(null);
    // Only this test's own mkdtemp folder.
    await fs.remove(testDir);
  });

  test('a page saved in a folder is sealed with its key, in its own search index, and in no site-wide index', async () => {
    const ann = await request('ann');
    await manager.savePage(MINUTES, 'The quince budget was approved.', { uuid: MINUTES_UUID }, ann);

    const file = path.join(pagesDir, 'vaults', SHARED_FOLDER_OWNER, 'default', `${MINUTES_UUID}.md`);
    expect(isSealedBytes(await fs.readFile(file))).toBe(true);
    expect(isSealedBytes(await fs.readFile(storeSearchIndexPath(pagesDir, SHARED_FOLDER_OWNER, 'default')))).toBe(true);
    expect(searchManager.updatePageInIndex).not.toHaveBeenCalled();
    // Not in the shared render cache or the site-wide indexes.
    expect(manager.isSharedIndexable(MINUTES)).toBe(false);

    expect((await manager.getPage(MINUTES, await request('rita')))?.content).toContain('quince budget');
  });

  test('a reader of one folder reads and finds nothing of another, not even a count', async () => {
    const ann = await request('ann');
    await manager.savePage(MINUTES, 'The quince budget was approved.', { uuid: MINUTES_UUID }, ann);
    await manager.savePage(BOARD, 'The quince merger stays confidential.', { uuid: BOARD_UUID }, ann);

    const rita = await request('rita');
    expect(await manager.getPage(BOARD, rita)).toBeNull();
    const hits = await manager.searchSharedFolderPages(rita, ['default', 'executive'], { query: 'quince' });
    expect(hits.map((h) => h.name)).toEqual([MINUTES]);

    const annHits = await manager.searchSharedFolderPages(await request('ann'), ['default', 'executive'], { query: 'quince' });
    expect(annHits.map((h) => h.name).sort()).toEqual([BOARD, MINUTES].sort());
  });

  test('a grant removed ends access on the next request', async () => {
    await manager.savePage(BOARD, 'The quince merger stays confidential.', { uuid: BOARD_UUID }, await request('ann'));
    expect((await manager.getPage(BOARD, await request('ann')))?.content).toContain('merger');
    grants.delete('ann:shared/executive');
    const next = await request('ann');
    expect(await manager.getPage(BOARD, next)).toBeNull();
    expect(await manager.searchSharedFolderPages(next, ['executive'], { query: 'quince' })).toEqual([]);
    // Nor can it write there.
    await expect(manager.savePage(BOARD, 'changed', { uuid: BOARD_UUID }, next)).rejects.toThrow();
  });

  test('a folder page never leaves its folder for the public space', async () => {
    const ann = await request('ann');
    await expect(manager.savePage(MINUTES, 'Out in the open?', { uuid: MINUTES_UUID, private: false }, ann)).rejects.toThrow(/stays in its folder/);
    expect(manager.pageExists('Minutes', ann)).toBe(false);
  });

  test('a context nothing asked about — a boot job, an anonymous visitor — reads nothing', async () => {
    await manager.savePage(MINUTES, 'The quince budget was approved.', { uuid: MINUTES_UUID }, await request('ann'));
    expect(await manager.getPage(MINUTES, actor('ann'))).toBeNull();
    expect(await manager.listVaultPages(actor('nobody'), SHARED_FOLDER_OWNER, 'default')).toEqual([]);
    expect((await manager.listVaultPages(await request('rita'), SHARED_FOLDER_OWNER, 'default')).map((p) => p.name)).toEqual([MINUTES]);
  });
});
