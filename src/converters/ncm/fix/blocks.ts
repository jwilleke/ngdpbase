/**
 * Block map of a page body, read from markdown-it's parser (#1332).
 *
 * Every fix step asks the same questions of a page — is this line code? is it
 * inside an HTML block? which lines start a list item, of which list, at what
 * depth? — and each used to answer them with its own line regexes. Those
 * regexes were approximations of CommonMark, and each approximation was wrong
 * in its own way (#1335, the no-break-space `*`, the lazy line that ended a
 * list early). This module answers them once, from the parser that will
 * render the page after the converter swap (#1273), using the source line
 * range markdown-it records on every block token.
 *
 * Code lines are the union of what markdown-it calls code (fences, indented
 * code) and what MarkupParser's Step 0 extracts as a fenced block before any
 * converter runs (#1335: an optionally indented run of three or more
 * backticks, closed by the same run indented no further than the opener or
 * 3 spaces). A step never edits a line either of them treats as code.
 *
 * Lines are split on `\n`; a trailing `\r` is kept out of the text the steps
 * see and put back by {@link joinLines}, so CRLF pages stay CRLF.
 *
 * @module converters/ncm/fix/blocks
 */

import MarkdownIt from 'markdown-it';

type Token = ReturnType<MarkdownIt['parse']>[number];

/** A direct child block of a list item. */
export interface ItemBlock {
  /** Token type of the block's opening token (`paragraph_open`, `fence`, `bullet_list_open`, ...). */
  type: string;
  /** First line (0-based). */
  start: number;
  /** Line after the last (0-based, exclusive). */
  end: number;
}

export interface ListItem {
  /** Line the item's marker is on (0-based). */
  line: number;
  /** Line after the item's last line (0-based, exclusive). May include trailing empty lines. */
  end: number;
  /** The marker character: `-`, `*`, `+`, `.` or `)`. */
  markup: string;
  /** Nesting depth: 0 for an item of a top-level list. */
  depth: number;
  /** Position among the list items that start on the same line, outermost first (`- * a` has two). */
  orderOnLine: number;
  /** Direct child blocks, in order. */
  blocks: ItemBlock[];
  list: ListInfo;
}

export interface ListInfo {
  ordered: boolean;
  /** First line (0-based). */
  start: number;
  /** Line after the last (0-based, exclusive). */
  end: number;
  /** CommonMark tight list: no empty line between its items or their blocks. */
  tight: boolean;
  depth: number;
  items: ListItem[];
  /** The outermost list this one sits in (itself when top-level). */
  outer: ListInfo;
}

export interface BlockMap {
  /** Page lines without their `\r`. */
  lines: string[];
  /** `\r` where the line had one, else ''. */
  eols: string[];
  /** true for a line inside fenced or indented code (markdown-it or Step 0). */
  code: boolean[];
  /** true for a line inside an HTML block. */
  html: boolean[];
  /** Every list, outer lists before the lists nested in them. */
  lists: ListInfo[];
  /** Every list item, in source order. */
  items: ListItem[];
  /** The paragraph blocks' line ranges, in source order. */
  paragraphs: ItemBlock[];
}

let parser: MarkdownIt | null = null;
function getParser(): MarkdownIt {
  // Block structure only: `html: true` because pages may contain HTML blocks,
  // and an HTML block ends a list the same way the renderer sees it.
  parser ??= new MarkdownIt({ html: true });
  return parser;
}

const STEP0_OPEN_FENCE = /^([ \t]*)(`{3,})[ \t]*[^\s`]*[^`]*$/;

/** Mark the lines MarkupParser's Step 0 extracts as fenced code, fences included. */
function markStep0Fences(lines: string[], code: boolean[]): void {
  let i = 0;
  while (i < lines.length) {
    const open = STEP0_OPEN_FENCE.exec(lines[i]);
    if (!open) { i++; continue; }
    const close = new RegExp(`^[ \\t]{0,${Math.max(3, open[1].length)}}${open[2]}\\s*$`);
    code[i++] = true;
    while (i < lines.length && !close.test(lines[i])) code[i++] = true;
    if (i < lines.length) code[i++] = true;
  }
}

export function splitLines(body: string): { lines: string[]; eols: string[] } {
  const parts = body.split('\n');
  return {
    lines: parts.map((p) => (p.endsWith('\r') ? p.slice(0, -1) : p)),
    eols: parts.map((p) => (p.endsWith('\r') ? '\r' : ''))
  };
}

export function joinLines(lines: string[], eols: string[]): string {
  return lines.map((l, i) => l + (eols[i] ?? '')).join('\n');
}

export function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

export function buildBlockMap(body: string): BlockMap {
  const { lines, eols } = splitLines(body);
  // markdown-it turns a lone `\r` into a line break, which would shift every
  // line number after it. A space keeps the line count and the columns.
  const tokens = getParser().parse(lines.join('\n').replace(/\r/g, ' '), {});

  const code = new Array<boolean>(lines.length).fill(false);
  const html = new Array<boolean>(lines.length).fill(false);
  const lists: ListInfo[] = [];
  const items: ListItem[] = [];
  const paragraphs: ItemBlock[] = [];
  const itemsByLine = new Map<number, number>();

  const listStack: ListInfo[] = [];
  // Open items, with the token level of their list_item_open.
  const itemStack: { item: ListItem; level: number }[] = [];

  const mark = (arr: boolean[], t: Token): void => {
    if (!t.map) return;
    for (let l = t.map[0]; l < t.map[1] && l < arr.length; l++) arr[l] = true;
  };

  for (const t of tokens) {
    // A block that opens at the item's own nesting level is a direct child.
    const parent = itemStack[itemStack.length - 1];
    const directChild = parent !== undefined && t.nesting !== -1 && t.level === parent.level + 1;
    if (directChild && t.map) parent.item.blocks.push({ type: t.type, start: t.map[0], end: t.map[1] });

    switch (t.type) {
    case 'fence':
    case 'code_block':
      mark(code, t);
      break;
    case 'html_block':
      mark(html, t);
      break;
    case 'paragraph_open':
      if (t.map) paragraphs.push({ type: t.type, start: t.map[0], end: t.map[1] });
      break;
    case 'bullet_list_open':
    case 'ordered_list_open': {
      const depth = listStack.length;
      const list: ListInfo = {
        ordered: t.type === 'ordered_list_open',
        start: t.map?.[0] ?? 0,
        end: t.map?.[1] ?? 0,
        tight: true,
        depth,
        items: [],
        outer: null as unknown as ListInfo
      };
      list.outer = depth === 0 ? list : listStack[0].outer;
      lists.push(list);
      listStack.push(list);
      break;
    }
    case 'bullet_list_close':
    case 'ordered_list_close':
      listStack.pop();
      break;
    case 'list_item_open': {
      const list = listStack[listStack.length - 1];
      const line = t.map?.[0] ?? 0;
      const orderOnLine = itemsByLine.get(line) ?? 0;
      itemsByLine.set(line, orderOnLine + 1);
      const item: ListItem = {
        line,
        end: t.map?.[1] ?? line + 1,
        markup: t.markup,
        depth: list.depth,
        orderOnLine,
        blocks: [],
        list
      };
      list.items.push(item);
      items.push(item);
      itemStack.push({ item, level: t.level });
      break;
    }
    case 'list_item_close':
      itemStack.pop();
      break;
    }
    // markdown-it marks a tight list by hiding its items' paragraphs.
    if (t.type === 'paragraph_open' && !t.hidden && directChild) parent.item.list.tight = false;
  }

  markStep0Fences(lines, code);
  return { lines, eols, code, html, lists, items, paragraphs };
}

const CONTAINER_MARKER = /^[ \t]*(?:>[ \t]?|([*+-]|\d{1,9}[.)])(?=[ \t]|$))/;

/**
 * Column of each list marker at the start of a line, outermost first:
 * `> - * a` gives the columns of `-` and `*`. Block-quote `>` markers are
 * skipped, not returned. Pair the result with {@link ListItem.orderOnLine}.
 */
export function markerColumns(line: string): number[] {
  const cols: number[] = [];
  let pos = 0;
  for (;;) {
    const m = CONTAINER_MARKER.exec(line.slice(pos));
    if (!m) return cols;
    if (m[1]) cols.push(pos + m[0].length - m[1].length);
    pos += m[0].length;
  }
}
