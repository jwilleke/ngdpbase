/**
 * #886 — OpenGraph + Twitter tags for page views.
 *
 * The tags are attacker-influenced (a page title and body become tag content),
 * so the escaping boundary matters: this module deliberately does NOT escape,
 * because the EJS template renders with `<%= %>`. Tests pin the raw values so a
 * future "helpful" escape here cannot double-encode them.
 */
import { describe, test, expect } from 'vitest';
import { buildSocialMeta, excerpt, absoluteUrl } from '../buildSocialMeta.js';

const BASE = 'https://wiki.example.com';

const get = (tags: ReturnType<typeof buildSocialMeta>, key: string) =>
  tags.find((t) => t.property === key || t.name === key)?.content;

describe('buildSocialMeta', () => {
  test('emits the core OpenGraph set for an ordinary page', () => {
    const tags = buildSocialMeta({
      pageName: 'Welcome',
      metadata: { title: 'Welcome', slug: 'welcome' },
      contentHtml: '<p>Hello there.</p>',
      baseUrl: BASE,
      applicationName: 'My Site'
    });

    expect(get(tags, 'og:type')).toBe('article');
    expect(get(tags, 'og:title')).toBe('Welcome');
    expect(get(tags, 'og:site_name')).toBe('My Site');
    expect(get(tags, 'og:url')).toBe(`${BASE}/view/welcome`);
    expect(get(tags, 'og:description')).toBe('Hello there.');
  });

  test('returns [] with no page name, so the caller needs no length check', () => {
    expect(buildSocialMeta({ pageName: '', baseUrl: BASE, applicationName: 'x' })).toEqual([]);
  });

  test('falls back to the page name when frontmatter has no title', () => {
    const tags = buildSocialMeta({
      pageName: 'Some Page', metadata: null, baseUrl: BASE, applicationName: 'x'
    });
    expect(get(tags, 'og:title')).toBe('Some Page');
    expect(get(tags, 'og:url')).toBe(`${BASE}/view/Some%20Page`);
  });

  describe('description', () => {
    test('frontmatter description wins over a derived excerpt', () => {
      const tags = buildSocialMeta({
        pageName: 'P',
        metadata: { description: 'Written by hand.' },
        contentHtml: '<p>Derived from body.</p>',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:description')).toBe('Written by hand.');
    });

    test('derives from rendered content when frontmatter has none', () => {
      // No page in the corpus sets `description`, so this is the live path.
      const tags = buildSocialMeta({
        pageName: 'P',
        contentHtml: '<h1>Title</h1><p>First real sentence.</p>',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:description')).toBe('Title First real sentence.');
    });

    test('does not leak script or style bodies into the description', () => {
      // A tag-strip alone would turn the script body into "description" text.
      const tags = buildSocialMeta({
        pageName: 'P',
        contentHtml: '<style>.a{color:red}</style><script>alert(1)</script><p>Real text.</p>',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:description')).toBe('Real text.');
    });

    test('decodes entities so the description reads as prose', () => {
      const tags = buildSocialMeta({
        pageName: 'P',
        contentHtml: '<p>Tom &amp; Jerry&nbsp;&mdash; a &quot;classic&quot;</p>',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:description')).toContain('Tom & Jerry');
      expect(get(tags, 'og:description')).toContain('"classic"');
    });

    test('omits og:description entirely when there is no content', () => {
      const tags = buildSocialMeta({ pageName: 'P', baseUrl: BASE, applicationName: 'x' });
      expect(get(tags, 'og:description')).toBeUndefined();
    });
  });

  describe('excerpt', () => {
    test('leaves short text untouched, with no ellipsis', () => {
      expect(excerpt('Short.', 200)).toBe('Short.');
    });

    test('truncates on a word boundary', () => {
      expect(excerpt('alpha beta gamma delta', 12)).toBe('alpha beta…');
    });

    test('hard-cuts a single word longer than the limit', () => {
      // No boundary exists; returning '' would be worse than a mid-word cut.
      const out = excerpt('a'.repeat(50), 10);
      expect(out).toBe('a'.repeat(10) + '…');
    });
  });

  describe('images and twitter card type', () => {
    test('uses the first content image and upgrades the card', () => {
      const tags = buildSocialMeta({
        pageName: 'P',
        contentHtml: '<p><img src="/attachments/abc123"><img src="/attachments/second"></p>',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:image')).toBe(`${BASE}/attachments/abc123`);
      expect(get(tags, 'twitter:card')).toBe('summary_large_image');
    });

    test('keeps an already-absolute image URL as-is', () => {
      const tags = buildSocialMeta({
        pageName: 'P',
        contentHtml: '<img src="https://cdn.example.com/a.png">',
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:image')).toBe('https://cdn.example.com/a.png');
    });

    test('falls back to a plain summary card with no image', () => {
      const tags = buildSocialMeta({
        pageName: 'P', contentHtml: '<p>text</p>', baseUrl: BASE, applicationName: 'x'
      });
      expect(get(tags, 'og:image')).toBeUndefined();
      expect(get(tags, 'twitter:card')).toBe('summary');
    });
  });

  describe('absoluteUrl', () => {
    test('drops the value rather than emitting a relative URL', () => {
      // og:image and og:url must be absolute; a relative one is ignored by
      // every consumer, so emitting none is the honest outcome.
      expect(absoluteUrl('/a.png', 'not-a-url')).toBeUndefined();
      expect(absoluteUrl('/a.png', '')).toBeUndefined();
    });

    test('tolerates a trailing slash on the base', () => {
      expect(absoluteUrl('/a.png', 'https://x.test/')).toBe('https://x.test/a.png');
    });

    test('omits og:url when the configured base is not absolute', () => {
      const tags = buildSocialMeta({
        pageName: 'P', baseUrl: 'localhost:3000', applicationName: 'x'
      });
      expect(get(tags, 'og:url')).toBeUndefined();
      // The rest of the card still renders — a missing URL is not fatal.
      expect(get(tags, 'og:title')).toBe('P');
    });
  });

  describe('escaping boundary', () => {
    test('returns raw values — the template escapes, not this module', () => {
      // Escaping here as well would double-encode: `&amp;quot;` in the page
      // source. The EJS `<%= %>` render is the single escape point.
      const tags = buildSocialMeta({
        pageName: 'P',
        metadata: { title: 'Quote " and <tag>' },
        baseUrl: BASE,
        applicationName: 'x'
      });
      expect(get(tags, 'og:title')).toBe('Quote " and <tag>');
    });
  });

  test('includes article timestamps and author when present', () => {
    const tags = buildSocialMeta({
      pageName: 'P',
      metadata: { lastModified: '2026-08-16T00:00:00.000Z', author: 'alice' },
      baseUrl: BASE,
      applicationName: 'x'
    });
    expect(get(tags, 'article:modified_time')).toBe('2026-08-16T00:00:00.000Z');
    expect(get(tags, 'article:author')).toBe('alice');
  });
});
