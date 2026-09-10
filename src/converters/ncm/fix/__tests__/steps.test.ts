/**
 * #1332 — the fix steps, one describe per step, and the registry.
 */
import { describe, it, expect } from 'vitest';
import { jspwikiBullets } from '../jspwikiBullets.js';
import { bulletMarkers } from '../bulletMarkers.js';
import { tightenLists } from '../tightenLists.js';
import { FIX_STEPS, runFixes, selectFixSteps } from '../index.js';

describe('jspwiki-bullets (#1325)', () => {
  const apply = (md: string) => jspwikiBullets.apply(md);

  it('nests ** and *** under the * parent, 2 spaces per level', () => {
    const r = apply('* Laboratory tests:\n** Skin testing\n** Blood tests\n*** CBC');
    expect(r.content).toBe('* Laboratory tests:\n  - Skin testing\n  - Blood tests\n    - CBC');
    expect(r.lines).toEqual([2, 3, 4]);
  });

  it('leaves single-star bullets alone — they are valid CommonMark', () => {
    const md = '* one\n* two';
    expect(apply(md)).toEqual({ content: md, lines: [] });
  });

  it('leaves bold at the start of a line alone', () => {
    expect(apply('**Note:** this is bold, not a bullet').lines).toEqual([]);
  });

  it('never touches a fenced code block, indented or not', () => {
    const md = '```\n** not a bullet\n```\n- item\n\n  ```text\n  ** still code\n  ```\n** real bullet';
    const r = apply(md);
    expect(r.lines).toEqual([9]);
    expect(r.content).toContain('** not a bullet');
    expect(r.content).toContain('  ** still code');
    expect(r.content.endsWith('  - real bullet')).toBe(true);
  });

  it('keeps an example fence inside a column-0 block as the block\'s content', () => {
    const md = '```markdown\n    ```\n    ** inside\n    ```\n```\n** after';
    expect(apply(md).lines).toEqual([6]);
  });

  it('leaves an HTML block alone', () => {
    expect(apply('<div>\n** inside\n</div>\n\n** after').lines).toEqual([5]);
  });

  it('converts a ** item whose text starts with a no-break space', () => {
    expect(apply('* a\n** \u00a0b').content).toBe('* a\n  - \u00a0b');
  });

  it('preserves CRLF line endings', () => {
    expect(apply('* a\r\n** b\r\n').content).toBe('* a\r\n  - b\r\n');
  });

  it('is idempotent', () => {
    const once = apply('* a\n** b\n*** c').content;
    expect(apply(once).lines).toEqual([]);
  });
});

describe('bullet-markers (S1)', () => {
  const apply = (md: string) => bulletMarkers.apply(md);

  it('rewrites * and + bullets to -, keeping indent and spacing', () => {
    const r = apply('* a\n  + b\n*   c');
    expect(r.content).toBe('- a\n  - b\n-   c');
    expect(r.lines).toEqual([1, 2, 3]);
  });

  it('merges a list that was split only by a marker change', () => {
    expect(apply('* a\n- b').content).toBe('- a\n- b');
  });

  it('leaves thematic breaks, emphasis and ordered lists alone', () => {
    const md = '* * *\n\n***\n\n*italic* text\n\n1. one\n2) two';
    expect(apply(md)).toEqual({ content: md, lines: [] });
  });

  it('leaves indented code alone, but not a deep item inside a list', () => {
    expect(apply('Text\n\n    * code').lines).toEqual([]);
    expect(apply('- a\n  - b\n    * c').content).toBe('- a\n  - b\n    - c');
  });

  it('leaves fenced code and HTML blocks alone', () => {
    const md = '```\n* code\n```\n\n<ul>\n* not a list item\n</ul>';
    expect(apply(md).lines).toEqual([]);
  });

  it('rewrites a bullet inside a block quote, and a nested one on the same line', () => {
    expect(apply('> * q').content).toBe('> - q');
    expect(apply('- * a').content).toBe('- - a');
  });

  it('converts an item whose text starts with a no-break space', () => {
    expect(apply('- a\n* \u00a0b').content).toBe('- a\n- \u00a0b');
  });

  it('changes nothing when the new marker would change the items', () => {
    // `- - -` is a thematic break, not three nested items.
    expect(apply('* - -').lines).toEqual([]);
  });

  it('preserves CRLF and is idempotent', () => {
    const r = apply('* a\r\n* b\r\n');
    expect(r.content).toBe('- a\r\n- b\r\n');
    expect(apply(r.content).lines).toEqual([]);
  });
});

describe('tighten-lists', () => {
  const apply = (md: string) => tightenLists.apply(md);

  it('removes the empty lines between groups (the Anthrax "Medical Treatment" shape)', () => {
    const md = 'Therapy:\n\n- Antibiotics:\n  - Cipro\n  - Penicillin\n\n- Antitoxin:\n  - Raxibacumab\n\nAfter the list.';
    const r = apply(md);
    expect(r.content).toBe('Therapy:\n\n- Antibiotics:\n  - Cipro\n  - Penicillin\n- Antitoxin:\n  - Raxibacumab\n\nAfter the list.');
    expect(r.lines).toEqual([6]);
  });

  it('removes empty lines between sibling items and before a sub-list', () => {
    expect(apply('- a\n\n- b\n\n  - b1').content).toBe('- a\n- b\n  - b1');
  });

  it('keeps the empty lines that separate the list from text before and after it', () => {
    expect(apply('Intro\n\n- a\n- b\n\nOutro').lines).toEqual([]);
  });

  it('leaves a list alone when an item has a real second paragraph', () => {
    expect(apply('- a\n\n  second paragraph of a\n\n- b').lines).toEqual([]);
  });

  // Naturalization: showdown shows a two-line item as a <br> only while the
  // list is loose; tightening would join the lines until the converter swap.
  it('leaves a list alone when an item\'s text runs onto a second line', () => {
    expect(apply('- USCIS Fees:\nForm N-400:\n  - $710\n\n- Other').lines).toEqual([]);
    expect(apply('- USCIS Fees:\n  Form N-400:\n\n- Other').lines).toEqual([]);
  });

  it('keeps the empty line between two different lists', () => {
    // Without it, `2. b` would join item a's text as a lazy continuation.
    expect(apply('- a\n\n2. b').lines).toEqual([]);
  });

  it('does not count a paragraph after the list as part of it', () => {
    // One space is less than the item's content column: the list has ended.
    expect(apply('- a\n\n- b\n\n text after').content).toBe('- a\n- b\n\n text after');
  });

  it('tightens around a code block that belongs to an item', () => {
    expect(apply('- a\n  ```\n  code\n\n  more\n  ```\n\n- b').content).toBe('- a\n  ```\n  code\n\n  more\n  ```\n- b');
  });

  it('never touches fenced code', () => {
    expect(apply('```\n- a\n\n- b\n```\n- c\n\n- d').content).toBe('```\n- a\n\n- b\n```\n- c\n- d');
  });

  it('stops at a heading', () => {
    expect(apply('- a\n\n## Next\n\n- b').lines).toEqual([]);
  });

  it('tightens numbered lists too, and preserves CRLF', () => {
    expect(apply('1. a\r\n\r\n2. b\r\n').content).toBe('1. a\r\n2. b\r\n');
  });

  it('is idempotent', () => {
    const once = apply('- a\n\n- b\n\n  - c').content;
    expect(apply(once).lines).toEqual([]);
  });
});

describe('registry', () => {
  it('save mode runs only the steps safe on save', () => {
    expect(selectFixSteps({ mode: 'save' }).map((s) => s.id)).toEqual(['jspwiki-bullets']);
    expect(selectFixSteps({ mode: 'convert' })).toEqual(FIX_STEPS);
  });

  it('picks steps by id, in registry order, and rejects an unknown id', () => {
    expect(selectFixSteps({ steps: ['tighten-lists', 'jspwiki-bullets'] }).map((s) => s.id)).toEqual(['jspwiki-bullets', 'tighten-lists']);
    expect(() => selectFixSteps({ steps: ['nope'] })).toThrow('Unknown fix step: nope');
  });

  it('runs each step on the previous one\'s output and reports only the steps that changed something', () => {
    const r = runFixes('* a\n\n** b\n\n* c');
    expect(r.content).toBe('- a\n  - b\n- c');
    expect(r.changes.map((c) => c.step)).toEqual(['jspwiki-bullets', 'bullet-markers', 'tighten-lists']);
    expect(runFixes(r.content).changes).toEqual([]);
  });

  it('save mode leaves valid Markdown alone', () => {
    const md = '* a\n\n* b';
    expect(runFixes(md, { mode: 'save' })).toEqual({ content: md, changes: [] });
  });

  it('every step is idempotent on a mixed page', () => {
    const page = '# T\n\n* a\n** b\n\n+ c\n\n```\n** code\n```\n\n1. x\n\n2. y\n';
    const once = runFixes(page).content;
    for (const step of FIX_STEPS) expect(step.apply(once).lines).toEqual([]);
  });
});
