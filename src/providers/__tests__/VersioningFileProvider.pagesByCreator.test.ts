/**
 * VersioningFileProvider.getPagesByCreator tests (#640)
 *
 * Same fixture pattern as the recentChanges tests — construct the provider,
 * stamp a synthetic pageIndex, exercise the method directly.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';

function makeEngine() {
  return {
    getManager: () => null,
    on: () => {},
    emit: () => {}
  } as unknown as ConstructorParameters<typeof VersioningFileProvider>[0];
}

function makeProvider() {
  const provider = new VersioningFileProvider(makeEngine());
  return provider as unknown as {
    pageIndex: {
      version: string;
      lastUpdated: string;
      pageCount: number;
      pages: Record<string, {
        title: string;
        uuid: string;
        lastModified: string;
        currentVersion: number;
        location: 'pages' | 'required-pages' | 'private';
        editor: string;
        author?: string;
        creator?: string;
        hasVersions: boolean;
        isPrivate?: boolean;
        audienceRoles?: string[];
      }>;
    } | null;
    getPagesByCreator: VersioningFileProvider['getPagesByCreator'];
  };
}

const baseEntry = (over: Partial<ReturnType<typeof makePageEntry>> = {}) => ({
  ...makePageEntry(),
  ...over
});

function makePageEntry() {
  return {
    title: 'Page',
    uuid: 'uuid',
    lastModified: '2026-05-01T00:00:00.000Z',
    currentVersion: 1,
    location: 'pages' as const,
    editor: 'alice',
    author: 'alice',
    creator: undefined as string | undefined,
    hasVersions: false,
    isPrivate: undefined as boolean | undefined,
    audienceRoles: undefined as string[] | undefined
  };
}

describe('VersioningFileProvider.getPagesByCreator (#640)', () => {
  test('returns [] when pageIndex is null', async () => {
    const p = makeProvider();
    p.pageIndex = null;
    expect(await p.getPagesByCreator('alice')).toEqual([]);
  });

  test('returns [] when username is empty', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 1,
      pages: { u1: baseEntry({ uuid: 'u1', author: 'alice' }) }
    };
    expect(await p.getPagesByCreator('')).toEqual([]);
  });

  test('matches by author field', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'AlicePage', author: 'alice' }),
        u2: baseEntry({ uuid: 'u2', title: 'BobPage', author: 'bob' }),
        u3: baseEntry({ uuid: 'u3', title: 'AlicePage2', author: 'alice' })
      }
    };
    const result = await p.getPagesByCreator('alice');
    expect(result.map(e => e.title).sort()).toEqual(['AlicePage', 'AlicePage2']);
  });

  test('matches by creator field (denormalised on private pages)', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 2,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'PrivAlice', author: 'alice', creator: 'alice', isPrivate: true }),
        u2: baseEntry({ uuid: 'u2', title: 'AdminCreatedForBob', author: 'admin', creator: 'bob', isPrivate: true })
      }
    };
    const aliceResult = await p.getPagesByCreator('alice');
    const bobResult = await p.getPagesByCreator('bob');
    expect(aliceResult.map(e => e.title)).toEqual(['PrivAlice']);
    expect(bobResult.map(e => e.title)).toEqual(['AdminCreatedForBob']);
  });

  test('onlyPrivate: true filters non-private pages out', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'PublicAlice', author: 'alice' }),
        u2: baseEntry({ uuid: 'u2', title: 'PrivateAlice', author: 'alice', isPrivate: true }),
        u3: baseEntry({ uuid: 'u3', title: 'PublicAlice2', author: 'alice' })
      }
    };
    const all = await p.getPagesByCreator('alice');
    const onlyPrivate = await p.getPagesByCreator('alice', { onlyPrivate: true });
    expect(all).toHaveLength(3);
    expect(onlyPrivate).toHaveLength(1);
    expect(onlyPrivate[0].title).toBe('PrivateAlice');
  });

  test('default sort is lastModified descending', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'Old', author: 'alice', lastModified: '2026-01-01' }),
        u2: baseEntry({ uuid: 'u2', title: 'New', author: 'alice', lastModified: '2026-05-01' }),
        u3: baseEntry({ uuid: 'u3', title: 'Mid', author: 'alice', lastModified: '2026-03-01' })
      }
    };
    const result = await p.getPagesByCreator('alice');
    expect(result.map(e => e.title)).toEqual(['New', 'Mid', 'Old']);
  });

  test('sortBy title-asc orders alphabetically', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'Charlie', author: 'alice' }),
        u2: baseEntry({ uuid: 'u2', title: 'Alpha', author: 'alice' }),
        u3: baseEntry({ uuid: 'u3', title: 'Bravo', author: 'alice' })
      }
    };
    const result = await p.getPagesByCreator('alice', { sortBy: 'title-asc' });
    expect(result.map(e => e.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('respects limit', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 5,
      pages: {
        u1: baseEntry({ uuid: 'u1', author: 'alice', lastModified: '2026-05-05' }),
        u2: baseEntry({ uuid: 'u2', author: 'alice', lastModified: '2026-05-04' }),
        u3: baseEntry({ uuid: 'u3', author: 'alice', lastModified: '2026-05-03' }),
        u4: baseEntry({ uuid: 'u4', author: 'alice', lastModified: '2026-05-02' }),
        u5: baseEntry({ uuid: 'u5', author: 'alice', lastModified: '2026-05-01' })
      }
    };
    const result = await p.getPagesByCreator('alice', { limit: 2 });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.uuid)).toEqual(['u1', 'u2']);
  });

  test('does NOT apply visibility filter (caller is asking about own pages)', async () => {
    // Even private-with-no-audience pages are returned for the matching creator.
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 1,
      pages: {
        u1: baseEntry({
          uuid: 'u1',
          title: 'AliceSecret',
          author: 'alice',
          creator: 'alice',
          isPrivate: true,
          audienceRoles: undefined // no audience whatsoever
        })
      }
    };
    const result = await p.getPagesByCreator('alice');
    expect(result.map(e => e.title)).toEqual(['AliceSecret']);
  });
});

// ─── #1004: systemKeywords filter (backs /my/captures) ───────────────────

/**
 * The index carries no system-keywords column, so the filter reads frontmatter
 * through getPageMetadata → resolvePageInfo → uuidIndex + pageCache. Seeding
 * those two maps exercises the real lookup path rather than stubbing the
 * method out; a test that stubbed getPageMetadata would still pass if the
 * production code looked the page up by the wrong key.
 */
function seedMetadata(
  provider: ReturnType<typeof makeProvider>,
  entries: Array<{ uuid: string; title: string; systemKeywords?: string[] }>
) {
  const p = provider as unknown as {
    uuidIndex: Map<string, string>;
    pageCache: Map<string, { title: string; uuid: string; metadata: Record<string, unknown> }>;
  };
  for (const e of entries) {
    p.uuidIndex.set(e.uuid, e.title);
    p.pageCache.set(e.title, {
      title: e.title,
      uuid: e.uuid,
      metadata: e.systemKeywords ? { 'system-keywords': e.systemKeywords } : {}
    });
  }
}

describe('VersioningFileProvider.getPagesByCreator systemKeywords filter (#1004)', () => {
  const captureIndex = {
    version: '1', lastUpdated: '', pageCount: 3,
    pages: {
      u1: baseEntry({ uuid: 'u1', title: 'Captures — alice — 2026-07-28', author: 'alice' }),
      u2: baseEntry({ uuid: 'u2', title: 'Ordinary Page', author: 'alice' }),
      u3: baseEntry({ uuid: 'u3', title: 'Captures — alice — 2026-07-27', author: 'alice' })
    }
  };

  test('returns only pages carrying the keyword', async () => {
    const p = makeProvider();
    p.pageIndex = { ...captureIndex };
    seedMetadata(p, [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'Ordinary Page', systemKeywords: ['general'] },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27', systemKeywords: ['capture'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.uuid).sort()).toEqual(['u1', 'u3']);
  });

  test('matches case-insensitively in both directions', async () => {
    const p = makeProvider();
    p.pageIndex = { ...captureIndex };
    seedMetadata(p, [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['Capture'] },
      { uuid: 'u2', title: 'Ordinary Page', systemKeywords: ['general'] },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27', systemKeywords: ['capture'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['CAPTURE'] });
    expect(result.map(e => e.uuid).sort()).toEqual(['u1', 'u3']);
  });

  test('ORs across multiple keywords (instance may configure several)', async () => {
    const p = makeProvider();
    p.pageIndex = { ...captureIndex };
    seedMetadata(p, [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'Ordinary Page', systemKeywords: ['general'] },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27', systemKeywords: ['clipping'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture', 'clipping'] });
    expect(result.map(e => e.uuid).sort()).toEqual(['u1', 'u3']);
  });

  test('excludes pages with no system-keywords at all', async () => {
    const p = makeProvider();
    p.pageIndex = { ...captureIndex };
    seedMetadata(p, [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'Ordinary Page' },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27' }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.uuid)).toEqual(['u1']);
  });

  test('omitted or empty filter returns everything (no accidental filtering)', async () => {
    const p = makeProvider();
    p.pageIndex = { ...captureIndex };
    seedMetadata(p, [
      { uuid: 'u1', title: 'Captures — alice — 2026-07-28', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'Ordinary Page' },
      { uuid: 'u3', title: 'Captures — alice — 2026-07-27', systemKeywords: ['capture'] }
    ]);
    expect(await p.getPagesByCreator('alice')).toHaveLength(3);
    expect(await p.getPagesByCreator('alice', { systemKeywords: [] })).toHaveLength(3);
    expect(await p.getPagesByCreator('alice', { systemKeywords: ['  '] })).toHaveLength(3);
  });

  test('does not leak another user\'s captures', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 2,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'AliceCapture', author: 'alice' }),
        u2: baseEntry({ uuid: 'u2', title: 'BobCapture', author: 'bob' })
      }
    };
    seedMetadata(p, [
      { uuid: 'u1', title: 'AliceCapture', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'BobCapture', systemKeywords: ['capture'] }
    ]);
    const result = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    expect(result.map(e => e.title)).toEqual(['AliceCapture']);
  });

  test('combines with onlyPrivate rather than overriding it', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 2,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'PublicCapture', author: 'alice' }),
        u2: baseEntry({ uuid: 'u2', title: 'PrivateCapture', author: 'alice', isPrivate: true })
      }
    };
    seedMetadata(p, [
      { uuid: 'u1', title: 'PublicCapture', systemKeywords: ['capture'] },
      { uuid: 'u2', title: 'PrivateCapture', systemKeywords: ['capture'] }
    ]);
    const both = await p.getPagesByCreator('alice', { systemKeywords: ['capture'] });
    const privateOnly = await p.getPagesByCreator('alice', { systemKeywords: ['capture'], onlyPrivate: true });
    expect(both).toHaveLength(2);
    expect(privateOnly.map(e => e.title)).toEqual(['PrivateCapture']);
  });
});

// ─── #640 Phase 2: getPagesByEditor + getPagesSharedWith ─────────────────

function makeProviderWith(pages: Record<string, ReturnType<typeof makePageEntry>>) {
  const p = makeProvider();
  p.pageIndex = {
    version: '1', lastUpdated: '', pageCount: Object.keys(pages).length, pages
  };
  return p;
}

/**
 * #1054: getPagesSharedWith now reads real frontmatter rather than the index's
 * `audienceRoles`, which is denormalised at write time and stale on any page
 * not re-saved since #754 (347 pages with an audience, 2 with an index entry).
 *
 * These helpers stub the metadata the provider will read. `audienceRoles` is
 * left on the index entries deliberately, so the tests below double as proof
 * that the stale copy no longer drives the result.
 */
function withAudienceMetadata(
  p: ReturnType<typeof makeProvider>,
  byUuid: Record<string, unknown>
) {
  (p as unknown as { getPageMetadata: (id: string) => Promise<unknown> })
    .getPageMetadata = (id: string) => Promise.resolve(byUuid[id] ?? null);
  return p;
}

describe('VersioningFileProvider.getPagesByEditor (#640 Phase 2)', () => {
  test('returns [] when pageIndex is null or username empty', async () => {
    const p = makeProvider();
    p.pageIndex = null;
    expect(await (p as unknown as { getPagesByEditor: (u: string) => Promise<unknown[]> }).getPagesByEditor('alice')).toEqual([]);
  });

  test('matches by editor field', async () => {
    const p = makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'EditedByAlice', author: 'bob', editor: 'alice' }),
      u2: baseEntry({ uuid: 'u2', title: 'EditedByBob', author: 'bob', editor: 'bob' }),
      u3: baseEntry({ uuid: 'u3', title: 'AliceEditedAgain', author: 'carol', editor: 'alice' })
    });
    const result = await (p as unknown as { getPagesByEditor: (u: string) => Promise<{ title: string }[]> }).getPagesByEditor('alice');
    expect(result.map(e => e.title).sort()).toEqual(['AliceEditedAgain', 'EditedByAlice']);
  });

  test('respects limit', async () => {
    const pages: Record<string, ReturnType<typeof makePageEntry>> = {};
    for (let i = 0; i < 5; i++) {
      pages[`u${i}`] = baseEntry({ uuid: `u${i}`, editor: 'alice', lastModified: `2026-05-0${i + 1}` });
    }
    const p = makeProviderWith(pages);
    const result = await (p as unknown as { getPagesByEditor: (u: string, o?: { limit?: number }) => Promise<unknown[]> }).getPagesByEditor('alice', { limit: 2 });
    expect(result).toHaveLength(2);
  });
});

describe('VersioningFileProvider.getPagesSharedWith (#640 Phase 2)', () => {
  test('returns [] when principals empty', async () => {
    const p = makeProviderWith({
      u1: baseEntry({ uuid: 'u1', author: 'alice', audienceRoles: ['bob'] })
    });
    expect(await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<unknown[]> }).getPagesSharedWith([])).toEqual([]);
  });

  test('matches when any principal appears in the frontmatter audience', async () => {
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'Shared1', author: 'alice', audienceRoles: ['bob', 'carol'] }),
      u2: baseEntry({ uuid: 'u2', title: 'NotShared', author: 'alice', audienceRoles: ['carol'] }),
      u3: baseEntry({ uuid: 'u3', title: 'SharedRole', author: 'alice', audienceRoles: ['editor'] })
    }), {
      u1: { audience: ['bob', 'carol'] },
      u2: { audience: ['carol'] },
      u3: { audience: ['editor'] }
    });
    const result = await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<{ title: string }[]> }).getPagesSharedWith(['bob']);
    expect(result.map(e => e.title)).toEqual(['Shared1']);

    const roleResult = await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<{ title: string }[]> }).getPagesSharedWith(['editor']);
    expect(roleResult.map(e => e.title)).toEqual(['SharedRole']);
  });

  test('excludes pages owned by any principal (no double-count with /my/pages)', async () => {
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'BobOwns', author: 'bob', audienceRoles: ['bob'] }),
      u2: baseEntry({ uuid: 'u2', title: 'AliceOwnsSharedToBob', author: 'alice', audienceRoles: ['bob'] }),
      u3: baseEntry({ uuid: 'u3', title: 'BobIsCreator', author: 'admin', creator: 'bob', audienceRoles: ['bob'] })
    }), {
      u1: { audience: ['bob'] }, u2: { audience: ['bob'] }, u3: { audience: ['bob'] }
    });
    const result = await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<{ title: string }[]> }).getPagesSharedWith(['bob']);
    // Bob owns u1 (author) and u3 (creator); only u2 is genuinely "shared with bob".
    expect(result.map(e => e.title)).toEqual(['AliceOwnsSharedToBob']);
  });

  test('returns [] when no page states an audience', async () => {
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', author: 'alice' })
    }), { u1: {} });
    expect(await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<unknown[]> }).getPagesSharedWith(['bob'])).toEqual([]);
  });

  // ─── #1054 ──────────────────────────────────────────────────────────────
  test('finds a page whose index audienceRoles is STALE but frontmatter shares it', async () => {
    // The bug: 345 of 347 audience pages looked unshared because the index copy
    // was never backfilled. This is the case that was silently missing.
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'StaleIndexShared', author: 'alice', audienceRoles: [] })
    }), { u1: { audience: ['bob'] } });

    const result = await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<{ title: string }[]> }).getPagesSharedWith(['bob']);
    expect(result.map(e => e.title)).toEqual(['StaleIndexShared']);
  });

  test('does NOT trust a stale index that claims a share frontmatter denies', async () => {
    // The other direction, and the one that would leak: listing a page under
    // "shared with me" that the viewer now gets a 403 on. Frontmatter decides.
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'NoLongerShared', author: 'alice', audienceRoles: ['bob'] })
    }), { u1: { audience: ['carol'] } });

    expect(await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<unknown[]> }).getPagesSharedWith(['bob'])).toEqual([]);
  });

  test('honours access.view, not just the audience shorthand', async () => {
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'SharedViaAccess', author: 'alice' })
    }), { u1: { access: { view: ['bob'] } } });

    const result = await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<{ title: string }[]> }).getPagesSharedWith(['bob']);
    expect(result.map(e => e.title)).toEqual(['SharedViaAccess']);
  });

  test('an edit-only access rule is not a share', async () => {
    const p = withAudienceMetadata(makeProviderWith({
      u1: baseEntry({ uuid: 'u1', title: 'EditOnly', author: 'alice' })
    }), { u1: { access: { edit: ['bob'] } } });

    expect(await (p as unknown as { getPagesSharedWith: (ps: string[]) => Promise<unknown[]> }).getPagesSharedWith(['bob'])).toEqual([]);
  });
});
