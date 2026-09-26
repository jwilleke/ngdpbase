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

/**
 * A GFM table's separator row: `|---|:---:|` (#1352). Cells of dashes, each
 * optionally colon-edged for alignment; leading and trailing pipes optional.
 */
export function isGfmSeparatorRow(line: string): boolean {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.length > 0 && cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
}

/**
 * The rows of a table block, with a GFM table read as one (#1352): the row
 * above a separator row is the header, and the separator itself is not a
 * row. Without this a pasted GFM table rendered its `|---|` line as a row of
 * dashes and had no header. A JSPWiki table has no separator row and comes
 * through unchanged.
 */
export function parseTableRows(lines: readonly string[]): JspwikiTableRow[] {
  const rows: JspwikiTableRow[] = [];
  for (const line of lines) {
    if (isGfmSeparatorRow(line)) {
      const header = rows[rows.length - 1];
      if (header) header.isHeader = true;
      continue;
    }
    rows.push(parseJspwikiTableRow(line));
  }
  return rows;
}
