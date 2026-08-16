/**
 * #1053 — one keyword suggestion pool for the page editors and the media editor.
 *
 * Transcribed from the behaviour the page templates already had, since the fix
 * is "media gets what pages get" — any divergence here would just move the
 * inconsistency rather than remove it.
 */
import { describe, test, expect } from 'vitest';
import { buildKeywordPool, KEYWORD_POOL_SKIP } from '../buildKeywordPool.js';

describe('buildKeywordPool', () => {
  test('merges the catalog with index-observed keywords', () => {
    // The whole bug: media used the catalog alone, so it offered 110
    // suggestions where the page editors offered 313.
    expect(buildKeywordPool(['alpha'], ['beta'])).toEqual(['alpha', 'beta']);
  });

  test('accepts catalog objects as well as plain strings', () => {
    expect(buildKeywordPool([{ label: 'Alpha' }, { id: 'beta-id' }, 'gamma'], []))
      .toEqual(['Alpha', 'beta-id', 'gamma']);
  });

  test('prefers label over id when both are present', () => {
    expect(buildKeywordPool([{ label: 'Nice Name', id: 'ugly-id' }], [])).toEqual(['Nice Name']);
  });

  test('sorts the result', () => {
    expect(buildKeywordPool(['zebra', 'apple'], ['mango'])).toEqual(['apple', 'mango', 'zebra']);
  });

  describe('dedupe', () => {
    test('is case-insensitive, and catalog casing wins', () => {
      // 'journal' from migrated entries and 'Journal' from seed pages must not
      // both appear; the curated catalog casing is the one to keep.
      expect(buildKeywordPool(['Journal'], ['journal'])).toEqual(['Journal']);
    });

    test('collapses repeats within a single source', () => {
      expect(buildKeywordPool(['dup', 'DUP'], [])).toEqual(['dup']);
    });
  });

  describe('bucket terms are excluded from suggestions', () => {
    test.each(KEYWORD_POOL_SKIP)('skips %s from either source', (term) => {
      expect(buildKeywordPool([term], [])).toEqual([]);
      expect(buildKeywordPool([], [term])).toEqual([]);
    });

    test('skips regardless of casing', () => {
      expect(buildKeywordPool(['Private', 'DRAFT'], [])).toEqual([]);
    });

    test('does not skip a keyword that merely contains a bucket word', () => {
      expect(buildKeywordPool(['private thoughts'], [])).toEqual(['private thoughts']);
    });
  });

  describe('malformed input', () => {
    test('tolerates null and undefined arguments', () => {
      expect(buildKeywordPool(null, null)).toEqual([]);
      expect(buildKeywordPool(undefined, undefined)).toEqual([]);
    });

    test('tolerates non-array arguments', () => {
      expect(buildKeywordPool('nope' as never, 42 as never)).toEqual([]);
    });

    test('drops entries with no usable label rather than emitting blanks', () => {
      // An empty suggestion renders as a blank row in the dropdown.
      expect(buildKeywordPool([null, undefined, {}, { label: '' }, 'real'], [null, '']))
        .toEqual(['real']);
    });
  });
});
