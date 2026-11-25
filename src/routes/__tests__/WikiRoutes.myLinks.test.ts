/**
 * /my/links — the signed-in user's pinned pages (#2520, slice 1 of #2247).
 *
 * The list is called "Pinned pages". The route keeps its address, so
 * bookmarks to /my/links still work; only the wording changes.
 */

import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['reader'] };

const createReq = () => ({
  params: {},
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/my/links',
  originalUrl: '/my/links',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: MOLLY
});

const createRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

function makeRoutes() {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'UserManager') {
        return {
          getUser: vi.fn(async () => ({
            username: 'molly',
            preferences: { 'nav.pinnedPages': [{ url: '/view/Garden', title: 'Garden' }] }
          }))
        };
      }
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes;
}

describe('GET /my/links (#2520)', () => {
  test('the list page is titled "Pinned pages", never "My Links"', async () => {
    const res = createRes();
    await makeRoutes().myLinksPage(createReq(), res);

    expect(res.render.mock.calls[0][0]).toBe('my-list');
    const view = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(view.title).toBe('Pinned pages');
    expect(view.tabTitle).toBe('Pinned pages');
    expect(JSON.stringify(view)).not.toContain('My Links');
    expect(view.items).toEqual([expect.objectContaining({ title: 'Garden', url: '/view/Garden' })]);
  });
});
