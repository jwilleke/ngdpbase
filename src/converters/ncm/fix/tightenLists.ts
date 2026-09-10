/**
 * Remove empty lines between list items, so the list renders "tight" (#1271).
 * Convert only.
 *
 * In CommonMark one empty line anywhere between the items of a list makes the
 * whole list "loose": every item's text is wrapped in a paragraph and the list
 * is spread out. Authors often leave an empty line only to group items in the
 * source — "Antibiotics:" and its sub-items, an empty line, "Antitoxin
 * therapy:" — and get a spaced-out list they did not ask for. An empty line
 * between two items of one list never ends the list, so removing it changes
 * the spacing and nothing else.
 *
 * Works on each top-level list together with the lists nested in it, and
 * deliberately narrow:
 *   - only an empty line whose next non-empty line starts an item of the same
 *     top-level list;
 *   - the list is skipped when any item has a real second block after an
 *     empty line (a second paragraph, a code block): there the empty line is
 *     meaning, and the list stays loose whatever else is removed;
 *   - the list is also skipped when an item's text runs onto a second line.
 *     showdown turns that line into a `<br>` only in a loose list and joins it
 *     into one line in a tight one, so tightening would lose the break until
 *     the converter swap (#1273). markdown-it keeps it either way.
 *
 * The result is parsed again; if the list items are not exactly the ones
 * before, nothing is changed.
 *
 * @module converters/ncm/fix/tightenLists
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank, joinLines, type BlockMap, type ListInfo } from './blocks.js';

export const tightenLists: FixStep = {
  id: 'tighten-lists',
  summary: 'Empty lines between list items were removed',
  safeOnSave: false,
  apply(body) {
    const map = buildBlockMap(body);
    const remove = new Set<number>();

    const outers = map.lists.filter((l) => l.depth === 0);
    for (const outer of outers) {
      if (skipList(map, outer)) continue;
      const starts = new Set(map.items.filter((i) => i.list.outer === outer).map((i) => i.line));
      for (let l = outer.start; l < outer.end; l++) {
        if (!isBlank(map.lines[l]) || map.code[l]) continue;
        let k = l;
        while (k < outer.end && isBlank(map.lines[k])) k++;
        if (starts.has(k)) for (let b = l; b < k; b++) remove.add(b);
        l = k - 1;
      }
    }
    if (!remove.size) return { content: body, lines: [] };

    const keep = (_: string, idx: number): boolean => !remove.has(idx);
    const content = joinLines(map.lines.filter(keep), map.eols.filter(keep));
    // Safety net: removing an empty line between items must never add, drop
    // or move an item. Line numbers shift, so compare items by depth, marker
    // and their list's position among the other lists.
    if (itemShape(map) !== itemShape(buildBlockMap(content))) return { content: body, lines: [] };
    return { content, lines: [...remove].sort((a, b) => a - b).map((n) => n + 1) };
  }
};

/** Every item's depth, marker and top-level list, as a comparable string. */
function itemShape(map: BlockMap): string {
  const outerIndex = new Map(map.lists.filter((l) => l.depth === 0).map((l, n) => [l, n]));
  return map.items.map((i) => `${i.depth}${i.markup}${outerIndex.get(i.list.outer)}`).join(' ');
}

function skipList(map: BlockMap, outer: ListInfo): boolean {
  for (const item of map.items) {
    if (item.list.outer !== outer) continue;
    for (let n = 0; n < item.blocks.length; n++) {
      const block = item.blocks[n];
      // A paragraph running onto a second line: the showdown <br> case.
      if (block.type === 'paragraph_open' && block.end - block.start > 1) return true;
      // A second block, other than a nested list, after an empty line.
      if (n > 0 && !block.type.endsWith('_list_open') && block.start > 0 && isBlank(map.lines[block.start - 1])) return true;
    }
  }
  return false;
}
