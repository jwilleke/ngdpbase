/**
 * #1462 slice 3 — every page write goes through the page door.
 *
 * Three writes used to go round it: the admin raw editor saved through the
 * provider, a version restore was done by the provider itself, and a trash
 * restore was followed by whatever index work the route remembered. Each one
 * left the page on disk saying one thing and search, the link graph and the
 * rendered cache saying another, with nothing in the audit log to say who did
 * it. They are proven here to go through `savePage` / `reconcileSharedIndexes`
 * — with the raw editor's opt-outs (#689) stated, and nothing else's.
 */
vi.unmock('../PageManager');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import PageManager from '../PageManager';
import VersioningFileProvider from '../../providers/VersioningFileProvider';

/** The acting subject: the door takes one, positionally (#1179). */
const JIM = { username: 'jim', isAuthenticated: true } as never;
const ADMIN = { username: 'admin', isAuthenticated: true } as never;

/** The audit emission is deliberately not awaited by the write paths. */
const settle = () => new Promise(resolve => setImmediate(resolve));

function indexSpies() {
  return {
    rendering: {
      getReferringPages: vi.fn(() => [] as string[]),
      removePageFromLinkGraph: vi.fn(),
      addPageToCache: vi.fn(),
      updatePageInLinkGraph: vi.fn()
    },
    search: { updatePageInIndex: vi.fn(async () => {}), removePageFromIndex: vi.fn(async () => {}) },
    attachments: { syncPageMentions: vi.fn(async () => {}) },
    assets: { syncPageAssets: vi.fn(async () => {}) },
    cache: { isInitialized: () => true, clear: vi.fn(async () => {}) }
  };
}

// ───────────────────────────── the raw editor (#689) ─────────────────────────
//
// A mocked provider, so what the door hands it — and what it does NOT do to it
// on the way — is visible.

function makeRawDoor(existing: Record<string, { content: string; metadata: Record<string, unknown> }> = {}) {
  const pages = new Map(Object.entries(existing));
  const spies = indexSpies();
  const events: Array<Record<string, unknown>> = [];

  const provider = {
    getPage: vi.fn(async (name: string) => {
      const p = pages.get(name);
      return p ? { ...p, title: p.metadata.title, uuid: p.metadata.uuid } : null;
    }),
    getPageMetadata: vi.fn(async (name: string) => pages.get(name)?.metadata ?? null),
    getPageUUID: vi.fn(() => null),
    savePage: vi.fn(async (name: string, _content: string, metadata: Record<string, unknown>) => ({
      name: typeof metadata.title === 'string' ? metadata.title : name,
      uuid: typeof metadata.uuid === 'string' ? metadata.uuid : 'uuid-new'
    })),
    deletePage: vi.fn(async (name: string) => pages.delete(name))
  };

  // Both gates the raw editor exists to get past, wired to refuse.
  const validation = {
    sanitizeMetadata: vi.fn((md: Record<string, unknown>) => ({ ...md, sanitized: true })),
    checkConflicts: vi.fn(async () => ({
      hasConflict: true,
      conflictType: 'title-duplicate',
      message: 'A page with title \'Broken\' already exists under UUID other-uuid'
    })),
    collectContentErrors: vi.fn(async () => [{ rule: 'no-raw-br', message: 'raw <br>', line: 1 }])
  };
  const audit = { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { events.push(e); return 'id'; }) };

  const managers: Record<string, unknown> = {
    RenderingManager: spies.rendering,
    SearchManager: spies.search,
    AttachmentManager: spies.attachments,
    AssetManager: spies.assets,
    CacheManager: spies.cache,
    ValidationManager: validation,
    AuditManager: audit,
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: (_k: string, d: string) => d }
  };
  const pm = new PageManager({ getManager: vi.fn((name: string) => managers[name] ?? null) });
  (pm as unknown as { provider: unknown }).provider = provider;
  return { pm, provider, validation, events, ...spies };
}

const BROKEN_PAGE = {
  Broken: {
    content: 'old body',
    metadata: { title: 'Broken', uuid: 'uuid-broken', author: 'alice', slug: 'broken', editor: 'alice' }
  }
};

const RAW = [
  '---',
  'title: Broken',
  'uuid: uuid-broken',
  'author: alice',
  'slug: broken',
  'editor: alice',
  'user-keywords:',
  '  - Draft',
  '---',
  '',
  'repaired body'
].join('\n');

describe('PageManager.saveRawPageWithAdminOverride() — the raw editor goes through the door (#689, #1462)', () => {
  test('writes the textarea\'s frontmatter and body exactly, and does not make the admin the editor', async () => {
    const d = makeRawDoor(BROKEN_PAGE);
    await d.pm.saveRawPageWithAdminOverride('Broken', RAW, ADMIN);

    const [name, content, metadata] = d.provider.savePage.mock.calls[0];
    expect(name).toBe('Broken');
    // Verbatim, leading blank line and all: the frontmatter parser's split.
    expect(content).toBe('\nrepaired body');
    // The textarea is the source of truth: no sanitisation, no stamping, no
    // keyword normalisation — 'Draft' would otherwise become `status: draft`.
    expect(metadata).toEqual({
      title: 'Broken',
      uuid: 'uuid-broken',
      author: 'alice',
      slug: 'broken',
      editor: 'alice',
      'user-keywords': ['Draft']
    });
    expect(d.validation.sanitizeMetadata).not.toHaveBeenCalled();
  });

  test('reconciles the shared indexes, like every other save', async () => {
    const d = makeRawDoor(BROKEN_PAGE);
    await d.pm.saveRawPageWithAdminOverride('Broken', RAW, ADMIN);

    expect(d.rendering.updatePageInLinkGraph).toHaveBeenCalledWith('Broken', '\nrepaired body');
    expect(d.search.updatePageInIndex).toHaveBeenCalledWith(
      'Broken',
      expect.objectContaining({ name: 'Broken', content: '\nrepaired body' })
    );
    expect(d.attachments.syncPageMentions).toHaveBeenCalledWith('Broken', '\nrepaired body');
    expect(d.assets.syncPageAssets).toHaveBeenCalledWith('Broken', '\nrepaired body');
    expect(d.cache.clear).toHaveBeenCalledWith(undefined, 'rendered-pages:uuid-broken:*');
  });

  test('is audited, naming the admin who wrote it', async () => {
    const d = makeRawDoor(BROKEN_PAGE);
    await d.pm.saveRawPageWithAdminOverride('Broken', RAW, ADMIN);
    await settle();

    expect(d.events).toHaveLength(1);
    // Never a rename: the raw editor writes a file in place, and its URL may
    // carry a uuid rather than the title.
    expect(d.events[0]).toMatchObject({ eventType: 'page-edit', user: 'admin' });
  });

  test('saves through the two gates it exists to repair — a duplicate title and a refused body', async () => {
    const d = makeRawDoor(BROKEN_PAGE);
    await expect(d.pm.saveRawPageWithAdminOverride('Broken', RAW, ADMIN)).resolves.toMatchObject({
      name: 'Broken',
      uuid: 'uuid-broken'
    });
    expect(d.validation.checkConflicts).not.toHaveBeenCalled();
    expect(d.validation.collectContentErrors).not.toHaveBeenCalled();
  });

  test('can repair a page that still carries legacy [{ALLOW}] markup', async () => {
    const d = makeRawDoor(BROKEN_PAGE);
    const raw = '---\ntitle: Broken\nuuid: uuid-broken\n---\n\n[{ALLOW view All}]\nbody';
    await expect(d.pm.saveRawPageWithAdminOverride('Broken', raw, ADMIN)).resolves.toBeTruthy();
    expect(d.provider.savePage).toHaveBeenCalled();
  });

  test('an ordinary save still refuses that markup, and still normalises', async () => {
    const d = makeRawDoor();
    await expect(
      d.pm.savePage('Fresh', '[{ALLOW view All}]', { title: 'Fresh' }, JIM, { skipValidation: true })
    ).rejects.toThrow(/no longer supported/);
  });
});

// ─────────────────────── restores, against a real provider ───────────────────

function makeLive(testDir: string) {
  const spies = indexSpies();
  const events: Array<Record<string, unknown>> = [];
  const configManager = {
    getProperty: vi.fn((key: string, defaultValue: unknown) => ({
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider.filesystem.storagedir': path.join(testDir, 'pages'),
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.page.provider.versioning.indexfile': path.join(testDir, 'data', 'page-index.json'),
      'ngdpbase.page.provider.versioning.deltastorage': true
    } as Record<string, unknown>)[key] ?? defaultValue),
    getResolvedDataPath: vi.fn((key: string, defaultValue: string) => ({
      'ngdpbase.page.provider.filesystem.storagedir': path.join(testDir, 'pages'),
      'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
      'ngdpbase.page.provider.versioning.indexfile': path.join(testDir, 'data', 'page-index.json')
    } as Record<string, string>)[key] ?? defaultValue),
    getInstanceDataFolder: vi.fn(() => testDir)
  };
  const managers: Record<string, unknown> = {
    ConfigurationManager: configManager,
    RenderingManager: spies.rendering,
    SearchManager: spies.search,
    AttachmentManager: spies.attachments,
    AssetManager: spies.assets,
    CacheManager: spies.cache,
    AuditManager: { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { events.push(e); return 'id'; }) }
  };
  const engine = { getManager: vi.fn((name: string) => managers[name] ?? null) };
  return { engine, events, ...spies };
}

describe('PageManager.restoreVersion() — a restore is a save (#1462 slice 3)', () => {
  let testDir: string;
  let pm: PageManager;
  let live: ReturnType<typeof makeLive>;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `pm-write-doors-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    await fs.ensureDir(testDir);
    live = makeLive(testDir);
    const provider = new VersioningFileProvider(live.engine);
    await provider.initialize();
    pm = new PageManager(live.engine);
    (pm as unknown as { provider: unknown }).provider = provider;
  });

  afterEach(async () => {
    // Only this test's own temp tree — never a data directory.
    if (testDir && await fs.pathExists(testDir)) await fs.remove(testDir);
  });

  test('puts the old body back as a new version, attributed to whoever asked', async () => {
    await pm.savePage('Restore Test', 'v1 content', { uuid: 'restore-1' }, JIM);
    await pm.savePage('Restore Test', 'v2 content', { uuid: 'restore-1' }, JIM);
    await pm.savePage('Restore Test', 'v3 content', { uuid: 'restore-1' }, JIM);

    const restored = await pm.restoreVersion('Restore Test', 1, { username: 'molly' });

    expect(restored.version).toBe(4);
    expect(restored.name).toBe('Restore Test');
    expect((await pm.getPage('Restore Test', JIM))!.content).toBe('v1 content');

    const provider = (pm as unknown as { provider: VersioningFileProvider }).provider;
    const history = await provider.getVersionHistory('Restore Test', JIM);
    expect(history[0].version).toBe(4);
    expect(history[0].changeType).toBe('restored');
    expect(history[0].message).toContain('Restored from v1');
    expect(history[0].author).toBe('molly');
  });

  test('keeps every earlier version', async () => {
    await pm.savePage('Test', 'v1', { uuid: 'restore-2' }, JIM);
    await pm.savePage('Test', 'v2', { uuid: 'restore-2' }, JIM);
    await pm.savePage('Test', 'v3', { uuid: 'restore-2' }, JIM);

    await pm.restoreVersion('Test', 2, JIM);

    const provider = (pm as unknown as { provider: VersioningFileProvider }).provider;
    expect((await provider.getVersionHistory('Test', JIM)).length).toBe(4);
    expect((await provider.getPageVersion('Test', 3, JIM)).content).toBe('v3');
  });

  test('restores by uuid', async () => {
    await pm.savePage('Test', 'v1', { uuid: 'restore-3' }, JIM);
    await pm.savePage('Test', 'v2', { uuid: 'restore-3' }, JIM);

    const restored = await pm.restoreVersion('restore-3', 1, JIM);

    expect(restored.version).toBe(3);
    expect((await pm.getPage('Test', JIM))!.content).toBe('v1');
  });

  test('reindexes the page and audits the write — the provider-level restore did neither', async () => {
    await pm.savePage('Test', 'v1', { uuid: 'restore-4' }, JIM);
    await pm.savePage('Test', 'v2', { uuid: 'restore-4' }, JIM);
    live.search.updatePageInIndex.mockClear();
    live.rendering.updatePageInLinkGraph.mockClear();
    live.events.length = 0;

    await pm.restoreVersion('Test', 1, JIM);
    await settle();

    expect(live.search.updatePageInIndex).toHaveBeenCalledWith('Test', expect.objectContaining({ content: 'v1' }));
    expect(live.rendering.updatePageInLinkGraph).toHaveBeenCalledWith('Test', 'v1');
    expect(live.events).toHaveLength(1);
    expect(live.events[0]).toMatchObject({ eventType: 'page-edit', user: 'jim' });
  });

  test('throws for a page or a version that is not there', async () => {
    await expect(pm.restoreVersion('NonExistent', 1, JIM)).rejects.toThrow();

    await pm.savePage('Test', 'v1', { uuid: 'restore-5' }, JIM);
    await expect(pm.restoreVersion('Test', 99, JIM)).rejects.toThrow();
  });

  test('requires a context, like every other write', async () => {
    await expect(pm.restoreVersion('Test', 1, null)).rejects.toThrow(
      'PageManager.restoreVersion requires an ActorContext'
    );
  });

  test('a trash restore puts the page back into the shared indexes', async () => {
    await pm.savePage('Trashed', 'body of the page', { uuid: 'trash-1' }, JIM);
    expect(await pm.deletePage('Trashed', JIM)).toBe(true);
    live.search.updatePageInIndex.mockClear();
    live.rendering.updatePageInLinkGraph.mockClear();

    const result = await pm.restoreDeletedPage('trash-1', JIM);

    expect(result).toEqual({ ok: true, title: 'Trashed' });
    expect(live.search.updatePageInIndex).toHaveBeenCalledWith(
      'Trashed',
      expect.objectContaining({ name: 'Trashed', content: 'body of the page\n' })
    );
    expect(live.rendering.updatePageInLinkGraph).toHaveBeenCalledWith('Trashed', 'body of the page\n');
    expect(live.rendering.addPageToCache).toHaveBeenCalledWith('Trashed');
    expect(live.cache.clear).toHaveBeenCalledWith(undefined, 'rendered-pages:trash-1:*');
  });

  test('a trash restore that the provider refuses changes no index', async () => {
    live.search.updatePageInIndex.mockClear();
    const result = await pm.restoreDeletedPage('no-such-uuid', JIM);

    expect(result).toMatchObject({ ok: false, reason: 'not-found' });
    expect(live.search.updatePageInIndex).not.toHaveBeenCalled();
  });

  test('one delete door: the page file goes to the trash and the door takes it out of the indexes', async () => {
    await pm.savePage('Doomed', 'body', { uuid: 'delete-1' }, JIM);
    expect(await pm.deletePage('Doomed', JIM)).toBe(true);

    expect(live.search.removePageFromIndex).toHaveBeenCalledWith('Doomed');
    expect(live.rendering.removePageFromLinkGraph).toHaveBeenCalledWith('Doomed');
    // The second door is gone (#1462 slice 3) — nothing may delete round this one.
    expect((pm as unknown as { deletePageWithContext?: unknown }).deletePageWithContext).toBeUndefined();
  });

  test('the raw editor\'s bytes reach the file, frontmatter and all', async () => {
    await pm.savePage('Raw Target', 'body', { uuid: 'raw-1', slug: 'raw-target' }, JIM);
    const raw = '---\ntitle: Raw Target\nuuid: raw-1\nslug: raw-target\nauthor: alice\n---\n\nrepaired';

    await pm.saveRawPageWithAdminOverride('Raw Target', raw, ADMIN);

    const onDisk = matter(await fs.readFile(path.join(testDir, 'pages', 'raw-1.md'), 'utf8'));
    expect(onDisk.content.trim()).toBe('repaired');
    expect(onDisk.data.author).toBe('alice');
    // The admin repaired a file; they did not author a revision.
    expect(onDisk.data.editor).toBeUndefined();
  });
});
