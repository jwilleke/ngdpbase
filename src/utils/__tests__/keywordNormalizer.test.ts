/**
 * Unit tests for the keyword normalizer (#869).
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeKeywordValue,
  isValidKeywordValue,
  keywordsCollide,
  toKeywordTerm,
  dedupeKeywords,
  KEYWORD_VALUE_MAX
} from '../keywordNormalizer';

describe('normalizeKeywordValue (#869)', () => {
  it('lowercases, hyphenates spaces, trims edges', () => {
    expect(normalizeKeywordValue('James Stanley Willeke')).toBe('james-stanley-willeke');
    expect(normalizeKeywordValue('  Fine  Dining  ')).toBe('fine-dining');
  });

  it('collapses runs of punctuation/commas to a single hyphen (comma-free result)', () => {
    const v = normalizeKeywordValue('Travel, Food & Drink');
    expect(v).toBe('travel-food-drink');
    expect(v).not.toContain(',');
  });

  it('transliterates diacritics rather than dropping them (unlike simpleSlug)', () => {
    expect(normalizeKeywordValue('José')).toBe('jose');
    expect(normalizeKeywordValue('Zürich Café')).toBe('zurich-cafe');
  });

  it('strips leading markers like ~WHO to their word', () => {
    expect(normalizeKeywordValue('~WHO')).toBe('who');
  });

  it('enforces the 64-char cap without a trailing hyphen', () => {
    const long = 'a'.repeat(70);
    expect(normalizeKeywordValue(long)).toHaveLength(KEYWORD_VALUE_MAX);
    // truncation must not leave a dangling hyphen
    const hyphenAt64 = ('word-'.repeat(20)); // hyphen would land near the cut
    expect(normalizeKeywordValue(hyphenAt64).endsWith('-')).toBe(false);
  });

  it('is idempotent on already-canonical values', () => {
    const v = 'james-stanley-willeke';
    expect(normalizeKeywordValue(v)).toBe(v);
  });

  it('returns empty for symbol-only / non-string input', () => {
    expect(normalizeKeywordValue('!!!')).toBe('');
    expect(normalizeKeywordValue('')).toBe('');
    // @ts-expect-error runtime guard
    expect(normalizeKeywordValue(null)).toBe('');
  });
});

describe('isValidKeywordValue', () => {
  it('accepts canonical values', () => {
    expect(isValidKeywordValue('travel')).toBe(true);
    expect(isValidKeywordValue('james-stanley-willeke')).toBe(true);
  });
  it('rejects non-canonical values', () => {
    expect(isValidKeywordValue('Travel')).toBe(false);   // uppercase
    expect(isValidKeywordValue('a b')).toBe(false);       // space
    expect(isValidKeywordValue('a,b')).toBe(false);       // comma
    expect(isValidKeywordValue('-lead')).toBe(false);     // leading hyphen
    expect(isValidKeywordValue('a--b')).toBe(false);      // double hyphen
    expect(isValidKeywordValue('')).toBe(false);
    expect(isValidKeywordValue('x'.repeat(65))).toBe(false);
  });
});

describe('keywordsCollide', () => {
  it('detects case/space/accent variants of one keyword', () => {
    expect(keywordsCollide('Dining', 'dining')).toBe(true);
    expect(keywordsCollide('Fine Dining', 'fine  dining')).toBe(true);
    expect(keywordsCollide('José', 'jose')).toBe(true);
  });
  it('does not collide distinct keywords or empties', () => {
    expect(keywordsCollide('travel', 'dining')).toBe(false);
    expect(keywordsCollide('!!!', '???')).toBe(false); // both normalize to ''
  });
});

describe('toKeywordTerm', () => {
  it('splits a title into { term (value), label (title) }', () => {
    expect(toKeywordTerm('  Fine Dining ')).toEqual({ term: 'fine-dining', label: 'Fine Dining' });
  });
});

describe('dedupeKeywords (#915)', () => {
  it('merges case/space/accent variants, first occurrence wins', () => {
    expect(dedupeKeywords(['Dining', 'travel', 'dining', 'Fine  Dining', 'fine-dining']))
      .toEqual(['Dining', 'travel', 'Fine  Dining']);
  });

  it('drops empties and trims kept forms', () => {
    expect(dedupeKeywords(['  Travel ', '', '!!!', 'travel'])).toEqual(['Travel']);
  });

  it('snaps kept keywords to the registry title when provided', () => {
    const registry = new Map([['dining', 'Dining'], ['travel', 'Travel']]);
    expect(dedupeKeywords(['dining', 'HIKING', 'Travel'], registry))
      .toEqual(['Dining', 'HIKING', 'Travel']); // known snap to title, unknown kept as-typed
  });

  it('is a no-op for an already-canonical, variant-free list', () => {
    const list = ['travel', 'dining', 'hiking'];
    expect(dedupeKeywords(list)).toEqual(list);
  });
});
