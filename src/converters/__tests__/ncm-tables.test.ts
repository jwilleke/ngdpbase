/**
 * Tests for NCM GFM-pipe-table → JSPWiki styled-table up-conversion (#728 table profile, NCM v2)
 *
 * The NCM profile up-converts GFM pipe tables into the rich JSPWiki form
 * (`%%table-fit / %%table-bordered / %%table-striped / %%table-hover / %%sortable`
 * wrapping `||header||` / `|cell|` rows). This is deterministic and idempotent:
 * once a table is in JSPWiki form it has no GFM separator row, so a second pass
 * leaves it byte-identical.
 */

import { upconvertPipeTables, DEFAULT_TABLE_CLASSES } from '../ncm/tables';

describe('upconvertPipeTables — GFM → JSPWiki styled tables', () => {
  const gfm = [
    '| Feature | Abnormal EKG | Borderline EKG |',
    '|---|---|---|',
    '| Certainty | Clearly outside normal range | Between normal & abnormal |',
    '| Clinical Meaning | Usually suggests a cardiac issue | May reflect minor/temporary changes |'
  ].join('\n');

  test('wraps in the five default style blocks in order, with matching closers', () => {
    const { body } = upconvertPipeTables(gfm);
    const lines = body.split('\n');
    expect(lines.slice(0, 5)).toEqual([
      '%%table-fit',
      '%%table-bordered',
      '%%table-striped',
      '%%table-hover',
      '%%sortable'
    ]);
    // exactly five closers
    expect(body.match(/^\/%$/gm)).toHaveLength(5);
  });

  test('header row uses || with leading AND trailing delimiter (parser slices first/last cell)', () => {
    const { body } = upconvertPipeTables(gfm);
    expect(body).toContain('||Feature||Abnormal EKG||Borderline EKG||');
  });

  test('data rows use single | with leading AND trailing delimiter', () => {
    const { body } = upconvertPipeTables(gfm);
    expect(body).toContain('|Certainty|Clearly outside normal range|Between normal & abnormal|');
    expect(body).toContain('|Clinical Meaning|Usually suggests a cardiac issue|May reflect minor/temporary changes|');
  });

  test('reports the number of tables converted', () => {
    expect(upconvertPipeTables(gfm).converted).toBe(1);
    expect(upconvertPipeTables('no tables here\n\njust prose').converted).toBe(0);
  });

  test('idempotent — a second pass leaves the converted output unchanged', () => {
    const once = upconvertPipeTables(gfm).body;
    const twice = upconvertPipeTables(once);
    expect(twice.body).toBe(once);
    expect(twice.converted).toBe(0);
  });

  test('honours custom class list and order', () => {
    const { body } = upconvertPipeTables(gfm, ['zebra-table', 'sortable']);
    const lines = body.split('\n');
    expect(lines.slice(0, 2)).toEqual(['%%zebra-table', '%%sortable']);
    expect(body.match(/^\/%$/gm)).toHaveLength(2);
  });

  test('empty class list still converts the table syntax but adds no wrapper', () => {
    const { body } = upconvertPipeTables(gfm, []);
    expect(body).not.toContain('%%');
    expect(body).not.toMatch(/^\/%$/m);
    expect(body).toContain('||Feature||Abnormal EKG||Borderline EKG||');
  });

  test('supports alignment separator rows (colons) and loose tables without outer pipes', () => {
    const loose = ['Name | Score', ':--- | ---:', 'Ann | 10'].join('\n');
    const { body, converted } = upconvertPipeTables(loose);
    expect(converted).toBe(1);
    expect(body).toContain('||Name||Score||');
    expect(body).toContain('|Ann|10|');
  });

  test('leaves existing JSPWiki || tables untouched (no GFM separator to match)', () => {
    const jspwiki = '%%sortable\n||A||B||\n|1|2|\n/%';
    expect(upconvertPipeTables(jspwiki).converted).toBe(0);
    expect(upconvertPipeTables(jspwiki).body).toBe(jspwiki);
  });

  test('does not touch pipe tables inside fenced code blocks', () => {
    const fenced = ['```', '| a | b |', '|---|---|', '| 1 | 2 |', '```'].join('\n');
    const { body, converted } = upconvertPipeTables(fenced);
    expect(converted).toBe(0);
    expect(body).toBe(fenced);
  });

  test('preserves surrounding prose around the table', () => {
    const doc = `Intro paragraph.\n\n${gfm}\n\nClosing paragraph.`;
    const { body } = upconvertPipeTables(doc);
    expect(body.startsWith('Intro paragraph.')).toBe(true);
    expect(body.trimEnd().endsWith('Closing paragraph.')).toBe(true);
  });

  test('DEFAULT_TABLE_CLASSES is the documented five', () => {
    expect(DEFAULT_TABLE_CLASSES).toEqual([
      'table-fit',
      'table-bordered',
      'table-striped',
      'table-hover',
      'sortable'
    ]);
  });
});
