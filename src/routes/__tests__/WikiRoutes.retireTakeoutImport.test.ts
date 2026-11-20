/**
 * The old vault takeout import is removed (#2187). `core.private-store` on
 * `/import` (#2118) does the same job, so a second door with its own size
 * setting and its own `store-import` record is gone.
 *
 *   - `POST /my/takeout/import` is a 404 for a signed-in owner;
 *   - `ImportManager.importOwnStoreTakeout`, the route's handler and
 *     `src/utils/privateStoreImport.ts` no longer exist;
 *   - the download page (`/my/takeout`) sends someone with a takeout to
 *     `/import` for the private-store receiver, and holds no upload form;
 *   - the download itself, `GET` and `POST /my/takeout`, is still registered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import express from 'express';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import ImportManager from '../../managers/ImportManager';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['editor'] };

function makeApp() {
  const managers: Record<string, unknown> = {};
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { userContext: unknown }).userContext = MOLLY;
    (req as unknown as { session: unknown }).session = { csrfToken: 't' };
    next();
  });
  new WikiRoutes({ getManager: (name: string) => managers[name] ?? null }).registerRoutes(app);
  return app;
}

/** Express's own 404 for a path no route matches, as opposed to a registered route that refuses. */
const unregistered = (res: { status: number; text: string }): boolean => res.status === 404 && res.text.includes('Cannot');

describe('the old takeout import route is gone (#2187)', () => {
  test('POST /my/takeout/import is a 404 for a signed-in owner', async () => {
    const res = await request(makeApp()).post('/my/takeout/import').field('store', 'vault').attach('archive', Buffer.from('PK'), 'a.zip');
    expect(res.status).toBe(404);
    expect(unregistered(res)).toBe(true);
  });

  test('ImportManager has no importOwnStoreTakeout, and WikiRoutes no handler for the route', () => {
    expect((new ImportManager({ getManager: () => null }) as unknown as Record<string, unknown>)['importOwnStoreTakeout']).toBeUndefined();
    expect((new WikiRoutes({ getManager: () => null }) as unknown as Record<string, unknown>)['myTakeoutImport']).toBeUndefined();
  });

  test('src/utils/privateStoreImport.ts is deleted', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/utils/privateStoreImport.ts'))).toBe(false);
  });

  test('the download, GET and POST /my/takeout, is still registered', async () => {
    const app = makeApp();
    for (const verb of ['get', 'post'] as const) {
      const res = await request(app)[verb]('/my/takeout');
      expect(`${verb} ${unregistered(res) ? 'unregistered' : 'registered'}`).toBe(`${verb} registered`);
    }
  });
});

describe('the download page sends an import to /import (#2187)', () => {
  const TEMPLATE = fs.readFileSync(path.join(ROOT, 'views/my-list.ejs'), 'utf8').replace(/<%- include\([^%]*%>/g, '');
  const render = (): string => ejs.render(TEMPLATE, {
    title: 'Download My Private Data', icon: 'fa-download', listKind: 'takeout', csrfToken: 'tok', emptyMessage: '',
    items: [{ store: 'vault', pageCount: 1, attachmentCount: 0, totalBytes: 10, locked: false }],
    totalItems: 1, paginationHtml: '', pageUrl: (n: string) => n,
    // What the page passed before #2187; it must not draw an upload form from it any more.
    importStores: ['vault', 'default']
  });

  test('links to /import with the private-store receiver chosen', () => {
    expect(render()).toContain('href="/import?receiver=core.private-store"');
  });

  test('says what an import needs, since /import offers nothing to someone signed in long ago or with every store locked', () => {
    expect(render()).toContain('You need to be signed in recently, and have a store unlocked.');
  });

  test('holds no upload form and posts nowhere to /my/takeout/import', () => {
    const html = render();
    expect(html).not.toContain('takeoutImportForm');
    expect(html).not.toContain('/my/takeout/import');
    expect(html).not.toContain('type="file"');
  });

  test('the page no longer works out where an import may go', async () => {
    const render_ = vi.fn();
    const managers: Record<string, unknown> = {
      PageManager: { listOwnStoreIds: async () => ['vault'], buildOwnStoreTakeout: async () => ({ pageCount: 1, attachmentCount: 0, totalBytes: 10 }) },
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d }
    };
    const routes = new WikiRoutes({ getManager: (n: string) => managers[n] ?? null });
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({ userContext: MOLLY, hasPermission: async () => true }) as never);
    vi.spyOn(routes as unknown as { permitted: () => Promise<boolean> }, 'permitted').mockResolvedValue(true);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    await (routes as unknown as { myTakeoutPage: (q: unknown, s: unknown) => Promise<unknown> })
      .myTakeoutPage({ query: {}, session: { csrfToken: 't' } }, { render: render_ });
    expect(render_.mock.calls[0][1]).not.toHaveProperty('importStores');
  });
});
