/**
 * The single-page export endpoints are removed (#2378). Nothing on screen
 * calls POST /export/html/:page or POST /export/markdown/:page since the
 * Export screen was retired (#2174), and they wrote a file into the exports
 * folder that nothing lists or cleans up.
 *
 *   - both routes are 404 for an admin, and no file reaches the exports folder;
 *   - ExportManager no longer has the code that wrote the file;
 *   - the page's "Export this page" entry, search export, and the engine's
 *     run routes are still registered.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import ExportManager from '../../managers/ExportManager';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

let exportsDir: string;

afterEach(() => {
  fs.rmSync(exportsDir, { recursive: true, force: true });
});

/** A real ExportManager writing to a temp folder, behind the real routes, as an admin. */
async function makeApp() {
  exportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdp-exports-'));
  const pageManager = {
    getPage: vi.fn().mockResolvedValue({ content: '# Welcome', lastModified: '2026-01-01' }),
    readPage: vi.fn().mockResolvedValue({ ok: true, page: { content: '# Welcome' } })
  };
  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    RenderingManager: { renderMarkdown: vi.fn().mockResolvedValue('<h1>Welcome</h1>') }
  };
  const engine = { getManager: (name: string) => managers[name] ?? null };
  const exportManager = new ExportManager(engine);
  await exportManager.initialize({ exportDirectory: exportsDir });
  managers['ExportManager'] = exportManager;

  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { userContext: unknown }).userContext = admin;
    next();
  });
  new WikiRoutes(engine).registerRoutes(app);
  return app;
}

describe('the single-page export endpoints are gone', () => {
  test.each(['/export/html/Welcome', '/export/markdown/Welcome'])('POST %s is a 404 for an admin and writes no file', async (url) => {
    const app = await makeApp();
    const res = await request(app).post(url);
    expect(res.status).toBe(404);
    expect(fs.readdirSync(exportsDir)).toEqual([]);
  });

  test('ExportManager has no saveExport, exportPageToHtml or exportToMarkdown', async () => {
    await makeApp();
    const manager = new ExportManager({ getManager: () => null }) as unknown as Record<string, unknown>;
    expect(manager['saveExport']).toBeUndefined();
    expect(manager['exportPageToHtml']).toBeUndefined();
    expect(manager['exportToMarkdown']).toBeUndefined();
  });

  test('WikiRoutes has no handler for either route', async () => {
    await makeApp();
    const routes = new WikiRoutes({ getManager: () => null }) as unknown as Record<string, unknown>;
    expect(routes['exportPageHtml']).toBeUndefined();
    expect(routes['exportPageMarkdown']).toBeUndefined();
  });
});

describe('what stays', () => {
  test('the page Export action, search export and the run routes are still registered', async () => {
    const app = await makeApp();
    for (const [verb, url] of [
      ['get', '/export/page/Welcome'],
      ['post', '/export/page/Welcome'],
      ['get', '/export/search?q=trip'],
      ['post', '/export/search'],
      ['get', '/export/runs/abc'],
      ['get', '/export/runs/abc/download']
    ] as const) {
      const res = await request(app)[verb](url);
      // Registered routes may refuse for other reasons (no engine here); an unregistered one is Express's 404 with no body.
      expect(`${verb} ${url} ${res.status === 404 && res.text.includes('Cannot') ? 'unregistered' : 'registered'}`).toBe(`${verb} ${url} registered`);
    }
  });

  test('the More menu still links to the page Export action', () => {
    expect(read('views/header.ejs')).toContain('/export/page/');
    expect(read('views/header.ejs')).toContain('Export this page');
  });

  test('the old /export link still redirects to search', async () => {
    const res = await request(await makeApp()).get('/export');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/search?from=export');
  });
});
