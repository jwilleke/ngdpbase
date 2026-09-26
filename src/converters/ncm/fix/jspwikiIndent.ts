/**
 * JSPWiki `;:text` → a plain paragraph (#1342).
 *
 * `;term:definition` is a JSPWiki definition list; with the term left empty,
 * `;:text`, it is the indentation idiom — a continuation line, not a term,
 * a quotation or a list. Markdown shows the `;:` as text. The marker goes and
 * the text stands as its own paragraph (operator decision, 2026-09-26): a
 * blockquote or a bullet would invent structure the author did not write.
 *
 * `;:` is never Markdown, so this runs on every NCM path. A definition with a
 * term (`;term:def`) is not this step's: the JSPWiki converter maps it.
 *
 * Deliberately narrow:
 *   - only a line that starts with `;:`;
 *   - the text keeps what follows the marker (`**img** = …`, `*Comment*`);
 *   - a converted line gets a blank line on each side, so consecutive ones
 *     stay separate paragraphs, as the JSPWiki lines were separate;
 *   - a `;:` with nothing after it is dropped;
 *   - never a line the renderer treats as code or HTML.
 *
 * @module converters/ncm/fix/jspwikiIndent
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank } from './blocks.js';

const INDENT = /^;:[ \t]*(.*)$/;

export const jspwikiIndent: FixStep = {
  id: 'jspwiki-indent',
  summary: 'JSPWiki ;: indented lines became plain paragraphs',
  apply(body) {
    if (!/^;:/m.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const changed: number[] = [];
    const out: string[] = [];
    const eols: string[] = [];
    let afterConverted = false;

    map.lines.forEach((line, i) => {
      const m = !map.code[i] && !map.html[i] ? INDENT.exec(line) : null;
      if (!m) {
        // Text right after a converted line starts its own paragraph.
        if (afterConverted && !isBlank(line)) { out.push(''); eols.push(map.eols[i]); }
        out.push(line); eols.push(map.eols[i]);
        afterConverted = false;
        return;
      }
      changed.push(i + 1);
      afterConverted = false;
      if (!m[1].trim()) return;
      if (out.length && !isBlank(out[out.length - 1])) { out.push(''); eols.push(map.eols[i]); }
      out.push(m[1]); eols.push(map.eols[i]);
      afterConverted = true;
    });
    if (!changed.length) return { content: body, lines: [] };
    return { content: out.map((l, k) => l + (eols[k] ?? '')).join('\n'), lines: changed };
  }
};
