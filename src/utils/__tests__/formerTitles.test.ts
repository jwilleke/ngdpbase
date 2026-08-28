/**
 * #1105 — former-title tracking in page frontmatter.
 *
 * Pure rules, no engine: what `formerTitles` becomes on a save, and how a
 * lookup index is derived from the page set. PageManager wires these; the
 * behaviour worth pinning lives here.
 */
import { computeFormerTitles, buildFormerTitleIndex, AMBIGUOUS } from '../formerTitles';

describe('computeFormerTitles()', () => {
  test('records the previous title on a rename', () => {
    expect(computeFormerTitles(undefined, 'Old Title', 'New Title')).toEqual(['Old Title']);
  });

  test('appends to an existing list', () => {
    expect(computeFormerTitles(['First'], 'Second', 'Third')).toEqual(['First', 'Second']);
  });

  test('leaves the list alone on an ordinary edit', () => {
    // Same title in and out — not a rename, nothing to record.
    expect(computeFormerTitles(['First'], 'Same', 'Same')).toEqual(['First']);
  });

  test('returns undefined when there is nothing to record and nothing held', () => {
    expect(computeFormerTitles(undefined, 'Same', 'Same')).toBeUndefined();
    expect(computeFormerTitles(undefined, undefined, 'New')).toBeUndefined();
  });

  test('de-duplicates rather than growing on repeat', () => {
    expect(computeFormerTitles(['A'], 'A', 'B')).toEqual(['A']);
  });

  test('drops the new title from the list when a page is renamed back', () => {
    // A -> B -> A. "A" is live again, so it is not a former title any more;
    // leaving it would make the page claim its own current name.
    expect(computeFormerTitles(['A'], 'B', 'A')).toEqual(['B']);
  });

  test('ignores malformed existing values', () => {
    expect(computeFormerTitles('not-an-array', 'Old', 'New')).toEqual(['Old']);
    expect(computeFormerTitles([null, 42, '', '  ', 'Real'], 'Old', 'New')).toEqual(['Real', 'Old']);
  });

  test('trims, and treats a whitespace-only title as no title', () => {
    expect(computeFormerTitles(undefined, '  Old Title  ', 'New')).toEqual(['Old Title']);
    expect(computeFormerTitles(undefined, '   ', 'New')).toBeUndefined();
  });
});

describe('buildFormerTitleIndex()', () => {
  test('maps a former title to the page holding it', () => {
    const index = buildFormerTitleIndex([{ title: 'New Title', formerTitles: ['Old Title'] }]);
    expect(index.get('old title')).toBe('New Title');
  });

  test('is case-insensitive on lookup', () => {
    const index = buildFormerTitleIndex([{ title: 'New', formerTitles: ['Old Title'] }]);
    expect(index.get('OLD TITLE'.toLowerCase())).toBe('New');
  });

  test('marks a former title claimed by two pages as ambiguous', () => {
    // Nothing in the data can say which page an old link meant. A confidently
    // wrong redirect is worse than the 404 it replaces.
    const index = buildFormerTitleIndex([
      { title: 'Page One', formerTitles: ['Shared'] },
      { title: 'Page Two', formerTitles: ['Shared'] }
    ]);
    expect(index.get('shared')).toBe(AMBIGUOUS);
  });

  test('a live page always beats a former title', () => {
    // Someone reused the name for a new page. The new page wins outright.
    const index = buildFormerTitleIndex([
      { title: 'Renamed', formerTitles: ['Recycled'] },
      { title: 'Recycled', formerTitles: [] }
    ]);
    expect(index.get('recycled')).toBe(AMBIGUOUS);
  });

  test('a page claiming its own title as former is ignored', () => {
    const index = buildFormerTitleIndex([{ title: 'Same', formerTitles: ['Same'] }]);
    expect(index.get('same')).toBeUndefined();
  });

  test('skips pages with no or malformed formerTitles', () => {
    const index = buildFormerTitleIndex([
      { title: 'A' },
      { title: 'B', formerTitles: 'nope' },
      { title: 'C', formerTitles: [null, 7] }
    ]);
    expect(index.size).toBe(0);
  });

  test('one page listing several former titles maps them all', () => {
    const index = buildFormerTitleIndex([{ title: 'Current', formerTitles: ['One', 'Two'] }]);
    expect(index.get('one')).toBe('Current');
    expect(index.get('two')).toBe('Current');
  });
});
