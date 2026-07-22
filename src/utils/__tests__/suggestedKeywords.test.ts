/**
 * Unit tests for getSuggestedKeywordSets (#883).
 */
import { describe, expect, it } from 'vitest';
import { getSuggestedKeywordSets, type RecentPageKeywords } from '../suggestedKeywords';

const NOW = 1_770_000_000_000; // fixed epoch for deterministic decay
const daysAgo = (d: number) => NOW - d * 86_400_000;

describe('getSuggestedKeywordSets (#883)', () => {
  it('returns one suggestion per distinct recent keyword set, newest-weighted first', () => {
    const recent: RecentPageKeywords[] = [
      { title: 'Old Page', keywords: ['history'], modifiedAt: daysAgo(60) },
      { title: 'Trip Day 2', keywords: ['travel', 'dining'], modifiedAt: daysAgo(1) },
      { title: 'Trip Day 1', keywords: ['travel', 'hiking'], modifiedAt: daysAgo(3) }
    ];
    const out = getSuggestedKeywordSets(recent, [], { now: NOW });
    expect(out.map(s => s.source)).toEqual(['Trip Day 2', 'Trip Day 1', 'Old Page']);
    expect(out[0].keywords).toEqual(['travel', 'dining']);
  });

  it('subtracts already-selected keywords and drops fully-covered sets', () => {
    const recent: RecentPageKeywords[] = [
      { title: 'A', keywords: ['travel', 'dining'], modifiedAt: daysAgo(1) },
      { title: 'B', keywords: ['travel'], modifiedAt: daysAgo(2) } // fully covered → dropped
    ];
    const out = getSuggestedKeywordSets(recent, ['travel'], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'A', keywords: ['dining'] });
  });

  it('dedupes identical sets, keeping the most recent source', () => {
    const recent: RecentPageKeywords[] = [
      { title: 'Older', keywords: ['a', 'b'], modifiedAt: daysAgo(10) },
      { title: 'Newer', keywords: ['b', 'a'], modifiedAt: daysAgo(1) }
    ];
    const out = getSuggestedKeywordSets(recent, [], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('Newer');
  });

  it('is case/space-insensitive for de-dup and exclusion but preserves display form', () => {
    const recent: RecentPageKeywords[] = [
      { title: 'A', keywords: ['  Travel ', 'Fine Dining'], modifiedAt: daysAgo(1) }
    ];
    const out = getSuggestedKeywordSets(recent, ['travel'], { now: NOW });
    expect(out[0].keywords).toEqual(['Fine Dining']); // Travel excluded, display trimmed
  });

  it('recurring keywords lift a set above a one-off set of the same age', () => {
    const recent: RecentPageKeywords[] = [
      { title: 'Popular', keywords: ['travel'], modifiedAt: daysAgo(2) },
      { title: 'Reinforce', keywords: ['travel'], modifiedAt: daysAgo(2) }, // same sig as Popular
      { title: 'OneOff', keywords: ['obscure'], modifiedAt: daysAgo(2) }
    ];
    const out = getSuggestedKeywordSets(recent, [], { now: NOW });
    // 'travel' recurs (higher member score) → its set outranks the one-off.
    expect(out[0].keywords).toEqual(['travel']);
    expect(out.find(s => s.keywords[0] === 'obscure')!.score)
      .toBeLessThan(out[0].score);
  });

  it('honours maxSets and handles empty / keyword-less input', () => {
    expect(getSuggestedKeywordSets([], [], { now: NOW })).toEqual([]);
    const recent: RecentPageKeywords[] = [
      { title: 'A', keywords: ['a'], modifiedAt: daysAgo(1) },
      { title: 'B', keywords: ['b'], modifiedAt: daysAgo(2) },
      { title: 'C', keywords: [], modifiedAt: daysAgo(3) } // no keywords → skipped
    ];
    expect(getSuggestedKeywordSets(recent, [], { now: NOW, maxSets: 1 })).toHaveLength(1);
  });
});
