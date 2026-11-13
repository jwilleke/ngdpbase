/**
 * The Export action on an add-on's list (#2174): GET and POST
 * /export/source/:source, for a source an add-on registered.
 *
 *   - the add-on's own read permission is the only gate: a user who holds it
 *     is offered CSV, and needs no core permission such as page-export;
 *   - a user who does not is told there is nothing to export, and a direct
 *     POST is refused;
 *   - the run, its status and its download are the ones every export uses;
 *   - core's own sources are not reachable here, so page-export still
 *     guards pages and searches.
 */
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import WikiRoutes, { exportStartRateLimiter } from '../WikiRoutes';
import ImportManager from '../../managers/ImportManager';
import BackgroundJobManager from '../../managers/BackgroundJobManager';
import ExportManager from '../../managers/ExportManager';
import { buildAddonHost } from '../../utils/addonHost';
import type { AddonManifest } from '../../managers/AddonsManager';
import fixtureAddon, { FixtureRows } from '../../managers/__tests__/__fixtures__/ice-export-fixture-addon/index';

const USERS: Record<string, { username: string; isAuthenticated: boolean; roles: string[] }> = {
  alice: { username: 'alice', isAuthenticated: true, roles: ['reader'] },
  bob: { username: 'bob', isAuthenticated: true, roles: ['reader'] },
  pat: { username: 'pat', isAuthenticated: true, roles: ['reader'] },
  Anonymous: { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] }
};
// pat holds page-export but not the add-on's read permission; alice is the reverse.
const GRANTS: Record<string, string[]> = { alice: [], bob: [], pat: ['page-export'], Anonymous: [] };

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
    PageManager: {
      mayShowPage: async () => true,
      readPage: async (ref: string) => ({ ok: true, name: ref, metadata: { title: ref }, value: { title: ref, uuid: ref, content: 'Body', metadata: {} } })
    }
  };
  const engine = {
    getManager: (name: string) => managers[name] ?? null,
    registerManager: (name: string, m: unknown) => { managers[name] = m; }
  };
  managers['ExportManager'] = new ExportManager(engine);
  managers['BackgroundJobManager'] = new BackgroundJobManager(engine);
  const importManager = new ImportManager(engine);
  managers['ImportManager'] = importManager;
  await importManager.initialize();

  const manifest = (await fs.readJson(path.join(__dirname, '../../managers/__tests__/__fixtures__/ice-export-fixture-addon/package.json'))).ngdpbase as AddonManifest;
  await fixtureAddon.register(engine, {}, buildAddonHost(manifest.slug, {}, undefined, engine, manifest));
  const rows = managers['FixtureRows'] as FixtureRows;
  rows.readers.add('alice');
  rows.rows.push(
    { id: 'r1', owner: 'alice', properties: { memo: 'Mine', amount: 5 } },
    { id: 'r2', owner: 'carol', properties: { memo: 'Carol only', amount: 7 } }
  );

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
  app.get('/export/source/:source', call('exportSourceFormats'));
  app.post('/export/source/:source', call('exportSourceStart'));
  app.get('/export/runs/:runId', call('exportRunStatus'));
  app.get('/export/runs/:runId/download', call('exportRunDownload'));
  return { app, importManager };
}

beforeEach(() => exportStartRateLimiter.reset());

const SOURCE = '/export/source/ice-export.rows';

describe('GET /export/source/:source', () => {
  test('a user who may read the list is offered CSV only, and the screen carries the list to the POST', async () => {
    const { app } = await makeApp();
    const res = await request(app).get(`${SOURCE}?ref=all&back=%2Faddons%2Frows`).set('x-user', 'alice');
    expect(res.status).toBe(200);
    expect(res.body.view).toBe('export-item');
    expect(res.body.data).toMatchObject({
      exportName: 'Rows', exportBack: '/addons/rows', exportAction: SOURCE, exportBody: { ref: 'all' }, formats: [{ id: 'core.csv-file', label: 'CSV (.csv)' }]
    });
  });

  test('a user who may not read the list is told there is nothing to export', async () => {
    const { app } = await makeApp();
    expect((await request(app).get(`${SOURCE}?ref=all`).set('x-user', 'bob')).status).toBe(404);
    // page-export does not stand in for the add-on's own permission.
    expect((await request(app).get(`${SOURCE}?ref=all`).set('x-user', 'pat')).status).toBe(404);
  });

  test('a visitor who is not signed in is told there is nothing to export', async () => {
    const { app } = await makeApp();
    expect((await request(app).get(`${SOURCE}?ref=all`)).status).toBe(404);
  });

  test('a back link that leaves the site is not followed', async () => {
    const { app } = await makeApp();
    const res = await request(app).get(`${SOURCE}?ref=all&back=https%3A%2F%2Fevil.example%2F`).set('x-user', 'alice');
    expect(res.body.data.exportBack).toBe('/');
  });

  test('core\'s own sources are not offered here: pages and searches keep their own routes', async () => {
    const { app } = await makeApp();
    expect((await request(app).get('/export/source/core.pages?ref=Main').set('x-user', 'pat')).status).toBe(404);
    expect((await request(app).get('/export/source/core.search?ref=%7B%7D').set('x-user', 'pat')).status).toBe(404);
  });
});

describe('POST /export/source/:source', () => {
  const binary = (res: request.Request) => res.buffer(true).parse((r, done) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => done(null, Buffer.concat(chunks)));
  });

  test('the export runs and downloads as a CSV of the rows the user may read, with no core permission held', async () => {
    const { app } = await makeApp();
    const start = await request(app).post(SOURCE).set('x-user', 'alice').send({ ref: 'all', format: 'core.csv-file' });
    expect(start.status).toBe(202);
    const runId = start.body.runId as string;
    await vi.waitFor(async () => {
      const status = await request(app).get(`/export/runs/${runId}`).set('x-user', 'alice');
      expect(status.body.run.state).toBe('done');
    });
    const file = await binary(request(app).get(`/export/runs/${runId}/download`).set('x-user', 'alice'));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/text\/csv/);
    expect(file.headers['content-disposition']).toMatch(/rows\.csv/);
    expect((file.body as Buffer).toString('utf8')).toBe('memo,amount\r\nMine,5\r\n');
    // Another user cannot read the run.
    expect((await request(app).get(`/export/runs/${runId}`).set('x-user', 'bob')).status).toBe(404);
    expect((await request(app).get(`/export/runs/${runId}/download`).set('x-user', 'bob')).status).toBe(404);
  });

  test('a user who may not read the list is refused, and no row is read', async () => {
    const { app } = await makeApp();
    for (const user of ['bob', 'pat']) {
      const res = await request(app).post(SOURCE).set('x-user', user).send({ ref: 'all', format: 'core.csv-file' });
      expect(res.status).toBe(404);
    }
    expect((await request(app).post(SOURCE).send({ ref: 'all', format: 'core.csv-file' })).status).toBe(404);
  });

  test('a format that is not offered is refused', async () => {
    const { app } = await makeApp();
    expect((await request(app).post(SOURCE).set('x-user', 'alice').send({ ref: 'all', format: 'core.pdf' })).status).toBe(404);
    expect((await request(app).post(SOURCE).set('x-user', 'alice').send({ ref: 'all' })).status).toBe(400);
  });

  test('core\'s own sources cannot be started here, even by someone holding page-export', async () => {
    const { app } = await makeApp();
    const res = await request(app).post('/export/source/core.pages').set('x-user', 'pat').send({ ref: 'Main', format: 'core.ncm-file' });
    expect(res.status).toBe(404);
  });
});
