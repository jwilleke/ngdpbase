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
 *   - a wiki link split over two lines (`[Long title` then
 *     `|url|target='_blank']`) is left alone: which line it belongs to needs a
 *     reader;
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

export const jspwikiLinkLeftovers: FixStep = {
  id: 'jspwiki-link-leftovers',
  summary: 'Links the JSPWiki import left half-converted became plain links',
  apply(body) {
    if (!/https?:\/\//.test(body) || !/\(https?:\/\/|\|target=/.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const lines: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const fixed = fixLinkLeftoversInLine(out[i]);
      if (fixed === out[i]) continue;
      out[i] = fixed;
      lines.push(i + 1);
    }
    return { content: lines.length ? joinLines(out, map.eols) : body, lines };
  }
};
