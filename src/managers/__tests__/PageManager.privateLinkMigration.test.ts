/**
 * The one-time private-link migration (#1457, epic #1454).
 *
 * A private page's links were written before `[store/Title]` existed, so
 * `[Notes]` — meaning the page next to it in the store — resolves against the
 * public name list and renders as a red link to /edit. The migration rewrites
 * them, once per store, through the page door.
 *
 * What it must not do is most of what is tested here: it must not claim a
 * public title, must not reach across stores, must not run twice, and must not
 * make the page look edited — same `lastModified` (operator, 2026-09-23), same
 * `editor`. Whoever ran the migration did not write the page.
 */

vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PageManager from '../PageManager';
import { actor } from '../../test-support/actors';
import type { ActorContext } from '../../context/ActorContext';
import { jobContextFromSystem } from '../../context/JobContext';
import {
  formatPrivatePageName,
  storeMigrationsPath
} from '../../utils/privateStorePath';

type Stored = { content: string; metadata: Record<string, unknown> };
type SaveCall = { name: string; content: string; metadata: Record<string, unknown>; options?: Record<string, unknown> };

/** The boot pass: the system principal, which holds no store key. */
const BOOT: ActorContext = jobContextFromSystem('system', 'private-link migration at boot');
/** The owner, for the unlock pass. */
const MOLLY = actor('molly');

const MOLLY_PAGE = (store: string, title: string) => formatPrivatePageName('molly', store, title);

function makeManager(pages: Array<{ store: string; title: string; content: string; editor?: string }>) {
  const stored = new Map<string, Stored>();
  for (const [i, page] of pages.entries()) {
    stored.set(MOLLY_PAGE(page.store, page.title), {
      content: page.content,
      metadata: {
        title: page.title,
        uuid: `uuid-${i}`,
        author: 'molly',
        editor: page.editor ?? 'molly',
        private: true,
        lastModified: '2024-01-01T00:00:00.000Z'
      }
    });
  }

  const saves: SaveCall[] = [];
  const provider = {
    getPage: vi.fn(async (name: string) => stored.get(name) ?? null),
    getPageMetadata: vi.fn(async (name: string) => stored.get(name)?.metadata ?? null),
    savePage: vi.fn(async (
      name: string,
      content: string,
      metadata: Record<string, unknown>,
      _ctx: ActorContext,
      options?: Record<string, unknown>
    ) => {
      saves.push({ name, content, metadata, options });
      stored.set(name, { content, metadata });
      return { name, uuid: metadata.uuid as string };
    }),
    listPrivateStorePages: vi.fn(async () =>
      pages.map((page, i) => ({ owner: 'molly', store: page.store, title: page.title, uuid: `uuid-${i}` })))
  };

  return { provider, saves, stored };
}

describe('PageManager.migratePrivateLinks (#1457)', () => {
  let pagesDir: string;
  let manager: PageManager;
  let harness: ReturnType<typeof makeManager>;

  const build = async (pages: Parameters<typeof makeManager>[0]) => {
    harness = makeManager(pages);
    const configManager = {
      getProperty: vi.fn((_key: string, fallback: unknown) => fallback),
      getResolvedDataPath: vi.fn((_key: string, fallback: string) =>
        (_key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : fallback))
    };
    manager = new PageManager({
      getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null))
    });
    (manager as unknown as { provider: unknown }).provider = harness.provider;
    // The store directory exists on disk, as it does in a live instance.
    await fs.ensureDir(path.join(pagesDir, 'private', 'molly', 'default'));
  };

  const markerFor = (store: string) => storeMigrationsPath(pagesDir, 'molly', store);

  beforeEach(async () => {
    pagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'private-links-'));
  });

  afterEach(async () => {
    await fs.remove(pagesDir);
  });

  test('a link to a page in the same store is rewritten; a public title is not', async () => {
    await build([
      { store: 'default', title: 'Diary', content: 'See [Notes] and [Welcome].' },
      { store: 'default', title: 'Notes', content: 'nothing to do' }
    ]);

    expect(await manager.migratePrivateLinks(BOOT)).toBe(1);

    expect(harness.saves).toHaveLength(1);
    expect(harness.saves[0].name).toBe(MOLLY_PAGE('default', 'Diary'));
    expect(harness.saves[0].content).toBe('See [default/Notes] and [Welcome].');
  });

  test('a link into another store is left exactly as it is', async () => {
    await build([
      { store: 'default', title: 'Diary', content: 'See [vault/Notes].' },
      { store: 'default', title: 'Notes', content: 'x' }
    ]);

    expect(await manager.migratePrivateLinks(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
  });

  test('the page keeps its lastModified and its editor: nobody edited it', async () => {
    await build([
      { store: 'default', title: 'Diary', content: 'See [Notes].', editor: 'molly' },
      { store: 'default', title: 'Notes', content: 'x' }
    ]);

    await manager.migratePrivateLinks(BOOT);

    const saved = harness.saves[0];
    expect(saved.options).toMatchObject({ preserveLastModified: true });
    expect(saved.metadata.lastModified).toBe('2024-01-01T00:00:00.000Z');
    // Not `system`, which is who ran it.
    expect(saved.metadata.editor).toBe('molly');
  });

  test('a second run writes nothing — the store records that it is done', async () => {
    await build([
      { store: 'default', title: 'Diary', content: 'See [Notes].' },
      { store: 'default', title: 'Notes', content: 'x' }
    ]);

    await manager.migratePrivateLinks(BOOT);
    expect(await fs.pathExists(markerFor('default'))).toBe(true);

    harness.saves.length = 0;
    harness.provider.getPage.mockClear();

    expect(await manager.migratePrivateLinks(BOOT)).toBe(0);
    expect(harness.saves).toHaveLength(0);
    // Cheap, not just idempotent: a migrated store's pages are not read again.
    expect(harness.provider.getPage).not.toHaveBeenCalled();
  });

  test('the marker names the migration and no page', async () => {
    await build([{ store: 'default', title: 'Diary', content: 'See [Notes].' }]);
    await manager.migratePrivateLinks(BOOT);

    const marker = await fs.readFile(markerFor('default'), 'utf8');
    expect(JSON.parse(marker)).toMatchObject({ migrations: { 'private-links': expect.any(String) } });
    expect(marker).not.toContain('Diary');
  });

  test('the owner\'s own pass covers the stores the owner can read', async () => {
    await build([
      { store: 'default', title: 'Diary', content: 'See [Notes].' },
      { store: 'default', title: 'Notes', content: 'x' }
    ]);

    expect(await manager.migratePrivateLinks(MOLLY, 'molly')).toBe(1);
    expect(harness.provider.listPrivateStorePages).toHaveBeenCalledWith(MOLLY, 'molly');
  });

  test('a store the context cannot read is neither visited nor marked', async () => {
    await build([{ store: 'default', title: 'Diary', content: 'See [Notes].' }]);
    harness.provider.listPrivateStorePages.mockResolvedValue([]);

    expect(await manager.migratePrivateLinks(BOOT)).toBe(0);
    expect(await fs.pathExists(markerFor('default'))).toBe(false);
  });
});
