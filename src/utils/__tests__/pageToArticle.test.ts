/**
 * Slice 4 of #755 (#772) — unit tests for `pageToArticle()`.
 *
 * Pure-function tests, no engine / WikiContext / I/O. Verifies that the
 * mapper returns the internal `Article` shape (typed `CreativeWork` —
 * **no** `@context`, that's only on the JSON-LD render path) consumable by
 * `CatalogManager.getCreativeWork('pages', uuid)`.
 *
 * Companion to `src/providers/__tests__/buildPageJsonLd.test.ts` which
 * covers the JSON-LD render mapper. The two mappers share source frontmatter
 * but produce structurally-different outputs by design (Decision 11).
 */

import { pageToArticle } from '../pageToArticle';
import type { PageFrontmatter } from '../../types/Page';

describe('pageToArticle()', () => {
  it('emits a full Article with all canonical fields when present', () => {
    const out = pageToArticle('Welcome', {
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
      slug: 'welcome',
      inLanguage: 'en'
    } as PageFrontmatter, { baseUrl: 'https://wiki.example.com', autoTaggedKeywords: ['autotag-1', 'intro'] });

    // The internal Article shape has no @context — that's render-only.
    expect((out as Record<string, unknown>)['@context']).toBeUndefined();
    expect(out['@type']).toBe('Article');
    expect(out['@id']).toBe('https://wiki.example.com/view/welcome');
    expect(out.url).toBe('https://wiki.example.com/view/welcome');
    expect(out.identifier).toBe('page-uuid-1');
    expect(out.name).toBe('Welcome to the Wiki');
    expect(out.description).toBe('Landing page');
    expect(out.dateCreated).toBe('2024-01-15T08:00:00.000Z');
    expect(out.dateModified).toBe('2024-06-20T08:00:00.000Z');
    // Decision 10: author is the immutable creator; editor is the mutable last-saver.
    // Internal Article uses bare strings (not Person objects — that's the render
    // mapper's job per Decision 11). Both surface here.
    expect(out.author).toBe('Alice');
    expect(out.editor).toBe('Bob');
    // Decision 5: system-category maps to `ngdp:category`, not `articleSection`.
    expect(out['ngdp:category']).toBe('general');
    expect(out['ngdp:slug']).toBe('welcome');
    expect(out.keywords).toEqual(['intro', 'welcome', 'featured', 'autotag-1', 'general']);
    expect(out.inLanguage).toBe('en');
  });

  it('uses URL-encoded title when no slug is set on frontmatter', () => {
    const out = pageToArticle('Hello World', {
      title: 'Hello World',
      uuid: 'p1',
      lastModified: '2024-01-01'
    } as PageFrontmatter);
    expect(out['@id']).toBe('/view/Hello%20World');
    expect(out.url).toBe('/view/Hello%20World');
  });

  it('omits absent fields rather than emitting null or empty strings', () => {
    const out = pageToArticle('Minimal', {
      title: 'Minimal',
      uuid: 'p2',
      lastModified: '2024-01-01T00:00:00.000Z'
    } as PageFrontmatter);

    expect(out.dateCreated).toBeUndefined();
    expect(out.author).toBeUndefined();
    expect(out.editor).toBeUndefined();
    expect(out.keywords).toBeUndefined();
    expect(out.description).toBeUndefined();
    expect(out.inLanguage).toBeUndefined();
    expect(out['ngdp:category']).toBeUndefined();
    expect(out['ngdp:slug']).toBeUndefined();
    expect(out.dateModified).toBe('2024-01-01T00:00:00.000Z');
  });

  it('still emits Article (not CreativeWork) even when no Article-signal fields are present', () => {
    // Unlike buildPageJsonLd, the internal Article shape never falls back to a
    // base CreativeWork — pages are always Articles. Sparse pages just omit
    // optional fields. (PageManager.types = ['Article'] reinforces this.)
    const out = pageToArticle('Bare', {
      title: 'Bare',
      uuid: 'p3'
    } as PageFrontmatter);
    expect(out['@type']).toBe('Article');
    // identifier is still set even when other fields aren't.
    expect(out.identifier).toBe('p3');
  });

  it('omits editor when it equals author (avoids redundant alice/alice)', () => {
    const out = pageToArticle('Solo', {
      title: 'Solo',
      uuid: 'p4',
      author: 'alice',
      editor: 'alice',
      lastModified: '2024-01-01'
    } as PageFrontmatter);
    expect(out.author).toBe('alice');
    expect(out.editor).toBeUndefined();
  });

  it('emits editor when different from author (last-saver tracking)', () => {
    const out = pageToArticle('Edited', {
      title: 'Edited',
      uuid: 'p5',
      author: 'alice',
      editor: 'bob',
      lastModified: '2024-01-02'
    } as PageFrontmatter);
    expect(out.author).toBe('alice');
    expect(out.editor).toBe('bob');
  });

  it('merges and deduplicates user-keywords, system-keywords, autoTagged, system-category in order', () => {
    const out = pageToArticle('Page', {
      title: 'Page',
      uuid: 'p6',
      lastModified: '2024-01-01',
      'user-keywords': ['a', 'b'],
      'system-keywords': ['b', 'c'], // duplicate `b` should drop
      'system-category': 'd'
    } as PageFrontmatter, { autoTaggedKeywords: ['c', 'e'] }); // `c` dup, `e` new

    expect(out.keywords).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('handles comma/whitespace-separated user-keywords scalar (legacy form)', () => {
    const out = pageToArticle('Page', {
      title: 'Page',
      uuid: 'p7',
      lastModified: '2024-01-01',
      'user-keywords': 'red, blue green'
    });
    expect(out.keywords).toEqual(['red', 'blue', 'green']);
  });

  it('strips trailing slash on baseUrl before computing @id / url', () => {
    const out = pageToArticle('Page', {
      title: 'Page',
      uuid: 'p8',
      lastModified: '2024-01-01'
    } as PageFrontmatter, { baseUrl: 'https://wiki.example.com/' });
    expect(out['@id']).toBe('https://wiki.example.com/view/Page');
  });

  it('falls back to the page name when title is empty', () => {
    const out = pageToArticle('Untitled', {
      title: '',
      uuid: 'p9',
      lastModified: '2024-01-01'
    } as PageFrontmatter);
    expect(out.name).toBe('Untitled');
  });

  it('uses page name as identifier when uuid is missing (legacy)', () => {
    const out = pageToArticle('LegacyPage', {
      title: 'LegacyPage',
      lastModified: '2024-01-01'
    });
    expect(out.identifier).toBe('LegacyPage');
  });

  it('reads `language` as a fallback for `inLanguage`', () => {
    const out = pageToArticle('Page', {
      title: 'Page',
      uuid: 'p10',
      lastModified: '2024-01-01',
      language: 'fr'
    });
    expect(out.inLanguage).toBe('fr');
  });

  it('handles null / undefined metadata gracefully (returns Article with defaults)', () => {
    const outNull = pageToArticle('Empty', null);
    expect(outNull['@type']).toBe('Article');
    expect(outNull.name).toBe('Empty');
    expect(outNull.identifier).toBe('Empty');

    const outUndef = pageToArticle('Empty', undefined);
    expect(outUndef['@type']).toBe('Article');
    expect(outUndef.name).toBe('Empty');
  });
});
