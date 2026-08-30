/**
 * VersioningFileProvider.getRecentChanges tests (#635)
 *
 * Focused tests for the recent-changes filter/sort/limit logic, without
 * bootstrapping the full provider. We construct a provider, inject a
 * synthetic pageIndex, and exercise getRecentChanges directly.
 *
 * Covers:
 *   - sort by lastModified desc
 *   - limit
 *   - since cutoff
 *   - private-page visibility: anonymous, non-creator, creator, admin via includeAll
 *   - audience match (by username, by role)
 *   - empty / missing pageIndex returns []
 *   - missing lastModified entries skipped
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngine() {
  return {
    getManager: () => null,
    on: () => {},
    emit: () => {}
  } as unknown as ConstructorParameters<typeof VersioningFileProvider>[0];
}

function makeProvider() {
  const provider = new VersioningFileProvider(makeEngine());
  // Stamp directly — provider is uninitialised but getRecentChanges only reads
  // this.pageIndex, so we can avoid the full bootstrap.
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
    getRecentChanges: VersioningFileProvider['getRecentChanges'];
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VersioningFileProvider.getRecentChanges', () => {
  test('returns [] when pageIndex is null', async () => {
    const p = makeProvider();
    p.pageIndex = null;
    const result = await p.getRecentChanges();
    expect(result).toEqual([]);
  });

  test('sorts entries by lastModified descending', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1',
      lastUpdated: '',
      pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'Old', lastModified: '2026-01-01T00:00:00.000Z' }),
        u2: baseEntry({ uuid: 'u2', title: 'New', lastModified: '2026-05-01T00:00:00.000Z' }),
        u3: baseEntry({ uuid: 'u3', title: 'Mid', lastModified: '2026-03-01T00:00:00.000Z' })
      }
    };
    const result = await p.getRecentChanges();
    expect(result.map(e => e.title)).toEqual(['New', 'Mid', 'Old']);
  });

  test('respects limit', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1',
      lastUpdated: '',
      pageCount: 5,
      pages: {
        u1: baseEntry({ uuid: 'u1', lastModified: '2026-05-05' }),
        u2: baseEntry({ uuid: 'u2', lastModified: '2026-05-04' }),
        u3: baseEntry({ uuid: 'u3', lastModified: '2026-05-03' }),
        u4: baseEntry({ uuid: 'u4', lastModified: '2026-05-02' }),
        u5: baseEntry({ uuid: 'u5', lastModified: '2026-05-01' })
      }
    };
    const result = await p.getRecentChanges({ limit: 2 });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.uuid)).toEqual(['u1', 'u2']);
  });

  test('respects since cutoff', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 3,
      pages: {
        u1: baseEntry({ uuid: 'u1', lastModified: '2026-04-01' }),
        u2: baseEntry({ uuid: 'u2', lastModified: '2026-05-01' }),
        u3: baseEntry({ uuid: 'u3', lastModified: '2026-03-01' })
      }
    };
    const result = await p.getRecentChanges({ since: '2026-04-15' });
    expect(result.map(e => e.uuid)).toEqual(['u2']);
  });

  test('skips entries with missing lastModified', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 2,
      pages: {
        u1: baseEntry({ uuid: 'u1', lastModified: '' }),
        u2: baseEntry({ uuid: 'u2', lastModified: '2026-05-01' })
      }
    };
    const result = await p.getRecentChanges();
    expect(result.map(e => e.uuid)).toEqual(['u2']);
  });

  describe('visibility filter', () => {
    test('anonymous (no principals) cannot see private pages', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 2,
        pages: {
          pub: baseEntry({ uuid: 'pub', title: 'Public' }),
          priv: baseEntry({ uuid: 'priv', title: 'Private', isPrivate: true, creator: 'alice' })
        }
      };
      const result = await p.getRecentChanges();
      expect(result.map(e => e.title)).toEqual(['Public']);
    });

    test('non-creator non-admin without audience match cannot see private pages', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 1,
        pages: {
          priv: baseEntry({ uuid: 'priv', title: 'AlicesSecret', isPrivate: true, creator: 'alice' })
        }
      };
      const result = await p.getRecentChanges({ principals: ['user', 'bob'] });
      expect(result).toEqual([]);
    });

    test('creator sees their own private page', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 1,
        pages: {
          priv: baseEntry({ uuid: 'priv', title: 'AlicesSecret', isPrivate: true, creator: 'alice' })
        }
      };
      const result = await p.getRecentChanges({ principals: ['user', 'alice'] });
      expect(result.map(e => e.title)).toEqual(['AlicesSecret']);
    });

    test('audience match by username allows visibility', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 1,
        pages: {
          priv: baseEntry({
            uuid: 'priv', title: 'Shared', isPrivate: true, creator: 'alice',
            audienceRoles: ['bob', 'carol']
          })
        }
      };
      const result = await p.getRecentChanges({ principals: ['user', 'bob'] });
      expect(result.map(e => e.title)).toEqual(['Shared']);
    });

    test('audience match by role allows visibility', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 1,
        pages: {
          priv: baseEntry({
            uuid: 'priv', title: 'EditorOnly', isPrivate: true, creator: 'alice',
            audienceRoles: ['editor']
          })
        }
      };
      const result = await p.getRecentChanges({ principals: ['editor', 'dave'] });
      expect(result.map(e => e.title)).toEqual(['EditorOnly']);
    });

    test('an admin principal bypasses the visibility filter (#1116)', async () => {
      // The caller supplies FACTS (its principals); the provider draws the
      // conclusion. The old `includeAll` boolean was the conclusion handed
      // over, and any caller could pass it.
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 2,
        pages: {
          priv1: baseEntry({ uuid: 'priv1', title: 'Alices', isPrivate: true, creator: 'alice' }),
          priv2: baseEntry({ uuid: 'priv2', title: 'Bobs', isPrivate: true, creator: 'bob' })
        }
      };
      const result = await p.getRecentChanges({ principals: ['admin'] });
      expect(result.map(e => e.title).sort()).toEqual(['Alices', 'Bobs']);
    });

    test('a stray includeAll from a legacy caller is ignored (#1116)', async () => {
      const p = makeProvider();
      p.pageIndex = {
        version: '1', lastUpdated: '', pageCount: 1,
        pages: {
          priv1: baseEntry({ uuid: 'priv1', title: 'Alices', isPrivate: true, creator: 'alice' })
        }
      };
      const result = await p.getRecentChanges(
        { principals: ['mallory'], includeAll: true }
      );
      expect(result).toEqual([]);
    });
  });

  test('preserves richer fields (editor, currentVersion, hasVersions)', async () => {
    const p = makeProvider();
    p.pageIndex = {
      version: '1', lastUpdated: '', pageCount: 1,
      pages: {
        u1: baseEntry({ uuid: 'u1', title: 'Foo', editor: 'alice', currentVersion: 5, hasVersions: true })
      }
    };
    const result = await p.getRecentChanges();
    expect(result[0]).toMatchObject({
      title: 'Foo', uuid: 'u1', editor: 'alice', currentVersion: 5, hasVersions: true
    });
  });

  // ---------------------------------------------------------------------
  // #1054 — a listed page must never be one the viewer gets a 403 on.
  //
  // The old filter nested the audience test inside `if (idx.isPrivate)`, so a
  // NON-private page carrying an audience was never tested. On jimstest that
  // was all 347 audience-restricted pages — visible in Recent Changes to an
  // anonymous viewer while /view/ correctly returned 403. Compounded by the
  // index's `audienceRoles` being denormalised at write time (347 pages with
  // audience frontmatter, 2 with a populated index entry), so the field the
  // check read was empty anyway.
  //
  // Frontmatter is the source of truth here, matching ACLManager.
  // ---------------------------------------------------------------------
  describe('#1054 — audience on a NON-private page', () => {
    const withMetadata = (meta: Record<string, unknown> | null) => {
      const p = makeProvider();
      (p as unknown as { getPageMetadata: (id: string) => Promise<unknown> })
        .getPageMetadata = () => Promise.resolve(meta);
      return p;
    };

    const indexWith = (over: Record<string, unknown>) => ({
      version: '1', lastUpdated: 'x', pageCount: 1,
      pages: { a: baseEntry({ uuid: 'a', title: 'Journal', ...over }) }
    });

    test('hides it from a viewer outside the audience', async () => {
      const p = withMetadata({ audience: ['jim'] });
      // isPrivate deliberately falsy — the exact shape that leaked.
      p.pageIndex = indexWith({ isPrivate: undefined });

      const out = await p.getRecentChanges({ principals: ['anonymous'] });
      expect(out).toEqual([]);
    });

    test('still shows it to a viewer inside the audience', async () => {
      const p = withMetadata({ audience: ['jim'] });
      p.pageIndex = indexWith({ isPrivate: undefined });

      const out = await p.getRecentChanges({ principals: ['reader', 'jim'] });
      expect(out).toHaveLength(1);
    });

    test('respects access.view the same way as audience', async () => {
      const p = withMetadata({ access: { view: ['editor'] } });
      p.pageIndex = indexWith({ isPrivate: undefined });

      expect(await p.getRecentChanges({ principals: ['anonymous'] })).toEqual([]);
      expect(await p.getRecentChanges({ principals: ['editor'] })).toHaveLength(1);
    });

    test('an edit-only rule does not hide a publicly readable page', async () => {
      // `access: {edit: [admin]}` restricts editing, not viewing.
      const p = withMetadata({ access: { edit: ['admin'] } });
      p.pageIndex = indexWith({ isPrivate: undefined });

      expect(await p.getRecentChanges({ principals: ['anonymous'] })).toHaveLength(1);
    });

    test('an unrestricted page is unaffected', async () => {
      const p = withMetadata({});
      p.pageIndex = indexWith({ isPrivate: undefined });

      expect(await p.getRecentChanges({ principals: ['anonymous'] })).toHaveLength(1);
    });

    test('stale audienceRoles in the index does not make it visible', async () => {
      // The second defect: index says unrestricted, frontmatter says otherwise.
      // Frontmatter must win, or 345 of 347 pages stay leaked.
      const p = withMetadata({ audience: ['jim'] });
      p.pageIndex = indexWith({ isPrivate: undefined, audienceRoles: [] });

      expect(await p.getRecentChanges({ principals: ['anonymous'] })).toEqual([]);
    });

    test('an admin principal still bypasses the filter (#1116)', async () => {
      const p = withMetadata({ audience: ['jim'] });
      p.pageIndex = indexWith({ isPrivate: undefined });

      expect(await p.getRecentChanges({ principals: ['admin'] }))
        .toHaveLength(1);
    });
  });
});
