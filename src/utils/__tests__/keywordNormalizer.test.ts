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
  groupKeywordVariants,
  parseHierarchicalTags,
  buildLeafPathMap,
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

describe('parseHierarchicalTags (#917)', () => {
  it('parses HierarchicalSubject (|) and TagsList (/) to normalized value paths', () => {
    expect(parseHierarchicalTags('Places|USA|Colorado|Denver', undefined))
      .toEqual(['places/usa/colorado/denver']);
    expect(parseHierarchicalTags(undefined, 'Places/USA/Colorado/Denver'))
      .toEqual(['places/usa/colorado/denver']);
  });

  it('unions both sources and dedupes identical paths', () => {
    const out = parseHierarchicalTags('Places|USA|Denver', 'Places/USA/Denver');
    expect(out).toEqual(['places/usa/denver']);
  });

  it('accepts arrays and normalizes each segment (spaces/accents)', () => {
    const out = parseHierarchicalTags(['People|Family|José García', 'Trips|2026 Trip West'], undefined);
    expect(out).toEqual(['people/family/jose-garcia', 'trips/2026-trip-west']);
  });

  it('drops empty segments and non-string / absent input', () => {
    expect(parseHierarchicalTags('A||B', undefined)).toEqual(['a/b']);
    expect(parseHierarchicalTags(undefined, undefined)).toEqual([]);
    expect(parseHierarchicalTags(42, {})).toEqual([]);
  });
});

describe('buildLeafPathMap (#917)', () => {
  it('maps each leaf to its path; most-frequent path wins a conflict', () => {
    const map = buildLeafPathMap([
      'places/usa/colorado/denver',
      'places/usa/colorado/denver',
      'places/co/denver'  // minority path for the same leaf
    ]);
    expect(map.get('denver')).toBe('places/usa/colorado/denver');
  });

  it('omits root-only leaves (a leaf with no genuine hierarchy)', () => {
    const map = buildLeafPathMap(['denver', 'places/usa/boulder']);
    expect(map.has('denver')).toBe(false);        // no '/' → no placement info
    expect(map.get('boulder')).toBe('places/usa/boulder');
  });
});

describe('groupKeywordVariants (#919)', () => {
  it('clusters forms sharing a canonical value; ignores single-form values', () => {
    const groups = groupKeywordVariants([
      { form: 'Dining', catalogued: true, catalogId: 'dining', pageCount: 3 },
      { form: 'dining', mediaCount: 5 },
      { form: 'Fine  Dining', pageCount: 1 },      // distinct value → own (single) group, dropped
      { form: 'Travel', pageCount: 10 }            // single form → dropped
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].value).toBe('dining');
    expect(groups[0].forms.map(f => f.form).sort()).toEqual(['Dining', 'dining']);
  });

  it('picks the catalogued form as canonical, else the most-used', () => {
    const [g] = groupKeywordVariants([
      { form: 'dining', mediaCount: 99 },
      { form: 'Dining', catalogued: true, catalogId: 'dining', pageCount: 1 }
    ]);
    expect(g.canonicalForm).toBe('Dining'); // catalogued wins over higher-count 'dining'
    expect(g.canonicalId).toBe('dining');

    const [g2] = groupKeywordVariants([
      { form: 'hiking', mediaCount: 2 },
      { form: 'Hiking', pageCount: 9 } // neither catalogued → top count
    ]);
    expect(g2.canonicalForm).toBe('Hiking');
  });

  it('folds space/accent/punctuation variants (stronger than lowercase)', () => {
    const [g] = groupKeywordVariants([
      { form: 'Fine Dining', pageCount: 1 },
      { form: 'fine-dining', mediaCount: 1 },
      { form: 'Fine  Dining', pageCount: 1 }
    ]);
    expect(g.value).toBe('fine-dining');
    expect(g.forms).toHaveLength(3);
  });

  it('mergeable only when canonical + another form are both catalog terms', () => {
    const cat = groupKeywordVariants([
      { form: 'Dining', catalogued: true, catalogId: 'dining' },
      { form: 'DINING', catalogued: true, catalogId: 'dining-2' }
    ])[0];
    expect(cat.mergeable).toBe(true);

    const media = groupKeywordVariants([
      { form: 'Dining', catalogued: true, catalogId: 'dining' },
      { form: 'dining', mediaCount: 4 } // observed only → not mergeable via page-retag
    ])[0];
    expect(media.mergeable).toBe(false);
  });

  it('sums counts across duplicate forms and drops empty/symbol forms', () => {
    const [g] = groupKeywordVariants([
      { form: 'Dining', pageCount: 2 },
      { form: 'Dining', mediaCount: 3 }, // same form → summed, not a variant on its own
      { form: 'dining', pageCount: 1 },
      { form: '   ', pageCount: 9 },
      { form: '!!!', pageCount: 9 }
    ]);
    const dining = g.forms.find(f => f.form === 'Dining');
    expect(dining).toMatchObject({ pageCount: 2, mediaCount: 3 });
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
