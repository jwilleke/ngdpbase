/**
 * Required Pages admin: pages that belong in the set but are not in it — #1377.
 *
 * The admin page was built only from the source files, so a live page whose
 * system-category ships to every install (one required-pages/ files carry,
 * #1503) but whose UUID was never added to the GitHub set was invisible.
 */
import WikiRoutes from '../WikiRoutes';

function makeRoutes(pages: Record<string, Record<string, unknown>>) {
  const pageManager = {
    listPagesFor: vi.fn(async () => Object.keys(pages)),
    getPageMetadata: vi.fn(async (title: string) => pages[title] ?? null),
    // #1503: read from required-pages/ frontmatter, not from a config field
    shippedSystemCategories: vi.fn(async () => new Set(['system', 'documentation']))
  };
  const engine = { getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null)) };
  const routes = new WikiRoutes(engine) as unknown as {
    findRequiredCategoryPagesNotInSource(
      sourceUuids: string[],
      reader: unknown
    ): Promise<Array<{ uuid: string; title: string; category: string }>>;
  };
  return { routes, pageManager };
}

describe('Required Pages: pages not in the GitHub set (#1377)', () => {
  test('lists system/documentation pages whose UUID is in no source set, sorted by title', async () => {
    const { routes } = makeRoutes({
      Metrics: { uuid: 'u-metrics', 'system-category': 'Documentation', author: 'jim' },
      'About ngdpbase': { uuid: 'u-about', 'system-category': 'system' },
      'Markdown Cheat Sheet': { uuid: 'U-SHIPPED', 'system-category': 'documentation' },
      Tritium: { uuid: 'u-tritium', 'system-category': 'general' },
      'Demo Sandbox': { uuid: 'u-demo', 'system-category': 'documentation', addon: 'demo' },
      'Private Notes': { uuid: 'u-private', 'system-category': 'documentation', private: true }
    });

    const found = await routes.findRequiredCategoryPagesNotInSource(['u-shipped'], { username: 'admin' });

    expect(found.map((p) => p.title)).toEqual(['About ngdpbase', 'Metrics']);
    expect(found[1]).toMatchObject({ uuid: 'u-metrics', category: 'documentation' });
  });

  test('pages are listed through the listing door for the viewer (#1219)', async () => {
    const { routes, pageManager } = makeRoutes({});
    const reader = { username: 'admin' };
    await routes.findRequiredCategoryPagesNotInSource([], reader);
    expect(pageManager.listPagesFor).toHaveBeenCalledWith(reader, 'view');
  });

  test('a page in an addon source set is not listed', async () => {
    const { routes } = makeRoutes({
      'Using FormPlugin': { uuid: 'u-forms', 'system-category': 'documentation' }
    });

    expect(await routes.findRequiredCategoryPagesNotInSource(['u-forms'], { username: 'admin' })).toEqual([]);
  });
});
