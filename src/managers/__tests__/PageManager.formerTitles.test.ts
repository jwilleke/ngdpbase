/**
 * #1105 — PageManager.resolveFormerTitle().
 *
 * The pure rules live in utils/formerTitles. What matters here is the wiring:
 * the index is derived from the live page set, built lazily, and refuses rather
 * than guessing.
 */
vi.unmock('../PageManager');

import PageManager from '../PageManager';

type Page = { title: string; formerTitles?: unknown };

function makeManager(pages: Page[]) {
  const byTitle = new Map(pages.map((p) => [p.title, p]));
  const provider = {
    getPageMetadata: vi.fn(async (title: string) => byTitle.get(title) ?? null)
  };
  const manager = new PageManager({ getManager: vi.fn(() => null) }) as unknown as {
    provider: unknown;
    getAllPages: () => Promise<string[]>;
    resolveFormerTitle: (t: string) => Promise<string | null>;
  };
  manager.provider = provider;
  manager.getAllPages = vi.fn(async () => pages.map((p) => p.title));
  return { manager, provider };
}

describe('PageManager.resolveFormerTitle()', () => {
  test('resolves a former title to the page that holds it now', async () => {
    const { manager } = makeManager([{ title: 'New Title', formerTitles: ['Old Title'] }]);
    await expect(manager.resolveFormerTitle('Old Title')).resolves.toBe('New Title');
  });

  test('is case-insensitive', async () => {
    const { manager } = makeManager([{ title: 'New Title', formerTitles: ['Old Title'] }]);
    await expect(manager.resolveFormerTitle('OLD TITLE')).resolves.toBe('New Title');
  });

  test('returns null for a title nobody claims', async () => {
    const { manager } = makeManager([{ title: 'New Title', formerTitles: ['Old Title'] }]);
    await expect(manager.resolveFormerTitle('Never Existed')).resolves.toBeNull();
  });

  test('refuses when two pages claim the same former title', async () => {
    const { manager } = makeManager([
      { title: 'Page One', formerTitles: ['Shared'] },
      { title: 'Page Two', formerTitles: ['Shared'] }
    ]);
    await expect(manager.resolveFormerTitle('Shared')).resolves.toBeNull();
  });

  test('refuses when the former title has been reused by a live page', async () => {
    const { manager } = makeManager([
      { title: 'Renamed', formerTitles: ['Recycled'] },
      { title: 'Recycled' }
    ]);
    await expect(manager.resolveFormerTitle('Recycled')).resolves.toBeNull();
  });

  test('returns null for empty or whitespace input without touching the provider', async () => {
    const { manager, provider } = makeManager([{ title: 'A', formerTitles: ['B'] }]);
    await expect(manager.resolveFormerTitle('   ')).resolves.toBeNull();
    expect(provider.getPageMetadata).not.toHaveBeenCalled();
  });

  test('builds the index once and reuses it', async () => {
    const { manager, provider } = makeManager([{ title: 'New', formerTitles: ['Old'] }]);
    await manager.resolveFormerTitle('Old');
    await manager.resolveFormerTitle('Old');
    expect(provider.getPageMetadata).toHaveBeenCalledTimes(1);
  });

  test('a page whose metadata cannot be read does not deny resolution for others', async () => {
    const { manager, provider } = makeManager([
      { title: 'Broken' },
      { title: 'Good', formerTitles: ['Former'] }
    ]);
    provider.getPageMetadata.mockImplementation(async (title: string) => {
      if (title === 'Broken') throw new Error('unreadable');
      return { title: 'Good', formerTitles: ['Former'] };
    });
    await expect(manager.resolveFormerTitle('Former')).resolves.toBe('Good');
  });
});
