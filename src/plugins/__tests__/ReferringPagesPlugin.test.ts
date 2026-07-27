/**
 * ReferringPagesPlugin tests
 *
 * @jest-environment node
 */

import ReferringPagesPlugin from '../referringPagesPlugin';

const ctx = (pageName: string, linkGraph: Record<string, string[]> = {}) => ({
  pageName,
  linkGraph,
  engine: null
});

describe('ReferringPagesPlugin', () => {
  test('has correct name', () => {
    expect(ReferringPagesPlugin.name).toBe('ReferringPagesPlugin');
  });

  test('returns empty message when no referring pages', () => {
    const result = ReferringPagesPlugin.execute(ctx('TestPage'), {});
    expect(result).toContain('No pages currently refer');
  });

  test('returns list of referring pages', () => {
    const linkGraph = { TestPage: ['PageA', 'PageB'] };
    const result = ReferringPagesPlugin.execute(ctx('TestPage', linkGraph), {});
    expect(result).toContain('PageA');
    expect(result).toContain('PageB');
  });

  test('format=count returns count string', () => {
    const linkGraph = { TestPage: ['PageA', 'PageB', 'PageC'] };
    const result = ReferringPagesPlugin.execute(ctx('TestPage', linkGraph), { format: 'count' });
    expect(result).toContain('3');
  });

  test('show=count (legacy) returns count string', () => {
    const linkGraph = { TestPage: ['PageA'] };
    const result = ReferringPagesPlugin.execute(ctx('TestPage', linkGraph), { show: 'count' });
    expect(result).toContain('1');
  });

  test('max param limits results', () => {
    const linkGraph = { TestPage: ['A', 'B', 'C', 'D', 'E'] };
    const result = ReferringPagesPlugin.execute(ctx('TestPage', linkGraph), { max: '2' });
    // Should only show 2 links
    const linkCount = (result.match(/\/view\//g) ?? []).length;
    expect(linkCount).toBeLessThanOrEqual(2);
  });

  test('page param targets different page', () => {
    const linkGraph = { OtherPage: ['RefA', 'RefB'] };
    const result = ReferringPagesPlugin.execute(ctx('CurrentPage', linkGraph), { page: 'OtherPage' });
    expect(result).toContain('RefA');
    expect(result).toContain('RefB');
  });

  test('format=count returns "0" for empty linkGraph', () => {
    const result = ReferringPagesPlugin.execute(ctx('TestPage'), { format: 'count' });
    expect(result).toContain('0');
  });

  test('initialize() does not throw', () => {
    expect(() => ReferringPagesPlugin.initialize?.({})).not.toThrow();
  });
});
