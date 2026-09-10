/**
 * #1325 — JSPWiki `**` bullets become Markdown nested bullets.
 */
import { describe, it, expect } from 'vitest';
import { convertJspwikiBullets } from '../jspwikiBullets.js';

describe('convertJspwikiBullets', () => {
  it('nests ** and *** under the * parent, 2 spaces per level', () => {
    const r = convertJspwikiBullets('* Laboratory tests:\n** Skin testing\n** Blood tests\n*** CBC');
    expect(r.content).toBe('* Laboratory tests:\n  - Skin testing\n  - Blood tests\n    - CBC');
    expect(r.changed).toBe(3);
    expect(r.lines).toEqual([2, 3, 4]);
  });

  it('leaves single-star bullets alone — they are valid CommonMark', () => {
    const md = '* one\n* two';
    expect(convertJspwikiBullets(md)).toEqual({ content: md, changed: 0, lines: [] });
  });

  it('leaves bold at the start of a line alone', () => {
    const md = '**Note:** this is bold, not a bullet';
    expect(convertJspwikiBullets(md).changed).toBe(0);
  });

  it('never touches a fenced code block, indented or not', () => {
    const md = '```\n** not a bullet\n```\n- item\n\n  ```text\n  ** still code\n  ```\n** real bullet';
    const r = convertJspwikiBullets(md);
    expect(r.lines).toEqual([9]);
    expect(r.content).toContain('** not a bullet');
    expect(r.content).toContain('  ** still code');
    expect(r.content.endsWith('  - real bullet')).toBe(true);
  });

  it('keeps an example fence inside a column-0 block as the block\'s content', () => {
    const md = '```markdown\n    ```\n    ** inside\n    ```\n```\n** after';
    expect(convertJspwikiBullets(md).lines).toEqual([6]);
  });

  it('converts a ** item whose text starts with a no-break space', () => {
    expect(convertJspwikiBullets('* a\n** \u00a0b').content).toBe('* a\n  - \u00a0b');
  });

  it('preserves CRLF line endings', () => {
    const r = convertJspwikiBullets('* a\r\n** b\r\n');
    expect(r.content).toBe('* a\r\n  - b\r\n');
  });

  it('is idempotent', () => {
    const once = convertJspwikiBullets('* a\n** b\n*** c').content;
    expect(convertJspwikiBullets(once).changed).toBe(0);
  });
});
