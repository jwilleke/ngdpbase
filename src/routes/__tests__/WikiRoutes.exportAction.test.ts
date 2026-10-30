/**
 * The Export action on a page (#2120, ICE #1979): GET and POST
 * /export/page/:page, GET /export/runs/:runId and its download.
 *
 *   - export starts from the page: only the formats the engine can make
 *     from a page are listed, and nothing (a 404) to a user who may not
 *     read it or does not hold `page-export` (D5);
 *   - an anonymous visitor is sent to sign in;
 *   - the export runs in the background as the user who asked, and its
 *     status and file are theirs alone;
 *   - end to end, a page comes back as a PDF: through a stand-in renderer
 *     always, and through real headless Chromium when one is available
 *     (as `pdfEngine.integration.test.ts` finds it).
 *
 * The routes run against a real ImportManager, BackgroundJobManager and
 * ExportManager; only the PDP, the page door, rendering and configuration
 * are stand-ins.
 */
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import WikiRoutes from '../WikiRoutes';
import ImportManager from '../../managers/ImportManager';
import ExportManager from '../../managers/ExportManager';
import BackgroundJobManager from '../../managers/BackgroundJobManager';
import { resolveChromium, type PdfJob, type PdfJobResult } from '../../export/pdfEngine';

const chromium = await resolveChromium(process.env.NGDPBASE_TEST_CHROMIUM ?? '');
if (!chromium.ok) console.warn(`[WikiRoutes.exportAction] real-Chromium test skipped: ${chromium.reason}`);

const GRANTS: Record<string, string[]> = {
  alice: ['profile-manage', 'page-export'],
  bob: ['profile-manage', 'page-export'],
  rita: ['profile-manage'],
  Anonymous: []
};
/** Who may read the page. */
const READERS = new Set(['alice', 'rita']);

const USERS: Record<string, { username: string; isAuthenticated: boolean; roles: string[] }> = {
  alice: { username: 'alice', isAuthenticated: true, roles: ['reader'] },
  bob: { username: 'bob', isAuthenticated: true, roles: ['reader'] },
  rita: { username: 'rita', isAuthenticated: true, roles: ['reader'] },
  Anonymous: { username: 'Anonymous', isAuthenticated: false, roles: ['anonymous'] }
};

const PAGE = 'Trip Notes';
const FAKE_PDF = Buffer.from('%PDF-1.7 stand-in');

/** `renderer`: the stand-in PDF render, or null for the real Chromium found above. */
async function makeApp(renderer: ((job: PdfJob) => Promise<PdfJobResult>) | null) {
  const config: Record<string, unknown> = {
    'ngdpbase.export.pdf.provider': 'local-chrome',
    'ngdpbase.export.pdf.provider.local-chrome.chromium-path': chromium.ok ? chromium.executablePath : ''
  };
  const pdfJobs: PdfJob[] = [];
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      getProperty: (key: string, fallback: unknown) => (key in config ? config[key] : fallback),
      getResolvedDataPath: (_key: string, fallback: string) => fallback
    },
    PolicyDecisionPoint: {
      permits: async (subject: { username: string }, p: string) => (GRANTS[subject.username] ?? []).includes(p),
      holds: async (subject: { username: string }, p: string) => (GRANTS[subject.username] ?? []).includes(p)
    },
    PageManager: {
      mayShowPage: async (ref: string, ctx: { username: string }) => ref === PAGE && READERS.has(ctx.username),
      readPage: async (ref: string, ctx: { username: string }) => {
        if (ref !== PAGE) return { ok: false, refusal: 'not-found' };
        if (!READERS.has(ctx.username)) return { ok: false, refusal: 'denied' };
        const metadata = { title: PAGE, uuid: 'u-1', lastModified: '2026-10-30' };
        return { ok: true, name: PAGE, metadata, value: { title: PAGE, uuid: 'u-1', content: 'Packed light: one bag.', metadata } };
      }
    },
    RenderingManager: {
      renderMarkdown: async (content: string) => `<p>${content}</p>`
    }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const jobs = new BackgroundJobManager(engine);
  managers['BackgroundJobManager'] = jobs;
  const exportManager = new ExportManager(engine);
  if (renderer) {
    const m = exportManager as unknown as { pdfRenderer: unknown; chromiumResolver: unknown };
    m.pdfRenderer = (job: PdfJob) => {
      pdfJobs.push(job);
      return renderer(job);
    };
    m.chromiumResolver = async () => ({ ok: true, executablePath: '/usr/bin/chromium', source: 'system' });
  }
  managers['ExportManager'] = exportManager;
  const importManager = new ImportManager(engine);
  await importManager.initialize();
  managers['ImportManager'] = importManager;

  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) => ({
    userContext: req.userContext,
    hasPermission: async (p: string) => (GRANTS[(req.userContext as { username: string }).username] ?? []).includes(p),
    holdsPermission: async () => false
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
  app.get('/export/page/:page', call('exportPageFormats'));
  app.post('/export/page/:page', call('exportPageStart'));
  app.get('/export/runs/:runId', call('exportRunStatus'));
  app.get('/export/runs/:runId/download', call('exportRunDownload'));
  return { app, importManager, pdfJobs };
}

const pageUrl = `/export/page/${encodeURIComponent(PAGE)}`;

/** Start an export as `user` and wait until it has ended. */
async function exportAs(app: express.Express, user: string, format: string) {
  const started = await request(app).post(pageUrl).set('x-user', user).send({ format });
  expect(started.status).toBe(202);
  const runId = started.body.runId as string;
  let run: { state: string; error?: string } | undefined;
  await vi.waitFor(async () => {
    run = (await request(app).get(`/export/runs/${runId}`).set('x-user', user)).body.run;
    expect(['done', 'failed']).toContain(run?.state);
  }, { timeout: 60_000, interval: 100 });
  return { runId, run: run };
}

/** supertest collects a binary body as a Buffer. */
const binary = (res: request.Request) => res.buffer(true).parse((r, done) => {
  const chunks: Buffer[] = [];
  r.on('data', (c: Buffer) => chunks.push(c));
  r.on('end', () => done(null, Buffer.concat(chunks)));
});

describe('GET /export/page/:page — the Export action offers only what fits', () => {
  test('an anonymous visitor is sent to sign in', async () => {
    const { app, importManager } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    const asked = vi.spyOn(importManager, 'exportFormatsFor');
    const res = await request(app).get(pageUrl);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?redirect=/);
    expect(asked).not.toHaveBeenCalled();
  });

  test('a reader holding page-export is offered the page formats, PDF among them', async () => {
    const { app } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    const res = await request(app).get(pageUrl).set('x-user', 'alice');
    expect(res.body.view).toBe('export-item');
    expect(res.body.data.formats).toEqual([
      { id: 'core.ncm-file', label: 'NCM (.md, as stored)' },
      { id: 'core.html-file', label: 'HTML (.html)' },
      { id: 'core.markdown-file', label: 'Markdown (.md)' },
      { id: 'core.pdf', label: 'PDF (.pdf)' }
    ]);
  });

  test('a user who may not read the page, or does not hold page-export, gets a 404 and nothing offered', async () => {
    const { app } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    expect((await request(app).get(pageUrl).set('x-user', 'bob')).status).toBe(404);
    expect((await request(app).get(pageUrl).set('x-user', 'rita')).status).toBe(404);
  });
});

describe('POST /export/page/:page and the run', () => {
  test('a user who may not read the page cannot start an export of it', async () => {
    const { app, pdfJobs } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    const res = await request(app).post(pageUrl).set('x-user', 'bob').send({ format: 'core.pdf' });
    expect(res.status).toBe(404);
    expect(pdfJobs).toEqual([]);
  });

  test('a format not offered for a page is refused', async () => {
    const { app } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    expect((await request(app).post(pageUrl).set('x-user', 'alice').send({ format: 'core.csv' })).status).toBe(404);
    expect((await request(app).post(pageUrl).set('x-user', 'alice').send({})).status).toBe(400);
  });

  test('end to end: a page exported as PDF is a download for its user only', async () => {
    const { app, pdfJobs } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    const { runId, run } = await exportAs(app, 'alice', 'core.pdf');
    expect(run).toMatchObject({ state: 'done', file: { name: 'Trip Notes.pdf', mediaType: 'application/pdf' } });
    // The page was rendered, then printed.
    expect(pdfJobs).toHaveLength(1);
    expect(pdfJobs[0].kind === 'render' && pdfJobs[0].html).toContain('Packed light: one bag.');

    const file = await binary(request(app).get(`/export/runs/${runId}/download`).set('x-user', 'alice'));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/^application\/pdf/);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="Trip Notes\.pdf"/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toBe('no-store');
    expect((file.body as Buffer).equals(FAKE_PDF)).toBe(true);

    // Anyone else neither sees it nor downloads it.
    expect((await request(app).get(`/export/runs/${runId}`).set('x-user', 'rita')).status).toBe(404);
    expect((await request(app).get(`/export/runs/${runId}/download`).set('x-user', 'rita')).status).toBe(404);
  });

  test('a PDF engine that fails gives a failed run with a plain reason, and no file', async () => {
    const { app } = await makeApp(async () => (({ ok: false, reason: 'Chromium crashed' })));
    const { runId, run } = await exportAs(app, 'alice', 'core.pdf');
    expect(run.state).toBe('failed');
    expect(run.error).toBeTruthy();
    expect((await request(app).get(`/export/runs/${runId}/download`).set('x-user', 'alice')).status).toBe(404);
  });

  test('HTML and Markdown come back as their own files', async () => {
    const { app } = await makeApp(async () => ({ ok: true, pdf: FAKE_PDF }));
    const html = await exportAs(app, 'alice', 'core.html-file');
    const htmlFile = await request(app).get(`/export/runs/${html.runId}/download`).set('x-user', 'alice');
    expect(htmlFile.headers['content-disposition']).toMatch(/filename="Trip Notes\.html"/);
    expect(htmlFile.text).toContain('<p>Packed light: one bag.</p>');

    const md = await exportAs(app, 'alice', 'core.markdown-file');
    const mdFile = await request(app).get(`/export/runs/${md.runId}/download`).set('x-user', 'alice');
    expect(mdFile.text).toContain('# Trip Notes\n\nPacked light: one bag.');
  });
});

describe.skipIf(!chromium.ok)('end to end with real Chromium (#2120, #1974)', () => {
  test('a page exported as PDF is a real PDF of the page', async () => {
    const { app } = await makeApp(null);
    const { runId, run } = await exportAs(app, 'alice', 'core.pdf');
    expect(run.state).toBe('done');
    const file = await binary(request(app).get(`/export/runs/${runId}/download`).set('x-user', 'alice'));
    const bytes = file.body as Buffer;
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  }, 90_000);
});
