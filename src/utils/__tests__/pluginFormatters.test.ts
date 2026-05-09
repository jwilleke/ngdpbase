/**
 * Unit tests for src/utils/pluginFormatters.ts
 *
 * Covers all exported utilities:
 *   parseMaxParam, applyMax, escapeHtml,
 *   formatAsList, formatAsCount,
 *   resolveUserParam,
 *   parseSortParam,
 *   formatAsTable,
 *   parsePageParam, parsePageSizeParam, applyPagination, formatPaginationLinks
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
  parsePlacementParam,
  placementClass
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
  test('returns empty string when only one page', () => {
    expect(formatPaginationLinks(1, 1, 'MyPage')).toBe('');
  });

  test('renders prev/next links', () => {
    const out = formatPaginationLinks(2, 3, 'My Page');
    expect(out).toContain('plugin-pagination');
    expect(out).toContain('page=1');
    expect(out).toContain('page=3');
    expect(out).toContain('My%20Page');
  });

  test('disables prev on first page', () => {
    const out = formatPaginationLinks(1, 3, 'P');
    expect(out).toContain('<span class="disabled">');
    expect(out).toContain('page=2');
  });

  test('disables next on last page', () => {
    const out = formatPaginationLinks(3, 3, 'P');
    expect(out).toContain('<span class="disabled">');
    expect(out).toContain('page=2');
  });

  test('uses custom queryParam', () => {
    const out = formatPaginationLinks(2, 4, 'P', 'p');
    expect(out).toContain('p=1');
    expect(out).toContain('p=3');
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
