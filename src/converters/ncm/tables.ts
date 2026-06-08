/**
 * NCM table up-conversion — GFM pipe tables → JSPWiki styled tables (#728, NCM v2)
 *
 * NCM v1 left tables as passthrough (both GFM pipe tables and JSPWiki `||`/`|`
 * tables rendered independently). NCM v2 makes the rich JSPWiki form the single
 * canonical table: every GFM pipe table found in a normalized body is rewritten
 * to a `||header||` / `|cell|` table wrapped in the configured style blocks
 * (default `%%table-fit %%table-bordered %%table-striped %%table-hover
 * %%sortable`). This gives imported markdown tables fit/border/zebra/hover and
 * client-side sorting for free, via the existing `JSPWikiPreprocessor`.
 *
 * Two invariants the rest of NCM relies on:
 * - **Idempotent.** The output has no GFM separator row (`|---|`), and detection
 *   requires a separator row, so a second pass converts nothing — the body is a
 *   fixed point. JSPWiki tables already in the body are likewise never matched.
 * - **Delimiter shape.** `JSPWikiPreprocessor.parseTableRow` slices off the
 *   first and last cell (the empties around the outer delimiters), so rows MUST
 *   lead AND trail with their delimiter: `||a||b||c||` for headers, `|a|b|c|`
 *   for data. Omitting the trailing delimiter silently drops the last column.
 *
 * @module converters/ncm/tables
 */

/** The five style classes NCM wraps an up-converted table in by default. */
export const DEFAULT_TABLE_CLASSES: string[] = [
  'table-fit',
  'table-bordered',
  'table-striped',
  'table-hover',
  'sortable'
];

/** Opening/closing fence markers for code blocks (``` or ~~~). */
const FENCE_RE = /^\s*(```|~~~)/;

/** A line that contains at least one (unescaped) pipe is a candidate table row. */
function hasPipe(line: string): boolean {
  return /(?<!\\)\|/.test(line);
}

/**
 * Split a pipe-table line into trimmed cells, dropping the empty cells produced
 * by leading/trailing outer pipes. Handles loose tables (no outer pipes) and
 * backslash-escaped pipes (`\|`) inside a cell.
 */
function splitPipeCells(line: string): string[] {
  const parts = line.trim().split(/(?<!\\)\|/);
  if (parts.length && parts[0].trim() === '') parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map(p => p.replace(/\\\|/g, '|').trim());
}

/** A GFM separator/alignment row: every cell is `:?-+:?` (e.g. `---`, `:--:`, `--:`). */
function isSeparatorRow(line: string): boolean {
  if (!hasPipe(line)) return false;
  const cells = splitPipeCells(line);
  if (cells.length === 0) return false;
  return cells.every(c => /^:?-+:?$/.test(c));
}

/** Build the JSPWiki rows (header `||…||`, data `|…|`) for one table block. */
function buildJspwikiTable(headerCells: string[], bodyRows: string[][], classes: string[]): string[] {
  const out: string[] = [];
  for (const cls of classes) out.push(`%%${cls}`);
  out.push(`||${headerCells.join('||')}||`);
  for (const row of bodyRows) out.push(`|${row.join('|')}|`);
  for (let i = 0; i < classes.length; i++) out.push('/%');
  return out;
}

/**
 * Up-convert every GFM pipe table in a Markdown body to the JSPWiki styled form.
 *
 * @param body    Markdown body (no frontmatter)
 * @param classes Style classes to wrap each table in (default {@link DEFAULT_TABLE_CLASSES}).
 *                Pass `[]` to convert the table syntax without any style wrapper.
 * @returns The rewritten body and the count of tables converted.
 */
export function upconvertPipeTables(
  body: string,
  classes: string[] = DEFAULT_TABLE_CLASSES
): { body: string; converted: number } {
  const lines = body.split('\n');
  const out: string[] = [];
  let converted = 0;
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Pass fenced code blocks through untouched.
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line);
      i++;
      continue;
    }

    // A table starts at a pipe row immediately followed by a separator row.
    if (!inFence && hasPipe(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headerCells = splitPipeCells(line);
      const bodyRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && hasPipe(lines[j]) && !isSeparatorRow(lines[j])) {
        bodyRows.push(splitPipeCells(lines[j]));
        j++;
      }
      out.push(...buildJspwikiTable(headerCells, bodyRows, classes));
      converted++;
      i = j;
      continue;
    }

    out.push(line);
    i++;
  }

  return { body: out.join('\n'), converted };
}
