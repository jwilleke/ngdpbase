/**
 * Bullet markers → the house style, `- ` (#1271 decision S1).
 *
 * CommonMark accepts `*`, `+` and `-` as bullet markers, and starts a NEW list
 * whenever the marker changes. Imported JSPWiki pages use `* item`; pages
 * written here use `- item`; mixing them on one page reads inconsistently in
 * the source and splits lists that were meant to be one. This rewrites every
 * bullet marker the parser sees to `-`, keeping its indent and spacing, so
 * nothing moves.
 *
 * Because the parser decides what is a list item, a thematic break (`* * *`),
 * emphasis (`*italic*`), indented code and fenced code are never touched, and
 * a bullet inside a block quote (`> * item`) is. The result is parsed again:
 * a new marker merges lists that differed only by marker, but must never add,
 * drop or re-nest an item (`* - -` would become a thematic break), and if it
 * does, nothing is changed.
 *
 * @module converters/ncm/fix/bulletMarkers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines, markerColumns, type BlockMap } from './blocks.js';

/** Each item's line and depth: what a marker change must leave alone. */
function itemPlaces(map: BlockMap): string {
  return map.items.map((i) => `${i.line}:${i.depth}`).join(' ');
}

export const bulletMarkers: FixStep = {
  id: 'bullet-markers',
  summary: 'Every bullet now starts with "-"',
  apply(body) {
    if (!/^[ \t>*+\-.)\d]*[*+](?:[ \t]|$)/m.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const changed = new Set<number>();
    for (const item of map.items) {
      if (item.markup !== '*' && item.markup !== '+') continue;
      if (map.code[item.line]) continue;
      const col = markerColumns(map.lines[item.line])[item.orderOnLine];
      if (col === undefined || map.lines[item.line][col] !== item.markup) continue;
      const line = out[item.line];
      out[item.line] = `${line.slice(0, col)}-${line.slice(col + 1)}`;
      changed.add(item.line + 1);
    }
    if (!changed.size) return { content: body, lines: [] };
    const content = joinLines(out, map.eols);
    if (itemPlaces(map) !== itemPlaces(buildBlockMap(content))) return { content: body, lines: [] };
    return { content, lines: [...changed].sort((a, b) => a - b) };
  }
};
