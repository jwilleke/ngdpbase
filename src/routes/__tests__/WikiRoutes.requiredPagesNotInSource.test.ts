/**
 * Required Pages admin: pages that belong in the set but are not in it — #1377.
 *
 * The admin page was built only from the source files, so a live page whose
 * category says it ships to every install (`storageLocation: required`) but
 * whose UUID was never added to the GitHub set was invisible.
 */
import WikiRoutes from '../WikiRoutes';

const categories = {
  general: { label: 'general', storageLocation: 'regular' },
  system: { label: 'system', storageLocation: 'required' },
  documentation: { label: 'documentation', storageLocation: 'required' },
  addon: { label: 'addon', storageLocation: 'regular' }
};

function makeRoutes(pages: Record<string, Record<string, unknown>>) {
  const pageManager = {
    listPagesFor: vi.fn(async () => Object.keys(pages)),
    getPageMetadata: vi.fn(async (title: string) => pages[title] ?? null)
  };
  const engine = { getManager: vi.fn((name: string) => (name === 'PageManager' ? pageManager : null)) };
  const routes = new WikiRoutes(engine) as unknown as {
    findRequiredCategoryPagesNotInSource(
      cm: { getProperty: (k: string, d: unknown) => unknown },
      sourceUuids: string[],
      reader: unknown
    ): Promise<Array<{ uuid: string; title: string; category: string }>>;
  };
  const configManager = { getProperty: (key: string, def: unknown) => (key === 'ngdpbase.system-category' ? categories : def) };
  return { routes, configManager, pageManager };
}

describe('Required Pages: pages not in the GitHub set (#1377)', () => {
  test('lists system/documentation pages whose UUID is in no source set, sorted by title', async () => {
    const { routes, configManager } = makeRoutes({
      Metrics: { uuid: 'u-metrics', 'system-category': 'Documentation', author: 'jim' },
      'About ngdpbase': { uuid: 'u-about', 'system-category': 'system' },
      'Markdown Cheat Sheet': { uuid: 'U-SHIPPED', 'system-category': 'documentation' },
      Tritium: { uuid: 'u-tritium', 'system-category': 'general' },
      'Demo Sandbox': { uuid: 'u-demo', 'system-category': 'documentation', addon: 'demo' },
      'Private Notes': { uuid: 'u-private', 'system-category': 'documentation', private: true }
    });

    const found = await routes.findRequiredCategoryPagesNotInSource(configManager, ['u-shipped'], { username: 'admin' });

    expect(found.map((p) => p.title)).toEqual(['About ngdpbase', 'Metrics']);
    expect(found[1]).toMatchObject({ uuid: 'u-metrics', category: 'documentation' });
  });

  test('pages are listed through the listing door for the viewer (#1219)', async () => {
    const { routes, configManager, pageManager } = makeRoutes({});
    const reader = { username: 'admin' };
    await routes.findRequiredCategoryPagesNotInSource(configManager, [], reader);
    expect(pageManager.listPagesFor).toHaveBeenCalledWith(reader, 'view');
  });

  test('a page in an addon source set is not listed', async () => {
    const { routes, configManager } = makeRoutes({
      'Using FormPlugin': { uuid: 'u-forms', 'system-category': 'documentation' }
    });

    expect(await routes.findRequiredCategoryPagesNotInSource(configManager, ['u-forms'], { username: 'admin' })).toEqual([]);
  });
});
