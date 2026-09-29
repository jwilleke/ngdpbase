/**
 * Moving a page to another vault, and the one-time move of existing captures
 * into the capture vault (#1505).
 *
 * Before #1505 a capture was a `general` page with the system keyword
 * `capture`, saved in its author's default vault. The move puts each one in
 * the capture vault with `system-category: capture`, once per vault, and
 * leaves alone anything that is not plainly such a capture.
 */

vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager, { CAPTURE_VAULT_MIGRATION, CATEGORY_VAULT_MIGRATION } from '../PageManager';
import type { ActorContext } from '../../context/ActorContext';
import { jobContextFromSystem } from '../../context/JobContext';
import { formatPrivatePageName, storeMetaPath, storeMigrationsPath } from '../../utils/privateStorePath';
import { actor } from '../../test-support/actors';
import { clearUnlockedPrivateStores, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';

type Stored = { content: string; metadata: Record<string, unknown> };
type SaveCall = { name: string; metadata: Record<string, unknown>; options?: Record<string, unknown> };

const BOOT: ActorContext = jobContextFromSystem('system', 'capture move at boot');
const JIM = (store: string, title: string) => formatPrivatePageName('jim', store, title);

interface Seed { store: string; title: string; category?: string; keywords?: string[] }

function makeProvider(pages: Seed[]) {
  const stored = new Map<string, Stored>();
  for (const [i, page] of pages.entries()) {
    stored.set(JIM(page.store, page.title), {
      content: `body of ${page.title}`,
      metadata: {
        title: page.title,
        uuid: `uuid-${i}`,
        author: 'jim',
        editor: 'jim',
        private: true,
        'system-category': page.category ?? 'general',
        'system-keywords': page.keywords ?? [],
        lastModified: '2024-01-01T00:00:00.000Z'
      }
    });
  }
  const saves: SaveCall[] = [];
  const provider = {
    getPage: vi.fn(async (name: string) => stored.get(name) ?? null),
    getPageMetadata: vi.fn(async (name: string) => stored.get(name)?.metadata ?? null),
    savePage: vi.fn(async (name: string, content: string, metadata: Record<string, unknown>, _ctx: ActorContext, options?: Record<string, unknown>) => {
      saves.push({ name, metadata, options });
      if (typeof options?.moveFrom === 'string') stored.delete(options.moveFrom);
      stored.set(name, { content, metadata });
      return { name, uuid: metadata.uuid as string };
    }),
    listPrivateStorePages: vi.fn(async () =>
      pages.map((page, i) => ({ owner: 'jim', store: page.store, title: page.title, uuid: `uuid-${i}` })))
  };
  return { provider, saves, stored };
}

describe('PageManager capture vault move (#1505)', () => {
  let pagesDir: string;
  let manager: PageManager;
  let harness: ReturnType<typeof makeProvider>;

  const build = async (pages: Seed[], captureVault: string | null = 'capture') => {
    harness = makeProvider(pages);
    const configManager = {
      getProperty: vi.fn((_key: string, fallback: unknown) => fallback),
      getResolvedDataPath: vi.fn((key: string, fallback: string) =>
        (key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback))
    };
    const validationManager = {
      getVaultId: vi.fn((category: string) =>
        (category === 'capture' ? captureVault : category === 'journal' ? 'journal' : category === 'general' ? 'default' : null)),
      sanitizeMetadata: vi.fn((metadata: unknown) => metadata),
      checkConflicts: vi.fn(async () => ({ hasConflict: false }))
    };
    manager = new PageManager({
      getManager: vi.fn((name: string) =>
        name === 'ConfigurationManager' ? configManager : name === 'ValidationManager' ? validationManager : null)
    });
    (manager as unknown as { provider: unknown }).provider = harness.provider;
    await fs.ensureDir(path.join(pagesDir, 'vaults', 'jim', 'default'));
  };

  beforeEach(async () => {
    pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-vault-'));
  });

  afterEach(async () => {
    clearUnlockedPrivateStores();
    await fs.remove(pagesDir);
  });

  test('a general page with the capture keyword moves to the capture vault as system-category capture', async () => {
    await build([
      { store: 'default', title: 'Captures — jim — 2026-08-03', keywords: ['capture'] },
      { store: 'default', title: 'Diary' }
    ]);

    expect(await manager.moveCapturesToCaptureVault(BOOT)).toBe(1);

    expect(harness.saves).toHaveLength(1);
    const [save] = harness.saves;
    expect(save.name).toBe(JIM('capture', 'Captures — jim — 2026-08-03'));
    expect(save.metadata['system-category']).toBe('capture');
    expect(save.options).toMatchObject({ moveFrom: JIM('default', 'Captures — jim — 2026-08-03'), preserveLastModified: true });
    // Nobody edited it.
    expect(save.metadata.lastModified).toBe('2024-01-01T00:00:00.000Z');
    expect(save.metadata.editor).toBe('jim');
  });

  test('a page someone gave another system-category stays where it is', async () => {
    await build([{ store: 'default', title: 'Clipped', category: 'journal', keywords: ['capture'] }]);
    expect(await manager.moveCapturesToCaptureVault(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
  });

  test('a page already in the capture vault stays where it is', async () => {
    await build([{ store: 'capture', title: 'Captures — jim — 2026-09-29', category: 'capture', keywords: ['capture'] }]);
    expect(await manager.moveCapturesToCaptureVault(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
  });

  test('each vault records that it is done, and a second run moves nothing', async () => {
    await build([{ store: 'default', title: 'Captures — jim — 2026-08-03', keywords: ['capture'] }]);
    await manager.moveCapturesToCaptureVault(BOOT);

    const record = JSON.parse(await fs.readFile(storeMigrationsPath(pagesDir, 'jim', 'default'), 'utf8'));
    expect(typeof record.migrations[CAPTURE_VAULT_MIGRATION]).toBe('string');

    harness.saves.length = 0;
    expect(await manager.moveCapturesToCaptureVault(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
  });

  test('with no capture vault configured nothing moves', async () => {
    await build([{ store: 'default', title: 'Captures — jim — 2026-08-03', keywords: ['capture'] }], null);
    expect(await manager.moveCapturesToCaptureVault(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
  });

  describe('movePagesToCategoryVaults (#1507)', () => {
    test('a page in the default vault moves to its system-category\'s own vault, unchanged', async () => {
      await build([
        { store: 'default', title: '2026-09-10-1-journal-jim', category: 'journal' },
        { store: 'default', title: 'Diary' }
      ]);

      expect(await manager.movePagesToCategoryVaults(BOOT)).toBe(1);

      expect(harness.saves).toHaveLength(1);
      const [save] = harness.saves;
      expect(save.name).toBe(JIM('journal', '2026-09-10-1-journal-jim'));
      expect(save.metadata['system-category']).toBe('journal');
      expect(save.options).toMatchObject({ moveFrom: JIM('default', '2026-09-10-1-journal-jim'), preserveLastModified: true });
      expect(save.metadata.lastModified).toBe('2024-01-01T00:00:00.000Z');
    });

    test('a page that never had an editor is not given one (the system ran the move, nobody edited it)', async () => {
      await build([{ store: 'default', title: '2026-09-10-1-journal-jim', category: 'journal' }]);
      const stored = harness.stored.get(JIM('default', '2026-09-10-1-journal-jim'));
      delete stored?.metadata.editor;

      await manager.movePagesToCategoryVaults(BOOT);

      expect(harness.saves[0].metadata).not.toHaveProperty('editor');
    });

    test('a page in any other vault was put there on purpose and stays', async () => {
      await build([{ store: 'yourphr', title: '2026-09-10-1-journal-jim', category: 'journal' }]);
      expect(await manager.movePagesToCategoryVaults(BOOT)).toBe(0);
      expect(harness.saves).toHaveLength(0);
    });

    test('a page whose system-category declares no vault stays', async () => {
      await build([{ store: 'default', title: 'Odd', category: 'system' }]);
      expect(await manager.movePagesToCategoryVaults(BOOT)).toBe(0);
      expect(harness.saves).toHaveLength(0);
    });

    test('each vault records that it is done', async () => {
      await build([{ store: 'default', title: '2026-09-10-1-journal-jim', category: 'journal' }]);
      await manager.movePagesToCategoryVaults(BOOT);
      const record = JSON.parse(await fs.readFile(storeMigrationsPath(pagesDir, 'jim', 'default'), 'utf8'));
      expect(typeof record.migrations[CATEGORY_VAULT_MIGRATION]).toBe('string');
      harness.saves.length = 0;
      expect(await manager.movePagesToCategoryVaults(BOOT)).toBe(0);
    });
  });

  describe('movePageToVault', () => {
    test('refuses a name that is not private, and a move to the vault the page is in', async () => {
      await build([{ store: 'default', title: 'Diary' }]);
      await expect(manager.movePageToVault('Diary', 'capture', BOOT)).rejects.toThrow(/not a private page name/);
      await expect(manager.movePageToVault(JIM('default', 'Diary'), 'default', BOOT)).rejects.toThrow(/already in that vault/);
      await expect(manager.movePageToVault(JIM('default', 'Diary'), '../x', BOOT)).rejects.toThrow(/not a vault id/);
    });

    test('never moves a page out of an encrypted vault into one that is not, even for its unlocked owner', async () => {
      await build([{ store: 'default', title: 'Diary' }]);
      await fs.writeJson(storeMetaPath(pagesDir, 'jim', 'default'), { encrypt: true });
      unlockPrivateStores('sid', 'jim', Buffer.alloc(32, 1));
      setUnlockedDek('sid', 'default', Buffer.alloc(32, 2));
      const owner = { ...actor('jim'), privateStoreHandle: 'sid' };

      await expect(manager.movePageToVault(JIM('default', 'Diary'), 'capture', owner))
        .rejects.toThrow(/cannot move to one that is not encrypted/);
      expect(harness.saves).toHaveLength(0);
    });
  });
});
