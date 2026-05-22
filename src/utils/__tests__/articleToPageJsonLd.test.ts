/**
 * #773 — unit tests for the `articleToPageJsonLd` render adapter.
 *
 * Pure-function tests; no engine / I/O. Verifies the internal-Article →
 * render-PageJsonLd conversions:
 *   - @context added
 *   - `ngdp:category` → `articleSection` (field rename)
 *   - bare-string author/editor → { @type: Person, name } objects
 *   - everything else passes through unchanged
 *   - absent fields stay absent
 */

import { articleToPageJsonLd } from '../articleToPageJsonLd';
import type { Article } from '../../types/Schema';

function baseArticle(overrides: Partial<Article> = {}): Article {
  return {
    '@id': '/view/Test',
    '@type': 'Article',
    identifier: 'tp-uuid',
    name: 'Test Page',
    url: '/view/Test',
    ...overrides
  };
}

describe('articleToPageJsonLd()', () => {
  it('adds @context: https://schema.org to the output', () => {
    const out = articleToPageJsonLd(baseArticle());
    expect(out['@context']).toBe('https://schema.org');
  });

  it('passes @type / @id / identifier / url / name through unchanged', () => {
    const article = baseArticle({
      '@id': '/view/Welcome',
      '@type': 'Article',
      identifier: 'welcome-uuid',
      url: '/view/Welcome',
      name: 'Welcome'
    });
    const out = articleToPageJsonLd(article);
    expect(out['@type']).toBe('Article');
    expect(out['@id']).toBe('/view/Welcome');
    expect(out.identifier).toBe('welcome-uuid');
    expect(out.url).toBe('/view/Welcome');
    expect(out.name).toBe('Welcome');
  });

  it('passes description / dateCreated / dateModified through when present', () => {
    const out = articleToPageJsonLd(baseArticle({
      description: 'A page',
      dateCreated: '2024-01-01T00:00:00.000Z',
      dateModified: '2025-06-01T00:00:00.000Z'
    }));
    expect(out.description).toBe('A page');
    expect(out.dateCreated).toBe('2024-01-01T00:00:00.000Z');
    expect(out.dateModified).toBe('2025-06-01T00:00:00.000Z');
  });

  it('omits description / dateCreated / dateModified when absent (no null emitted)', () => {
    const out = articleToPageJsonLd(baseArticle());
    expect(out.description).toBeUndefined();
    expect(out.dateCreated).toBeUndefined();
    expect(out.dateModified).toBeUndefined();
  });

  it('converts bare-string author to Person object', () => {
    const out = articleToPageJsonLd(baseArticle({ author: 'alice' }));
    expect(out.author).toEqual({ '@type': 'Person', name: 'alice' });
  });

  it('converts bare-string editor to Person object', () => {
    const out = articleToPageJsonLd(baseArticle({ author: 'alice', editor: 'bob' }));
    expect(out.editor).toEqual({ '@type': 'Person', name: 'bob' });
  });

  it('passes Person-shaped author through (with @type ensured)', () => {
    const out = articleToPageJsonLd(baseArticle({
      // Caller pre-built a Person object — adapter normalises @type
      author: { '@type': 'Person', name: 'alice' } as Article['author']
    }));
    expect(out.author).toEqual({ '@type': 'Person', name: 'alice' });
  });

  it('omits author / editor entirely when source has neither', () => {
    const out = articleToPageJsonLd(baseArticle());
    expect(out.author).toBeUndefined();
    expect(out.editor).toBeUndefined();
  });

  it('omits author when string is empty', () => {
    const out = articleToPageJsonLd(baseArticle({ author: '' }));
    expect(out.author).toBeUndefined();
  });

  it('renames ngdp:category → articleSection', () => {
    const article = baseArticle();
    (article as Record<string, unknown>)['ngdp:category'] = 'tutorials';
    const out = articleToPageJsonLd(article);
    expect(out.articleSection).toBe('tutorials');
    // The internal field name should not leak into the render output.
    expect((out as Record<string, unknown>)['ngdp:category']).toBeUndefined();
  });

  it('omits articleSection when ngdp:category is absent', () => {
    const out = articleToPageJsonLd(baseArticle());
    expect(out.articleSection).toBeUndefined();
  });

  it('passes keywords through when non-empty', () => {
    const out = articleToPageJsonLd(baseArticle({ keywords: ['a', 'b', 'c'] }));
    expect(out.keywords).toEqual(['a', 'b', 'c']);
  });

  it('omits keywords when empty array (no consumer wants `[]`)', () => {
    const out = articleToPageJsonLd(baseArticle({ keywords: [] }));
    expect(out.keywords).toBeUndefined();
  });

  it('passes inLanguage through when set', () => {
    const out = articleToPageJsonLd(baseArticle({ inLanguage: 'en' }));
    expect(out.inLanguage).toBe('en');
  });

  it('does NOT leak ngdp:slug into the render output', () => {
    const article = baseArticle();
    (article as Record<string, unknown>)['ngdp:slug'] = 'welcome';
    const out = articleToPageJsonLd(article);
    // ngdp:slug is render-redundant with @id (Decision B 2026-05-20).
    expect((out as Record<string, unknown>)['ngdp:slug']).toBeUndefined();
  });

  it('reproduces the v3.34.0 Welcome-page baseline byte-for-byte equivalent shape', () => {
    // Regression gate against the pre-refactor JSON-LD output captured in
    // /tmp/welcome-jsonld-before.json during #773 development. The baseline:
    //   {
    //     "@context":"https://schema.org",
    //     "@type":"Article",
    //     "@id":"/view/Welcome",
    //     "url":"/view/Welcome",
    //     "name":"Welcome",
    //     "identifier":"92fd6e62-...",
    //     "dateModified":"2025-10-20T10:46:34.027Z",
    //     "author":{"@type":"Person","name":"system"},
    //     "articleSection":"system",
    //     "keywords":["system"]
    //   }
    const article: Article = {
      '@context': undefined as unknown as never, // not on Article
      '@type': 'Article',
      '@id': '/view/Welcome',
      identifier: '92fd6e62-20f8-46c2-b7da-77b404c3100a',
      name: 'Welcome',
      url: '/view/Welcome',
      dateModified: '2025-10-20T10:46:34.027Z',
      author: 'system',
      keywords: ['system']
    };
    (article as Record<string, unknown>)['ngdp:category'] = 'system';

    const out = articleToPageJsonLd(article);
    expect(out).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': '/view/Welcome',
      url: '/view/Welcome',
      name: 'Welcome',
      identifier: '92fd6e62-20f8-46c2-b7da-77b404c3100a',
      dateModified: '2025-10-20T10:46:34.027Z',
      author: { '@type': 'Person', name: 'system' },
      articleSection: 'system',
      keywords: ['system']
    });
  });
});
