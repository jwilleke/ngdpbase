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

describe('PageManager.getFormerTitleLinkNames()', () => {
  type Linkable = { title: string; formerTitles?: unknown };
  function makeLinkManager(pages: Linkable[], hidden: string[] = []) {
    const byTitle = new Map(pages.map((p) => [p.title, p]));
    const provider = {
      getPageMetadata: vi.fn(async (title: string) => byTitle.get(title) ?? null),
      pageExists: vi.fn((title: string) => byTitle.has(title) && !hidden.includes(title))
    };
    const manager = new PageManager({ getManager: vi.fn(() => null) }) as unknown as {
      provider: unknown;
      getAllPages: () => Promise<string[]>;
      getFormerTitleLinkNames: () => Promise<string[]>;
    };
    manager.provider = provider;
    manager.getAllPages = vi.fn(async () => pages.map((p) => p.title));
    return manager;
  }

  test('lists a former title, lower case, so a link written with it can be drawn as an existing page', async () => {
    const manager = makeLinkManager([{ title: 'Pinned pages', formerTitles: ['My Links'] }]);
    await expect(manager.getFormerTitleLinkNames()).resolves.toEqual(['my links']);
  });

  test('leaves out a title a live page holds, so a live page always wins', async () => {
    const manager = makeLinkManager([
      { title: 'Pinned pages', formerTitles: ['My Links'] },
      { title: 'My Links' }
    ]);
    await expect(manager.getFormerTitleLinkNames()).resolves.toEqual([]);
  });

  test('leaves out a title two pages both claim', async () => {
    const manager = makeLinkManager([
      { title: 'Page One', formerTitles: ['Shared'] },
      { title: 'Page Two', formerTitles: ['Shared'] }
    ]);
    await expect(manager.getFormerTitleLinkNames()).resolves.toEqual([]);
  });

  test('leaves out a former title of a page a signed-out reader may not see', async () => {
    const manager = makeLinkManager(
      [{ title: 'Secret plans', formerTitles: ['Old plans'] }, { title: 'Pinned pages', formerTitles: ['My Links'] }],
      ['Secret plans']
    );
    await expect(manager.getFormerTitleLinkNames()).resolves.toEqual(['my links']);
  });

  test('leaves out a former title of a private page', async () => {
    const manager = makeLinkManager([
      { title: 'vaults/alice/default/Diary', formerTitles: ['Journal'] },
      { title: 'Pinned pages', formerTitles: ['My Links'] }
    ]);
    await expect(manager.getFormerTitleLinkNames()).resolves.toEqual(['my links']);
  });
});

describe('a shipped page keeps its former titles when a new site first saves it', () => {
  type Normalize = (
    pageName: string,
    metadata: Record<string, unknown>,
    existingPage: unknown,
    actingUser: string,
    viaToken: unknown,
    keepEditor?: boolean,
    shippedAuthor?: string,
    shippedSeed?: boolean
  ) => Promise<Record<string, unknown>>;

  function makeNormalizer(): Normalize {
    const manager = new PageManager({ getManager: vi.fn(() => null) }) as unknown as { normalizeSaveMetadata: Normalize };
    return manager.normalizeSaveMetadata.bind(manager);
  }
  const shipped = { title: 'Pinned pages', formerTitles: ['My Links'] };

  test('the seeded copy of a new page keeps formerTitles', async () => {
    const out = await makeNormalizer()('Pinned pages', { ...shipped }, null, 'system', undefined, false, undefined, true);
    expect(out.formerTitles).toEqual(['My Links']);
  });

  test('an ordinary save of a new page cannot claim a former title', async () => {
    const out = await makeNormalizer()('Pinned pages', { ...shipped }, null, 'alice', undefined);
    expect(out.formerTitles).toBeUndefined();
  });
});
