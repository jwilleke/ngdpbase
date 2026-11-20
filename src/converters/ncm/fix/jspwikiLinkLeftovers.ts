/**
 * Links the JSPWiki import left half-converted (#1492).
 *
 * The import turned `[text|url|target='_blank']` into Markdown by pieces, and
 * on some pages the pieces were left glued together. Now that a bare web
 * address renders as a link (#2443), each would show as one long broken link.
 * Four shapes, each unambiguous:
 *
 *   - `url(url)`, the same address twice, becomes `url`;
 *   - `url(url|target='_blank')`, the same address twice, becomes `url`;
 *   - `](url|target='_blank')`, a Markdown link whose destination kept the
 *     JSPWiki attribute, becomes `](url)` — every external link opens in a new
 *     tab anyway (#1492);
 *   - a wiki link split over two lines is joined back onto one (#2443, below).
 *
 * Deliberately narrow:
 *   - two different addresses in `url(other)` are left alone;
 *   - a split link is joined only when the break is at
 *     the pipe (`[Long title` then `|url|target='_blank']`, or `[Long title|`
 *     then `url|target='_blank']`, #2443): the address and its closing `]`
 *     must be on the second line, nothing between the lines, and the first
 *     line must end inside an unclosed `[`. Anything less clear is left alone;
 *   - never inside code, an HTML block or an inline code span;
 *   - a line longer than {@link MAX_LINE} characters is left as it is, and an
 *     address is matched up to {@link MAX_URL} characters, so the cost of a
 *     page grows with its size, not with the square of one line;
 *   - a join may not make a line longer than {@link MAX_LINE} characters or
 *     take more than {@link MAX_JOINS} lines; a longer run is left as it is.
 *
 * One run does everything: a line is repaired for the leftovers above before
 * it is tested for a join, and a line made by a join is looked at again, so a
 * second run changes nothing.
 *
 * @module converters/ncm/fix/jspwikiLinkLeftovers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

/** Longest address the step matches, longest line it reads or makes, and most lines it joins into one. */
const MAX_URL = 2048;
const MAX_LINE = 10000;
const MAX_JOINS = 20;

/** An address: no space, and none of the characters the leftovers glue on. */
const URL = String.raw`https?:\/\/[^\s()|\]]{1,${MAX_URL}}`;
const TARGET_BLANK = String.raw`\|target=(?:'_blank'|"_blank")`;

const DOUBLED = new RegExp(`(${URL})\\((${URL})(?:${TARGET_BLANK})?\\)`, 'g');
const DESTINATION_WITH_TARGET = new RegExp(`\\]\\((${URL})${TARGET_BLANK}\\)`, 'g');

/** Rewrite one stretch of text that is not inside a code span. */
function fixText(text: string): string {
  return text
    .replace(DOUBLED, (whole: string, first: string, second: string) => (first === second ? first : whole))
    .replace(DESTINATION_WITH_TARGET, (_whole: string, url: string) => `](${url})`);
}

/** Apply {@link fixText} to a line, leaving its code spans as written. */
export function fixLinkLeftoversInLine(line: string): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf('`', i);
    if (tick === -1) {
      out += fixText(line.slice(i));
      break;
    }
    out += fixText(line.slice(i, tick));
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

/** Text of a line outside its code spans, with each span blanked to spaces. */
function withoutCodeSpans(line: string): string {
  return line.replace(/(`+)(?:(?!\1).)*?\1/g, (m: string) => ' '.repeat(m.length));
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
        // MAX_JOINS lines: a longer run is left exactly as it is.
        let joined = text;
        let last = i;
        let tooLong = false;
        while (last + 1 < map.lines.length && editable(last + 1)) {
          const next = fixLinkLeftoversInLine(map.lines[last + 1]);
          const half = SECOND_HALF.exec(next);
          const first = endsInOpenLink(joined);
          if (!half || !first.open || first.pipe === Boolean(half[1])) break;
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
            const own = fixLinkLeftoversInLine(map.lines[n]);
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
        const fixed = fixLinkLeftoversInLine(text);
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
