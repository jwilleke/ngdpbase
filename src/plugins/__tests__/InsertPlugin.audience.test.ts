/**
 * #2550: Insert honours a page's `audience`, and can show nothing when refused.
 *
 * Real InsertPlugin, MarkupParser, PluginManager, RegionCache, PageManager and
 * PolicyInformationPoint. Only storage and global policy are stubbed (policy
 * lets every reader view every page), so a refusal here comes from the
 * inserted page's own `audience` — the Fairways Home case: one host page, one
 * section for signed-in members and nothing from it for a signed-out visitor.
 *
 * @jest-environment node
 */
vi.unmock('../../managers/PageManager');
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import MarkupParser from '../../parsers/MarkupParser';
import PluginManager from '../../managers/PluginManager';
import PageManager from '../../managers/PageManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import RegionCache from '../../cache/RegionCache';
import NodeCacheAdapter from '../../cache/NodeCacheAdapter';
import InsertPlugin from '../InsertPlugin';

type Meta = Record<string, unknown>;

const PAGES: Record<string, Meta> = {
  Home: { title: 'Home', uuid: 'u-home' },
  PublicNews: { title: 'PublicNews', uuid: 'u-news' },
  OccupantsSecret: { title: 'OccupantsSecret', uuid: 'u-occ', audience: ['reader'] }
};
const CONTENT: Record<string, string> = {
  Home: 'host body',
  PublicNews: 'PUBLIC-NEWS-TEXT',
  OccupantsSecret: 'MEMBERS-ONLY-TEXT'
};

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const member = { username: 'bob', roles: ['reader', 'Authenticated', 'All'], isAuthenticated: true };

describe('Insert and a page\'s audience (#2550)', () => {
  let adapter: NodeCacheAdapter;
  let parser: MarkupParser;

  beforeEach(async () => {
    adapter = new NodeCacheAdapter({ stdTTL: 300, checkperiod: 0, maxKeys: 100 });
    const regions = new Map<string, RegionCache>();
    const region = (name: string) => {
      if (!regions.has(name)) regions.set(name, new RegionCache(adapter as never, name, async () => '0'));
      return regions.get(name);
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getAllProperties: () => ({}) },
      CacheManager: { isInitialized: () => true, region },
      RenderingManager: {
        converter: { makeHtml: (t: string) => t },
        renderMarkdown: async (content: string) => `<rendered>${content}</rendered>`
      },
      // Global policy: every reader views every page. Only a page's own rules refuse.
      PolicyEvaluator: {
        evaluateAccess: async () => ({ hasDecision: true, allowed: true, policyName: 'everyone-reads', reason: 'test' })
      }
    };
    const engine = {
      getManager: (name: string) => managers[name] ?? null,
      logger: { info() {}, warn() {}, debug() {}, error() {} }
    };
    const resolve = (id: string) => Object.keys(PAGES).find((t) => id === t || id === PAGES[t].uuid) ?? null;
    const provider = {
      getPageMetadata: async (id: string) => { const t = resolve(id); return t ? { ...PAGES[t] } : null; },
      pageExists: (id: string) => resolve(id) !== null,
      getPage: async (id: string) => {
        const t = resolve(id);
        return t ? { title: t, uuid: PAGES[t].uuid, content: CONTENT[t], metadata: PAGES[t], filePath: '' } : null;
      }
    };
    const pm = new PageManager(engine);
    (pm as unknown as { provider: unknown }).provider = provider;
    (pm as unknown as { isSharedIndexable: () => boolean }).isSharedIndexable = () => true;
    managers.PageManager = pm;
    managers.PolicyInformationPoint = new PolicyInformationPoint(engine);

    const plugins = new PluginManager(engine);
    managers.PluginManager = plugins;
    await plugins.registerPlugin('Insert', InsertPlugin as never);
    parser = new MarkupParser(engine);
    managers.MarkupParser = parser;
    await parser.initialize?.();
  });

  afterEach(async () => { await adapter.close(); });

  const HOME = [
    'Welcome.',
    '',
    '[{Insert page=\'PublicNews\'}]',
    '',
    '[{Insert page=\'OccupantsSecret\', denied=\'none\'}]'
  ].join('\n');
  const as = (userContext: unknown) => ({ pageName: 'Home', userContext });

  test('a signed-out viewer gets no text from the restricted page and nothing naming it', async () => {
    const html = await parser.parse(HOME, as(anonymous));
    expect(html).toContain('PUBLIC-NEWS-TEXT');
    expect(html).not.toContain('MEMBERS-ONLY-TEXT');
    expect(html).not.toContain('OccupantsSecret');
    expect(html).not.toContain('insert-plugin-placeholder');
    expect(html).not.toMatch(/not visible|not found/i);
  });

  test('a signed-in viewer in the audience gets the inserted text', async () => {
    const html = await parser.parse(HOME, as(member));
    expect(html).toContain('PUBLIC-NEWS-TEXT');
    expect(html).toContain('MEMBERS-ONLY-TEXT');
  });

  test.each([
    ['signed out, then signed in', [anonymous, member]],
    ['signed in, then signed out', [member, anonymous]]
  ])('one cache, %s: the two renders are never mixed', async (_label, order) => {
    const first = await parser.parse(HOME, as(order[0]));
    const second = await parser.parse(HOME, as(order[1]));
    const [signedOut, signedIn] = order[0] === anonymous ? [first, second] : [second, first];
    expect(signedOut).not.toContain('MEMBERS-ONLY-TEXT');
    expect(signedOut).not.toContain('OccupantsSecret');
    expect(signedIn).toContain('MEMBERS-ONLY-TEXT');
    // Each viewer is then served their own entry again — it is still a cache.
    const parse = vi.spyOn(parser as unknown as { renderUncached: () => Promise<string> }, 'renderUncached');
    expect(await parser.parse(HOME, as(anonymous))).toBe(signedOut);
    expect(await parser.parse(HOME, as(member))).toBe(signedIn);
    expect(parse).not.toHaveBeenCalled();
  });

  test('a page with no audience inserts as before, for a signed-out viewer too', async () => {
    const html = await parser.parse('[{Insert page=\'PublicNews\'}]', as(anonymous));
    expect(html).toContain('PUBLIC-NEWS-TEXT');
    expect(html).toContain('insert-plugin-attribution');
  });

  test('without the option the refusal keeps its note, as before', async () => {
    const html = await parser.parse('[{Insert page=\'OccupantsSecret\'}]', as(anonymous));
    expect(html).toContain('Insert: page not visible');
    expect(html).not.toContain('MEMBERS-ONLY-TEXT');
  });

  test('a page that does not exist shows nothing too, so absence and refusal look alike', async () => {
    const html = await parser.parse('[{Insert page=\'Nowhere\', denied=\'none\'}]', as(anonymous));
    expect(html).not.toContain('Nowhere');
    expect(html).not.toContain('insert-plugin-placeholder');
  });
});
