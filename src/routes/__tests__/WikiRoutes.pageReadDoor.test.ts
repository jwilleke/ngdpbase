/**
 * #1622 — the page-source and version APIs go through the page-read door.
 *
 * Four routes returned a page's content to anyone, anonymous included, because
 * the read decision was a route helper each route had to remember to call:
 *
 * - `GET /api/page-source/:page`
 * - `GET /api/page/:identifier/versions`
 * - `GET /api/page/:identifier/version/:version`
 * - `GET /api/page/:identifier/compare/:v1/:v2`
 *
 * These run the real WikiRoutes, the real PageManager door and the real
 * PolicyInformationPoint; only storage and global policy are stubbed, and
 * policy lets every reader view every page. So a 404 here comes from the page's
 * own audience — exactly what the routes used to skip. Sabotage: put
 * `pageManager.getPage` back in `getPageSource`, or `provider.getVersionHistory`
 * back in `getPageVersions`, and the anonymous cases go red.
 */
vi.unmock('../../managers/PageManager');
import request from 'supertest';
import type { Express } from 'express';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { buildTestApp, type TestUserContext } from './__fixtures__/buildTestApp';

const PAGES: Record<string, Record<string, unknown>> = {
  Public: { title: 'Public', uuid: 'u-public', slug: 'public' },
  MembersOnly: { title: 'MembersOnly', uuid: 'u-members', slug: 'members-only', audience: ['reader'] }
};
const CONTENT: Record<string, string> = { Public: 'public words', MembersOnly: 'MEMBERS-ONLY-TEXT' };

function resolve(identifier: string): string | null {
  for (const [title, meta] of Object.entries(PAGES)) {
    if (identifier === title || identifier === meta.uuid || identifier === meta.slug) return title;
  }
  return null;
}

const anonymous: TestUserContext = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const reader: TestUserContext = { username: 'bob', roles: ['reader', 'Authenticated', 'All'], isAuthenticated: true };

function makeApp(userContext: TestUserContext): Express {
  const provider = {
    getPageMetadata: async (id: string) => (resolve(id) ? { ...PAGES[resolve(id)] } : null),
    pageExists: (id: string) => resolve(id) !== null,
    getPage: async (id: string) => {
      const title = resolve(id);
      return title ? { title, uuid: PAGES[title].uuid, content: CONTENT[title], metadata: PAGES[title], filePath: '' } : null;
    },
    getVersionHistory: async (id: string) => [{ version: 2, author: 'x', comment: `history of ${resolve(id)}` }, { version: 1 }],
    getPageVersion: async (id: string, version: number) => ({ version, content: `${CONTENT[resolve(id)]} @v${version}`, metadata: {} }),
    compareVersions: async (id: string, v1: number, v2: number) => ({ fromVersion: v1, toVersion: v2, diff: [[0, CONTENT[resolve(id)]]], stats: {} })
  };
  let pip: unknown = null;
  let pm: unknown = null;
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'PageManager') return pm;
      if (name === 'PolicyInformationPoint') return pip;
      // Global policy: every reader views every page. Only the page's audience refuses.
      if (name === 'PolicyEvaluator') {
        return { evaluateAccess: async () => ({ hasDecision: true, allowed: true, policyName: 'everyone-reads', reason: 'test' }) };
      }
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    }
  };
  pm = new PageManager(engine);
  (pm as { provider: unknown }).provider = provider;
  pip = new PolicyInformationPoint(engine);
  const app = buildTestApp({ userContext });
  new WikiRoutes(engine).registerRoutes(app);
  return app;
}

/** Each API, and what of the page's content its 200 carries. */
const APIS: Array<[string, (page: string) => string]> = [
  ['page source', (page) => `/api/page-source/${page}`],
  ['version list', (page) => `/api/page/${page}/versions`],
  ['one version', (page) => `/api/page/${page}/version/1`],
  ['version compare', (page) => `/api/page/${page}/compare/1/2`]
];

describe('#1622 the page APIs answer only a caller who may read the page', () => {
  test.each(APIS)('%s: anonymous gets 404 for a page whose audience excludes anonymous', async (_what, url) => {
    const res = await request(makeApp(anonymous)).get(url('MembersOnly'));
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('MEMBERS-ONLY-TEXT');
    expect(res.text).not.toContain('history of MembersOnly');
  });

  test.each(APIS)('%s: by slug or uuid too — the door decides on the page it resolved to', async (_what, url) => {
    for (const id of ['members-only', 'u-members']) {
      const res = await request(makeApp(anonymous)).get(url(id));
      expect(res.status, id).toBe(404);
    }
  });

  test.each(APIS)('%s: anonymous gets 200 for a public page', async (_what, url) => {
    const res = await request(makeApp(anonymous)).get(url('Public'));
    expect(res.status).toBe(200);
  });

  test.each(APIS)('%s: a reader in the audience gets 200', async (_what, url) => {
    const res = await request(makeApp(reader)).get(url('MembersOnly'));
    expect(res.status).toBe(200);
  });

  test('a refusal and a missing page are the same answer', async () => {
    const refused = await request(makeApp(anonymous)).get('/api/page-source/MembersOnly');
    const missing = await request(makeApp(anonymous)).get('/api/page-source/Nowhere');
    expect([refused.status, refused.text]).toEqual([missing.status, missing.text]);
  });
});
