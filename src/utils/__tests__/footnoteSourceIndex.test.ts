/**
 * #2454 S3 — the in-memory reverse index (docs/design/shared-footnote-sources.md,
 * R6): which pages cite which source. Built from footnote files, never stored.
 */

import { SourceIndex, sourcesCitedIn } from '../footnoteSourceIndex';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

describe('sourcesCitedIn', () => {
  test('lists each source id with the footnote ids that cite it, skipping notes with no source', () => {
    const map = {
      '1': { id: '1', display: 'a', url: '', note: '', createdBy: '', createdAt: '', sourceId: S1 },
      '2': { id: '2', display: 'b', url: '', note: '', createdBy: '', createdAt: '', sourceId: S1 },
      '3': { id: '3', display: 'c', url: '', note: '', createdBy: '', createdAt: '', sourceId: S2 },
      '4': { id: '4', display: 'd', url: '', note: '', createdBy: '', createdAt: '' }
    };
    expect(sourcesCitedIn(map)).toEqual({ [S1]: ['1', '2'], [S2]: ['3'] });
  });

  test('a value that is not a footnote map gives nothing', () => {
    expect(sourcesCitedIn(null)).toEqual({});
    expect(sourcesCitedIn('x')).toEqual({});
    expect(sourcesCitedIn({ '1': null })).toEqual({});
  });
});

describe('SourceIndex', () => {
  test('setPage records the page under each source it cites, and pagesFor lists them', () => {
    const index = new SourceIndex();
    index.setPage('page-a', { [S1]: ['1'] });
    index.setPage('page-b', { [S1]: ['2'], [S2]: ['1'] });
    expect(index.pagesFor(S1).sort()).toEqual(['page-a', 'page-b']);
    expect(index.pagesFor(S2)).toEqual(['page-b']);
    expect(index.pagesFor('nobody')).toEqual([]);
  });

  test('setPage replaces what the page cited before', () => {
    const index = new SourceIndex();
    index.setPage('page-a', { [S1]: ['1'] });
    index.setPage('page-a', { [S2]: ['1'] });
    expect(index.pagesFor(S1)).toEqual([]);
    expect(index.pagesFor(S2)).toEqual(['page-a']);
  });

  test('removePage and an empty setPage take the page out', () => {
    const index = new SourceIndex();
    index.setPage('page-a', { [S1]: ['1'] });
    index.setPage('page-b', { [S1]: ['1'] });
    index.removePage('page-a');
    expect(index.pagesFor(S1)).toEqual(['page-b']);
    index.setPage('page-b', {});
    expect(index.pagesFor(S1)).toEqual([]);
  });

  test('a rebuild swaps the whole content in one step', () => {
    const index = new SourceIndex();
    index.setPage('old', { [S1]: ['1'] });
    expect(index.built).toBe(false);
    index.replaceAll(new Map([['new', { [S2]: ['1'] }]]));
    expect(index.built).toBe(true);
    expect(index.pagesFor(S1)).toEqual([]);
    expect(index.pagesFor(S2)).toEqual(['new']);
  });
});
