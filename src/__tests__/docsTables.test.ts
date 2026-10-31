/**
 * Markdown tables in docs/ stay whole (#2120). A blank line inside a table
 * cuts the rows after it off: they render as a line of pipes, and
 * markdownlint does not see it, since an orphaned row is a valid paragraph.
 * ImportManager.md's "Core shims and receivers" table lost its export row
 * that way. A row that starts a table must be followed by its separator.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = path.join(ROOT, 'docs');

/** Each table row that follows a blank line but is not a table's header: `file:line`. */
function orphanedTableRows(file: string, text: string): string[] {
  const lines = text.split('\n');
  const found: string[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced || !line.startsWith('|')) return;
    const startsBlock = i === 0 || lines[i - 1].trim() === '';
    const isHeader = /^\s{0,3}\|?\s*:?-{3,}/.test(lines[i + 1] ?? '');
    if (startsBlock && !isHeader) found.push(`${file}:${i + 1}`);
  });
  return found;
}

describe('docs: no table is cut by a blank line', () => {
  test('the check finds a row cut off its table', () => {
    const cut = '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| 3 | 4 |\n';
    expect(orphanedTableRows('x.md', cut)).toEqual(['x.md:5']);
    expect(orphanedTableRows('x.md', cut.replace('\n\n', '\n'))).toEqual([]);
  });

  test('every markdown file under docs/', () => {
    const files = (fs.readdirSync(DOCS, { recursive: true }) as string[]).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThan(0);
    const found = files.flatMap(f => orphanedTableRows(path.join('docs', f), fs.readFileSync(path.join(DOCS, f), 'utf8')));
    expect(found).toEqual([]);
  });
});
