/**
 * The Export action on a search (ICE): GET and POST /export/search.
 *
 *   - a signed-out visitor is sent to sign in and nothing is read;
 *   - a signed-in user is offered the formats for the search they ran,
 *     and the screen carries that search forward to the POST;
 *   - the export is a zip of the pages the user may read, downloaded from
 *     the same run routes a page export uses;
 *   - the search page shows Export only to a signed-in user.
 */
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import WikiRoutes, { exportStartRateLimiter } from '../WikiRoutes';
import ImportManager from '../../managers/ImportManager';
import BackgroundJobManager from '../../managers/BackgroundJobManager';
import { readZip } from '../../utils/zipArchive';

const USERS: Record<string, { username: string; isAuthenticated: boolean; roles: string[] }> = {
  alice: { username: 'alice', isAuthenticated: true, roles: ['reader'] },
  Anonymous: { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] }
};
const GRANTS: Record<string, string[]> = { alice: ['page-export', 'search-page'], Anonymous: ['search-page'] };

async function makeApp() {
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (_key: string, fallback: unknown) => fallback,
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (s: { username: string }, p: string) => (GRANTS[s.username] ?? []).includes(p),
      holds: async (s: { username: string }, p: string) => (GRANTS[s.username] ?? []).includes(p)
    },
    SearchManager: {
      advancedSearchWithContext: async () => ['Alpha', 'Beta'].map(name => ({ name, title: name, metadata: {} }))
    },
    PageManager: {
      mayShowPage: async () => true,
      readPage: async (ref: string) => ({ ok: true, name: ref, metadata: { title: ref }, value: { title: ref, uuid: ref, content: `Body of ${ref}`, metadata: {} } })
    },
    ExportManager: { isPdfConfigured: () => false, renderPageDocument: async () => '<html></html>', htmlToPdf: async () => Buffer.alloc(0) }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  managers['BackgroundJobManager'] = new BackgroundJobManager(engine);
  const importManager = new ImportManager(engine);
  await importManager.initialize();
  managers['ImportManager'] = importManager;

  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) => ({
    userContext: req.userContext,
    hasPermission: async (p: string) => (GRANTS[(req.userContext as { username: string }).username] ?? []).includes(p),
    holdsPermission: async (p: string) => (GRANTS[(req.userContext as { username: string }).username] ?? []).includes(p)
  }) as never);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
  vi.spyOn(routes, 'renderError').mockImplementation((async (_q: Request, s: Response, status: number) => { s.status(status).send('error'); }) as never);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    (req as unknown as { userContext: unknown }).userContext = USERS[String(req.headers['x-user'] ?? 'Anonymous')];
    (res as unknown as { render: unknown }).render = (view: string, data: unknown) => res.json({ view, data });
    next();
  });
  const call = (name: string) => (req: Request, res: Response) =>
    void (routes as unknown as Record<string, (q: Request, s: Response) => Promise<unknown>>)[name](req, res);
  app.get('/export/search', call('exportSearchFormats'));
  app.post('/export/search', call('exportSearchStart'));
  app.get('/export/runs/:runId', call('exportRunStatus'));
  app.get('/export/runs/:runId/download', call('exportRunDownload'));
  app.get('/search', call('searchPages'));
  return { app, importManager };
}

beforeEach(() => exportStartRateLimiter.reset());

const binary = (res: request.Request) => res.buffer(true).parse((r, done) => {
  const chunks: Buffer[] = [];
  r.on('data', (c: Buffer) => chunks.push(c));
  r.on('end', () => done(null, Buffer.concat(chunks)));
});

describe('GET /export/search', () => {
  test('a signed-out visitor is sent to sign in, and nothing is read', async () => {
    const { app, importManager } = await makeApp();
    const asked = vi.spyOn(importManager, 'exportFormatsFor');
    const res = await request(app).get('/export/search?q=trip');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?redirect=/);
    expect(asked).not.toHaveBeenCalled();
  });

  test('a signed-in user is offered the formats, and the screen carries their search to the POST', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/export/search?q=trip&types=page&category=Travel&category=Food').set('x-user', 'alice');
    expect(res.body.view).toBe('export-item');
    expect(res.body.data.formats.map((f: { id: string }) => f.id)).toContain('core.ncm-file');
    expect(res.body.data.exportAction).toBe('/export/search');
    expect(res.body.data.exportBody).toEqual({ q: 'trip', types: 'page', category: ['Travel', 'Food'] });
  });
});

describe('POST /export/search', () => {
  test('a signed-out visitor is refused', async () => {
    const { app } = await makeApp();
    const res = await request(app).post('/export/search').send({ format: 'core.ncm-file', q: 'trip' });
    expect([302, 401, 403]).toContain(res.status);
  });

  test('a signed-in user gets a zip with a file for each page, from the run download', async () => {
    const { app } = await makeApp();
    const started = await request(app).post('/export/search').set('x-user', 'alice').send({ format: 'core.ncm-file', q: 'trip' });
    expect(started.status).toBe(202);
    const runId = started.body.runId as string;
    await vi.waitFor(async () => {
      expect(['done', 'failed']).toContain((await request(app).get(`/export/runs/${runId}`).set('x-user', 'alice')).body.run?.state);
    }, { timeout: 30_000, interval: 100 });
    const file = await binary(request(app).get(`/export/runs/${runId}/download`).set('x-user', 'alice'));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/^application\/zip/);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="?search-results\.zip"?/);
    expect(readZip(file.body as Buffer, { maxEntries: 100, maxTotalBytes: 1_000_000 }).map(e => e.path).sort()).toEqual(['Alpha.md', 'Beta.md']);
  });

  test('a format not offered, or none, is refused', async () => {
    const { app } = await makeApp();
    expect((await request(app).post('/export/search').set('x-user', 'alice').send({ format: 'core.csv', q: 'trip' })).status).toBe(404);
    expect((await request(app).post('/export/search').set('x-user', 'alice').send({ q: 'trip' })).status).toBe(400);
  });
});

describe('the search page', () => {
  test('tells the page whether to show Export: yes for a signed-in user, no for a visitor', async () => {
    const { app } = await makeApp();
    expect((await request(app).get('/search?q=trip').set('x-user', 'alice')).body.data.assetPickerCanExport).toBe(true);
    expect((await request(app).get('/search?q=trip')).body.data.assetPickerCanExport).toBe(false);
  });
});
