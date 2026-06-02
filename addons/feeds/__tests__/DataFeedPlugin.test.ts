/**
 * Unit tests for the [DataFeed] plugin (#685 slice 7).
 *
 * @jest-environment node
 */
import { describe, expect, it } from 'vitest';
import DataFeedPlugin from '../src/DataFeedPlugin';
import type { NormalizedRecord } from '../src/adapters/types';

const recs: NormalizedRecord[] = [
  { sourceRecordId: 'a', fetchedAt: 'x', properties: { place: 'Ridgecrest', magnitude: 5.2 } },
  { sourceRecordId: 'b', fetchedAt: 'x', properties: { place: 'Aleutians', magnitude: 4.8 } },
  { sourceRecordId: 'c', fetchedAt: 'x', properties: { place: 'Hawaii', magnitude: 6.1 } }
];

const ctxWith = (records: NormalizedRecord[]) => ({
  engine: { getManager: (n: string) => (n === 'FeedManager' ? { getRecords: async () => records } : undefined) }
}) as never;

const exec = (params: Record<string, unknown>, records = recs) =>
  DataFeedPlugin.execute!(ctxWith(records), params as never) as Promise<string>;

describe('[DataFeed] plugin (#685)', () => {
  it('errors when source is missing', async () => {
    expect(await exec({})).toContain('source is required');
  });

  it('errors when the feeds addon / FeedManager is absent', async () => {
    const ctx = { engine: { getManager: () => undefined } } as never;
    const out = await DataFeedPlugin.execute!(ctx, { source: 'x' } as never);
    expect(out).toContain('not available');
  });

  it('reports an empty source', async () => {
    expect(await exec({ source: 'q' }, [])).toContain('no records for feed');
  });

  it('renders a table with default columns (union of property keys)', async () => {
    const out = await exec({ source: 'q' });
    expect(out).toContain('<table');
    expect(out).toContain('<th>place</th>');
    expect(out).toContain('<th>magnitude</th>');
    expect(out).toContain('Ridgecrest');
    expect(out).toContain('6.1');
  });

  it('honours an explicit columns list', async () => {
    const out = await exec({ source: 'q', columns: 'place' });
    expect(out).toContain('<th>place</th>');
    expect(out).not.toContain('<th>magnitude</th>');
  });

  it('sorts by a column descending', async () => {
    const out = await exec({ source: 'q', columns: 'place,magnitude', sort: 'magnitude-desc' });
    expect(out.indexOf('Hawaii')).toBeLessThan(out.indexOf('Ridgecrest')); // 6.1 before 5.2
    expect(out.indexOf('Ridgecrest')).toBeLessThan(out.indexOf('Aleutians')); // 5.2 before 4.8
  });

  it('applies max', async () => {
    const out = await exec({ source: 'q', columns: 'place,magnitude', sort: 'magnitude-desc', max: '1' });
    expect(out).toContain('Hawaii');
    expect(out).not.toContain('Aleutians');
  });

  it('renders a list when format=list (name via recordName)', async () => {
    const out = await exec({ source: 'q', format: 'list' });
    expect(out).toContain('<ul class="feed-list">');
    expect(out).toContain('<li>Ridgecrest</li>');
  });

  it('escapes cell values (no raw HTML injection)', async () => {
    const out = await exec({ source: 'q', columns: 'place' }, [
      { sourceRecordId: 'x', fetchedAt: 'x', properties: { place: '<b>xss</b>' } }
    ]);
    expect(out).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(out).not.toContain('<b>xss</b>');
  });
});
