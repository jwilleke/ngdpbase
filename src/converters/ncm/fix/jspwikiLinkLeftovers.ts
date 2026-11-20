/**
 * Links the JSPWiki import left half-converted (#1492).
 *
 * The import turned `[text|url|target='_blank']` into Markdown by pieces, and
 * on some pages the pieces were left glued together. Today they show as
 * harmless text; once bare web addresses become links (`linkify`, #1492),
 * each would become one long broken link. Three shapes, each unambiguous:
 *
 *   - `url(url)`, the same address twice, becomes `url`;
 *   - `url(url|target='_blank')`, the same address twice, becomes `url`;
 *   - `](url|target='_blank')`, a Markdown link whose destination kept the
 *     JSPWiki attribute, becomes `](url)` — every external link opens in a new
 *     tab anyway (#1492).
 *
 * Deliberately narrow:
 *   - two different addresses in `url(other)` are left alone;
 *   - a wiki link split over two lines is joined only when the break is at
 *     the pipe (`[Long title` then `|url|target='_blank']`, or `[Long title|`
 *     then `url|target='_blank']`, #2443): the address and its closing `]`
 *     must be on the second line, nothing between the lines, and the first
 *     line must end inside an unclosed `[`. Anything less clear is left alone;
 *   - never inside code, an HTML block or an inline code span.
 *
 * @module converters/ncm/fix/jspwikiLinkLeftovers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

/** An address: no space, and none of the characters the leftovers glue on. */
const URL = String.raw`https?:\/\/[^\s()|\]]+`;
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
    const out = [...map.lines];
    const eols = [...map.eols];
    const keep = out.map(() => true);
    const lines: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const fixed = fixLinkLeftoversInLine(out[i]);
      if (fixed !== out[i]) {
        out[i] = fixed;
        lines.push(i + 1);
      }
      // A wiki link split over two lines: join the second onto the first.
      const next = i + 1;
      if (next >= out.length || map.code[next] || map.html[next]) continue;
      const half = SECOND_HALF.exec(out[next]);
      const first = endsInOpenLink(out[i]);
      if (!half || !first.open || first.pipe === Boolean(half[1])) continue;
      out[i] = out[i].replace(/\s+$/, '') + out[next].replace(/^\s+/, '');
      eols[i] = eols[next];
      keep[next] = false;
      if (lines[lines.length - 1] !== i + 1) lines.push(i + 1);
      lines.push(next + 1);
      i = next;
    }
    if (!lines.length) return { content: body, lines };
    const kept = out.filter((_l, n) => keep[n]);
    const keptEols = eols.filter((_e, n) => keep[n]);
    return { content: joinLines(kept, keptEols), lines };
  }
};
