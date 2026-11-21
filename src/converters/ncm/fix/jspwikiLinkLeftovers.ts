/**
 * Links the JSPWiki import left half-converted (#1492).
 *
 * The import turned `[text|url|target='_blank']` into Markdown by pieces, and
 * on some pages the pieces were left glued together. Now that a bare web
 * address renders as a link (#2443), each would show as one long broken link.
 * Each shape is unambiguous:
 *
 *   - `url(url)`, the same address twice, becomes `url`;
 *   - `url(url|target='_blank')`, the same address twice, becomes `url`;
 *   - `](url|target='_blank')`, a Markdown link whose destination kept the
 *     JSPWiki attribute, becomes `](url)` — every external link opens in a new
 *     tab anyway (#1492);
 *   - a wiki link split over two lines is joined back onto one (#2443, below);
 *   - a link that lost its opening `[` (#2451), in the shapes seen on real
 *     pages: `text|url|target='_blank']` at the start of a line (after an
 *     indent, quote, list or heading marker, which stay in front) becomes
 *     `[text](url)`, and the same with no text (` |url|target='_blank']`)
 *     becomes the bare address, which renders as a link; and
 *     `url|Wikipedia:url|target='_blank'` (with or without a closing `]`) with
 *     no brackets at all, the same address twice, becomes `url`.
 *
 * Deliberately narrow:
 *   - two different addresses in `url(other)` are left alone;
 *   - a split link is joined only when the break is at the pipe
 *     (`[Long title` then `|url|target='_blank']`, or `[Long title|` then
 *     `url|target='_blank']`, #2443): the address and its closing `]` must
 *     be on the second line, nothing between the lines, and the first line
 *     must end inside an unclosed `[`. Anything less clear is left alone;
 *   - a lost-bracket repair needs the leftover `|target=` and, for the text
 *     form, the text at the start of the line (after a quote, list or heading
 *     marker) with no bracket in it, which does not start with a quote mark;
 *     a line right after one with an unclosed `[` is left alone, since it may
 *     be the second half of a split link; the `]` after an interwiki copy is
 *     dropped only when no unclosed `[` comes before it on the line;
 *   - never inside code, an HTML block or an inline code span;
 *   - a line longer than {@link MAX_LINE} characters is left as it is, and an
 *     address is matched up to {@link MAX_URL} characters, so the cost of a
 *     page grows with its size, not with the square of one line;
 *   - a join may not make a line longer than {@link MAX_LINE} characters or
 *     take more than {@link MAX_JOINS} continuation lines (the first line and
 *     20 more); a longer run is left as it is.
 *
 * One run does everything: a line is repaired for the leftovers above before
 * it is tested for a join, and a line made by a join is looked at again, so a
 * second run changes nothing.
 *
 * @module converters/ncm/fix/jspwikiLinkLeftovers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

/** Longest address the step matches, longest line it reads or makes, and most continuation lines it joins onto one. */
const MAX_URL = 2048;
const MAX_LINE = 10000;
const MAX_JOINS = 20;

/** An address: no space, and none of the characters the leftovers glue on. */
const URL = String.raw`https?:\/\/[^\s()|\]]{1,${MAX_URL}}`;
const TARGET_BLANK = String.raw`\|target=(?:'_blank'|"_blank")`;

const DOUBLED = new RegExp(`(${URL})\\((${URL})(?:${TARGET_BLANK})?\\)`, 'g');
const DESTINATION_WITH_TARGET = new RegExp(`\\]\\((${URL})${TARGET_BLANK}\\)`, 'g');

/**
 * A link that lost its opening `[` (#2451), at the start of a line after an
 * optional indent, quote mark, list marker or heading marker: `text|url|target='_blank']`,
 * with or without the text. The text holds no bracket, pipe or backtick.
 */
const LOST_BRACKET = new RegExp(`^(\\s*(?:>\\s*)*(?:(?:[-*+]|\\d{1,9}[.)])\\s+)?(?:#{1,6}\\s+)?)((?!>)[^\\s\\[\\]|\`][^\\[\\]|\`]*)?\\|(${URL})${TARGET_BLANK}\\]`);
/** The same address twice, the second behind an interwiki prefix, with no brackets at all (#2451). */
const INTERWIKI_COPY = new RegExp(`(${URL})\\|(?:[A-Za-z][A-Za-z0-9_]*:)?(${URL})${TARGET_BLANK}\\]?`, 'g');

/** Rewrite one stretch of text that is not inside a code span. */
function fixText(text: string, lostBrackets: boolean, atLineStart: boolean): string {
  let out = text
    .replace(DOUBLED, (whole: string, first: string, second: string) => (first === second ? first : whole))
    .replace(DESTINATION_WITH_TARGET, (_whole: string, url: string) => `](${url})`);
  if (!lostBrackets || !out.includes('|target=')) return out;
  if (atLineStart) {
    out = out.replace(LOST_BRACKET, (_whole: string, lead: string, words: string | undefined, url: string) => {
      const label = (words ?? '').trim();
      return label ? `${lead}[${label}](${url})` : `${lead}${url}`;
    });
  }
  return out.replace(INTERWIKI_COPY, (whole: string, first: string, second: string, at: number) => {
    // The address must start the line or follow a space, so a longer word or a link destination is left alone.
    const startsAfterSpace = at === 0 ? atLineStart : /\s/.test(out[at - 1]);
    if (first !== second || !startsAfterSpace) return whole;
    // A closing `]` that belongs to an open `[` before the match stays.
    const before = out.slice(0, at);
    const open = (before.match(/\[/g) ?? []).length > (before.match(/\]/g) ?? []).length;
    return open && whole.endsWith(']') ? `${first}]` : first;
  });
}

/**
 * Apply {@link fixText} to a line, leaving its code spans as written. With
 * `lostBrackets` false, the lost-bracket repairs (#2451) are skipped: the join
 * test needs a second half of a split link as it was written.
 */
export function fixLinkLeftoversInLine(line: string, lostBrackets = true): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf('`', i);
    if (tick === -1) {
      out += fixText(line.slice(i), lostBrackets, i === 0);
      break;
    }
    out += fixText(line.slice(i, tick), lostBrackets, i === 0);
    let run = tick;
    while (line[run] === '`') run++;
    const fence = line.slice(tick, run);
    const close = line.indexOf(fence, run);
    if (close === -1) {
      out += line.slice(tick);
      break;
    }
    out += line.slice(tick, close + fence.length);
    i = close + fence.length;
  }
  return out;
}

/** The second half of a split link: an address and the closing `]`, nothing else. */
const SECOND_HALF = new RegExp(`^\\s*(\\|)?${URL}(?:${TARGET_BLANK})?\\]`);

/**
 * Text of a line outside its code spans, with each span blanked to spaces.
 * Code spans are found as {@link fixLinkLeftoversInLine} finds them: a run of
 * backticks, then the next run of the same length; an unmatched run is plain text.
 */
function withoutCodeSpans(line: string): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf('`', i);
    if (tick === -1) break;
    let run = tick;
    while (line[run] === '`') run++;
    const fence = line.slice(tick, run);
    const close = line.indexOf(fence, run);
    if (close === -1) {
      out += line.slice(i, run);
      i = run;
      continue;
    }
    out += line.slice(i, tick) + ' '.repeat(close + fence.length - tick);
    i = close + fence.length;
  }
  return out + line.slice(i);
}

/** Does a line, outside its code spans, hold more `[` than `]`? */
function hasUnclosedBracket(line: string): boolean {
  if (line.length > MAX_LINE) return false;
  const text = withoutCodeSpans(line);
  return (text.match(/\[/g) ?? []).length > (text.match(/\]/g) ?? []).length;
}

/**
 * Does this line end inside an unclosed `[` that opens a link text? Plugin
 * syntax (`[{`), footnotes (`[^`) and checkboxes (`[ ]`, `[x]`) are not.
 */
function endsInOpenLink(line: string): { open: boolean; pipe: boolean } {
  const text = withoutCodeSpans(line).replace(/\s+$/, '');
  const at = text.lastIndexOf('[');
  if (at === -1 || text.indexOf(']', at) !== -1) return { open: false, pipe: false };
  const rest = text.slice(at + 1);
  if (rest === '' || rest[0] === '{' || rest[0] === '^') return { open: false, pipe: false };
  return { open: true, pipe: rest.endsWith('|') };
}

export const jspwikiLinkLeftovers: FixStep = {
  id: 'jspwiki-link-leftovers',
  summary: 'Links the JSPWiki import left half-converted became plain links',
  apply(body) {
    if (!/https?:\/\//.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out: string[] = [];
    const eols: string[] = [];
    const touched = new Set<number>();
    const editable = (n: number): boolean => !map.code[n] && !map.html[n] && map.lines[n].length <= MAX_LINE;

    for (let i = 0; i < map.lines.length; i++) {
      let text = map.lines[i];
      let eol = map.eols[i];
      const from = [i];
      if (editable(i)) {
        // A wiki link split over two lines: join the next line onto this one,
        // as often as it fits, so `[A|u] [B` + `|u2]` ends as one line. A line
        // is repaired before it is tested, so the answer does not depend on a
        // second run. The joined text may not pass MAX_LINE characters or
        // MAX_JOINS continuation lines: a longer run is left exactly as it is.
        let joined = text;
        let last = i;
        let tooLong = false;
        while (last + 1 < map.lines.length && editable(last + 1)) {
          const next = fixLinkLeftoversInLine(map.lines[last + 1], false);
          const half = SECOND_HALF.exec(next);
          if (!half) break;
          const first = endsInOpenLink(joined);
          if (!first.open || first.pipe === Boolean(half[1])) break;
          if (joined.length + next.length > MAX_LINE || last - i >= MAX_JOINS) {
            tooLong = true;
            break;
          }
          joined = joined.replace(/\s+$/, '') + next.replace(/^\s+/, '');
          last++;
        }
        if (tooLong) {
          // Leave the whole run as it is, so a second run decides the same way.
          let end = last;
          while (
            end + 1 < map.lines.length &&
            editable(end + 1) &&
            SECOND_HALF.test(map.lines[end + 1]) &&
            endsInOpenLink(map.lines[end]).open
          ) end++;
          for (let n = i; n <= end; n++) {
            const own = fixLinkLeftoversInLine(map.lines[n], false);
            if (own !== map.lines[n]) touched.add(n + 1);
            out.push(own);
            eols.push(map.eols[n]);
          }
          i = end;
          continue;
        }
        if (last > i) {
          text = joined;
          eol = map.eols[last];
          for (let n = i + 1; n <= last; n++) from.push(n);
          i = last;
        }
        // After a line with an unclosed `[`, a leftover may be the second half of a link the join refused: leave it.
        const fixed = fixLinkLeftoversInLine(
          text,
          // only a line with a leftover target can need it, so the bracket count is not run on every line
          text.includes('|target=') && (from[0] === 0 || !hasUnclosedBracket(map.lines[from[0] - 1]))
        );
        if (fixed !== text || from.length > 1) from.forEach((n) => touched.add(n + 1));
        text = fixed;
      }
      out.push(text);
      eols.push(eol);
    }
    if (!touched.size) return { content: body, lines: [] };
    return { content: joinLines(out, eols), lines: [...touched].sort((a, b) => a - b) };
  }
};
