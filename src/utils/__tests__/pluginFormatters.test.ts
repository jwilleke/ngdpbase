/**
 * Unit tests for src/utils/pluginFormatters.ts
 *
 * Covers all exported utilities:
 *   parseMaxParam, applyMax, escapeHtml,
 *   formatAsList, formatAsCount,
 *   resolveUserParam,
 *   parseSortParam,
 *   formatAsTable,
 *   parsePageParam, parsePageSizeParam, applyPagination, formatPaginationLinks,
 *   formatPaginationNav, formatStatFilters
 *
 * Related: GitHub Issue #238 (Code Consolidation)
 */

import {
  parseMaxParam,
  applyMax,
  escapeHtml,
  formatAsList,
  formatAsCount,
  resolveUserParam,
  parseSortParam,
  formatAsTable,
  parsePageParam,
  parsePageSizeParam,
  applyPagination,
  formatPaginationLinks,
  formatPaginationNav,
  formatStatFilters,
  parsePlacementParam,
  placementClass,
  resolveManagerFetch,
  resolveCurrentKeyword,
  simpleSlug
} from '../pluginFormatters';

// ---------------------------------------------------------------------------
// parseMaxParam
// ---------------------------------------------------------------------------

describe('parseMaxParam', () => {
  test('returns defaultMax (0) when undefined', () => {
    expect(parseMaxParam(undefined)).toBe(0);
  });

  test('returns defaultMax when null', () => {
    expect(parseMaxParam(null)).toBe(0);
  });

  test('returns defaultMax when empty string', () => {
    expect(parseMaxParam('')).toBe(0);
  });

  test('parses a numeric string', () => {
    expect(parseMaxParam('10')).toBe(10);
  });

  test('parses a number directly', () => {
    expect(parseMaxParam(25)).toBe(25);
  });

  test('returns 0 for "0" (unlimited)', () => {
    expect(parseMaxParam('0')).toBe(0);
  });

  test('returns defaultMax for non-numeric string', () => {
    expect(parseMaxParam('abc')).toBe(0);
  });

  test('returns defaultMax for negative value', () => {
    expect(parseMaxParam('-5')).toBe(0);
  });

  test('respects a custom defaultMax', () => {
    expect(parseMaxParam(undefined, 20)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// applyMax
// ---------------------------------------------------------------------------

describe('applyMax', () => {
  const items = [1, 2, 3, 4, 5];

  test('returns all items when max=0 (unlimited)', () => {
    expect(applyMax(items, 0)).toEqual(items);
  });

  test('slices to max when max > 0', () => {
    expect(applyMax(items, 3)).toEqual([1, 2, 3]);
  });

  test('returns all items when max > length', () => {
    expect(applyMax(items, 100)).toEqual(items);
  });

  test('returns empty array for empty input', () => {
    expect(applyMax([], 5)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  test('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes less-than and greater-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  test('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  test('converts number to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  test('passes through plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// formatAsCount
// ---------------------------------------------------------------------------

describe('formatAsCount', () => {
  test('formats zero', () => {
    expect(formatAsCount(0)).toBe('0');
  });

  test('formats small number', () => {
    expect(formatAsCount(7)).toBe('7');
  });

  test('formats large number with thousands separator', () => {
    // en-US locale uses comma separator
    expect(formatAsCount(32227)).toBe('32,227');
  });
});

// ---------------------------------------------------------------------------
// formatAsList
// ---------------------------------------------------------------------------

describe('formatAsList', () => {
  const links = [
    { href: '/view/Alpha', text: 'Alpha', cssClass: 'wikipage' },
    { href: '/view/Beta',  text: 'Beta',  cssClass: 'wikipage' }
  ];

  test('returns empty message for empty array', () => {
    expect(formatAsList([])).toBe('<p><em>No pages found.</em></p>');
  });

  test('renders a <ul> list by default', () => {
    const out = formatAsList(links);
    expect(out).toContain('<ul>');
    expect(out).toContain('href="/view/Alpha"');
    expect(out).toContain('href="/view/Beta"');
    expect(out).toContain('class="wikipage"');
  });

  test('renders bullet list when before contains *', () => {
    const out = formatAsList(links, { before: '* ' });
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>');
  });

  test('renders bullet list when before contains -', () => {
    const out = formatAsList(links, { before: '- ' });
    expect(out).toContain('<ul>');
  });

  test('applies before/after text when neither * nor -', () => {
    const out = formatAsList(links, { before: '>> ', after: ' <<' });
    expect(out).toContain('>> ');
    expect(out).toContain(' <<');
  });

  test('processes \\n escape in before/after', () => {
    const out = formatAsList(links, { before: '', after: '\\n' });
    expect(out).toBeTruthy();
  });

  test('escapes link text', () => {
    const xssLinks = [{ href: '/view/x', text: '<b>XSS</b>' }];
    const out = formatAsList(xssLinks);
    expect(out).toContain('&lt;b&gt;XSS&lt;/b&gt;');
    expect(out).not.toContain('<b>XSS</b>');
  });

  test('renders title attribute when provided', () => {
    const withTitle = [{ href: '/view/P', text: 'P', title: 'A & B' }];
    const out = formatAsList(withTitle);
    expect(out).toContain('title="A &amp; B"');
  });
});

// ---------------------------------------------------------------------------
// resolveUserParam
// ---------------------------------------------------------------------------

describe('resolveUserParam', () => {
  const loggedIn = { userName: 'alice', userContext: { username: 'alice' } };
  const anon     = { userName: 'anonymous', userContext: { username: 'anonymous' } };
  const asserted = { userName: 'asserted', userContext: { username: 'asserted' } };
  const empty    = {};

  test('returns undefined when value is undefined', () => {
    expect(resolveUserParam(undefined, loggedIn)).toBeUndefined();
  });

  test('returns non-token value unchanged', () => {
    expect(resolveUserParam('jim', loggedIn)).toBe('jim');
  });

  test('resolves $currentUser to logged-in username (exact case)', () => {
    expect(resolveUserParam('$currentUser', loggedIn)).toBe('alice');
  });

  test('resolves $currentuser (all lowercase) to logged-in username', () => {
    expect(resolveUserParam('$currentuser', loggedIn)).toBe('alice');
  });

  test('resolves $CURRENTUSER (uppercase) to logged-in username', () => {
    expect(resolveUserParam('$CURRENTUSER', loggedIn)).toBe('alice');
  });

  test('returns undefined for $currentUser when user is anonymous', () => {
    expect(resolveUserParam('$currentUser', anon)).toBeUndefined();
  });

  test('returns undefined for $currentUser when username is "asserted"', () => {
    expect(resolveUserParam('$currentUser', asserted)).toBeUndefined();
  });

  test('returns undefined for $currentUser when context has no username', () => {
    expect(resolveUserParam('$currentUser', empty)).toBeUndefined();
  });

  test('falls back to context.userName when userContext.username is absent', () => {
    const ctx = { userName: 'bob' };
    expect(resolveUserParam('$currentUser', ctx)).toBe('bob');
  });
});

// ---------------------------------------------------------------------------
// parseSortParam
// ---------------------------------------------------------------------------

describe('parseSortParam', () => {
  const validKeys = ['name', 'count', 'date'];

  test('returns default for undefined', () => {
    expect(parseSortParam(undefined, validKeys, 'name')).toEqual({ key: 'name', order: 'asc' });
  });

  test('returns key alone (uses defaultOrder)', () => {
    expect(parseSortParam('count', validKeys, 'name')).toEqual({ key: 'count', order: 'asc' });
  });

  test('returns key-asc', () => {
    expect(parseSortParam('name-asc', validKeys, 'name')).toEqual({ key: 'name', order: 'asc' });
  });

  test('returns key-desc', () => {
    expect(parseSortParam('date-desc', validKeys, 'name')).toEqual({ key: 'date', order: 'desc' });
  });

  test('returns default for unrecognised key', () => {
    expect(parseSortParam('unknown', validKeys, 'name', 'desc')).toEqual({ key: 'name', order: 'desc' });
  });

  test('is case-insensitive', () => {
    expect(parseSortParam('NAME-DESC', validKeys, 'count')).toEqual({ key: 'name', order: 'desc' });
  });
});

// ---------------------------------------------------------------------------
// formatAsTable
// ---------------------------------------------------------------------------

describe('formatAsTable', () => {
  const headers = ['Page', 'Score'];
  const rows = [
    ['<a href="/view/Alpha">Alpha</a>', '0.9'],
    ['<a href="/view/Beta">Beta</a>',   '0.7']
  ];

  test('returns empty message for no rows', () => {
    expect(formatAsTable(headers, [])).toBe('<p><em>No pages found.</em></p>');
  });

  test('renders <table> with headers and rows', () => {
    const out = formatAsTable(headers, rows);
    expect(out).toContain('<table');
    expect(out).toContain('<th>Page</th>');
    expect(out).toContain('<th>Score</th>');
    expect(out).toContain('Alpha');
    expect(out).toContain('0.9');
  });

  test('adds sortable class when option set', () => {
    const out = formatAsTable(headers, rows, { sortable: true });
    expect(out).toContain('sortable');
  });

  test('adds data-sort-column when defaultSortColumn specified', () => {
    const out = formatAsTable(headers, rows, { sortable: true, defaultSortColumn: 1 });
    expect(out).toContain('data-sort-column="1"');
  });

  test('escapes header text', () => {
    const xssHeaders = ['<b>Page</b>', 'Score'];
    const out = formatAsTable(xssHeaders, rows);
    expect(out).toContain('&lt;b&gt;Page&lt;/b&gt;');
  });

  test('cellDataSort adds data-sort attribute', () => {
    const out = formatAsTable(headers, rows, {
      cellDataSort: { 1: (row) => row[1] }
    });
    expect(out).toContain('data-sort="0.9"');
  });
});

// ---------------------------------------------------------------------------
// parsePageParam / parsePageSizeParam
// ---------------------------------------------------------------------------

describe('parsePageParam', () => {
  test('returns defaultPage (1) for undefined', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  test('parses valid page number', () => {
    expect(parsePageParam('3')).toBe(3);
  });

  test('returns defaultPage for "0" (< 1)', () => {
    expect(parsePageParam('0')).toBe(1);
  });

  test('returns defaultPage for non-numeric', () => {
    expect(parsePageParam('abc')).toBe(1);
  });
});

describe('parsePageSizeParam', () => {
  test('returns 0 (disabled) for undefined', () => {
    expect(parsePageSizeParam(undefined)).toBe(0);
  });

  test('parses valid page size', () => {
    expect(parsePageSizeParam('10')).toBe(10);
  });

  test('returns 0 for "0" (disabled)', () => {
    expect(parsePageSizeParam('0')).toBe(0);
  });

  test('returns default for non-numeric', () => {
    expect(parsePageSizeParam('abc')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyPagination
// ---------------------------------------------------------------------------

describe('applyPagination', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  test('returns all items as page 1 of 1 when pageSize=0', () => {
    const result = applyPagination(items, 1, 0);
    expect(result.items).toEqual(items);
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.totalItems).toBe(7);
  });

  test('paginates correctly — page 1', () => {
    const result = applyPagination(items, 1, 3);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.totalPages).toBe(3);
    expect(result.currentPage).toBe(1);
  });

  test('paginates correctly — page 2', () => {
    const result = applyPagination(items, 2, 3);
    expect(result.items).toEqual([4, 5, 6]);
    expect(result.currentPage).toBe(2);
  });

  test('last page returns remaining items', () => {
    const result = applyPagination(items, 3, 3);
    expect(result.items).toEqual([7]);
  });

  test('clamps page above totalPages', () => {
    const result = applyPagination(items, 99, 3);
    expect(result.currentPage).toBe(3);
  });

  test('clamps page below 1', () => {
    const result = applyPagination(items, 0, 3);
    expect(result.currentPage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// formatPaginationLinks
// ---------------------------------------------------------------------------

describe('formatPaginationLinks', () => {
  // #1301: this now delegates to formatPaginationNav. Its signature and its
  // single-page behaviour are unchanged — the three plugins calling it did not
  // change — but the markup it returns is the canonical control rather than the
  // unstyled `.plugin-pagination` text links it emitted before.

  test('returns empty string when only one page', () => {
    expect(formatPaginationLinks(1, 1, 'MyPage')).toBe('');
  });

  test('builds /view/{page}?page=N URLs from the page name', () => {
    const out = formatPaginationLinks(2, 3, 'My Page');

    expect(out).toContain('/view/My%20Page?page=1');
    expect(out).toContain('/view/My%20Page?page=3');
  });

  test('uses custom queryParam', () => {
    const out = formatPaginationLinks(2, 4, 'P', 'p');

    expect(out).toContain('p=1');
    expect(out).toContain('p=3');
  });

  test('emits the canonical control, not the old unstyled markup', () => {
    // `.plugin-pagination` had no CSS anywhere in the repo, so these three
    // plugin surfaces rendered as bare inline text next to a styled Bootstrap
    // pager elsewhere in the application. That is the whole point of #1301.
    const out = formatPaginationLinks(2, 3, 'P');

    expect(out).not.toContain('plugin-pagination');
    expect(out).toContain('data-pagination');
    expect(out).toContain('<ul class="pagination pagination-sm mb-0">');
  });

  test('carries the prev/next URLs the client enhancer reads', () => {
    const out = formatPaginationLinks(2, 3, 'P');

    expect(out).toContain('data-prev-url="/view/P?page=1"');
    expect(out).toContain('data-next-url="/view/P?page=3"');
  });

  test('disables prev on the first page and next on the last', () => {
    const first = formatPaginationLinks(1, 3, 'P');
    const last = formatPaginationLinks(3, 3, 'P');

    expect(first).toContain('aria-label="Previous"');
    expect(first).not.toContain('data-prev-url');
    expect(last).toContain('aria-label="Next"');
    expect(last).not.toContain('data-next-url');
  });

  test('numbers the pages, which the old prev/next-only control never did', () => {
    const out = formatPaginationLinks(2, 3, 'P');

    expect(out).toContain('>1</a>');
    expect(out).toContain('<li class="page-item active"><span class="page-link" aria-current="page">2</span></li>');
    expect(out).toContain('>3</a>');
  });
});

// ---------------------------------------------------------------------------
// parsePlacementParam
// ---------------------------------------------------------------------------

describe('parsePlacementParam', () => {
  test('returns default (right) when undefined', () => {
    expect(parsePlacementParam(undefined)).toBe('right');
  });

  test('returns default when empty string', () => {
    expect(parsePlacementParam('')).toBe('right');
  });

  test('honours an explicit default', () => {
    expect(parsePlacementParam(undefined, 'block')).toBe('block');
  });

  test('accepts each valid placement', () => {
    expect(parsePlacementParam('right')).toBe('right');
    expect(parsePlacementParam('left')).toBe('left');
    expect(parsePlacementParam('block')).toBe('block');
    expect(parsePlacementParam('inline')).toBe('inline');
  });

  test('is case-insensitive and trims whitespace', () => {
    expect(parsePlacementParam('  Right  ')).toBe('right');
    expect(parsePlacementParam('BLOCK')).toBe('block');
  });

  test('falls back to default for unrecognised values', () => {
    expect(parsePlacementParam('center')).toBe('right');
    expect(parsePlacementParam('top', 'block')).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// placementClass
// ---------------------------------------------------------------------------

describe('placementClass', () => {
  test('returns plugin-placement-<placement> for every variant', () => {
    expect(placementClass('right')).toBe('plugin-placement-right');
    expect(placementClass('left')).toBe('plugin-placement-left');
    expect(placementClass('block')).toBe('plugin-placement-block');
    expect(placementClass('inline')).toBe('plugin-placement-inline');
  });
});

// ---------------------------------------------------------------------------
// resolveManagerFetch (#685 slice 2)
// ---------------------------------------------------------------------------

describe('resolveManagerFetch', () => {
  const makeContext = (managers: Record<string, unknown>) => ({
    engine: { getManager: (name: string) => managers[name] }
  });

  test('resolves a manager method and returns its text', async () => {
    const ctx = makeContext({
      TestManager: { toMarqueeText: async () => 'hello from manager' }
    });
    const r = await resolveManagerFetch('TestManager.toMarqueeText()', ctx);
    expect(r).toEqual({ status: 'ok', text: 'hello from manager' });
  });

  test('passes key=value args to the method as an object', async () => {
    let received: Record<string, string> | undefined;
    const ctx = makeContext({
      TestManager: { toMarqueeText: async (o: Record<string, string>) => { received = o; return 'x'; } }
    });
    await resolveManagerFetch('TestManager.toMarqueeText(limit=3,sort=date-desc)', ctx);
    expect(received).toEqual({ limit: '3', sort: 'date-desc' });
  });

  test('stringifies a non-string return value', async () => {
    const ctx = makeContext({ M: { count: async () => 42 } });
    const r = await resolveManagerFetch('M.count()', ctx);
    expect(r).toEqual({ status: 'ok', text: '42' });
  });

  test('returns not-found when the manager is absent', async () => {
    const r = await resolveManagerFetch('NoSuchManager.toMarqueeText()', makeContext({}));
    expect(r).toEqual({ status: 'not-found' });
  });

  test('returns not-found when the method is absent', async () => {
    const ctx = makeContext({ TestManager: { somethingElse: () => 'x' } });
    const r = await resolveManagerFetch('TestManager.toMarqueeText()', ctx);
    expect(r).toEqual({ status: 'not-found' });
  });

  test('returns no-spec for a malformed spec (caller falls through)', async () => {
    const ctx = makeContext({ TestManager: { toMarqueeText: async () => 'x' } });
    expect(await resolveManagerFetch('not a spec', ctx)).toEqual({ status: 'no-spec' });
    expect(await resolveManagerFetch('', ctx)).toEqual({ status: 'no-spec' });
    expect(await resolveManagerFetch(undefined, ctx)).toEqual({ status: 'no-spec' });
  });

  test('returns no-spec when no engine is present', async () => {
    const r = await resolveManagerFetch('TestManager.toMarqueeText()', {});
    expect(r).toEqual({ status: 'no-spec' });
  });
});

// ---------------------------------------------------------------------------
// resolveCurrentKeyword + simpleSlug (#901)
// ---------------------------------------------------------------------------

describe('simpleSlug', () => {
  test('lowercases and hyphenates', () => {
    expect(simpleSlug('2026 Trip West')).toBe('2026-trip-west');
    expect(simpleSlug("Molly's Cooking")).toBe('molly-s-cooking');
    expect(simpleSlug('chemistry')).toBe('chemistry');
  });
});

describe('resolveCurrentKeyword', () => {
  const slug = simpleSlug;

  test('non-current value → single lookup, returned as-is', async () => {
    const calls: string[] = [];
    const lookup = async (kw: string) => { calls.push(kw); return kw === 'travel' ? [1, 2] : []; };
    const r = await resolveCurrentKeyword('travel', 'AnyPage', slug, lookup);
    expect(r.keyword).toBe('travel');
    expect(r.results).toEqual([1, 2]);
    expect(calls).toEqual(['travel']);
  });

  test("'current' picks the form with more results (slug wins)", async () => {
    const by: Record<string, number[]> = { '2026 trip west': [1], '2026-trip-west': [1, 2, 3, 4] };
    const r = await resolveCurrentKeyword('current', '2026 trip west', slug, async k => by[k] ?? []);
    expect(r.keyword).toBe('2026-trip-west');
    expect(r.results).toHaveLength(4);
  });

  test("'current' picks name form on tie / both empty", async () => {
    const r = await resolveCurrentKeyword('current', 'Nothing', slug, async () => []);
    expect(r.keyword).toBe('Nothing');
    expect(r.results).toEqual([]);
  });

  test("'current' is case-insensitive", async () => {
    const by: Record<string, number[]> = { Dining: [1, 2, 3], dining: [1] };
    const r = await resolveCurrentKeyword('CURRENT', 'Dining', slug, async k => by[k] ?? []);
    expect(r.keyword).toBe('Dining');
    expect(r.results).toHaveLength(3);
  });

  test('single-word page: name == slug after slugify, only one lookup form', async () => {
    const calls: string[] = [];
    const r = await resolveCurrentKeyword('current', 'chemistry', slug, async k => { calls.push(k); return [1]; });
    // slug('chemistry') === 'chemistry' === name → slug lookup skipped
    expect(calls).toEqual(['chemistry']);
    expect(r.keyword).toBe('chemistry');
  });
});

// ---------------------------------------------------------------------------
// formatPaginationNav (#1300)
// ---------------------------------------------------------------------------

describe('formatPaginationNav', () => {
  const href = (page: number): string => `/list?page=${page}`;

  test('renders nothing for a single page', () => {
    // Nothing to navigate. A control that only ever shows "1" is noise.
    expect(formatPaginationNav(1, 1, href)).toBe('');
    expect(formatPaginationNav(1, 0, href)).toBe('');
  });

  describe('the wrapper carries the state the enhancer needs', () => {
    test('exposes current page, total pages and the marker attribute', () => {
      const out = formatPaginationNav(3, 12, href);

      expect(out).toContain('data-pagination');
      expect(out).toContain('data-current-page="3"');
      expect(out).toContain('data-total-pages="12"');
    });

    test('exposes prev and next URLs so keyboard and swipe need no page numbers', () => {
      const out = formatPaginationNav(3, 12, href);

      expect(out).toContain('data-prev-url="/list?page=2"');
      expect(out).toContain('data-next-url="/list?page=4"');
    });

    test('omits the prev URL on the first page and the next URL on the last', () => {
      expect(formatPaginationNav(1, 5, href)).not.toContain('data-prev-url');
      expect(formatPaginationNav(5, 5, href)).not.toContain('data-next-url');
    });
  });

  describe('markup shape', () => {
    test('is a labelled nav wrapping a Bootstrap pagination list', () => {
      const out = formatPaginationNav(1, 3, href);

      expect(out).toMatch(/^<nav /);
      expect(out).toContain('aria-label="Pagination"');
      expect(out).toContain('<ul class="pagination pagination-sm mb-0">');
    });

    test('the current page is marked active, carries aria-current, and is not a link', () => {
      const out = formatPaginationNav(2, 3, href);

      expect(out).toContain('<li class="page-item active"><span class="page-link" aria-current="page">2</span></li>');
    });

    test('other pages are links to their own href', () => {
      const out = formatPaginationNav(2, 3, href);

      expect(out).toContain('<a class="page-link" href="/list?page=1">1</a>');
      expect(out).toContain('<a class="page-link" href="/list?page=3">3</a>');
    });

    test('prev is disabled on the first page and next on the last', () => {
      const first = formatPaginationNav(1, 3, href);
      const last = formatPaginationNav(3, 3, href);

      expect(first).toContain('<li class="page-item disabled"><span class="page-link" aria-label="Previous">');
      expect(last).toContain('<li class="page-item disabled"><span class="page-link" aria-label="Next">');
    });
  });

  describe('the sliding window', () => {
    test('shows every page when they fit', () => {
      const out = formatPaginationNav(1, 5, href);

      for (const n of [1, 2, 3, 4, 5]) expect(out).toContain(`>${n}</`);
      expect(out).not.toContain('&hellip;');
    });

    test('caps at seven page numbers', () => {
      const out = formatPaginationNav(10, 50, href);
      const numbered = out.match(/class="page-link"[^>]*>\d+</g) ?? [];

      // Seven in the window, plus the first and last shortcuts.
      expect(numbered.length).toBe(9);
    });

    test('leads with an ellipsis and the first page when the window has moved off the start', () => {
      const out = formatPaginationNav(20, 50, href);

      expect(out).toContain('&hellip;');
      expect(out).toContain('>1</a>');
      expect(out).toContain('>50</a>');
    });

    test('does not render an ellipsis that hides a single page', () => {
      // Window starts at 2: page 1 is adjacent, so an ellipsis would stand in
      // for nothing and cost the user a click to discover that.
      const out = formatPaginationNav(5, 20, href);
      const beforeWindow = out.slice(0, out.indexOf('>2<'));

      expect(beforeWindow).not.toContain('&hellip;');
    });

    test('keeps the window full at the end of the range', () => {
      const out = formatPaginationNav(50, 50, href);

      for (const n of [44, 45, 46, 47, 48, 49, 50]) expect(out).toContain(`>${n}<`);
    });
  });

  test('escapes the URLs it is given', () => {
    const nasty = (page: number): string => `/list?q="><script>alert(${page})</script>`;
    const out = formatPaginationNav(2, 3, nasty);

    expect(out).not.toContain('<script>');
    expect(out).toContain('&quot;&gt;&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// formatStatFilters (#1303)
// ---------------------------------------------------------------------------

describe('formatStatFilters', () => {
  // /admin/users renders four cards that filter the table when clicked. Nine
  // other surfaces render the same-looking cards and do nothing — one of them
  // pixel-identical, another defining a :hover rule on a card with no click
  // handler. An inconsistent appearance is untidy; an inconsistent affordance
  // is a lie, and that is what this control exists to end.

  test('a bar with no stats renders nothing', () => {
    expect(formatStatFilters([])).toBe('');
  });

  test('renders one card per stat, with its label and count', () => {
    const html = formatStatFilters([
      { label: 'Total Users', value: 12 },
      { label: 'Active Users', value: 9 }
    ]);
    expect(html).toContain('Total Users');
    expect(html).toContain('>12<');
    expect(html).toContain('Active Users');
    expect(html).toContain('>9<');
  });

  test('the bar carries the marker the enhancer looks for', () => {
    // Same contract as the pagination control: the markup is what the client
    // enhancer finds, so a surface gets the behaviour by emitting this and
    // calling nothing.
    expect(formatStatFilters([{ label: 'Total', value: 1 }])).toContain('data-stat-filters');
  });

  test('a stat with a match is a client-side filter — keyboard reachable, not a link', () => {
    const html = formatStatFilters([{ label: 'Active', value: 9, match: 'status=active' }]);
    expect(html).toContain('data-stat-match="status=active"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('<a ');
  });

  test('a clearing card is clickable and carries no match of its own', () => {
    // "Total" is the card that shows everything again. /admin/users lets you
    // click it to clear, and dropping that would be a regression in the one
    // surface this control has to match exactly.
    const html = formatStatFilters([{ label: 'Total Users', value: 12, clears: true }]);
    expect(html).toContain('data-stat-clear');
    expect(html).toContain('role="button"');
    expect(html).not.toContain('data-stat-match');
  });

  test('a stat with an href is a server-side filter — an ordinary link', () => {
    // The decision this issue left open. A paginated surface CANNOT filter by
    // hiding loaded rows: it would filter the page and imply it filtered the
    // set, which is the defect #1237 documents in the audit search box. Such a
    // surface passes an href and the card navigates.
    const html = formatStatFilters([{ label: 'Denied', value: 896, href: '/admin/audit?result=deny' }]);
    expect(html).toContain('<a ');
    expect(html).toContain('href="/admin/audit?result=deny"');
    expect(html).not.toContain('data-stat-match');
  });

  test('a stat with neither is a plain card that reports and does not pretend to filter', () => {
    const html = formatStatFilters([{ label: 'Security Incidents', value: 3 }]);
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('cursor');
  });

  test('the server marks which filter is in effect', () => {
    const html = formatStatFilters([
      { label: 'All', value: 20, href: '/admin/audit' },
      { label: 'Denied', value: 896, href: '/admin/audit?result=deny', active: true }
    ]);
    expect(html).toContain('data-stat-active');
  });

  test('a tone becomes the card colour, and an unknown tone does not emit a bogus class', () => {
    expect(formatStatFilters([{ label: 'Total', value: 1, tone: 'primary' }])).toContain('bg-primary');
    expect(formatStatFilters([{ label: 'Total', value: 1, tone: 'nonsense' as never }])).not.toContain('bg-nonsense');
  });

  test('labels and values are escaped', () => {
    const html = formatStatFilters([{ label: '<script>x</script>', value: '<b>7</b>' }]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>7</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('an href is escaped', () => {
    const html = formatStatFilters([{ label: 'X', value: 1, href: '/a?b="c"&d=e' }]);
    expect(html).toContain('&quot;');
    expect(html).toContain('&amp;');
  });

  test('the rows selector travels on the bar, so the enhancer knows what to hide', () => {
    const html = formatStatFilters(
      [{ label: 'Active', value: 9, match: 'status=active' }],
      { rowSelector: 'tbody tr[data-username]' }
    );
    expect(html).toContain('data-stat-rows="tbody tr[data-username]"');
  });

  test('without a rows selector the bar filters nothing itself — the page owns it', () => {
    // /admin/users combines the quick filter with a search box and two selects,
    // so it listens for the change and runs its own compound filter. A bar that
    // also hid rows would fight it.
    const html = formatStatFilters([{ label: 'Active', value: 9, match: 'status=active' }]);
    expect(html).not.toContain('data-stat-rows');
  });
});
