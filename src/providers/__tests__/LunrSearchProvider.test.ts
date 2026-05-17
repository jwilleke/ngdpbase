/**
 * Unit tests for LunrSearchProvider — author/editor filtering (#339)
 *
 * We instantiate the compiled provider (from dist/), inject documents
 * directly via the private `documents` field (accessible at runtime despite
 * TypeScript's `private` keyword), and call advancedSearch() to verify
 * filtering behaviour without needing a full engine or disk index.
 *
 * Covers:
 * - author filter: exact case-insensitive match against document.author
 * - editor filter: exact case-insensitive match against document.editor
 * - author + category combined filter
 * - editor + keyword combined filter
 * - author/editor returned in result metadata
 * - No filter: all documents returned
 * - Empty filter string: no filtering applied
 */

// Use the compiled output (same as CI — no build step required for this file).
// The provider is a class exported via module.exports from the dist file.
import LunrSearchProvider from '../../../dist/src/providers/LunrSearchProvider';

// ---------------------------------------------------------------------------
// Minimal mock engine (only needs ConfigurationManager for initialize())
// ---------------------------------------------------------------------------

function makeEngine(snippetLength = 200) {
  return {
    getManager: (name) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key, def) => {
            if (key === 'ngdpbase.search.provider.lunr.stemming') return false;
            if (key === 'ngdpbase.search.provider.lunr.snippetlength') return snippetLength;
            if (key.startsWith('ngdpbase.search.provider.lunr.boost')) return 1;
            if (key === 'ngdpbase.search.provider.lunr.maxresults') return 100;
            return def;
          },
          getResolvedDataPath: (_key, def) => def
        };
      }
      if (name === 'MetricsManager') return null;
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// Helper to build a minimal LunrDocument (all required fields)
// ---------------------------------------------------------------------------

function makeDoc(id, opts: {
  title?: string;
  content?: string;
  systemCategory?: string;
  userKeywords?: string;
  author?: string;
  editor?: string;
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
    isPrivate: undefined,
    creator: undefined
  };
}

// ---------------------------------------------------------------------------
// Setup: create provider, skip initialize(), inject documents directly
// ---------------------------------------------------------------------------

let provider;

beforeEach(() => {
  provider = new LunrSearchProvider(makeEngine());

  // Inject test documents directly — bypasses disk I/O and full index build.
  // TypeScript `private` does not affect runtime access.
  provider['documents'] = {
    'JimPage1':   makeDoc('JimPage1',   { author: 'jim',   editor: 'jim',   systemCategory: 'general',       userKeywords: 'foo' }),
    'JimPage2':   makeDoc('JimPage2',   { author: 'jim',   editor: 'alice', systemCategory: 'documentation', userKeywords: 'bar' }),
    'AlicePage1': makeDoc('AlicePage1', { author: 'alice', editor: 'alice', systemCategory: 'general',       userKeywords: 'foo' }),
    'AlicePage2': makeDoc('AlicePage2', { author: 'alice', editor: 'bob',   systemCategory: 'documentation', userKeywords: 'baz' }),
    'NoAuthor':   makeDoc('NoAuthor',   { /* no author/editor */            systemCategory: 'general',       userKeywords: 'foo' })
  };

  // Provide a minimal config so advancedSearch can read maxResults / snippetLength
  provider['config'] = {
    indexDir: '/tmp',
    stemming: false,
    boost: { title: 1, systemCategory: 1, userKeywords: 1, tags: 1, keywords: 1 },
    maxResults: 100,
    snippetLength: 200
  };
});

// ---------------------------------------------------------------------------
// No filters — returns all documents
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — no filters', () => {
  test('returns all documents when no criteria given', async () => {
    const results = await provider.advancedSearch({});
    expect(results).toHaveLength(5);
  });

  test('empty author string does not filter', async () => {
    const results = await provider.advancedSearch({ author: '' });
    expect(results).toHaveLength(5);
  });

  test('empty editor string does not filter', async () => {
    const results = await provider.advancedSearch({ editor: '' });
    expect(results).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// author filter
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — author filter', () => {
  test('filters to pages authored by jim', async () => {
    const results = await provider.advancedSearch({ author: 'jim' });
    expect(results).toHaveLength(2);
    const names = results.map(r => r.name);
    expect(names).toContain('JimPage1');
    expect(names).toContain('JimPage2');
    expect(names).not.toContain('AlicePage1');
    expect(names).not.toContain('NoAuthor');
  });

  test('filters to pages authored by alice', async () => {
    const results = await provider.advancedSearch({ author: 'alice' });
    expect(results).toHaveLength(2);
    const names = results.map(r => r.name);
    expect(names).toContain('AlicePage1');
    expect(names).toContain('AlicePage2');
  });

  test('author filter is case-insensitive', async () => {
    const upper = await provider.advancedSearch({ author: 'JIM' });
    const lower = await provider.advancedSearch({ author: 'jim' });
    expect(upper).toHaveLength(lower.length);
    expect(upper.map(r => r.name).sort()).toEqual(lower.map(r => r.name).sort());
  });

  test('unknown author returns empty array', async () => {
    const results = await provider.advancedSearch({ author: 'nobody' });
    expect(results).toHaveLength(0);
  });

  test('author filter excludes pages with no author set', async () => {
    const results = await provider.advancedSearch({ author: 'jim' });
    expect(results.map(r => r.name)).not.toContain('NoAuthor');
  });
});

// ---------------------------------------------------------------------------
// editor filter
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — editor filter', () => {
  test('filters to pages last edited by jim', async () => {
    const results = await provider.advancedSearch({ editor: 'jim' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('JimPage1');
  });

  test('filters to pages last edited by alice', async () => {
    const results = await provider.advancedSearch({ editor: 'alice' });
    expect(results).toHaveLength(2);
    const names = results.map(r => r.name);
    expect(names).toContain('JimPage2');
    expect(names).toContain('AlicePage1');
  });

  test('editor filter is case-insensitive', async () => {
    const upper = await provider.advancedSearch({ editor: 'ALICE' });
    const lower = await provider.advancedSearch({ editor: 'alice' });
    expect(upper).toHaveLength(lower.length);
  });

  test('unknown editor returns empty array', async () => {
    const results = await provider.advancedSearch({ editor: 'ghost' });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Combined filters
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — combined filters', () => {
  test('author + category narrows results', async () => {
    // jim has 2 pages: JimPage1 (general) and JimPage2 (documentation)
    const results = await provider.advancedSearch({
      author: 'jim',
      categories: ['documentation']
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('JimPage2');
  });

  test('editor + keyword narrows results', async () => {
    // alice edited JimPage2 (bar) and AlicePage1 (foo)
    const results = await provider.advancedSearch({
      editor: 'alice',
      userKeywords: ['foo']
    });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('AlicePage1');
  });

  test('author + editor on same page returns that page', async () => {
    // JimPage1: author=jim, editor=jim
    const results = await provider.advancedSearch({ author: 'jim', editor: 'jim' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('JimPage1');
  });

  test('incompatible author + editor returns empty', async () => {
    // No page has author=jim AND editor=bob
    const results = await provider.advancedSearch({ author: 'jim', editor: 'bob' });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// author/editor in result metadata
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — metadata fields', () => {
  test('result metadata includes author field', async () => {
    const results = await provider.advancedSearch({ author: 'jim' });
    for (const result of results) {
      expect(result.metadata).toHaveProperty('author');
      expect(result.metadata.author).toBe('jim');
    }
  });

  test('result metadata includes editor field', async () => {
    const results = await provider.advancedSearch({ editor: 'alice' });
    for (const result of results) {
      expect(result.metadata).toHaveProperty('editor');
      expect(result.metadata.editor).toBe('alice');
    }
  });

  test('result metadata includes both author and editor', async () => {
    const results = await provider.advancedSearch({});
    const jimPage1 = results.find(r => r.name === 'JimPage1');
    expect(jimPage1).toBeDefined();
    expect(jimPage1.metadata.author).toBe('jim');
    expect(jimPage1.metadata.editor).toBe('jim');

    const jimPage2 = results.find(r => r.name === 'JimPage2');
    expect(jimPage2).toBeDefined();
    expect(jimPage2.metadata.author).toBe('jim');
    expect(jimPage2.metadata.editor).toBe('alice');
  });
});

// ---------------------------------------------------------------------------
// #740 — single-field (title) multi-word search is field-scoped AND
// ---------------------------------------------------------------------------

describe('LunrSearchProvider.advancedSearch — #740 field-scoped AND (title)', () => {
  beforeEach(() => {
    provider['documents'] = {
      'PubEd':   makeDoc('PubEd',   { title: 'Public Education Programs', content: 'about local schools' }),
      'Boise':   makeDoc('Boise',   { title: 'Boise, ID', content: 'mentions Public services and Education separately' }),
      'OnlyPub': makeDoc('OnlyPub', { title: 'Public Notices', content: 'nothing relevant' })
    };
    provider['rebuildLunrFromDocuments']();
  });

  test('quoted multi-word title search requires ALL tokens in the title', async () => {
    // Mirrors the reported URL q=%22Public+Education%22 (literal quotes) with
    // the #739 title default (searchIn=['title']).
    const results = await provider.advancedSearch({ query: '"Public Education"', searchIn: ['title'] });
    const names = results.map(r => r.name);
    expect(names).toContain('PubEd');       // both tokens in title
    expect(names).not.toContain('Boise');   // tokens only in content → not title-scoped
    expect(names).not.toContain('OnlyPub'); // only "Public" in title → AND fails
  });

  test('single-token title search still matches', async () => {
    const results = await provider.advancedSearch({ query: 'Public', searchIn: ['title'] });
    const names = results.map(r => r.name);
    expect(names).toContain('PubEd');
    expect(names).toContain('OnlyPub');
    expect(names).not.toContain('Boise'); // "Public" not in Boise's title
  });
});
