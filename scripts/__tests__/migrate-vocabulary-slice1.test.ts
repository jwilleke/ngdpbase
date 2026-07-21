/**
 * Tests for the #893 vocabulary migration transform (Slice 1 of EPIC #869).
 * Pure string-in/string-out — no filesystem. Serialization traps from #545
 * (scalar-vs-array) and #862 (multi-value shape) covered explicitly.
 */
import { describe, test, expect } from 'vitest';
import { transformFrontmatter } from '../migrate-vocabulary-slice1';
import matter from 'gray-matter';

function page(fm: string): string {
  return `---\n${fm}\n---\n# Body\n`;
}

describe('transformFrontmatter (#893)', () => {
  test('clean page untouched', () => {
    const raw = page('title: T\nuser-keywords:\n  - travel');
    const r = transformFrontmatter(raw);
    expect(r.outcome).toBe('clean');
    expect(r.content).toBe(raw);
  });

  test('draft in user-keywords becomes status: draft', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - draft\n  - travel'));
    expect(r.outcome).toBe('migrated');
    const d = matter(r.content).data;
    expect(d.status).toBe('draft');
    expect(d['user-keywords']).toEqual(['travel']);
  });

  test('published keyword drops with NO status field (absence = published)', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - published\n  - travel'));
    expect(r.outcome).toBe('migrated');
    const d = matter(r.content).data;
    expect(d.status).toBeUndefined();
    expect(d['user-keywords']).toEqual(['travel']);
  });

  test('highest state wins across both arrays (published > review > draft)', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - draft\nsystem-keywords:\n  - review'));
    const d = matter(r.content).data;
    expect(d.status).toBe('review');
    expect(d['user-keywords']).toBeUndefined();
    expect(d['system-keywords']).toBeUndefined();
  });

  test('explicit status wins over keyword-derived state', () => {
    const r = transformFrontmatter(page('title: T\nstatus: review\nuser-keywords:\n  - draft'));
    const d = matter(r.content).data;
    expect(d.status).toBe('review');
    expect(d['user-keywords']).toBeUndefined();
  });

  test('capture moves user-keywords → system-keywords', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - capture\n  - travel'));
    expect(r.outcome).toBe('migrated');
    const d = matter(r.content).data;
    expect(d['user-keywords']).toEqual(['travel']);
    expect(d['system-keywords']).toEqual(['capture']);
  });

  test('capture does not duplicate when already in system-keywords', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - capture\nsystem-keywords:\n  - capture'));
    const d = matter(r.content).data;
    expect(d['system-keywords']).toEqual(['capture']);
    expect(d['user-keywords']).toBeUndefined();
  });

  test('#545 trap: scalar user-keywords string normalized to array', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords: capture'));
    expect(r.outcome).toBe('migrated');
    const d = matter(r.content).data;
    expect(d['system-keywords']).toEqual(['capture']);
    expect(d['user-keywords']).toBeUndefined();
  });

  test('idempotent: migrated output is clean on second pass', () => {
    const first = transformFrontmatter(page('title: T\nuser-keywords:\n  - draft\n  - capture\n  - travel'));
    expect(first.outcome).toBe('migrated');
    const second = transformFrontmatter(first.content);
    expect(second.outcome).toBe('clean');
  });

  test('case-insensitive matching (Draft, CAPTURE)', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - Draft\n  - CAPTURE'));
    expect(r.outcome).toBe('migrated');
    const d = matter(r.content).data;
    expect(d.status).toBe('draft');
    expect(d['system-keywords']).toEqual(['capture']);
  });

  test('body content preserved byte-for-byte through migration', () => {
    const r = transformFrontmatter(page('title: T\nuser-keywords:\n  - draft') );
    expect(matter(r.content).content).toBe('# Body\n');
  });
});
