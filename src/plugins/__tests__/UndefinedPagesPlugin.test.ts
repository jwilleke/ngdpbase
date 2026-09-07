/**
 * Unit tests for UndefinedPagesPlugin — sort, pagination, and pluginFormatters utilities.
 *
 * Tests the new sort=, page=, and pageSize= parameters added in v1.2.0, plus
 * the parseSortParam / applyPagination helpers in pluginFormatters.ts.
 */

import path from 'path';
// Load formatters and plugin via ts-jest transform (TypeScript source)
import { parseSortParam, applyPagination, parsePageParam, parsePageSizeParam, formatPaginationLinks } from '../../utils/pluginFormatters';
import UndefinedPagesPlugin from '../../plugins/UndefinedPagesPlugin' ;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock plugin context.
 * @param {string[]} allPages   - Pages that actually exist
 * @param {Record<string,string[]>} linkGraph - Link graph (target → referrers)
 * @param {Record<string,string>} [query]    - Simulated URL query string
 */
function makeContext(allPages, linkGraph, query = {}) {
  return {
    engine: {
      getManager: (name) => {
        if (name === 'PageManager') {
          return { getAllPages: async () => allPages };
        }
        return null;
      }
    },
    pageName: 'TestPage',
    linkGraph,
    query
  };
}

// ---------------------------------------------------------------------------
// parseSortParam
// ---------------------------------------------------------------------------

describe('parseSortParam', () => {
  const keys = ['name', 'count'];

  test('returns default when value is undefined', () => {
    expect(parseSortParam(undefined, keys, 'name', 'asc')).toEqual({ key: 'name', order: 'asc' });
  });

  test('returns default when value is empty string', () => {
    expect(parseSortParam('', keys, 'name', 'asc')).toEqual({ key: 'name', order: 'asc' });
  });

  test('bare key uses defaultOrder', () => {
    expect(parseSortParam('name', keys, 'name', 'asc')).toEqual({ key: 'name', order: 'asc' });
    expect(parseSortParam('count', keys, 'name', 'desc')).toEqual({ key: 'count', order: 'desc' });
  });

  test('key-asc parses correctly', () => {
    expect(parseSortParam('name-asc', keys, 'name')).toEqual({ key: 'name', order: 'asc' });
    expect(parseSortParam('count-asc', keys, 'name')).toEqual({ key: 'count', order: 'asc' });
  });

  test('key-desc parses correctly', () => {
    expect(parseSortParam('name-desc', keys, 'name')).toEqual({ key: 'name', order: 'desc' });
    expect(parseSortParam('count-desc', keys, 'name')).toEqual({ key: 'count', order: 'desc' });
  });

  test('unrecognised value falls back to default', () => {
    expect(parseSortParam('bogus', keys, 'name', 'asc')).toEqual({ key: 'name', order: 'asc' });
    expect(parseSortParam('date-desc', keys, 'count', 'desc')).toEqual({ key: 'count', order: 'desc' });
  });

  test('is case-insensitive', () => {
    expect(parseSortParam('NAME-DESC', keys, 'name')).toEqual({ key: 'name', order: 'desc' });
    expect(parseSortParam('Count-Asc', keys, 'name')).toEqual({ key: 'count', order: 'asc' });
  });
});

// ---------------------------------------------------------------------------
// parsePageParam / parsePageSizeParam
// ---------------------------------------------------------------------------

describe('parsePageParam', () => {
  test('returns default for undefined', () => expect(parsePageParam(undefined)).toBe(1));
  test('returns default for empty string', () => expect(parsePageParam('')).toBe(1));
  test('parses valid integer string', () => expect(parsePageParam('3')).toBe(3));
  test('parses number', () => expect(parsePageParam(5)).toBe(5));
  test('returns default for zero', () => expect(parsePageParam('0')).toBe(1));
  test('returns default for negative', () => expect(parsePageParam('-1')).toBe(1));
  test('returns default for NaN', () => expect(parsePageParam('abc')).toBe(1));
  test('honours custom default', () => expect(parsePageParam(undefined, 2)).toBe(2));
});

describe('parsePageSizeParam', () => {
  test('returns 0 (disabled) for undefined', () => expect(parsePageSizeParam(undefined)).toBe(0));
  test('parses valid integer', () => expect(parsePageSizeParam('20')).toBe(20));
  test('returns 0 for negative', () => expect(parsePageSizeParam('-5')).toBe(0));
  test('allows 0 explicitly', () => expect(parsePageSizeParam('0')).toBe(0));
});

// ---------------------------------------------------------------------------
// applyPagination
// ---------------------------------------------------------------------------

describe('applyPagination', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  test('pageSize=0 returns all items as page 1 of 1', () => {
    const result = applyPagination(items, 1, 0);
    expect(result.items).toEqual(items);
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.totalItems).toBe(5);
  });

  test('page 1 of 2 (pageSize=3)', () => {
    const result = applyPagination(items, 1, 3);
    expect(result.items).toEqual(['a', 'b', 'c']);
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(1);
    expect(result.totalItems).toBe(5);
  });

  test('page 2 of 2 (pageSize=3)', () => {
    const result = applyPagination(items, 2, 3);
    expect(result.items).toEqual(['d', 'e']);
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(2);
  });

  test('page beyond totalPages clamps to last page', () => {
    const result = applyPagination(items, 99, 3);
    expect(result.currentPage).toBe(2);
    expect(result.items).toEqual(['d', 'e']);
  });

  test('page 0 or negative clamps to page 1', () => {
    const result = applyPagination(items, 0, 3);
    expect(result.currentPage).toBe(1);
    expect(result.items).toEqual(['a', 'b', 'c']);
  });

  test('empty items returns page 1 of 1', () => {
    const result = applyPagination([], 1, 5);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.currentPage).toBe(1);
    expect(result.totalItems).toBe(0);
  });

  test('exact multiple of pageSize', () => {
    const result = applyPagination(['a', 'b', 'c', 'd'], 2, 2);
    expect(result.items).toEqual(['c', 'd']);
    expect(result.totalPages).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// formatPaginationLinks
// ---------------------------------------------------------------------------

describe('formatPaginationLinks', () => {
  test('returns empty string when totalPages <= 1', () => {
    expect(formatPaginationLinks(1, 1, 'MyPage')).toBe('');
    expect(formatPaginationLinks(1, 0, 'MyPage')).toBe('');
  });

  // #1301: this delegates to the canonical control now. The URLs it builds are
  // unchanged — that is the part this plugin depends on — but the markup is
  // Bootstrap pagination rather than the unstyled `.plugin-pagination` text it
  // emitted before, and the position is carried by the active item and
  // `data-current-page` rather than a "Page X of Y" string.

  test('first page disables Prev, shows Next link', () => {
    const html = formatPaginationLinks(1, 3, 'MyPage');
    expect(html).toContain('page-item disabled');
    expect(html).toContain('aria-label="Previous"');
    expect(html).toContain('href="/view/MyPage?page=2"');
    expect(html).toContain('data-current-page="1"');
    expect(html).toContain('data-total-pages="3"');
  });

  test('last page shows Prev link, disables Next', () => {
    const html = formatPaginationLinks(3, 3, 'MyPage');
    expect(html).toContain('href="/view/MyPage?page=2"');
    expect(html).toContain('page-item disabled');
    expect(html).toContain('aria-label="Next"');
    expect(html).toContain('data-current-page="3"');
  });

  test('middle page shows both links', () => {
    const html = formatPaginationLinks(2, 5, 'MyPage');
    expect(html).toContain('href="/view/MyPage?page=1"');
    expect(html).toContain('href="/view/MyPage?page=3"');
    expect(html).toContain('data-prev-url="/view/MyPage?page=1"');
    expect(html).toContain('data-next-url="/view/MyPage?page=3"');
    expect(html).not.toContain('page-item disabled');
  });

  test('encodes page name in URL', () => {
    const html = formatPaginationLinks(1, 2, 'My Page');
    expect(html).toContain('/view/My%20Page?page=2');
  });

  test('custom query param', () => {
    const html = formatPaginationLinks(1, 2, 'MyPage', 'p');
    expect(html).toContain('?p=2');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — sort by name
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — sort by name', () => {
  const existingPages = ['Alpha', 'Beta'];
  const linkGraph = {
    'Alpha': ['SomePage'],
    'Zeta': ['SomePage'],
    'Mango': ['SomePage', 'OtherPage'],
    'Apple': ['SomePage']
  };

  test('default sort is name-asc (alphabetical)', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list' });
    const positions = ['Apple', 'Mango', 'Zeta'].map(p => html.indexOf(p));
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  test('sort=name-asc gives alphabetical order', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'name-asc' });
    const apple = html.indexOf('Apple');
    const mango = html.indexOf('Mango');
    const zeta  = html.indexOf('Zeta');
    expect(apple).toBeLessThan(mango);
    expect(mango).toBeLessThan(zeta);
  });

  test('sort=name-desc gives reverse alphabetical', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'name-desc' });
    const apple = html.indexOf('Apple');
    const mango = html.indexOf('Mango');
    const zeta  = html.indexOf('Zeta');
    expect(zeta).toBeLessThan(mango);
    expect(mango).toBeLessThan(apple);
  });

  test('invalid sort falls back to name-asc', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'bogus' });
    const apple = html.indexOf('Apple');
    const zeta  = html.indexOf('Zeta');
    expect(apple).toBeLessThan(zeta);
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — sort by count
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — sort by count', () => {
  const existingPages = [];
  const linkGraph = {
    'Few': ['PageA'],                              // count=1
    'Many': ['PageA', 'PageB', 'PageC'],           // count=3
    'Medium': ['PageA', 'PageB']                   // count=2
  };

  test('sort=count-asc orders ascending by referrer count', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'count-asc' });
    expect(html.indexOf('Few')).toBeLessThan(html.indexOf('Medium'));
    expect(html.indexOf('Medium')).toBeLessThan(html.indexOf('Many'));
  });

  test('sort=count-desc orders descending by referrer count', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'count-desc' });
    expect(html.indexOf('Many')).toBeLessThan(html.indexOf('Medium'));
    expect(html.indexOf('Medium')).toBeLessThan(html.indexOf('Few'));
  });

  test('sort=count-desc with max=2 returns top 2 by count', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', sort: 'count-desc', max: '2' });
    expect(html).toContain('Many');
    expect(html).toContain('Medium');
    expect(html).not.toContain('Few');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — table format + sort
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — table format with sort', () => {
  const existingPages = [];
  const linkGraph = {
    'PageA': ['X'],
    'PageB': ['X', 'Y', 'Z']
  };

  test('table has sortable class', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'table' });
    expect(html).toContain('sortable');
  });

  test('table has data-sort-column and data-sort-direction attributes', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'table', sort: 'count-desc' });
    expect(html).toContain('data-sort-column="1"');
    expect(html).toContain('data-sort-direction="desc"');
  });

  test('table default sort sets column 0 (name)', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'table' });
    expect(html).toContain('data-sort-column="0"');
    expect(html).toContain('data-sort-direction="asc"');
  });

  test('showReferring=true table column 1 gets data-sort attribute', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'table', showReferring: 'true' });
    // Column 1 should have data-sort with the numeric count
    expect(html).toMatch(/data-sort="\d+"/);
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — pagination
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — pagination', () => {
  const existingPages = [];
  // 5 undefined pages
  const linkGraph = {
    'PageA': ['X'],
    'PageB': ['X'],
    'PageC': ['X'],
    'PageD': ['X'],
    'PageE': ['X']
  };

  test('pageSize=3 shows only first 3 items on page 1', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { pageSize: '3', page: '1' });
    // name-asc: A, B, C visible; D, E not
    expect(html).toContain('PageA');
    expect(html).toContain('PageB');
    expect(html).toContain('PageC');
    expect(html).not.toContain('PageD');
    expect(html).not.toContain('PageE');
  });

  test('pageSize=3 page=2 shows last 2 items', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { pageSize: '3', page: '2' });
    expect(html).not.toContain('PageA');
    expect(html).toContain('PageD');
    expect(html).toContain('PageE');
  });

  test('pagination HTML is included when pageSize > 0', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { pageSize: '3', page: '1' });
    expect(html).toContain('data-pagination');
    expect(html).toContain('data-current-page="1"');
    expect(html).toContain('data-total-pages="2"');
  });

  test('page beyond total clamps to last page', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { pageSize: '3', page: '99' });
    expect(html).toContain('data-current-page="2"');
    expect(html).toContain('data-total-pages="2"');
    expect(html).toContain('PageD');
    expect(html).toContain('PageE');
  });

  test('pageSize=0 (default) uses max= instead', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { max: '2', sort: 'name-asc' });
    expect(html).toContain('PageA');
    expect(html).toContain('PageB');
    expect(html).not.toContain('PageC');
    expect(html).not.toContain('data-pagination');
  });

  test('query.page overrides page param when pageSize active', async () => {
    const ctx = makeContext(existingPages, linkGraph, { page: '2' });
    const html = await UndefinedPagesPlugin.execute(ctx, { pageSize: '3' });
    // Query string page=2 should win
    expect(html).not.toContain('PageA');
    expect(html).toContain('PageD');
    expect(html).toContain('PageE');
  });

  test('no pagination HTML when pageSize=0', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, {});
    expect(html).not.toContain('data-pagination');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — format=count ignores sort/pagination
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — format=count unaffected by sort/page', () => {
  const existingPages = ['Alpha'];
  const linkGraph = {
    'Alpha': [],
    'Missing1': ['Alpha'],
    'Missing2': ['Alpha', 'Other'],
    'Missing3': ['Alpha']
  };

  test('count returns total regardless of sort', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'count', sort: 'count-desc' });
    expect(html).toBe('3');
  });

  test('count returns total regardless of pageSize', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'count', pageSize: '1' });
    expect(html).toBe('3');
  });

  test('count ignores max', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'count', max: '1' });
    expect(html).toBe('3');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — exclude parameter
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — exclude parameter', () => {
  const existingPages = [];
  const linkGraph = {
    'SystemPage': ['Ref1'],
    'UserPage': ['Ref2'],
    'SystemAdmin': ['Ref3']
  };

  test('exclude pattern filters out matching pages', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { exclude: 'System' });
    expect(html).toContain('UserPage');
    expect(html).not.toContain('SystemPage');
    expect(html).not.toContain('SystemAdmin');
  });

  test('invalid exclude regex returns error message', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { exclude: '[invalid regex(' });
    expect(html).toContain('error');
    expect(html).toContain('Invalid exclude pattern');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — showReferring in list format
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — showReferring in list format', () => {
  const existingPages = [];
  const linkGraph = {
    'MissingPage': ['Alpha', 'Beta'],
    'Orphan': []
  };

  test('showReferring=true shows referring pages as nested list', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', showReferring: 'true' });
    expect(html).toContain('referring-pages');
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
  });

  test('showReferring=true with page that has no referrers shows just anchor', async () => {
    const ctx = makeContext(existingPages, { 'Orphan': [] });
    const html = await UndefinedPagesPlugin.execute(ctx, { format: 'list', showReferring: 'true' });
    expect(html).toContain('Orphan');
    expect(html).not.toContain('referring-pages');
  });
});

// ---------------------------------------------------------------------------
// UndefinedPagesPlugin — before/after params
// ---------------------------------------------------------------------------

describe('UndefinedPagesPlugin — before/after params', () => {
  const existingPages = [];
  const linkGraph = { 'PageA': ['X'] };

  test('before param is included in list output', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { before: '>>> ', after: '' });
    expect(html).toContain('>>> ');
  });

  test('after param is included in list output', async () => {
    const ctx = makeContext(existingPages, linkGraph);
    const html = await UndefinedPagesPlugin.execute(ctx, { before: '', after: ' <<<' });
    expect(html).toContain(' <<<');
  });
});
