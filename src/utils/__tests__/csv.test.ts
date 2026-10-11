/**
 * One CSV writer for every export (RFC 4180), safe to open in a spreadsheet.
 */
import { csvCell, toCsv } from '../csv';

describe('csvCell', () => {
  test.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['two\nlines', '"two\nlines"'],
    ['', ''],
    [42, '42'],
    [0, '0'],
    [true, 'true'],
    [null, ''],
    [undefined, '']
  ])('%j → %s', (value, cell) => {
    expect(csvCell(value)).toBe(cell);
  });

  // A spreadsheet runs a cell that starts with these as a formula (CSV injection).
  test.each([
    ['=HYPERLINK("http://x")', '"\'=HYPERLINK(""http://x"")"'],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTAB', "'\tTAB"],
    ['\rCR', '"\'\rCR"']
  ])('neutralises a formula: %j', (value, cell) => {
    expect(csvCell(value)).toBe(cell);
  });

  test('a number is a number, even when negative', () => {
    expect(csvCell(-12550)).toBe('-12550');
  });
});

describe('toCsv', () => {
  test('a header row, then each row, CRLF-separated with a final CRLF', () => {
    expect(toCsv(['name', 'note'], [['Pat', 'a,b'], ['Lee', '']])).toBe('name,note\r\nPat,"a,b"\r\nLee,\r\n');
  });

  test('no rows is just the header', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });
});
