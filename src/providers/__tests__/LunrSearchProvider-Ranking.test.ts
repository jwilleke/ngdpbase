/**
 * @file LunrSearchProvider-Ranking.test.ts
 * @description #884 — URL tokenization and prefix typeahead.
 *
 * Field weighting (bullet 1) was already implemented: title 10, systemCategory
 * 8, knowledgeRole 8, userKeywords 6, tags 5, keywords 4, content 1. These
 * cover the two bullets that were genuinely missing.
 */
// Opt out of the global provider mock — these test the real helpers.
vi.unmock('../LunrSearchProvider');
vi.unmock('../../providers/LunrSearchProvider');

import { tokenizeUrls, applyPrefixToLastTerm } from '../LunrSearchProvider';

describe('#884 URL tokenization', () => {
  test('splits a URL into its component words', () => {
    // The point of the feature: "wikipedia" and "volcano" become findable on a
    // page that merely links there.
    const out = tokenizeUrls('See https://en.wikipedia.org/wiki/Volcano for more');
    expect(out.split(' ').sort()).toEqual(['en', 'org', 'volcano', 'wiki', 'wikipedia']);
  });

  test('splits query strings and fragments too', () => {
    const out = tokenizeUrls('http://example.com/path?topic=lava&sort=date#section');
    expect(out).toContain('example');
    expect(out).toContain('lava');
    expect(out).toContain('section');
  });

  test('de-duplicates across multiple URLs', () => {
    const out = tokenizeUrls('http://example.com/a http://example.com/b');
    expect(out.split(' ').filter((t) => t === 'example')).toHaveLength(1);
  });

  test('returns empty for content with no URLs', () => {
    expect(tokenizeUrls('just prose, no links here')).toBe('');
    expect(tokenizeUrls('')).toBe('');
  });

  test('ignores bare domains and abbreviations', () => {
    // Only http(s):// counts. Matching bare dots would turn "e.g." and every
    // sentence-ending abbreviation into index noise.
    expect(tokenizeUrls('see example.com or e.g. this')).toBe('');
  });

  test('drops numeric-only and single-character fragments', () => {
    // Ports, path ids and `/a/` noise carry index weight and are never searched.
    const out = tokenizeUrls('http://example.com:8080/v/2/9/page');
    expect(out.split(' ')).not.toContain('8080');
    expect(out.split(' ')).not.toContain('2');
    expect(out.split(' ')).not.toContain('v');
    expect(out).toContain('page');
  });

  test('does not swallow trailing markdown punctuation', () => {
    const out = tokenizeUrls('[link](https://example.com/docs) and text');
    expect(out).toContain('docs');
    expect(out.split(' ')).not.toContain('and');
  });
});

describe('#884 prefix typeahead', () => {
  test('widens only the last term', () => {
    // Earlier terms are words the user has finished typing.
    expect(applyPrefixToLastTerm('volcano eru')).toBe('volcano eru*');
  });

  test('widens a single term', () => {
    expect(applyPrefixToLastTerm('volc')).toBe('volc*');
  });

  test('leaves a term that already has a wildcard alone', () => {
    expect(applyPrefixToLastTerm('volc*')).toBe('volc*');
  });

  test('leaves field-scoped and presence-operator terms alone', () => {
    // Appending `*` to these corrupts a query the caller wrote deliberately.
    expect(applyPrefixToLastTerm('title:volcano')).toBe('title:volcano');
    expect(applyPrefixToLastTerm('lava +volcano')).toBe('lava +volcano');
    expect(applyPrefixToLastTerm('lava -ash')).toBe('lava -ash');
  });

  test('leaves an empty or punctuation-only query alone', () => {
    expect(applyPrefixToLastTerm('')).toBe('');
    expect(applyPrefixToLastTerm('   ')).toBe('   ');
    expect(applyPrefixToLastTerm('a ---')).toBe('a ---');
  });
});
