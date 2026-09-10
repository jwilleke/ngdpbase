/**
 * #1271 S1 — every bullet marker becomes `-`.
 */
import { describe, it, expect } from 'vitest';
import { normalizeBulletMarkers } from '../bulletMarkers.js';

describe('normalizeBulletMarkers', () => {
  it('rewrites * and + bullets to -, keeping indent and spacing', () => {
    const r = normalizeBulletMarkers('* Laboratory tests:\n  - Skin testing\n+ Imaging:\n  * Chest X-rays');
    expect(r.content).toBe('- Laboratory tests:\n  - Skin testing\n- Imaging:\n  - Chest X-rays');
    expect(r.lines).toEqual([1, 3, 4]);
  });

  it('leaves hyphen bullets, bold, italic and dividers alone', () => {
    const md = '- already\n**bold** start\n*italic* start\n* * *\n***';
    expect(normalizeBulletMarkers(md).changed).toBe(0);
  });

  it('never touches fenced code', () => {
    const md = '```\n* not a bullet\n```\n- item\n\n  ```md\n  * still code\n  ```\n* real';
    const r = normalizeBulletMarkers(md);
    expect(r.lines).toEqual([9]);
    expect(r.content).toContain('* not a bullet');
    expect(r.content).toContain('  * still code');
  });

  it('leaves a 4-space-indented star outside a list alone — that is indented code', () => {
    const md = 'Some text.\n\n    * code sample';
    expect(normalizeBulletMarkers(md).changed).toBe(0);
  });

  it('rewrites a deep bullet that continues a list', () => {
    const r = normalizeBulletMarkers('- a\n  - b\n    * c\n      * d');
    expect(r.content).toBe('- a\n  - b\n    - c\n      - d');
  });

  it('keeps a list going across a blank line and an indented continuation', () => {
    const r = normalizeBulletMarkers('- a\n\n  more about a\n\n    * nested after text');
    expect(r.lines).toEqual([5]);
  });

  // California High-Speed Rail: one item's text began with a no-break space;
  // skipping it left a lone `*` that split the list under CommonMark.
  it('rewrites an item whose text starts with a no-break space', () => {
    const r = normalizeBulletMarkers('* one\n* \u00a0two\n* three');
    expect(r.content).toBe('- one\n- \u00a0two\n- three');
  });

  it('preserves CRLF and is idempotent', () => {
    const once = normalizeBulletMarkers('* a\r\n* b\r\n').content;
    expect(once).toBe('- a\r\n- b\r\n');
    expect(normalizeBulletMarkers(once).changed).toBe(0);
  });
});
