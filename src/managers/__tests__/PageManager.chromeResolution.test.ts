/**
 * Site chrome page resolution — #952, and since #1622 one reader for every caller.
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
vi.unmock('../PageManager');
import PageManager, { type ChromeSlot } from '../PageManager';
import { ANONYMOUS_SUBJECT } from '../UserManager';

type PageRec = { content: string; metadata: Record<string, unknown> };

function makeManager(pages: Record<string, PageRec>, config: Record<string, unknown> | null = {}) {
  const reads: Array<{ slug: string; ctx: unknown }> = [];
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager' && config) {
        return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
      }
      return null;
    }
  };
  const pm = Object.create(PageManager.prototype) as PageManager;
  (pm as unknown as { engine: unknown }).engine = engine;
  (pm as unknown as { provider: unknown }).provider = {
    getPage: async (slug: string, ctx: unknown) => { reads.push({ slug, ctx }); return pages[slug] ?? null; }
  };
  return Object.assign(pm, { reads });
}

const resolve = (pm: PageManager, slot: ChromeSlot = 'left-menu') => pm.readChromePage(slot);
const makeRoutes = makeManager;

const page = (content: string): PageRec => ({ content, metadata: {} });

describe('PageManager.readChromePage (#952, #1622)', () => {
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
      const got = await resolve(engine, 'footer');
      expect(got?.content).toBe('CORE FOOTER');
    });
  });

  test('no configuration reader falls back to the legacy chain', async () => {
    const pm = makeManager({ LeftMenu: page('CORE MENU') }, null);
    expect((await resolve(pm))?.content).toBe('CORE MENU');
  });

  describe('#1622 one reader for every caller', () => {
    test('chrome is read as the anonymous reader, never as the viewer', async () => {
      const pm = makeManager({ LeftMenu: page('CORE MENU') });
      await resolve(pm);
      expect(pm.reads.every((r) => r.ctx === ANONYMOUS_SUBJECT)).toBe(true);
    });

    test('the page-tabs template defaults to Template:PageTabs and honours its setting', async () => {
      expect((await resolve(makeManager({ 'Template:PageTabs': page('TABS') }), 'page-tabs'))?.content).toBe('TABS');
      const custom = makeManager({ 'Template:PageTabs': page('TABS'), 'My Tabs': page('MINE') }, { 'ngdpbase.tab.pagetabs.template': 'My Tabs' });
      expect((await resolve(custom, 'page-tabs'))?.content).toBe('MINE');
    });

    test('a missing page-tabs template is quiet — tabs are optional', async () => {
      expect(await resolve(makeManager({}), 'page-tabs')).toBeNull();
    });
  });
});
