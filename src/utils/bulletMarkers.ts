/**
 * Bullet markers → the house style, `- ` (#1271 decision S1).
 *
 * CommonMark accepts `*`, `+` and `-` as bullet markers, and starts a NEW list
 * whenever the marker changes. Imported JSPWiki pages use `* item`; pages
 * written here use `- item`; mixing them on one page — as the `**` migration
 * left 607 pages, `* parent` over `  - child` — reads inconsistently in the
 * source and splits lists that were meant to be one. This rewrites every
 * bullet marker to `-`, keeping its indent and spacing, so nothing moves.
 *
 * What counts as a bullet, and what is left alone:
 *   - a line whose first non-space characters are `*` or `+` followed by
 *     whitespace and text;
 *   - never inside a fenced code block (the MarkupParser Step 0 rule, #1335);
 *   - never a thematic break (`* * *`, `***`);
 *   - never emphasis: `**bold**` and `*italic*` have no space after the marker;
 *   - a line indented four or more spaces is only a bullet when it continues a
 *     list; outside one, CommonMark reads it as an indented code block, so it
 *     is left alone.
 *
 * Pure and idempotent. Line endings are preserved.
 *
 * @module utils/bulletMarkers
 */

export interface BulletMarkerResult {
  content: string;
  changed: number;
  /** 1-based line numbers rewritten, in order. */
  lines: number[];
}

const OPEN_FENCE = /^([ \t]*)(`{3,})[ \t]*[^\s`]*[^`]*$/;
const THEMATIC_BREAK = /^ {0,3}([*_-])([ \t]*\1){2,}[ \t]*$/;
// `[^ \t]`, not `\S`: in JavaScript `\S` rejects a no-break space, so an item
// whose text begins with one was skipped — and the single `*` left behind
// split the list once its neighbours became `-`.
const LIST_ITEM = /^( *)([*+-]|\d{1,9}[.)])[ \t]+[^ \t]/;
const STAR_OR_PLUS = /^( *)[*+]([ \t]+[^ \t].*)$/;

export function normalizeBulletMarkers(markdown: string): BulletMarkerResult {
  const parts = markdown.split('\n');
  const lines: number[] = [];
  let closeFence: RegExp | null = null;
  let inList = false;

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    const cr = raw.endsWith('\r') ? '\r' : '';
    const line = cr ? raw.slice(0, -1) : raw;

    if (closeFence) {
      if (closeFence.test(line)) closeFence = null;
      continue;
    }
    const open = OPEN_FENCE.exec(line);
    if (open) {
      closeFence = new RegExp(`^[ \\t]{0,${Math.max(3, open[1].length)}}${open[2]}\\s*$`);
      continue;
    }
    if (/^[ \t]*$/.test(line)) continue; // a blank line does not end a list by itself
    if (THEMATIC_BREAK.test(line)) { inList = false; continue; }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const indent = item[1].length;
      if (indent > 3 && !inList) continue; // indented code, not a list
      inList = true;
      const m = STAR_OR_PLUS.exec(line);
      if (m) {
        parts[i] = `${m[1]}-${m[2]}${cr}`;
        lines.push(i + 1);
      }
      continue;
    }
    // Text: an indented line continues the item above; anything at the left
    // margin ends the list.
    if (!/^[ \t]/.test(line)) inList = false;
  }

  return { content: lines.length ? parts.join('\n') : markdown, changed: lines.length, lines };
}
