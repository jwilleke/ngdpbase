/**
 * TotalPagesPlugin tests
 *
 * @jest-environment node
 */

import TotalPagesPlugin from '../TotalPagesPlugin';

const makeEngine = (pages: unknown[] | null = []) => ({
  getManager: vi.fn((name: string) => {
    if (name === 'PageManager') {
      if (pages === null) return null;
      // #1219: the count is of pages the viewer may read; the raw index is larger.
      return {
        getAllPages: vi.fn().mockResolvedValue([...pages, 'private-1', 'private-2']),
        listPagesFor: vi.fn().mockResolvedValue(pages)
      };
    }
    return null;
  }),
  logger: { error: vi.fn() }
});

describe('TotalPagesPlugin', () => {
  test('has correct name', () => {
    expect(TotalPagesPlugin.name).toBe('TotalPagesPlugin');
  });

  test('returns "0" when engine is null', async () => {
    const result = await TotalPagesPlugin.execute({ engine: null }, {});
    expect(result).toBe('0');
  });

  test('returns "0" when PageManager unavailable', async () => {
    const result = await TotalPagesPlugin.execute({ engine: makeEngine(null) }, {});
    expect(result).toBe('0');
  });

  test('returns "0" for empty pages', async () => {
    const result = await TotalPagesPlugin.execute({ engine: makeEngine([]) }, {});
    expect(result).toContain('0');
  });

  test('returns count for pages', async () => {
    const engine = makeEngine([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    const result = await TotalPagesPlugin.execute({ engine }, {});
    expect(result).toContain('3');
  });

  test('returns "0" when the listing throws', async () => {
    const pm = { listPagesFor: vi.fn().mockRejectedValue(new Error('DB error')) };
    const engine = { getManager: vi.fn(() => pm), logger: { error: vi.fn() } };
    const result = await TotalPagesPlugin.execute({ engine }, {});
    expect(result).toBe('0');
  });
});
