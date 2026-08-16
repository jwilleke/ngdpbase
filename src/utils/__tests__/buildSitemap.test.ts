/**
 * #885 — sitemap.xml XML generation.
 *
 * Page titles and slugs reach `<loc>` unescaped from the author's keyboard, so
 * the escaping tests are the load-bearing ones: a raw `&` in a slug makes the
 * whole document unparseable, and a crawler drops the file rather than the URL.
 */
import { describe, test, expect } from 'vitest';
import {
  buildSitemapXml,
  buildSitemapIndexXml,
  escapeXml,
  toW3CDate,
  paginate,
  selectPublicSitemapEntries,
  isRestrictedByMetadata,
  SITEMAP_MAX_URLS
} from '../buildSitemap.js';

describe('escapeXml', () => {
  test('escapes all five predefined entities', () => {
    expect(escapeXml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&apos;');
  });

  test('escapes & first, so replacements are not re-escaped', () => {
    // Naive ordering yields `&amp;lt;` — valid XML, wrong text.
    expect(escapeXml('<')).toBe('&lt;');
    expect(escapeXml('a & b < c')).toBe('a &amp; b &lt; c');
  });
});

describe('toW3CDate', () => {
  test('normalises a parseable timestamp to ISO', () => {
    expect(toW3CDate('2026-02-10T13:17:58.620Z')).toBe('2026-02-10T13:17:58.620Z');
  });

  test('drops an unparseable value rather than passing it through', () => {
    // A malformed <lastmod> makes consumers distrust the file; omitting it is
    // explicitly allowed by the spec.
    expect(toW3CDate('not a date')).toBeUndefined();
    expect(toW3CDate('')).toBeUndefined();
    expect(toW3CDate(undefined)).toBeUndefined();
    expect(toW3CDate(12345)).toBeUndefined();
  });
});

describe('buildSitemapXml', () => {
  test('emits a well-formed urlset', () => {
    const xml = buildSitemapXml([
      { loc: 'https://x.test/view/a', lastmod: '2026-02-10T13:17:58.620Z' }
    ]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://x.test/view/a</loc>');
    expect(xml).toContain('<lastmod>2026-02-10T13:17:58.620Z</lastmod>');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  test('omits lastmod entirely when absent or unparseable', () => {
    const xml = buildSitemapXml([{ loc: 'https://x.test/view/a', lastmod: 'garbage' }]);
    expect(xml).not.toContain('<lastmod>');
    expect(xml).toContain('<loc>https://x.test/view/a</loc>');
  });

  test('escapes a slug containing XML metacharacters', () => {
    // `Tom & Jerry` in a slug would otherwise break the document.
    const xml = buildSitemapXml([{ loc: 'https://x.test/view/Tom & Jerry <1>' }]);
    expect(xml).toContain('<loc>https://x.test/view/Tom &amp; Jerry &lt;1&gt;</loc>');
    expect(xml).not.toMatch(/<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  test('an empty list still produces a valid empty urlset', () => {
    const xml = buildSitemapXml([]);
    expect(xml).toContain('<urlset');
    expect(xml).toContain('</urlset>');
    expect(xml).not.toContain('<url>');
  });
});

describe('buildSitemapIndexXml', () => {
  test('lists each child sitemap', () => {
    const xml = buildSitemapIndexXml(
      ['https://x.test/sitemap-1.xml', 'https://x.test/sitemap-2.xml'],
      '2026-02-10T13:17:58.620Z'
    );
    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<loc>https://x.test/sitemap-1.xml</loc>');
    expect(xml).toContain('<loc>https://x.test/sitemap-2.xml</loc>');
    expect(xml).toContain('<lastmod>2026-02-10T13:17:58.620Z</lastmod>');
  });

  test('omits lastmod when not supplied', () => {
    expect(buildSitemapIndexXml(['https://x.test/sitemap-1.xml'])).not.toContain('<lastmod>');
  });
});

describe('selectPublicSitemapEntries', () => {
  const BASE = 'https://x.test';

  test('includes an ordinary public page', () => {
    const out = selectPublicSitemapEntries(
      [{ slug: 'welcome', lastModified: '2026-02-10T13:17:58.620Z', location: 'pages' }],
      BASE
    );
    expect(out).toEqual([
      { loc: 'https://x.test/view/welcome', lastmod: '2026-02-10T13:17:58.620Z' }
    ]);
  });

  describe('exclusions — each one is a leak if it regresses', () => {
    test('excludes a private page by either signal', () => {
      const out = selectPublicSitemapEntries([
        { slug: 'a', location: 'private' },
        { slug: 'b', isPrivate: true, location: 'pages' },
        { slug: 'c', location: 'pages' }
      ], BASE);
      expect(out.map((e) => e.loc)).toEqual(['https://x.test/view/c']);
    });

    test('excludes any page carrying audienceRoles', () => {
      // An anonymous visitor is in no audience, so a non-empty list always
      // means "not for everyone" — regardless of which roles are named.
      const out = selectPublicSitemapEntries([
        { slug: 'a', location: 'pages', audienceRoles: ['editor'] },
        { slug: 'b', location: 'pages', audienceRoles: ['anonymous'] },
        { slug: 'c', location: 'pages', audienceRoles: [] }
      ], BASE);
      expect(out.map((e) => e.loc)).toEqual(['https://x.test/view/c']);
    });

    test('allow-lists the ordinary page store — other stores are excluded', () => {
      // Caught live: `required-pages` entries were being listed, and
      // `using-formplugin` among them 404s on /view/. Deny-listing `private`
      // admitted every other store by default; a new store type must now be
      // opted in rather than published by omission.
      const out = selectPublicSitemapEntries([
        { slug: 'a', location: 'required-pages' },
        { slug: 'b', location: 'some-future-store' },
        { slug: 'c' },
        { slug: 'd', location: 'pages' }
      ], BASE);
      expect(out.map((e) => e.loc)).toEqual(['https://x.test/view/d']);
    });

    test('conservative by design: an empty audience list is treated as public', () => {
      const out = selectPublicSitemapEntries([{ slug: 'a', location: 'pages', audienceRoles: [] }], BASE);
      expect(out).toHaveLength(1);
    });
  });

  test('falls back to title when the index entry has no slug', () => {
    const out = selectPublicSitemapEntries([{ title: 'Some Page', location: 'pages' }], BASE);
    expect(out[0].loc).toBe('https://x.test/view/Some%20Page');
  });

  test('skips an entry with neither slug nor title', () => {
    expect(selectPublicSitemapEntries([{ lastModified: 'x', location: 'pages' }], BASE)).toEqual([]);
  });

  test('returns nothing when the base URL is not absolute', () => {
    // Relative <loc> values are invalid per the spec; emitting a whole file of
    // them is worse than emitting nothing.
    expect(selectPublicSitemapEntries([{ slug: 'a', location: 'pages' }], 'localhost:3000')).toEqual([]);
    expect(selectPublicSitemapEntries([{ slug: 'a', location: 'pages' }], '')).toEqual([]);
  });

  test('tolerates a trailing slash on the base and null entries', () => {
    const out = selectPublicSitemapEntries(
      [null, { slug: 'a', location: 'pages' }],
      'https://x.test/'
    );
    expect(out.map((e) => e.loc)).toEqual(['https://x.test/view/a']);
  });
});

// The regression these pin is real and was caught live: the index's
// denormalised `audienceRoles` is written on save, so 345 of 347
// audience-restricted pages on jimstest (personal journal entries) showed
// nothing there and leaked into a generated sitemap. Frontmatter decides.
describe('isRestrictedByMetadata', () => {
  test('public page with no rules is not restricted', () => {
    expect(isRestrictedByMetadata({})).toBe(false);
    expect(isRestrictedByMetadata(null)).toBe(false);
    expect(isRestrictedByMetadata(undefined)).toBe(false);
  });

  test('private frontmatter restricts, as boolean or string', () => {
    expect(isRestrictedByMetadata({ private: true })).toBe(true);
    expect(isRestrictedByMetadata({ private: 'true' })).toBe(true);
    expect(isRestrictedByMetadata({ private: false })).toBe(false);
  });

  test('a non-empty audience restricts, whatever it names', () => {
    // This is the exact shape that leaked: `audience: [jim]` on a journal page.
    expect(isRestrictedByMetadata({ audience: ['jim'] })).toBe(true);
    expect(isRestrictedByMetadata({ audience: 'editor' })).toBe(true);
    expect(isRestrictedByMetadata({ audience: ['anonymous'] })).toBe(true);
  });

  test('a non-empty access rule restricts', () => {
    expect(isRestrictedByMetadata({ access: { view: ['admin'] } })).toBe(true);
    expect(isRestrictedByMetadata({ access: 'view:admin' })).toBe(true);
  });

  test('empty containers do not restrict', () => {
    expect(isRestrictedByMetadata({ audience: [], access: {} })).toBe(false);
    expect(isRestrictedByMetadata({ audience: '  ' })).toBe(false);
  });
});

describe('paginate', () => {
  test('keeps a small set in one file', () => {
    const pages = paginate([{ loc: 'a' }, { loc: 'b' }]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
  });

  test('splits at the sitemaps.org 50,000-URL cap', () => {
    expect(SITEMAP_MAX_URLS).toBe(50_000);
    const entries = Array.from({ length: 3 }, (_, i) => ({ loc: `u${i}` }));
    const pages = paginate(entries, 2);
    expect(pages.map((p) => p.length)).toEqual([2, 1]);
  });

  test('returns a single empty page for no entries, so callers need no branch', () => {
    expect(paginate([])).toEqual([[]]);
  });
});
