/**
 * Slice 6a of #760 (#765) — unit tests for the page→Article JSON-LD mapper.
 *
 * Pure-function tests; no engine / WikiContext / I/O. Verifies that the
 * mapper:
 *   - emits the canonical Article shape (always — the CreativeWork fallback
 *     for very-sparse pages was removed in #773 once PageManager declared
 *     `types: ['Article']`; the render path matches the catalog source)
 *   - omits absent fields (no nulls, no empty strings)
 *   - merges + dedupes the four keyword sources into a single `keywords` array
 *   - resolves the `@id` / `url` to a canonical /view/<slug> when no baseUrl
 *     is configured, or to a fully-qualified URL when one is set
 *   - respects Decision 10 (author = original creator; editor = last saver
 *     only when different from author)
 *   - tolerates the legacy `user-keywords` scalar form (space/comma-separated)
 *   - leaves XSS hygiene to JSON.stringify (we don't double-escape here)
 */

import { buildPageJsonLd, stringifyJsonLdForScript, wantsJsonLd } from '../buildPageJsonLd';

describe('buildPageJsonLd()', () => {
  it('emits a full Article shape when all the canonical fields are present', () => {
    const out = buildPageJsonLd('Welcome', {
      title: 'Welcome to the Wiki',
      description: 'Landing page',
      author: 'Alice',
      editor: 'Bob',
      created: '2024-01-15T08:00:00.000Z',
      lastModified: '2024-06-20T08:00:00.000Z',
      'system-category': 'general',
      'user-keywords': ['intro', 'welcome'],
      'system-keywords': ['featured'],
      uuid: 'page-uuid-1',
      inLanguage: 'en'
    }, { baseUrl: 'https://wiki.example.com', autoTaggedKeywords: ['autotag-1', 'intro'] });

    expect(out['@context']).toBe('https://schema.org');
    expect(out['@type']).toBe('Article');
    expect(out['@id']).toBe('https://wiki.example.com/view/Welcome');
    expect(out.url).toBe('https://wiki.example.com/view/Welcome');
    expect(out.identifier).toBe('page-uuid-1');
    expect(out.name).toBe('Welcome to the Wiki');
    expect(out.description).toBe('Landing page');
    expect(out.dateCreated).toBe('2024-01-15T08:00:00.000Z');
    expect(out.dateModified).toBe('2024-06-20T08:00:00.000Z');
    expect(out.author).toEqual({ '@type': 'Person', name: 'Alice' });
    expect(out.editor).toEqual({ '@type': 'Person', name: 'Bob' });
    expect(out.articleSection).toBe('general');
    // keywords: union of user + system + auto + system-category, deduplicated, order-preserving.
    expect(out.keywords).toEqual(['intro', 'welcome', 'featured', 'autotag-1', 'general']);
    expect(out.inLanguage).toBe('en');
  });

  it('always emits Article even when no Article-signal field is present (#773 removed the CreativeWork fallback)', () => {
    // Before #773 the very-sparse case emitted `@type: CreativeWork`. After
    // #773 PageManager.types = ['Article'] is the source of truth and the
    // render path matches — every page is an Article.
    const out = buildPageJsonLd('Stub', {});
    expect(out['@type']).toBe('Article');
    expect(out.name).toBe('Stub'); // falls back to pageName when title absent
    expect(out['@id']).toBe('/view/Stub');
    expect(out.url).toBe('/view/Stub');
  });

  it('promotes to Article when only one Article-signal field is present (dateModified)', () => {
    const out = buildPageJsonLd('Stub', { lastModified: '2024-06-20T08:00:00.000Z' });
    expect(out['@type']).toBe('Article');
  });

  it('promotes to Article when only an author is present', () => {
    const out = buildPageJsonLd('Stub', { author: 'Alice' });
    expect(out['@type']).toBe('Article');
    expect(out.author).toEqual({ '@type': 'Person', name: 'Alice' });
  });

  it('omits empty/null fields entirely rather than emitting null', () => {
    const out = buildPageJsonLd('Empty', {
      title: '',
      description: '',
      author: '',
      created: '',
      lastModified: '',
      'system-category': '',
      'user-keywords': [],
      uuid: ''
    });
    expect(out.description).toBeUndefined();
    expect(out.author).toBeUndefined();
    expect(out.editor).toBeUndefined();
    expect(out.dateCreated).toBeUndefined();
    expect(out.dateModified).toBeUndefined();
    expect(out.articleSection).toBeUndefined();
    expect(out.keywords).toBeUndefined();
    // identifier falls back to pageName when uuid is empty (#773 — Article
    // requires a non-empty identifier per the type). Before #773 the legacy
    // buildPageJsonLd path omitted identifier here; the shift unifies the
    // catalog-side and render-side identifier rule.
    expect(out.identifier).toBe('Empty');
    expect(out.inLanguage).toBeUndefined();
    // name falls back to pageName when title is empty.
    expect(out.name).toBe('Empty');
  });

  it('does NOT emit editor when it equals author (Decision 10 — only emit when distinct)', () => {
    const out = buildPageJsonLd('Stub', { author: 'Alice', editor: 'Alice' });
    expect(out.author).toEqual({ '@type': 'Person', name: 'Alice' });
    expect(out.editor).toBeUndefined();
  });

  it('emits editor when it differs from author', () => {
    const out = buildPageJsonLd('Stub', { author: 'Alice', editor: 'Bob' });
    expect(out.author).toEqual({ '@type': 'Person', name: 'Alice' });
    expect(out.editor).toEqual({ '@type': 'Person', name: 'Bob' });
  });

  it('tolerates the legacy comma/whitespace-separated user-keywords scalar form', () => {
    const out = buildPageJsonLd('Stub', {
      'user-keywords': 'alpha beta, gamma  delta' as unknown as string[],
      author: 'Alice'
    });
    expect(out.keywords).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('deduplicates keywords case-sensitively across all four sources', () => {
    const out = buildPageJsonLd('Stub', {
      'user-keywords': ['a', 'b'],
      'system-keywords': ['b', 'c'],
      'system-category': 'a',
      author: 'Alice'
    }, { autoTaggedKeywords: ['c', 'd'] });
    expect(out.keywords).toEqual(['a', 'b', 'c', 'd']);
  });

  it('resolves @id and url to the relative path form when no baseUrl is configured', () => {
    const out = buildPageJsonLd('Some Page', { author: 'Alice' });
    expect(out['@id']).toBe('/view/Some%20Page');
    expect(out.url).toBe('/view/Some%20Page');
  });

  it('strips trailing slashes from baseUrl', () => {
    const out = buildPageJsonLd('Welcome', { author: 'Alice' }, { baseUrl: 'https://example.com/' });
    expect(out['@id']).toBe('https://example.com/view/Welcome');
  });

  it('URL-encodes the slug for safe canonical IDs', () => {
    const out = buildPageJsonLd('Page With Spaces & Special <chars>', { author: 'Alice' });
    expect(out['@id']).toBe('/view/Page%20With%20Spaces%20%26%20Special%20%3Cchars%3E');
  });

  it('prefers inLanguage over legacy `language` when both are present', () => {
    const out = buildPageJsonLd('Stub', {
      author: 'Alice',
      inLanguage: 'en-US',
      language: 'en'
    });
    expect(out.inLanguage).toBe('en-US');
  });

  it('falls back to `language` when inLanguage is absent', () => {
    const out = buildPageJsonLd('Stub', { author: 'Alice', language: 'es' });
    expect(out.inLanguage).toBe('es');
  });

  it('tolerates null/undefined metadata', () => {
    const out = buildPageJsonLd('Lonely', null);
    // Article-always policy from #773 — see the comment on the
    // "always emits Article" test above.
    expect(out['@type']).toBe('Article');
    expect(out.name).toBe('Lonely');
    expect(out['@id']).toBe('/view/Lonely');
  });

  it('passes HTML-looking values through unchanged in the object; stringifyJsonLdForScript escapes them safely', () => {
    const out = buildPageJsonLd('Stub', {
      title: '<script>alert(1)</script>',
      description: '"><img src=x onerror=alert(1)>',
      author: 'Alice'
    });
    // Mapper itself stays unescaped — the object is structured data; consumers
    // that don't embed in HTML (e.g. content-negotiation in Slice 6b) want
    // the natural JSON shape.
    expect(out.name).toBe('<script>alert(1)</script>');
    expect(out.description).toBe('"><img src=x onerror=alert(1)>');
  });
});

describe('stringifyJsonLdForScript()', () => {
  it('escapes < / > / & to \\uXXXX JSON escapes — no raw HTML survives', () => {
    const s = stringifyJsonLdForScript({
      name: '<script>alert(1)</script>',
      description: 'a & b > c',
      url: 'https://example.com/?x=1&y=2'
    });
    expect(s).not.toContain('<');
    expect(s).not.toContain('>');
    expect(s).not.toContain('&');
    expect(s).toContain('\\u003cscript\\u003ealert(1)\\u003c/script\\u003e');
    expect(s).toContain('\\u0026');
  });

  it('produces valid JSON that round-trips back to the original object', () => {
    const original = { name: '<x>', tags: ['a&b', 'c>d', '<e'], n: 42 };
    const s = stringifyJsonLdForScript(original);
    expect(JSON.parse(s)).toEqual(original);
  });

  it('handles nested objects and arrays', () => {
    const s = stringifyJsonLdForScript({ x: { y: ['<a>', { z: 'b&c' }] } });
    expect(s).not.toMatch(/[<>&]/);
    expect(JSON.parse(s).x.y[0]).toBe('<a>');
    expect(JSON.parse(s).x.y[1].z).toBe('b&c');
  });

  it('handles a realistic Article payload from buildPageJsonLd', () => {
    const obj = buildPageJsonLd('Demo', {
      title: 'Demo <Page>',
      author: 'Alice & Bob',
      'user-keywords': ['<a>', 'b>c']
    });
    const s = stringifyJsonLdForScript(obj);
    expect(s).not.toMatch(/[<>&]/);
    const parsed = JSON.parse(s);
    expect(parsed.name).toBe('Demo <Page>');
    expect(parsed.author.name).toBe('Alice & Bob');
    expect(parsed.keywords).toEqual(['<a>', 'b>c']);
  });
});

describe('wantsJsonLd() — Slice 6b content-negotiation gate (#766)', () => {
  const r = (accept: string | string[] | undefined) => ({ headers: { accept } });

  it('returns true for exact `application/ld+json`', () => {
    expect(wantsJsonLd(r('application/ld+json'))).toBe(true);
  });

  it('returns true when application/ld+json is one of several MIME types in the header', () => {
    expect(wantsJsonLd(r('text/html, application/ld+json, */*'))).toBe(true);
  });

  it('returns true when application/ld+json has a quality value', () => {
    expect(wantsJsonLd(r('application/ld+json; q=0.9'))).toBe(true);
    expect(wantsJsonLd(r('text/html;q=0.5, application/ld+json;q=1.0'))).toBe(true);
  });

  it('returns true case-insensitively (RFC 7231 says Accept tokens are case-insensitive)', () => {
    expect(wantsJsonLd(r('Application/LD+JSON'))).toBe(true);
  });

  it('returns true when accept is a string-array (some proxies / frameworks normalize that way)', () => {
    expect(wantsJsonLd(r(['text/html', 'application/ld+json']))).toBe(true);
  });

  it('returns false for plain text/html', () => {
    expect(wantsJsonLd(r('text/html'))).toBe(false);
  });

  it('returns false for application/json (NOT application/ld+json — strict)', () => {
    expect(wantsJsonLd(r('application/json'))).toBe(false);
  });

  it('returns false for */* (the curl/browser default)', () => {
    expect(wantsJsonLd(r('*/*'))).toBe(false);
  });

  it('returns false when accept header is missing entirely', () => {
    expect(wantsJsonLd(r(undefined))).toBe(false);
  });

  it('returns false when headers object is missing', () => {
    expect(wantsJsonLd({})).toBe(false);
    expect(wantsJsonLd(null)).toBe(false);
    expect(wantsJsonLd(undefined)).toBe(false);
  });

  it('returns false for the empty string (some proxies send `accept: ""`)', () => {
    expect(wantsJsonLd(r(''))).toBe(false);
  });
});
