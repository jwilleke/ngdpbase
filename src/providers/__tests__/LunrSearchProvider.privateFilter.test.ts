/**
 * Unit tests for LunrSearchProvider — private page filtering (#122)
 *
 * Tests that search() filters out private pages for users who are not the
 * creator or an admin, while allowing creators and admins to see their own
 * private pages in results.
 *
 * Covers:
 * - Anonymous search: private pages excluded
 * - Non-creator authenticated user: private pages excluded
 * - Page creator: private pages included
 * - Admin user: all private pages included regardless of creator
 * - Public pages: always included
 * - Mixed results: correct filtering applied per document
 */

// Opt out of the global LunrSearchProvider mock so we test the real implementation
vi.unmock('../LunrSearchProvider');

import LunrSearchProvider from '../LunrSearchProvider';

// ---------------------------------------------------------------------------
// Minimal mock engine
// ---------------------------------------------------------------------------

function makeEngine() {
  return {
    getManager: (name) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key, def) => {
            if (key === 'ngdpbase.search.provider.lunr.stemming') return false;
            if (key === 'ngdpbase.search.provider.lunr.snippetlength') return 200;
            if (key.startsWith('ngdpbase.search.provider.lunr.boost')) return 1;
            if (key === 'ngdpbase.search.provider.lunr.maxresults') return 100;
            return def;
          },
          getResolvedDataPath: (_key, def) => def
        };
      }
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Helper to build a minimal LunrDocument
// ---------------------------------------------------------------------------

function makeDoc(id, opts: {
  title?: string;
  content?: string;
  systemCategory?: string;
  userKeywords?: string;
  author?: string;
  editor?: string;
  isPrivate?: boolean;
  creator?: string;
  audience?: string[];
} = {}) {
  return {
    id,
    title: opts.title ?? id,
    content: opts.content ?? `Content for ${id}`,
    body: opts.content ?? `Content for ${id}`,
    systemCategory: opts.systemCategory ?? 'general',
    userKeywords: opts.userKeywords ?? '',
    tags: '',
    keywords: opts.userKeywords ?? '',
    lastModified: '2026-01-01T00:00:00.000Z',
    uuid: `uuid-${id}`,
    author: opts.author ?? undefined,
    editor: opts.editor ?? undefined,
    isPrivate: opts.isPrivate ?? undefined,
    creator: opts.creator ?? undefined,
    audience: opts.audience ?? undefined
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let provider;

beforeEach(() => {
  provider = new LunrSearchProvider(makeEngine());

  // Inject documents including private pages
  provider['documents'] = {
    'AlicePrivatePage': makeDoc('AlicePrivatePage', { isPrivate: true, creator: 'alice', content: 'secret private content' }),
    'BobPrivatePage':   makeDoc('BobPrivatePage',   { isPrivate: true, creator: 'bob',   content: 'bob private stuff' }),
    'PublicPage':       makeDoc('PublicPage',        { content: 'public content for everyone' })
  };

  provider['config'] = {
    indexDir: '/tmp',
    stemming: false,
    boost: { title: 1, systemCategory: 1, userKeywords: 1, tags: 1, keywords: 1 },
    maxResults: 100,
    snippetLength: 200
  };

  // Mock the Lunr index to return all three documents as hits
  provider['searchIndex'] = {
    search: vi.fn().mockReturnValue([
      { ref: 'AlicePrivatePage', score: 1.0, matchData: {} },
      { ref: 'BobPrivatePage',   score: 0.9, matchData: {} },
      { ref: 'PublicPage',       score: 0.8, matchData: {} }
    ])
  };
});

// ---------------------------------------------------------------------------
// No wikiContext — treat as anonymous
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.search — private filtering — no wikiContext', () => {
  test('excludes all private pages when no wikiContext provided', async () => {
    const results = await provider.search('content');
    const names = results.map(r => r.name);
    expect(names).not.toContain('AlicePrivatePage');
    expect(names).not.toContain('BobPrivatePage');
    expect(names).toContain('PublicPage');
  });

  test('returns empty array when query is empty', async () => {
    const results = await provider.search('');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Non-creator, non-admin user
// ---------------------------------------------------------------------------

// Build a WikiContext-shaped fixture that satisfies SearchWikiContext
// (#625 — exposes hasRole / getPrincipals as the real WikiContext does)
function makeWikiContext(username, roles = ['user']) {
  return {
    userContext: { username, roles },
    hasRole: (...names: string[]) => names.some((n) => roles.includes(n)),
    getPrincipals: () => (username ? [...roles, username] : [...roles])
  };
}

describe('LunrSearchProvider.search — private filtering — non-creator user', () => {
  test('excludes private pages not owned by the current user', async () => {
    const wikiContext = makeWikiContext('carol');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).not.toContain('AlicePrivatePage');
    expect(names).not.toContain('BobPrivatePage');
    expect(names).toContain('PublicPage');
  });

  test('includes only the creator\'s own private page, excludes others', async () => {
    const wikiContext = makeWikiContext('alice');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AlicePrivatePage');
    expect(names).not.toContain('BobPrivatePage');
    expect(names).toContain('PublicPage');
  });

  test('bob sees only his own private page', async () => {
    const wikiContext = makeWikiContext('bob');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).not.toContain('AlicePrivatePage');
    expect(names).toContain('BobPrivatePage');
    expect(names).toContain('PublicPage');
  });
});

// ---------------------------------------------------------------------------
// Admin user
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.search — private filtering — admin user', () => {
  test('admin sees all private pages from all creators', async () => {
    const wikiContext = makeWikiContext('admin', ['admin']);
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AlicePrivatePage');
    expect(names).toContain('BobPrivatePage');
    expect(names).toContain('PublicPage');
  });

  test('user with both user and admin roles is treated as admin', async () => {
    const wikiContext = makeWikiContext('jim', ['user', 'admin']);
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AlicePrivatePage');
    expect(names).toContain('BobPrivatePage');
  });
});

// ---------------------------------------------------------------------------
// #626: Audience filter — private page with frontmatter audience
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.search — private filtering — frontmatter audience (#626)', () => {
  beforeEach(() => {
    // Override the default fixture with audience-bearing private pages
    provider['documents'] = {
      'AliceShared': makeDoc('AliceShared', {
        isPrivate: true,
        creator: 'alice',
        audience: ['bob', 'carol'],
        content: 'shared private content'
      }),
      'AliceRoleShared': makeDoc('AliceRoleShared', {
        isPrivate: true,
        creator: 'alice',
        audience: ['editor'],
        content: 'role-audience private content'
      }),
      'AliceUnshared': makeDoc('AliceUnshared', {
        isPrivate: true,
        creator: 'alice',
        content: 'no audience private content'
      })
    };
    provider['searchIndex'] = {
      search: vi.fn().mockReturnValue([
        { ref: 'AliceShared', score: 1.0, matchData: {} },
        { ref: 'AliceRoleShared', score: 0.9, matchData: {} },
        { ref: 'AliceUnshared', score: 0.8, matchData: {} }
      ])
    };
  });

  test('user listed in audience by username sees the private page', async () => {
    const wikiContext = makeWikiContext('bob');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AliceShared');         // bob is in audience
    expect(names).not.toContain('AliceRoleShared'); // bob not 'editor'
    expect(names).not.toContain('AliceUnshared');   // no audience match, not creator, not admin
  });

  test('user matching audience by role sees the role-audience page', async () => {
    const wikiContext = makeWikiContext('dave', ['editor']);
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).not.toContain('AliceShared');     // dave not listed by username
    expect(names).toContain('AliceRoleShared');     // dave has 'editor' role
    expect(names).not.toContain('AliceUnshared');   // no audience
  });

  test('user not in audience and not creator/admin sees nothing private', async () => {
    const wikiContext = makeWikiContext('eve');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).not.toContain('AliceShared');
    expect(names).not.toContain('AliceRoleShared');
    expect(names).not.toContain('AliceUnshared');
  });

  test('admin still bypasses audience — sees all private pages regardless', async () => {
    const wikiContext = makeWikiContext('root', ['admin']);
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AliceShared');
    expect(names).toContain('AliceRoleShared');
    expect(names).toContain('AliceUnshared');
  });

  test('creator still sees their own private page even when not in audience', async () => {
    const wikiContext = makeWikiContext('alice');
    const results = await provider.search('content', { wikiContext });
    const names = results.map(r => r.name);
    expect(names).toContain('AliceShared');         // alice is creator
    expect(names).toContain('AliceRoleShared');     // alice is creator
    expect(names).toContain('AliceUnshared');       // alice is creator
  });
});

// ---------------------------------------------------------------------------
// Public pages always visible
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.search — private filtering — public pages', () => {
  test('public pages are visible to anonymous users', async () => {
    const results = await provider.search('content');
    expect(results.map(r => r.name)).toContain('PublicPage');
  });

  test('public pages are visible to authenticated non-admin users', async () => {
    const wikiContext = makeWikiContext('carol', ['user']);
    const results = await provider.search('content', { wikiContext });
    expect(results.map(r => r.name)).toContain('PublicPage');
  });
});

// ---------------------------------------------------------------------------
// searchIndex null — returns empty
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.search — no index', () => {
  test('returns empty array when searchIndex is null', async () => {
    provider['searchIndex'] = null;
    const results = await provider.search('content');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// #639: buildDocumentFromPageData reads top-level `private` field
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.buildDocumentFromPageData — private signal sources (#639)', () => {
  function buildDoc(metadata: Record<string, unknown>) {
    return provider['buildDocumentFromPageData']('TestPage', {
      metadata,
      content: 'page body'
    });
  }

  test('top-level private: true → isPrivate true on doc', () => {
    const doc = buildDoc({ title: 'X', uuid: 'u1', author: 'alice', private: true });
    expect(doc.isPrivate).toBe(true);
    expect(doc.creator).toBe('alice');
  });

  // #639 Slice E: user-keywords back-compat fallback removed.
  // #802 Slice 4: system-location back-compat fallback retired; only
  // `private:true` (or `pageData.isPrivate`) signals privacy.

  test('system-location: private alone → isPrivate undefined (#802 Slice 4: fallback retired)', () => {
    const doc = buildDoc({ title: 'X', uuid: 'u1', author: 'alice', 'system-location': 'private' });
    expect(doc.isPrivate).toBeUndefined();
  });

  test('no private signals → isPrivate undefined', () => {
    const doc = buildDoc({ title: 'X', uuid: 'u1', author: 'alice' });
    expect(doc.isPrivate).toBeUndefined();
    expect(doc.creator).toBeUndefined();
  });

  test('both top-level and user-keywords present → isPrivate true', () => {
    const doc = buildDoc({
      title: 'X', uuid: 'u1', author: 'alice',
      private: true, 'user-keywords': ['private']
    });
    expect(doc.isPrivate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// #716/#731: the no-text advancedSearch branch (browse-all / category-only /
// keyword-only) builds from the raw documents map. Before Slice 1 it applied
// NO private filter and leaked private pages to any caller. These guard the
// isDocVisible() filter now applied there.
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — no-query branch — private filtering (#716/#731)', () => {
  let p;
  beforeEach(() => {
    p = new LunrSearchProvider(makeEngine());
    p['documents'] = {
      'AlicePriv': makeDoc('AlicePriv', { isPrivate: true, creator: 'alice', systemCategory: 'docs', audience: ['team-x'] }),
      'BobPriv':   makeDoc('BobPriv',   { isPrivate: true, creator: 'bob',   systemCategory: 'docs' }),
      'Public':    makeDoc('Public',    { systemCategory: 'docs' })
    };
    p['config'] = { indexDir: '/tmp', stemming: false, boost: {}, maxResults: 100, snippetLength: 200 };
  });

  test('no wikiContext (anon): excludes every private page', async () => {
    const names = (await p.advancedSearch({})).map(r => r.name);
    expect(names).toEqual(['Public']);
  });

  test('category-only filter (no text query) still ACL-filters', async () => {
    // The broader leak: a category filter with no `query` hits the same branch.
    const names = (await p.advancedSearch({ categories: ['docs'] })).map(r => r.name);
    expect(names).not.toContain('AlicePriv');
    expect(names).not.toContain('BobPriv');
    expect(names).toContain('Public');
  });

  test('non-creator user: private excluded', async () => {
    const names = (await p.advancedSearch({ wikiContext: makeWikiContext('carol') })).map(r => r.name);
    expect(names.sort()).toEqual(['Public']);
  });

  test('creator sees own private page only', async () => {
    const names = (await p.advancedSearch({ wikiContext: makeWikiContext('alice') })).map(r => r.name).sort();
    expect(names).toEqual(['AlicePriv', 'Public']);
  });

  test('admin sees all', async () => {
    const names = (await p.advancedSearch({ wikiContext: makeWikiContext('root', ['admin']) })).map(r => r.name).sort();
    expect(names).toEqual(['AlicePriv', 'BobPriv', 'Public']);
  });

  test('audience principal grants visibility of a private page', async () => {
    // carol is not the creator but is in AlicePriv's audience via principals
    const wc = makeWikiContext('carol', ['user', 'team-x']);
    const names = (await p.advancedSearch({ wikiContext: wc })).map(r => r.name).sort();
    expect(names).toContain('AlicePriv');
    expect(names).not.toContain('BobPriv');
  });
});
