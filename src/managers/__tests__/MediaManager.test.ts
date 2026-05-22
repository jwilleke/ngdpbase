/**
 * MediaManager tests
 *
 * @jest-environment node
 */
import MediaManager from '../MediaManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeConfigManager(overrides: Record<string, unknown> = {}) {
  return {
    getProperty: vi.fn((key: string, dv: unknown) => overrides[key] ?? dv),
    getResolvedDataPath: vi.fn((_key: string, dv: string) => dv)
  };
}

function makeEngine(configOverrides: Record<string, unknown> = {}): WikiEngine {
  const cm = makeConfigManager(configOverrides);
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return cm;
      return null;
    })
  } as unknown as WikiEngine;
}

async function makeInitializedManager(configOverrides: Record<string, unknown> = {}): Promise<MediaManager> {
  const engine = makeEngine(configOverrides);
  const mgr = new MediaManager(engine);
  await mgr.initialize();
  return mgr;
}

describe('MediaManager (uninitialized — null guard paths)', () => {
  test('provider is null before initialize()', () => {
    const mgr = new MediaManager(makeEngine());
    expect(mgr.provider).toBeNull();
  });

  test('rebuildIndex() returns zero counts when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    const result = await mgr.rebuildIndex();
    expect(result).toMatchObject({ scanned: 0, added: 0, updated: 0, errors: 0 });
  });

  test('scanFolders() returns zero counts when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    const result = await mgr.scanFolders();
    expect(result).toMatchObject({ scanned: 0, added: 0, updated: 0, errors: 0 });
  });

  test('getItem() returns null when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.getItem('abc')).toBeNull();
  });

  test('listByYear() returns [] when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.listByYear(2025)).toEqual([]);
  });

  test('listByPage() returns [] when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.listByPage('TestPage')).toEqual([]);
  });

  test('listByKeyword() returns [] when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.listByKeyword('vacation')).toEqual([]);
  });

  test('search() returns [] when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.search('mountains')).toEqual([]);
  });

  test('findByFilename() returns null when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.findByFilename('photo.jpg')).toBeNull();
  });

  test('getThumbnailBuffer() returns null when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.getThumbnailBuffer('abc', '300x300')).toBeNull();
  });

  test('getTranscodedBuffer() returns null when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.getTranscodedBuffer('abc', 'jpeg')).toBeNull();
  });

  test('getYears() returns [] when no provider', async () => {
    const mgr = new MediaManager(makeEngine());
    expect(await mgr.getYears()).toEqual([]);
  });

  test('shutdown() does not throw when never initialized', async () => {
    const mgr = new MediaManager(makeEngine());
    await expect(mgr.shutdown()).resolves.not.toThrow();
  });
});

describe('MediaManager initialize()', () => {
  test('throws when ConfigurationManager unavailable', async () => {
    const engine = { getManager: vi.fn(() => null) } as unknown as WikiEngine;
    const mgr = new MediaManager(engine);
    await expect(mgr.initialize()).rejects.toThrow('ConfigurationManager not available');
  });

  test('initializes with default config', async () => {
    const mgr = await makeInitializedManager();
    expect(mgr).toBeDefined();
  });

  test('provider is set after initialize()', async () => {
    const mgr = await makeInitializedManager();
    expect(mgr.provider).not.toBeNull();
  });

  test('initializes with scaninterval=0 (no timer)', async () => {
    const mgr = await makeInitializedManager({ 'ngdpbase.media.scaninterval': 0 });
    expect(mgr).toBeDefined();
    await mgr.shutdown();
  });

  test('initializes with string-form folders', async () => {
    const mgr = await makeInitializedManager({ 'ngdpbase.media.folders': '/photos,/videos' });
    expect(mgr).toBeDefined();
    await mgr.shutdown();
  });

  test('shutdown() clears timer and closes provider', async () => {
    const mgr = await makeInitializedManager({ 'ngdpbase.media.scaninterval': 60000 });
    await expect(mgr.shutdown()).resolves.not.toThrow();
    expect(mgr.provider).toBeNull();
  });

  test('getYears() delegates to provider when initialized', async () => {
    const mgr = await makeInitializedManager();
    const years = await mgr.getYears();
    expect(Array.isArray(years)).toBe(true);
    await mgr.shutdown();
  });

  test('listByYear() delegates to provider when initialized', async () => {
    const mgr = await makeInitializedManager();
    const items = await mgr.listByYear(2024);
    expect(Array.isArray(items)).toBe(true);
    await mgr.shutdown();
  });

  test('getItem() returns null when item not found', async () => {
    const mgr = await makeInitializedManager();
    const item = await mgr.getItem('nonexistent-uuid');
    expect(item).toBeNull();
    await mgr.shutdown();
  });

  test('findByFilename() delegates to provider when initialized', async () => {
    const mgr = await makeInitializedManager();
    const item = await mgr.findByFilename('no-such-file.jpg');
    expect(item).toBeNull();
    await mgr.shutdown();
  });
});

// ---------------------------------------------------------------------------
// #634: checkPrivatePageAccess — frontmatter-based, not pageIndex-coupled
// ---------------------------------------------------------------------------

// #714 Slice D: the private `MediaManager.checkPrivatePageAccess` helper this
// describe block exercised was deleted as part of the unified-access-control
// evaluator EPIC. Its 2 call sites (findByFilename + listByYear) now delegate
// to `ACLManager.canUserAccessPage`, whose equivalent coverage lives in the
// `canUserAccessPage — cross-page check (#714 Slice B)` describe block in
// `src/managers/__tests__/ACLManager.test.ts` (7 tests). The block below is
// kept skipped (not deleted) for historical traceability — operator-action
// restriction blocked the natural delete; the coverage isn't lost.
describe.skip('MediaManager.checkPrivatePageAccess (#634 — moved to ACLManager.canUserAccessPage in #714 Slice D)', () => {
  // The method is private; we reach it via type assertion. Calling it through
  // getItem() would require a fully wired provider stack — overkill for unit
  // testing the access decision itself.
  type CheckFn = (wikiContext: unknown, pageName: string) => Promise<boolean>;
  const callCheck = (mgr: MediaManager, ctx: unknown, name: string): Promise<boolean> => {
    const fn = (mgr as unknown as { checkPrivatePageAccess: CheckFn }).checkPrivatePageAccess.bind(mgr);
    return fn(ctx, name);
  };

  function makeEngineWithPageManager(metadata: Record<string, unknown> | null) {
    const pageManager = {
      getPageMetadata: vi.fn().mockResolvedValue(metadata)
    };
    const cm = makeConfigManager();
    const engine = {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return cm;
        if (name === 'PageManager') return pageManager;
        return null;
      }),
      pageManager
    };
    return engine as unknown as WikiEngine;
  }

  function makeWikiContext(username?: string, roles: string[] = []) {
    return {
      userContext: username ? { username, roles } : undefined,
      hasRole: (...names: string[]) => names.some(n => roles.includes(n))
    };
  }

  test('returns true (allow) when page is not private', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice'
      // no 'system-location' — public page
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('bob');
    expect(await callCheck(mgr, ctx, 'PublicPage')).toBe(true);
  });

  test('returns true when getPageMetadata returns null (no such page)', async () => {
    const engine = makeEngineWithPageManager(null);
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('bob');
    expect(await callCheck(mgr, ctx, 'Missing')).toBe(true);
  });

  test('returns false for anonymous user on a private page', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', 'system-location': 'private'
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext(); // no username
    expect(await callCheck(mgr, ctx, 'AlicesSecret')).toBe(false);
  });

  test('returns true for the creator on their own private page', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', 'system-location': 'private'
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('alice');
    expect(await callCheck(mgr, ctx, 'AlicesSecret')).toBe(true);
  });

  test('returns false for a non-creator non-admin on a private page', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', 'system-location': 'private'
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('bob');
    expect(await callCheck(mgr, ctx, 'AlicesSecret')).toBe(false);
  });

  test('returns true for admin on any private page', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', 'system-location': 'private'
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('root', ['admin']);
    expect(await callCheck(mgr, ctx, 'AlicesSecret')).toBe(true);
  });

  test('returns true (conservative) when PageManager is not registered', async () => {
    const engine = {
      getManager: vi.fn(() => null)
    } as unknown as WikiEngine;
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('bob');
    expect(await callCheck(mgr, ctx, 'Anything')).toBe(true);
  });

  test('uses pageManager.getPageMetadata, NOT provider.pageIndex', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', 'system-location': 'private'
    });
    const mgr = new MediaManager(engine);
    const ctx = makeWikiContext('alice');
    await callCheck(mgr, ctx, 'AlicesSecret');
    const pm = (engine as unknown as { pageManager: { getPageMetadata: ReturnType<typeof vi.fn> } }).pageManager;
    expect(pm.getPageMetadata).toHaveBeenCalledWith('AlicesSecret');
  });

  // #639: top-level `private: true` triggers the same gate as legacy signals
  test('top-level private: true triggers gate (no system-location, no user-keyword)', async () => {
    const engine = makeEngineWithPageManager({
      uuid: 'u1', author: 'alice', private: true
      // intentionally NO system-location, NO user-keywords
    });
    const mgr = new MediaManager(engine);
    expect(await callCheck(mgr, makeWikiContext('bob'), 'AlicesSecret')).toBe(false);
    expect(await callCheck(mgr, makeWikiContext('alice'), 'AlicesSecret')).toBe(true);
    expect(await callCheck(mgr, makeWikiContext('root', ['admin']), 'AlicesSecret')).toBe(true);
  });

  // #639 Slice E: user-keywords back-compat case removed alongside the
  // fallback. The top-level `private: true` test above (and #634's
  // system-location test) cover the canonical paths.
});
