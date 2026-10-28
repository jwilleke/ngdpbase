/**
 * The import screen (#2021, ICE #1979): GET /import, POST /import and
 * GET /import/runs/:runId.
 *
 * What matters is who may do what, not the engine's file handling (that is
 * ImportManager.ice.test.ts):
 *
 *   - an anonymous visitor is refused, and nothing is listed or queued;
 *   - a user is offered only the receivers `receiversFor` gives them, and a
 *     `?receiver=` they may not use preselects nothing;
 *   - an upload runs as the user who sent it, with their job context, and the
 *     request carries no client-named scope or shim (#2013);
 *   - a run's status is its own user's; anyone else gets a 404;
 *   - the upload limits are configuration and are enforced before anything
 *     is queued.
 *
 * The routes run against a real ImportManager and BackgroundJobManager; only
 * the PDP, the page and file doors and configuration are stand-ins.
 */
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import WikiRoutes from '../WikiRoutes';
import ImportManager from '../../managers/ImportManager';
import BackgroundJobManager from '../../managers/BackgroundJobManager';
import { MemoryIceLedger } from '../../ice/ledger';
import { boundScope } from '../../ice/runImport';

/** Who holds what. `profile-manage` is every user's; an anonymous visitor holds nothing. */
const GRANTS: Record<string, string[]> = {
  molly: ['profile-manage', 'page-create'],
  bob: ['profile-manage', 'page-create', 'asset-upload'],
  rita: ['profile-manage'],
  Anonymous: []
};

const USERS: Record<string, { username: string; isAuthenticated: boolean; roles: string[] }> = {
  molly: { username: 'molly', isAuthenticated: true, roles: ['editor'] },
  bob: { username: 'bob', isAuthenticated: true, roles: ['editor'] },
  rita: { username: 'rita', isAuthenticated: true, roles: ['reader'] },
  Anonymous: { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] }
};

async function makeApp(config: Record<string, unknown> = {}) {
  const saved: string[] = [];
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (subject: { username: string }, permission: string) => (GRANTS[subject.username] ?? []).includes(permission)
    },
    PageManager: {
      getPageMetadata: async () => null,
      normalizePageContent: (content: string) => ({ content, changes: [] }),
      completeNcmConversion: async (content: string) => ({ content, warnings: [] }),
      savePage: async (name: string, content: string, metadata: Record<string, unknown>) => {
        saved.push(name);
        return { content, name, uuid: String(metadata.uuid), previousName: null };
      },
      refreshPageList: async () => undefined
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const jobs = new BackgroundJobManager(engine);
  managers['BackgroundJobManager'] = jobs;
  const importManager = new ImportManager(engine);
  await importManager.initialize();
  importManager.setImportLedger(new MemoryIceLedger());
  // An add-on's receiver nobody here may use.
  importManager.registerReceiver('acct', {
    name: 'ledger', label: 'Ledger', accepts: ['ncm'],
    mayUse: async () => false,
    receive: async () => ({ status: 'stored' })
  });
  managers['ImportManager'] = importManager;

  const routes = new WikiRoutes(engine);
  // The request's own context; `permitted` and `refuse` run for real on it.
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) => ({
    userContext: req.userContext,
    hasPermission: async (p: string) => (GRANTS[(req.userContext as { username: string }).username] ?? []).includes(p),
    holdsPermission: async () => false
  }) as never);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
  vi.spyOn(routes, 'renderError').mockImplementation((async (_q: Request, s: Response, status: number) => { s.status(status).send('error'); }) as never);

  const app = express();
  app.use((req, res, next) => {
    const user = USERS[String(req.headers['x-user'] ?? 'Anonymous')];
    // A password session's subject carries its key handle (#2034).
    const handle = req.headers['x-key-handle'];
    (req as unknown as { userContext: unknown }).userContext = typeof handle === 'string' ? { ...user, privateStoreHandle: handle } : user;
    // The view's data, instead of rendering it.
    (res as unknown as { render: unknown }).render = (view: string, data: unknown) => res.json({ view, data });
    next();
  });
  const call = (name: 'importPage' | 'importUpload' | 'importRunStatus') => (req: Request, res: Response) =>
    void (routes as unknown as Record<string, (q: Request, s: Response) => Promise<unknown>>)[name](req, res);
  app.get('/import', call('importPage'));
  app.post('/import', call('importUpload'));
  app.get('/import/runs/:runId', call('importRunStatus'));
  return { app, importManager, jobs, saved, managers };
}

const MD = Buffer.from('# Garden\n\nTomatoes.\n');

describe('GET /import (#2021)', () => {
  test('an anonymous visitor is sent to sign in, and no receiver is asked', async () => {
    const { app, importManager } = await makeApp();
    const asked = vi.spyOn(importManager, 'receiversFor');
    const res = await request(app).get('/import');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?redirect=/);
    expect(asked).not.toHaveBeenCalled();
  });

  test('a user is offered only the receivers they may use', async () => {
    const { app } = await makeApp();
    const molly = await request(app).get('/import').set('x-user', 'molly');
    expect(molly.body.view).toBe('import');
    expect(molly.body.data.receivers.map((r: { id: string }) => r.id)).toEqual(['core.pages']);
    const bob = await request(app).get('/import').set('x-user', 'bob');
    expect(bob.body.data.receivers.map((r: { id: string }) => r.id)).toEqual(['core.pages', 'core.files']);
  });

  test('a user who may use no receiver gets the screen with none, not a refusal', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/import').set('x-user', 'rita');
    expect(res.status).toBe(200);
    expect(res.body.data.receivers).toEqual([]);
    expect(res.body.data.preselected).toBe('');
  });

  test('?receiver= preselects one they may use, and is ignored for one they may not', async () => {
    const { app } = await makeApp();
    const usable = await request(app).get('/import?receiver=core.files').set('x-user', 'bob');
    expect(usable.body.data.preselected).toBe('core.files');
    const notTheirs = await request(app).get('/import?receiver=acct.ledger').set('x-user', 'bob');
    expect(notTheirs.body.data.preselected).toBe('');
    expect(notTheirs.body.data.receivers.map((r: { id: string }) => r.id)).not.toContain('acct.ledger');
  });

  test('each receiver comes with the original-file choices it offers (D11)', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/import').set('x-user', 'bob');
    const byId = Object.fromEntries(res.body.data.receivers.map((r: { id: string; originals: unknown }) => [r.id, r.originals]));
    expect(byId['core.pages']).toEqual({ allowed: ['none', 'cite', 'keep'], default: 'none' });
    expect(byId['core.files']).toEqual({ allowed: ['none'], default: 'none' });
  });
});

describe('POST /import (#2021)', () => {
  test('an anonymous upload is refused with 401, and nothing is queued', async () => {
    const { app, importManager } = await makeApp();
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    const res = await request(app).post('/import').field('receiver', 'core.pages').attach('files', MD, 'Garden.md');
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('queues the files as the user, with their job context and no client-named scope or shim (#2013)', async () => {
    const { app, importManager, jobs, saved } = await makeApp();
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    const job = vi.spyOn(jobs, 'enqueue');
    const res = await request(app).post('/import').set('x-user', 'molly')
      .field('receiver', 'core.pages')
      .field('scope', 'core.pages/bob')
      .field('shim', 'core.html')
      .attach('files', MD, 'Garden.md');
    expect(res.status).toBe(202);
    expect(res.body.runId).toEqual(expect.any(String));

    const [asked, ctx] = enqueue.mock.calls[0];
    expect(asked).not.toHaveProperty('scope');
    expect(asked).not.toHaveProperty('shim');
    expect(asked.receiver).toBe('core.pages');
    expect(asked.source.files).toEqual([expect.objectContaining({ name: 'Garden.md', bytes: MD })]);
    // The request's own context; the run gets the job context derived from it.
    expect(ctx).toBe(USERS.molly);
    expect(job.mock.calls[0][1]).toMatchObject({ username: 'molly', origin: 'request' });

    await jobs.whenIdle();
    await vi.waitFor(() => expect(importManager.getImportRun(res.body.runId, USERS.molly as never)?.state).toBe('done'));
    const run = importManager.getImportRun(res.body.runId, USERS.molly);
    expect(run?.scope).toBe(boundScope('core.pages', 'molly'));
    expect(run?.files[0].status).toBe('imported');
    expect(saved).toEqual(['Garden']);
  });

  test('an identity store that cannot answer is a 503 to try again shortly, and nothing is queued (#2013)', async () => {
    const { app, importManager, managers } = await makeApp();
    managers['IdentityManager'] = { canAnswer: () => false, getByUserIdentifier: async () => null };
    const res = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages').attach('files', MD, 'Garden.md');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/try again shortly/i);
    expect(importManager.importRunsFor(USERS.molly as never)).toEqual([]);
  });

  test('a receiver the user may not use is refused, and nothing is queued', async () => {
    const { app, importManager } = await makeApp();
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    for (const receiver of ['core.files', 'acct.ledger', 'no.such']) {
      const res = await request(app).post('/import').set('x-user', 'molly').field('receiver', receiver).attach('files', MD, 'Garden.md');
      expect(res.status, receiver).toBe(403);
    }
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('an original-file choice the receiver does not offer is refused (D11)', async () => {
    const { app, importManager } = await makeApp();
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    const res = await request(app).post('/import').set('x-user', 'bob')
      .field('receiver', 'core.files').field('original', 'keep').attach('files', MD, 'photo.png');
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();

    const ok = await request(app).post('/import').set('x-user', 'bob')
      .field('receiver', 'core.pages').field('original', 'cite').attach('files', MD, 'Cited.md');
    expect(ok.status).toBe(202);
    expect(enqueue.mock.calls[0][0].original).toBe('cite');
  });

  test('more files than ngdpbase.import.engine.upload-max-files is a 413, and nothing is queued', async () => {
    const { app, importManager } = await makeApp({ 'ngdpbase.import.engine.upload-max-files': 2 });
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    const res = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages')
      .attach('files', MD, 'One.md').attach('files', MD, 'Two.md').attach('files', MD, 'Three.md');
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/2 files/);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('more bytes than ngdpbase.import.engine.upload-max-bytes is a 413, and nothing is queued', async () => {
    const { app, importManager } = await makeApp({ 'ngdpbase.import.engine.upload-max-bytes': 30 });
    const enqueue = vi.spyOn(importManager, 'enqueueUpload');
    // Each file is under the limit; together they are over it.
    const res = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages')
      .attach('files', MD, 'One.md').attach('files', MD, 'Two.md');
    expect(res.status).toBe(413);
    const one = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages')
      .attach('files', Buffer.alloc(40, 'a'), 'Big.md');
    expect(one.status).toBe(413);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('no file is a 400', async () => {
    const { app } = await makeApp();
    const res = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages');
    expect(res.status).toBe(400);
  });
});

describe('GET /import/runs/:runId (#2021)', () => {
  test('a run is shown to the user it ran as; anyone else, or anonymous, is refused', async () => {
    const { app, jobs } = await makeApp();
    const started = await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages').attach('files', MD, 'Garden.md');
    await jobs.whenIdle();

    const own = await request(app).get(`/import/runs/${started.body.runId}`).set('x-user', 'molly');
    expect(own.status).toBe(200);
    expect(own.body.run).toMatchObject({ runId: started.body.runId, username: 'molly' });
    expect(own.headers['cache-control']).toBe('no-store');

    const other = await request(app).get(`/import/runs/${started.body.runId}`).set('x-user', 'bob');
    expect(other.status).toBe(404);
    expect(other.body.run).toBeUndefined();

    const anonymous = await request(app).get(`/import/runs/${started.body.runId}`);
    expect(anonymous.status).toBe(401);
  });

  test('the screen lists only the user\'s own runs', async () => {
    const { app, jobs } = await makeApp();
    await request(app).post('/import').set('x-user', 'molly').field('receiver', 'core.pages').attach('files', MD, 'Mine.md');
    await request(app).post('/import').set('x-user', 'bob').field('receiver', 'core.pages').attach('files', MD, 'Bobs.md');
    await jobs.whenIdle();
    const res = await request(app).get('/import').set('x-user', 'molly');
    expect(res.body.data.runs.map((r: { username: string }) => r.username)).toEqual(['molly']);
  });
});

describe('POST /import: an original kept in an encrypted store (#2034)', () => {
  /** phr's shape: keeps originals in the user's encrypted store, which only a context holding the key may write. */
  function sealedReceiver(importManager: ImportManager) {
    const keeps: Array<{ username: string; handle?: string }> = [];
    importManager.registerReceiver('vaultrec', {
      name: 'records', label: 'Records', accepts: ['file'],
      keepsEncrypted: true,
      originals: { allowed: ['keep', 'none'], default: 'keep' },
      mayUse: async () => true,
      receive: async () => ({ status: 'stored', ref: 'record-1' }),
      keepOriginal: async (_item, ctx) => {
        const handle = (ctx as { privateStoreHandle?: string }).privateStoreHandle;
        if (!handle) return { status: 'refused', message: 'Your vault is locked. Unlock it and try again.' };
        keeps.push({ username: ctx.username, handle });
        return { status: 'stored', ref: `original-${keeps.length}` };
      }
    });
    return keeps;
  }

  test('is kept during the upload with the request context, and the run reuses it', async () => {
    const { app, importManager, jobs } = await makeApp();
    const keeps = sealedReceiver(importManager);
    const res = await request(app).post('/import').set('x-user', 'molly').set('x-key-handle', 'molly-sid')
      .field('receiver', 'vaultrec.records').field('original', 'keep').attach('files', MD, 'labs.xml');
    expect(res.status).toBe(202);
    expect(keeps).toEqual([{ username: 'molly', handle: 'molly-sid' }]);

    await jobs.whenIdle();
    await vi.waitFor(() => expect(importManager.getImportRun(res.body.runId, USERS.molly as never)?.state).toBe('done'));
    expect(importManager.getImportRun(res.body.runId, USERS.molly)?.files[0]).toMatchObject({ status: 'imported', original: { ref: 'original-1' } });
    expect(keeps).toHaveLength(1);
  });

  test('a refused keep refuses the upload with why, and nothing is queued', async () => {
    const { app, importManager, jobs } = await makeApp();
    sealedReceiver(importManager);
    const enqueue = vi.spyOn(jobs, 'enqueue');
    const res = await request(app).post('/import').set('x-user', 'molly')
      .field('receiver', 'vaultrec.records').field('original', 'keep').attach('files', MD, 'labs.xml');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('The original of "labs.xml" could not be kept: Your vault is locked. Unlock it and try again. Nothing was imported.');
    expect(enqueue).not.toHaveBeenCalled();
    expect(importManager.importRunsFor(USERS.molly)).toEqual([]);
  });

  test('an original that is not kept is not touched at upload', async () => {
    const { app, importManager, jobs } = await makeApp();
    const keeps = sealedReceiver(importManager);
    const res = await request(app).post('/import').set('x-user', 'molly')
      .field('receiver', 'vaultrec.records').field('original', 'none').attach('files', MD, 'labs.xml');
    expect(res.status).toBe(202);
    await jobs.whenIdle();
    expect(keeps).toEqual([]);
  });
});

