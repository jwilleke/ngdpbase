/**
 * JSPWiki `!` headings → Markdown ATX headings (#1342).
 *
 * JSPWiki marks a heading with `!` at the start of a line, and more marks
 * mean a LARGER heading: `!!!` is the largest, `!` the smallest. So `!!!`
 * becomes `#`, `!!` becomes `##` and `!` becomes `###`. Markdown shows a `!`
 * line as literal text.
 *
 * The one place this mapping lives: the JSPWiki file converter calls this
 * step too, so a JSPWiki import and the NCM funnel read a `!` line the same
 * way.
 *
 * Deliberately narrow:
 *   - the `!` must be the first character of the line, as in JSPWiki;
 *   - a Markdown image, `![alt](src)`, is not a heading; `![Main]` (a
 *     heading whose text starts with a link) still is;
 *   - a line with nothing after the marks is left alone;
 *   - never a line the renderer treats as code or HTML.
 *
 * @module converters/ncm/fix/jspwikiHeadings
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

const JSPWIKI_HEADING = /^(!{1,3})[ \t]*(\S.*)$/;
const MARKDOWN_IMAGE = /^!\[[^\]]*\]\(/;

/** The ATX heading for a JSPWiki `!` line, or null when the line is not one. */
export function jspwikiHeadingLine(line: string): string | null {
  if (MARKDOWN_IMAGE.test(line)) return null;
  const m = JSPWIKI_HEADING.exec(line);
  if (!m) return null;
  return `${'#'.repeat(4 - m[1].length)} ${m[2]}`;
}

export const jspwikiHeadings: FixStep = {
  id: 'jspwiki-headings',
  summary: 'JSPWiki ! headings became # headings',
  apply(body) {
    if (!/^!/m.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const lines: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const heading = jspwikiHeadingLine(out[i]);
      if (heading === null) continue;
      out[i] = heading;
      lines.push(i + 1);
    }
    return { content: lines.length ? joinLines(out, map.eols) : body, lines };
  }
};
