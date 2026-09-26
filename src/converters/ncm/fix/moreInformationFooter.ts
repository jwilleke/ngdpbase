/**
 * The JSPWiki "More Information" footer is removed (#1348).
 *
 * A convention from the JSPWiki years, for want of a Referring Pages tab:
 *
 *     ## More Information
 *     There might be more information for this subject on one of the following:
 *     [{ReferringPagesPlugin before='*' after='\n' }]
 *
 * The page's Referring Pages tab now shows the same list, so the section goes
 * (operator, 2026-09-12). The section is the heading and everything up to
 * the next heading of the same or a higher level, or the end of the page.
 *
 * Deliberately narrow: the section is removed only when every line in it is
 * one of the footer's own lines, in the variants stored pages carry — the
 * sentence (also cut short, or with the plugin on the same line), "Pages
 * that reference this topic:", and the plugin call (also missing its closing
 * `]`). A section with anything else under the heading ("See also: …") is
 * left for review. A ReferringPagesPlugin call without the heading is valid
 * NCM and is left alone. Never a heading the renderer treats as code or HTML.
 *
 * @module converters/ncm/fix/moreInformationFooter
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank, joinLines } from './blocks.js';

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t#]*$/;
const MORE_INFORMATION = /^more information:?$/i;
const PLUGIN = String.raw`\[\{ReferringPagesPlugin\b[^}]*\}\]?`;
const FOOTER_LINES = [
  new RegExp(String.raw`^There might be more information for this subject\b[^\[]*(?:${PLUGIN})?$`, 'i'),
  /^Pages that reference this topic:?$/i,
  new RegExp(`^${PLUGIN}$`, 'i')
];

function headingLevel(line: string): number {
  const m = HEADING.exec(line);
  return m ? m[1].length : 0;
}

export const moreInformationFooter: FixStep = {
  id: 'more-information-footer',
  summary: 'The "More Information" footer was removed; the Referring Pages tab lists the same pages',
  apply(body) {
    if (!/more information/i.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const src = map.lines;
    const remove = new Set<number>();

    for (let i = 0; i < src.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const m = HEADING.exec(src[i]);
      if (!m || !MORE_INFORMATION.test(m[2].trim())) continue;
      const level = m[1].length;
      let end = i + 1;
      while (end < src.length && !(headingLevel(src[end]) && headingLevel(src[end]) <= level && !map.code[end])) end++;
      const content = src.slice(i + 1, end);
      if (!content.every((l) => isBlank(l) || FOOTER_LINES.some((re) => re.test(l.trim())))) continue;
      for (let k = i; k < end; k++) remove.add(k);
      // At the end of the page, the blank lines before the heading go too.
      if (end === src.length) for (let k = i - 1; k >= 0 && isBlank(src[k]); k--) remove.add(k);
      i = end - 1;
    }

    // A page that ended with a newline still does: its empty last line stays.
    if (src.length > 1 && src[src.length - 1] === '') remove.delete(src.length - 1);
    if (!remove.size) return { content: body, lines: [] };
    const keptLines: string[] = [];
    const keptEols: string[] = [];
    src.forEach((line, k) => {
      if (remove.has(k)) return;
      keptLines.push(line);
      keptEols.push(map.eols[k]);
    });
    return { content: joinLines(keptLines, keptEols), lines: [...remove].sort((a, b) => a - b).map((k) => k + 1) };
  }
};
