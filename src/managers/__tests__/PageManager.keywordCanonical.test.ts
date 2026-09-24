/**
 * A saved page's keywords snap to the vocabulary's display form (#915, #1467).
 *
 * The feature shipped broken and stayed that way. `PageManager` built its own
 * canonical map through a cast that claimed `CatalogManager.getProviderTerms`
 * returns an array; it returns `{ displayName, terms } | null`. So `for...of`
 * threw `terms is not iterable` on EVERY save, the surrounding catch logged a
 * warning and returned an empty map, and dedup ran with nothing to snap to.
 *
 * Nothing failed. The save succeeded, the page was written, and the only trace
 * was a warning nobody read — which is why these tests assert on the SAVED
 * metadata rather than on the map: the contract that matters is what lands on
 * the page, and it is the one no test held.
 */

import PageManager from '../PageManager';
import { TEST_ACTOR } from '../../test-support/actors';

/** The vocabulary as CatalogManager really serves it: enabled terms only. */
const TERMS = [
  { term: 'fine-dining', label: 'Fine Dining' },
  { term: 'travel', label: 'Travel' }
];

function makeManager(options: { catalog?: unknown } = {}) {
  const provider = {
    getPage: vi.fn(async () => null),
    savePage: vi.fn(async (name: string) => ({ name, uuid: 'uuid-1' }))
  };
  const validationManager = {
    collectContentErrors: vi.fn().mockResolvedValue([]),
    checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false }),
    sanitizeMetadata: vi.fn((m: unknown) => m)
  };
  const catalogManager =
    'catalog' in options
      ? options.catalog
      : {
        getProviderTerms: vi.fn(async () => ({ displayName: 'User Keywords', terms: TERMS })),
        getCanonicalKeywordMap: vi.fn(async () =>
          new Map(TERMS.map(t => [t.term, t.label]))
        )
      };

  const manager = new PageManager({
    getManager: (n: string) =>
      n === 'ValidationManager' ? validationManager
        : n === 'CatalogManager' ? catalogManager
          : null
  });
  (manager as unknown as { provider: unknown }).provider = provider;
  return { manager, provider };
}

/** The keywords as they were handed to the provider for writing. */
const savedKeywords = (provider: { savePage: { mock: { calls: unknown[][] } } }): string[] => {
  const metadata = provider.savePage.mock.calls[0]?.[2] as
    | { 'user-keywords'?: string[] }
    | undefined;
  return metadata?.['user-keywords'] ?? [];
};

describe('a saved page\'s keywords snap to the catalogued title (#1467)', () => {
  test('an author\'s casing and spacing become the vocabulary\'s display form', async () => {
    const { manager, provider } = makeManager();

    await manager.savePage('Dinner', 'body', { 'user-keywords': ['fine dining', 'TRAVEL'] }, TEST_ACTOR);

    expect(savedKeywords(provider)).toEqual(['Fine Dining', 'Travel']);
  });

  test('variants of one term collapse to a single catalogued entry', async () => {
    // #869's whole point: `Dining` and `dining` can never coexist on a page.
    const { manager, provider } = makeManager();

    await manager.savePage('Dinner', 'body', { 'user-keywords': ['Fine Dining', 'fine-dining'] }, TEST_ACTOR);

    expect(savedKeywords(provider)).toEqual(['Fine Dining']);
  });

  test('a keyword outside the vocabulary is kept as the author wrote it', async () => {
    const { manager, provider } = makeManager();

    await manager.savePage('Dinner', 'body', { 'user-keywords': ['Backgammon'] }, TEST_ACTOR);

    expect(savedKeywords(provider)).toEqual(['Backgammon']);
  });

  test('the save still succeeds with no CatalogManager — snapping is best-effort', async () => {
    // The old code reached this outcome for EVERY save, by accident. It is the
    // correct outcome only when the vocabulary is genuinely unavailable.
    const { manager, provider } = makeManager({ catalog: null });

    await manager.savePage('Dinner', 'body', { 'user-keywords': ['fine dining'] }, TEST_ACTOR);

    expect(provider.savePage).toHaveBeenCalled();
    expect(savedKeywords(provider)).toEqual(['fine dining']);
  });

  test('the map is asked of CatalogManager, not rebuilt from its terms here', async () => {
    // The cast that broke this was a second implementation. If a future caller
    // starts reading getProviderTerms and mapping it again, this fails.
    const catalog = {
      getProviderTerms: vi.fn(async () => ({ displayName: 'User Keywords', terms: TERMS })),
      getCanonicalKeywordMap: vi.fn(async () => new Map([['travel', 'Travel']]))
    };
    const { manager } = makeManager({ catalog });

    await manager.savePage('Dinner', 'body', { 'user-keywords': ['travel'] }, TEST_ACTOR);

    expect(catalog.getCanonicalKeywordMap).toHaveBeenCalled();
    expect(catalog.getProviderTerms).not.toHaveBeenCalled();
  });
});
