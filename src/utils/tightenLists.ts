/**
 * Remove empty lines between list items, so the list renders "tight" (#1271).
 *
 * In CommonMark one empty line anywhere between the items of a list makes the
 * whole list "loose": every item's text is wrapped in a paragraph and the list
 * is spread out. Authors often leave an empty line only to group items in the
 * source — "Antibiotics:" and its sub-items, an empty line, "Antitoxin
 * therapy:" — and get a spaced-out list they did not ask for. The list's
 * STRUCTURE does not depend on those lines (an empty line between items never
 * ends the list), so removing them changes the spacing and nothing else.
 *
 * Deliberately narrow:
 *   - only an empty line whose next non-empty line is an item of the same list;
 *   - a list is skipped entirely when any item has a real second paragraph (an
 *     empty line followed by indented text that is not an item): there the
 *     empty line is meaning, and removing the others would change nothing;
 *   - a list is also skipped when an item's text runs onto a second line.
 *     showdown turns that line into a `<br>` only in a loose list, and joins it
 *     into one line in a tight one, so tightening would lose the break until
 *     the converter swap (#1273). markdown-it keeps it either way.
 *   - never inside a fenced code block (the MarkupParser Step 0 rule, #1335);
 *   - a list ends at text back at the left margin, a heading, a thematic break
 *     or a fence.
 *
 * Pure and idempotent. Line endings are preserved.
 *
 * @module utils/tightenLists
 */

export interface TightenResult {
  content: string;
  /** How many empty lines were removed. */
  changed: number;
  /** 1-based line numbers (in the input) that were removed, in order. */
  lines: number[];
}

const OPEN_FENCE = /^([ \t]*)(`{3,})[ \t]*[^\s`]*[^`]*$/;
const THEMATIC_BREAK = /^ {0,3}([*_-])([ \t]*\1){2,}[ \t]*$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+[^ \t]/;
const BLANK = /^[ \t]*$/;

export function tightenLists(markdown: string): TightenResult {
  const parts = markdown.split('\n');
  const bare = (i: number): string => parts[i].replace(/\r$/, '');
  const remove = new Set<number>();

  let i = 0;
  while (i < parts.length) {
    const line = bare(i);
    const open = OPEN_FENCE.exec(line);
    if (open) {
      const close = new RegExp(`^[ \\t]{0,${Math.max(3, open[1].length)}}${open[2]}\\s*$`);
      i++;
      while (i < parts.length && !close.test(bare(i))) i++;
      i++;
      continue;
    }
    const first = ITEM.exec(line);
    if (!first || first[1].length > 3) { i++; continue; }

    // A list span: items, indented continuation lines, and empty lines that
    // lead to more of the same list.
    const candidates: number[] = [];
    let hasParagraph = false;
    let hasMultilineItem = false;
    let j = i + 1;
    while (j < parts.length) {
      const l = bare(j);
      if (OPEN_FENCE.test(l) || THEMATIC_BREAK.test(l) || /^ {0,3}#{1,6}[ \t]/.test(l)) break;
      if (BLANK.test(l)) {
        let k = j;
        while (k < parts.length && BLANK.test(bare(k))) k++;
        if (k >= parts.length) break;
        const next = bare(k);
        if (OPEN_FENCE.test(next)) break;
        if (ITEM.test(next)) {
          for (let b = j; b < k; b++) candidates.push(b);
          j = k;
          continue;
        }
        if (/^[ \t]+[^ \t]/.test(next)) { hasParagraph = true; j = k; continue; }
        break; // text back at the margin: the list is over
      }
      if (ITEM.test(l)) { j++; continue; }
      // Text directly under an item, with no empty line between, belongs to
      // that item — indented or not (CommonMark's lazy continuation). It is
      // the multi-line item this function must not tighten.
      hasMultilineItem = true;
      j++;
    }
    if (!hasParagraph && !hasMultilineItem) for (const c of candidates) remove.add(c);
    i = j;
  }

  if (!remove.size) return { content: markdown, changed: 0, lines: [] };
  const lines = [...remove].sort((a, b) => a - b);
  return {
    content: parts.filter((_, idx) => !remove.has(idx)).join('\n'),
    changed: lines.length,
    lines: lines.map((n) => n + 1)
  };
}
