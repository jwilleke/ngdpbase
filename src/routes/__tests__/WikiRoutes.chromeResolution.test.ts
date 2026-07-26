/**
 * Site chrome page resolution — #952.
 *
 * Chrome used to be resolved by slug convention: `left-menu-content` silently
 * beat the core `LeftMenu`, so an operator could edit `LeftMenu`, save
 * successfully, and see nothing change.
 *
 * The key migration property pinned here: the config key defaults to **empty**,
 * and empty means "legacy chain". Defaulting it to the core page name would
 * silently revert navigation on any instance relying on the convention —
 * geohazardwatch among them — the moment it upgraded.
 */

import WikiRoutes from '../WikiRoutes';

type PageRec = { content: string; metadata: Record<string, unknown> };

function makeRoutes(pages: Record<string, PageRec>, config: Record<string, unknown> = {}) {
  const engine = {
    getManager: (name: string) => {
      if (name === 'PageManager') {
        return { getPage: async (slug: string) => pages[slug] ?? null };
      }
      if (name === 'ConfigurationManager') {
        return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
      }
      return null;
    }
  };
  const routes = Object.create(WikiRoutes.prototype) as WikiRoutes;
  (routes as unknown as { engine: unknown }).engine = engine;
  return routes;
}

const resolve = (routes: WikiRoutes, key = 'ngdpbase.chrome.left-menu-page') =>
  (routes as unknown as {
    resolveChromePage(k: string, legacy: string[], label: string): Promise<PageRec | null>;
  }).resolveChromePage(key, ['left-menu-content', 'LeftMenu'], 'LeftMenu');

const page = (content: string): PageRec => ({ content, metadata: {} });

describe('resolveChromePage (#952)', () => {
  describe('unset config — legacy behaviour must be preserved exactly', () => {
    test('the override still wins over the core page', async () => {
      // This is the pre-#952 behaviour. Changing it would silently revert
      // navigation on upgrade for every instance relying on the convention.
      const r = makeRoutes({
        'left-menu-content': page('ADDON MENU'),
        'LeftMenu': page('CORE MENU')
      });
      expect((await resolve(r))?.content).toBe('ADDON MENU');
    });

    test('falls through to the core page when no override exists', async () => {
      const r = makeRoutes({ 'LeftMenu': page('CORE MENU') });
      expect((await resolve(r))?.content).toBe('CORE MENU');
    });

    test('returns null when neither page exists', async () => {
      expect(await resolve(makeRoutes({}))).toBeNull();
    });

    test('an empty-string config value is treated as unset', async () => {
      const r = makeRoutes(
        { 'left-menu-content': page('ADDON MENU'), 'LeftMenu': page('CORE MENU') },
        { 'ngdpbase.chrome.left-menu-page': '' }
      );
      expect((await resolve(r))?.content).toBe('ADDON MENU');
    });

    test('a whitespace-only config value is treated as unset', async () => {
      const r = makeRoutes(
        { 'left-menu-content': page('ADDON MENU'), 'LeftMenu': page('CORE MENU') },
        { 'ngdpbase.chrome.left-menu-page': '   ' }
      );
      expect((await resolve(r))?.content).toBe('ADDON MENU');
    });
  });

  describe('config set — explicit and authoritative', () => {
    test('the configured page wins over the legacy override', async () => {
      const r = makeRoutes(
        { 'left-menu-content': page('ADDON MENU'), 'LeftMenu': page('CORE MENU') },
        { 'ngdpbase.chrome.left-menu-page': 'LeftMenu' }
      );
      expect((await resolve(r))?.content).toBe('CORE MENU');
    });

    test('an operator can point chrome at an arbitrary page', async () => {
      const r = makeRoutes(
        { 'left-menu-content': page('ADDON MENU'), 'my-nav': page('MY NAV') },
        { 'ngdpbase.chrome.left-menu-page': 'my-nav' }
      );
      expect((await resolve(r))?.content).toBe('MY NAV');
    });

    test('a missing configured page returns null — it does NOT fall back', async () => {
      // Falling back here would reintroduce exactly the invisible-substitution
      // problem the config exists to remove: the operator would silently get a
      // page they did not choose.
      const r = makeRoutes(
        { 'left-menu-content': page('ADDON MENU'), 'LeftMenu': page('CORE MENU') },
        { 'ngdpbase.chrome.left-menu-page': 'does-not-exist' }
      );
      expect(await resolve(r)).toBeNull();
    });
  });

  describe('footer resolves through the same path', () => {
    test('footer config is honoured independently of the menu', async () => {
      const engine = makeRoutes(
        { 'footer-content': page('ADDON FOOTER'), 'Footer': page('CORE FOOTER') },
        { 'ngdpbase.chrome.footer-page': 'Footer' }
      );
      const got = await (engine as unknown as {
        resolveChromePage(k: string, l: string[], lbl: string): Promise<PageRec | null>;
      }).resolveChromePage('ngdpbase.chrome.footer-page', ['footer-content', 'Footer'], 'Footer');
      expect(got?.content).toBe('CORE FOOTER');
    });
  });

  test('missing PageManager degrades to null rather than throwing', async () => {
    const routes = Object.create(WikiRoutes.prototype) as WikiRoutes;
    (routes as unknown as { engine: unknown }).engine = { getManager: () => null };
    expect(await resolve(routes)).toBeNull();
  });
});
