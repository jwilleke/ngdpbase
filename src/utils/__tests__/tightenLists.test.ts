/**
 * #1271 — empty lines between list items are removed, so lists render tight.
 */
import { describe, it, expect } from 'vitest';
import { tightenLists } from '../tightenLists.js';

describe('tightenLists', () => {
  it('removes the empty lines between groups (the Anthrax "Medical Treatment" shape)', () => {
    const md = 'Therapy:\n\n- Antibiotics:\n  - Cipro\n  - Penicillin\n\n- Antitoxin:\n  - Raxibacumab\n\nAfter the list.';
    const r = tightenLists(md);
    expect(r.content).toBe('Therapy:\n\n- Antibiotics:\n  - Cipro\n  - Penicillin\n- Antitoxin:\n  - Raxibacumab\n\nAfter the list.');
    expect(r.lines).toEqual([6]);
  });

  it('removes empty lines between sibling items and before a sub-list', () => {
    expect(tightenLists('- a\n\n- b\n\n  - b1').content).toBe('- a\n- b\n  - b1');
  });

  it('keeps the empty lines that separate the list from text before and after it', () => {
    const md = 'Intro\n\n- a\n- b\n\nOutro';
    expect(tightenLists(md).changed).toBe(0);
  });

  it('leaves a list alone when an item has a real second paragraph', () => {
    const md = '- a\n\n  second paragraph of a\n\n- b';
    expect(tightenLists(md).changed).toBe(0);
  });

  // Naturalization: showdown shows a two-line item as a <br> only while the
  // list is loose; tightening would join the lines until the converter swap.
  it('leaves a list alone when an item\'s text runs onto a second line', () => {
    expect(tightenLists('- USCIS Fees:\nForm N-400:\n  - $710\n\n- Other').changed).toBe(0);
    expect(tightenLists('- USCIS Fees:\n  Form N-400:\n\n- Other').changed).toBe(0);
  });

  it('never touches fenced code', () => {
    const md = '```\n- a\n\n- b\n```\n- c\n\n- d';
    const r = tightenLists(md);
    expect(r.content).toBe('```\n- a\n\n- b\n```\n- c\n- d');
  });

  it('stops at a heading', () => {
    expect(tightenLists('- a\n\n## Next\n\n- b').changed).toBe(0);
  });

  it('tightens numbered lists too, and preserves CRLF', () => {
    expect(tightenLists('1. a\r\n\r\n2. b\r\n').content).toBe('1. a\r\n2. b\r\n');
  });

  it('is idempotent', () => {
    const once = tightenLists('- a\n\n- b\n\n  - c').content;
    expect(tightenLists(once).changed).toBe(0);
  });
});
