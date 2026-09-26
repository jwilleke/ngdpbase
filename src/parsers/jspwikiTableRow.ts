/**
 * One JSPWiki table row, read the way JSPWiki reads it (#1338).
 *
 * The one implementation for both table paths: a table inside a `%%` style
 * block (`MarkupParser.createTableNode`) and a bare one
 * (`JSPWikiPreprocessor`). They had a copy each, and the bare one dropped the
 * last cell of every row without a trailing delimiter — 4,442 rows on 475
 * jimstest pages — because it always cut the last split piece.
 *
 * - A row starting with `||` is a header row, split on `||`; otherwise on `|`.
 * - The piece before the leading delimiter is empty and is dropped.
 * - The trailing delimiter is optional. The piece after the last delimiter is
 *   dropped only when it is empty, as JSPWiki does; otherwise it is a cell.
 * - A delimiter inside `[...]` belongs to a wiki link (`[Text|Page]`), not
 *   to the table.
 */

export interface JspwikiTableRow {
  isHeader: boolean;
  cells: string[];
}

export function parseJspwikiTableRow(line: string): JspwikiTableRow {
  const trimmed = line.trim();
  const isHeader = trimmed.startsWith('||');
  const parts = splitCellsBracketAware(trimmed, isHeader ? '||' : '|');
  const last = parts[parts.length - 1];
  const cells = parts
    .slice(1, last !== undefined && last.trim() === '' ? -1 : undefined)
    .map(cell => cell.trim());
  return { isHeader, cells };
}

/**
 * Split text on a delimiter, except inside `[...]` bracket groups: the pipe
 * in `[wiki link|PageName]` is not a cell boundary.
 */
export function splitCellsBracketAware(text: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let i = 0;

  while (i < text.length) {
    if (text[i] === '[') {
      bracketDepth++;
      current += text[i];
      i++;
      continue;
    }
    if (text[i] === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += text[i];
      i++;
      continue;
    }
    if (bracketDepth === 0 && text.substring(i, i + delimiter.length) === delimiter) {
      cells.push(current);
      current = '';
      i += delimiter.length;
      continue;
    }
    current += text[i];
    i++;
  }
  cells.push(current);
  return cells;
}
