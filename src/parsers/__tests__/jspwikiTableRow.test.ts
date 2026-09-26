/**
 * The one table-row reader both table paths use (#1338, #1352).
 */

import { isGfmSeparatorRow, parseJspwikiTableRow, parseTableRows } from '../jspwikiTableRow';

describe('parseJspwikiTableRow (#1338)', () => {
  test('the trailing delimiter is optional; an empty trailing piece is not a cell', () => {
    expect(parseJspwikiTableRow('|| a || b')).toEqual({ isHeader: true, cells: ['a', 'b'] });
    expect(parseJspwikiTableRow('| a | b |')).toEqual({ isHeader: false, cells: ['a', 'b'] });
  });
});

describe('GFM tables (#1352)', () => {
  test.each(['|---|---|', '| --- | :---: |', '---|---', '|:--|--:|'.replace(/--/g, '---')])('%s is a separator row', (line) => {
    expect(isGfmSeparatorRow(line)).toBe(true);
  });

  test.each(['| a | b |', '| -- | x |', '|| H ||', '| --- | text |'])('%s is not', (line) => {
    expect(isGfmSeparatorRow(line)).toBe(false);
  });

  test('the row above the separator is the header; the separator is not a row', () => {
    expect(parseTableRows(['| A | B |', '|---|---|', '| 1 | 2 |'])).toEqual([
      { isHeader: true, cells: ['A', 'B'] },
      { isHeader: false, cells: ['1', '2'] }
    ]);
  });

  test('a JSPWiki table comes through unchanged', () => {
    expect(parseTableRows(['|| A || B ||', '| 1 | 2 |'])).toEqual([
      { isHeader: true, cells: ['A', 'B'] },
      { isHeader: false, cells: ['1', '2'] }
    ]);
  });
});
