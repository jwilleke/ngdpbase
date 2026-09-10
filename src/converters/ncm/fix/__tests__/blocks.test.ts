/**
 * #1332 — the block map the fix steps read.
 */
import { describe, it, expect } from 'vitest';
import { buildBlockMap, markerColumns } from '../blocks.js';

describe('buildBlockMap', () => {
  it('records items with their line, depth, marker and direct blocks', () => {
    const map = buildBlockMap('- a\n\n  para\n- b\n  * c');
    expect(map.items.map((i) => [i.line, i.depth, i.markup])).toEqual([[0, 0, '-'], [3, 0, '-'], [4, 1, '*']]);
    expect(map.items[0].blocks.map((b) => [b.type, b.start, b.end])).toEqual([['paragraph_open', 0, 1], ['paragraph_open', 2, 3]]);
    expect(map.items[1].blocks.map((b) => b.type)).toEqual(['paragraph_open', 'bullet_list_open']);
    expect(map.items[2].list.outer).toBe(map.items[0].list);
  });

  it('knows tight lists from loose ones', () => {
    expect(buildBlockMap('- a\n- b').lists[0].tight).toBe(true);
    expect(buildBlockMap('- a\n\n- b').lists[0].tight).toBe(false);
  });

  it('marks code from markdown-it and from MarkupParser Step 0', () => {
    // An indented fence opened inside a paragraph is not a fence to
    // markdown-it, but Step 0 extracts it — so it is code.
    const map = buildBlockMap('text\n  ```\n  - x\n  ```\n\n    indented code\n\n- item');
    expect(map.code).toEqual([false, true, true, true, false, true, false, false]);
  });

  it('marks HTML blocks', () => {
    expect(buildBlockMap('<div>\n* a\n</div>\n\n* b').html).toEqual([true, true, true, false, false]);
  });

  it('keeps line numbers when the page has CRLF or a lone CR', () => {
    const map = buildBlockMap('x\ry\r\n\r\n* a\r\n');
    expect(map.lines).toEqual(['x\ry', '', '* a', '']);
    expect(map.eols).toEqual(['\r', '\r', '\r', '']);
    expect(map.items[0].line).toBe(2);
  });

  it('counts items that start on the same line, outermost first', () => {
    const map = buildBlockMap('- * a');
    expect(map.items.map((i) => i.orderOnLine)).toEqual([0, 1]);
  });
});

describe('markerColumns', () => {
  it('finds each list marker, skipping block-quote markers', () => {
    expect(markerColumns('- a')).toEqual([0]);
    expect(markerColumns('  > - * a')).toEqual([4, 6]);
    expect(markerColumns('1. - b')).toEqual([0, 3]);
    expect(markerColumns('-')).toEqual([0]);
  });

  it('stops at text', () => {
    expect(markerColumns('-5 degrees')).toEqual([]);
    expect(markerColumns('*bold* - x')).toEqual([]);
  });
});
