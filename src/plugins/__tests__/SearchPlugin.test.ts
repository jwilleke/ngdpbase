/**
 * Unit tests for SearchPlugin
 *
 * Covers:
 * - author/editor filter parameters (new in #339)
 * - format='table' output via formatAsTable (refactored from inline HTML)
 * - format='titles' output via formatAsList
 * - format='count' output via formatAsCount
 * - format='list' plain text output
 * - Empty result handling per format
 * - Filter description in table summary (category, keywords, author, editor)
 * - advancedSearch triggered when author or editor param is provided
 * - Pagination and max parameters continue to work
 */

import SearchPluginModule from '../SearchPlugin' ;
import type { SimplePlugin } from '../types';
const SearchPlugin = SearchPluginModule as unknown as SimplePlugin;
// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake SearchResult object (matches BaseSearchProvider.SearchResult shape).
 */
function makeResult(name: string, title: string, opts: { score?: number; snippet?: string; systemCategory?: string; userKeywords?: string; author?: string; editor?: string; lastModified?: string } = {}) {
  return {
    name,
    title,
    score: opts.score ?? 1.0,
    snippet: opts.snippet ?? '',
    metadata: {
      systemCategory: opts.systemCategory ?? '',
      userKeywords: opts.userKeywords ?? '',
      author: opts.author ?? '',
      editor: opts.editor ?? '',
      lastModified: opts.lastModified ?? ''
    }
  };
}

/**
 * Build a plugin context that wires up a mock SearchManager.
 * advancedSearchResults / searchResults control what the mocks return.
 */
function makeContext(opts = {}) {
  const {
    advancedSearchResults = [],
    searchResults = [],
    pageName = 'TestPage',
    query = {}
  } = opts;

  const mockSearchManager = {
    advancedSearch: vi.fn().mockResolvedValue(advancedSearchResults),
    search: vi.fn().mockResolvedValue(searchResults)
  };

  return {
    context: {
      engine: {
        getManager: (name) => {
          if (name === 'SearchManager') return mockSearchManager;
          return null;
        }
      },
      pageName,
      linkGraph: {},
      query
    },
    mockSearchManager
  };
}

// ---------------------------------------------------------------------------
// format='table' (default)
// ---------------------------------------------------------------------------

describe('SearchPlugin — format=table', () => {
  test('renders result count and page link in table', async () => {
    const results = [makeResult('Alpha', 'Alpha Page'), makeResult('Beta', 'Beta Page')];
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'alpha', format: 'table' });

    expect(html).toContain('2'); // count in summary
    expect(html).toContain('alpha');
    expect(html).toContain('href="/view/Alpha"');
    expect(html).toContain('href="/view/Beta"');
    // Uses formatAsTable — should have plugin-table class
    expect(html).toContain('plugin-table');
  });

  test('shows "No results" when empty', async () => {
    const { context } = makeContext({ searchResults: [] });
    const html = await SearchPlugin.execute(context, { query: 'nothing', format: 'table' });
    expect(html).toContain('No results found');
    expect(html).toContain('nothing');
  });

  test('shows category in filter description', async () => {
    const results = [makeResult('Doc', 'Docs', { systemCategory: 'documentation' })];
    const { context } = makeContext({ advancedSearchResults: results });

    const html = await SearchPlugin.execute(context, { 'system-category': 'documentation', format: 'table' });
    expect(html).toContain('documentation');
    // formatAsTable renders the table
    expect(html).toContain('plugin-table');
  });

  test('shows author in filter description', async () => {
    const results = [makeResult('MyPage', 'My Page', { author: 'jim' })];
    const { context } = makeContext({ advancedSearchResults: results });

    const html = await SearchPlugin.execute(context, { author: 'jim', format: 'table' });
    expect(html).toContain('jim');
    expect(html).toContain('author');
  });

  test('shows editor in filter description', async () => {
    const results = [makeResult('MyPage', 'My Page', { editor: 'alice' })];
    const { context } = makeContext({ advancedSearchResults: results });

    const html = await SearchPlugin.execute(context, { editor: 'alice', format: 'table' });
    expect(html).toContain('alice');
    expect(html).toContain('edited by');
  });
});

// ---------------------------------------------------------------------------
// format='titles'
// ---------------------------------------------------------------------------

describe('SearchPlugin — format=titles', () => {
  test('renders a list of linked page titles', async () => {
    const results = [makeResult('Alpha', 'Alpha Page'), makeResult('Beta', 'Beta Page')];
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'alpha', format: 'titles' });

    // formatAsList produces <ul><li><a ...>
    expect(html).toContain('<ul>');
    expect(html).toContain('href="/view/Alpha"');
    expect(html).toContain('Alpha Page');
    expect(html).toContain('href="/view/Beta"');
    expect(html).toContain('class="wikipage"');
  });

  test('shows "No results" when empty', async () => {
    const { context } = makeContext({ searchResults: [] });
    const html = await SearchPlugin.execute(context, { query: 'x', format: 'titles' });
    expect(html).toContain('No results found');
  });

  test('encodes special characters in href', async () => {
    const results = [makeResult('My Page', 'My Page')];
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'my', format: 'titles' });
    expect(html).toContain('href="/view/My%20Page"');
  });
});

// ---------------------------------------------------------------------------
// format='list'
// ---------------------------------------------------------------------------

describe('SearchPlugin — format=list', () => {
  test('renders plain text names without links', async () => {
    const results = [makeResult('Alpha', 'Alpha Page'), makeResult('Beta', 'Beta Page')];
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'a', format: 'list' });
    expect(html).toContain('<ul>');
    expect(html).toContain('Alpha Page');
    expect(html).not.toContain('href=');
  });

  test('shows "No results" when empty', async () => {
    const { context } = makeContext({ searchResults: [] });
    const html = await SearchPlugin.execute(context, { query: 'x', format: 'list' });
    expect(html).toContain('No results found');
  });
});

// ---------------------------------------------------------------------------
// format='count'
// ---------------------------------------------------------------------------

describe('SearchPlugin — format=count', () => {
  test('returns count of results', async () => {
    const results = [makeResult('A', 'A'), makeResult('B', 'B'), makeResult('C', 'C')];
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'a', format: 'count' });
    expect(html).toContain('3');
    expect(html).toContain('search-count');
  });

  test('returns 0 for no results', async () => {
    const { context } = makeContext({ searchResults: [] });
    const html = await SearchPlugin.execute(context, { query: 'x', format: 'count' });
    expect(html).toContain('0');
  });

  test('count uses full result set (ignores max)', async () => {
    const results = Array.from({ length: 5 }, (_, i) => makeResult(`P${i}`, `Page ${i}`));
    const { context } = makeContext({ searchResults: results });

    const html = await SearchPlugin.execute(context, { query: 'page', format: 'count', max: '2' });
    // count should reflect ALL results before max is applied
    expect(html).toContain('5');
  });
});

// ---------------------------------------------------------------------------
// author / editor filter — advancedSearch routing
// ---------------------------------------------------------------------------

describe('SearchPlugin — author/editor filter routing', () => {
  test('author param triggers advancedSearch with author set', async () => {
    const results = [makeResult('MyPage', 'My Page', { author: 'jim' })];
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: results });

    await SearchPlugin.execute(context, { author: 'jim', format: 'titles' });

    expect(mockSearchManager.advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'jim' })
    );
    expect(mockSearchManager.search).not.toHaveBeenCalled();
  });

  test('editor param triggers advancedSearch with editor set', async () => {
    const results = [makeResult('MyPage', 'My Page', { editor: 'alice' })];
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: results });

    await SearchPlugin.execute(context, { editor: 'alice', format: 'titles' });

    expect(mockSearchManager.advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ editor: 'alice' })
    );
    expect(mockSearchManager.search).not.toHaveBeenCalled();
  });

  test('author + system-category combine in advancedSearch call', async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    await SearchPlugin.execute(context, { author: 'jim', 'system-category': 'general' });

    expect(mockSearchManager.advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ author: 'jim', categories: ['general'] })
    );
  });

  test('plain query without filters uses search()', async () => {
    const results = [makeResult('Alpha', 'Alpha')];
    const { context, mockSearchManager } = makeContext({ searchResults: results });

    await SearchPlugin.execute(context, { query: 'alpha' });

    expect(mockSearchManager.search).toHaveBeenCalled();
    expect(mockSearchManager.advancedSearch).not.toHaveBeenCalled();
  });

  test('wildcard query without filters uses advancedSearch', async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    await SearchPlugin.execute(context, {}); // default query='*'

    expect(mockSearchManager.advancedSearch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// author / editor — result output
// ---------------------------------------------------------------------------

describe('SearchPlugin — author/editor result rendering', () => {
  test('titles format lists pages by that author', async () => {
    const results = [
      makeResult('JimPage1', 'Jim Page 1', { author: 'jim' }),
      makeResult('JimPage2', 'Jim Page 2', { author: 'jim' })
    ];
    const { context } = makeContext({ advancedSearchResults: results });

    const html = await SearchPlugin.execute(context, { author: 'jim', format: 'titles' });
    expect(html).toContain('Jim Page 1');
    expect(html).toContain('Jim Page 2');
    expect(html).toContain('href="/view/JimPage1"');
  });

  test('count format returns correct number for author filter', async () => {
    const results = Array.from({ length: 7 }, (_, i) =>
      makeResult(`P${i}`, `Page ${i}`, { author: 'jim' })
    );
    const { context } = makeContext({ advancedSearchResults: results });

    const html = await SearchPlugin.execute(context, { author: 'jim', format: 'count' });
    expect(html).toContain('7');
  });
});

// ---------------------------------------------------------------------------
// Invalid format
// ---------------------------------------------------------------------------

describe('SearchPlugin — invalid format', () => {
  test('returns error message for unknown format', async () => {
    const { context } = makeContext({ searchResults: [] });
    const html = await SearchPlugin.execute(context, { format: 'bogus' });
    expect(html).toContain('error');
    expect(html).toContain('Invalid format parameter');
  });
});

// ---------------------------------------------------------------------------
// Missing SearchManager
// ---------------------------------------------------------------------------

describe('SearchPlugin — missing SearchManager', () => {
  test('returns error when SearchManager not available', async () => {
    const context = {
      engine: { getManager: () => null },
      pageName: 'TestPage',
      linkGraph: {},
      query: {}
    };
    const html = await SearchPlugin.execute(context, {});
    expect(html).toContain('error');
    expect(html).toContain('SearchManager');
  });
});

// ---------------------------------------------------------------------------
// $currentUser token resolution
// ---------------------------------------------------------------------------

describe('SearchPlugin — $currentUser token', () => {
  function makeLoggedInContext(username, opts = {}) {
    const base = makeContext(opts);
    base.context.userName = username;
    base.context.userContext = { username };
    return base;
  }

  function makeAnonContext(opts = {}) {
    const base = makeContext(opts);
    base.context.userName = 'anonymous';
    base.context.userContext = { username: 'anonymous' };
    return base;
  }

  test('$currentUser in author= resolves to logged-in username', async () => {
    const results = [makeResult('MyPage', 'My Page', { author: 'alice' })];
    const { context, mockSearchManager } = makeLoggedInContext('alice', {
      advancedSearchResults: results
    });
    const html = await SearchPlugin.execute(context, { author: '$currentUser' });
    expect(html).not.toContain('log in');
    const call = mockSearchManager.advancedSearch.mock.calls[0][0];
    expect(call.author).toBe('alice');
  });

  test('$currentUser (lowercase) in editor= resolves to logged-in username', async () => {
    const results = [makeResult('EditedPage', 'Edited Page', { editor: 'bob' })];
    const { context, mockSearchManager } = makeLoggedInContext('bob', {
      advancedSearchResults: results
    });
    const html = await SearchPlugin.execute(context, { editor: '$currentuser' });
    expect(html).not.toContain('log in');
    const call = mockSearchManager.advancedSearch.mock.calls[0][0];
    expect(call.editor).toBe('bob');
  });

  test('$currentUser in author= for anonymous user returns login prompt', async () => {
    const { context } = makeAnonContext({ advancedSearchResults: [] });
    const html = await SearchPlugin.execute(context, { author: '$currentUser' });
    expect(html).toContain('log in');
    expect(html).not.toContain('<table');
  });

  test('$currentUser in editor= for anonymous user returns login prompt', async () => {
    const { context } = makeAnonContext({ advancedSearchResults: [] });
    const html = await SearchPlugin.execute(context, { editor: '$currentUser' });
    expect(html).toContain('log in');
    expect(html).not.toContain('<table');
  });

  test('literal author value (not $currentUser) is passed through unchanged', async () => {
    const results = [makeResult('SomePage', 'Some Page')];
    const { context, mockSearchManager } = makeLoggedInContext('alice', {
      advancedSearchResults: results
    });
    const html = await SearchPlugin.execute(context, { author: 'jim' });
    expect(html).not.toContain('log in');
    const call = mockSearchManager.advancedSearch.mock.calls[0][0];
    expect(call.author).toBe('jim');
  });
});

// ---------------------------------------------------------------------------
// #643 — last-modified date filter (since / until / date)
// ---------------------------------------------------------------------------

describe('SearchPlugin — date filter (#643)', () => {
  test("date='YYYY-MM-DD' maps to a whole-day dateRange and uses advancedSearch", async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    await SearchPlugin.execute(context, { date: '2026-05-01' });

    expect(mockSearchManager.advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { from: '2026-05-01', to: '2026-05-01' } })
    );
    expect(mockSearchManager.search).not.toHaveBeenCalled();
  });

  test('since + until map to dateRange.from / dateRange.to', async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    await SearchPlugin.execute(context, { since: '2026-04-01', until: '2026-04-30' });

    expect(mockSearchManager.advancedSearch).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { from: '2026-04-01', to: '2026-04-30' } })
    );
  });

  test('since only sets dateRange.from without to', async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    await SearchPlugin.execute(context, { since: '2026-05-10' });

    const call = mockSearchManager.advancedSearch.mock.calls[0][0];
    expect(call.dateRange).toEqual({ from: '2026-05-10' });
  });

  test('invalid date format returns an error and does not search', async () => {
    const { context, mockSearchManager } = makeContext({ advancedSearchResults: [] });

    const html = await SearchPlugin.execute(context, { date: '2026/05/01' });

    expect(html).toContain('Invalid date parameter');
    expect(mockSearchManager.advancedSearch).not.toHaveBeenCalled();
    expect(mockSearchManager.search).not.toHaveBeenCalled();
  });

  test('no date param → no dateRange (does not trigger advancedSearch on its own)', async () => {
    const { context, mockSearchManager } = makeContext({ searchResults: [] });

    await SearchPlugin.execute(context, { query: 'hello' });

    // plain text query → basic search, no dateRange anywhere
    expect(mockSearchManager.search).toHaveBeenCalled();
    expect(mockSearchManager.advancedSearch).not.toHaveBeenCalled();
  });
});
