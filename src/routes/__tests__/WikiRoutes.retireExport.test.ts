/**
 * The old general Export screen is retired (#2174, slice 2). Exports start
 * from search results or from a page. An old link or bookmark to /export
 * lands on the search page with a one-line note, not a 404.
 *
 *   - /export redirects to /search and the search page carries the note;
 *   - the header, the mobile menu and the two admin pages have no link to it;
 *   - the saved-exports list and its download and delete routes are gone;
 *   - search export and the page export are still registered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';
import WikiRoutes from '../WikiRoutes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function makeApp() {
  const routes = new WikiRoutes({ getManager: () => null });
  const app = express();
  routes.registerRoutes(app);
  return app;
}

describe('an old /export link', () => {
  test('lands on the search page, with a way for the page to show the note', async () => {
    const res = await request(makeApp()).get('/export');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/search?from=export');
  });

  const searchNotice = async (query: Record<string, string>, isAuthenticated: boolean) => {
    const routes = new WikiRoutes({ getManager: () => null });
    vi.spyOn(routes, 'createWikiContext').mockReturnValue({
      userContext: isAuthenticated ? { username: 'alice', isAuthenticated } : { username: 'anonymous', isAuthenticated },
      hasPermission: async () => true
    });
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
    vi.spyOn(routes as never, 'getPickerKeywordCatalogs').mockResolvedValue({ userKeywords: [], systemKeywords: [], categories: [] });
    vi.spyOn(routes as never, 'getPickerYears').mockResolvedValue([] as never);
    const res = { render: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() };
    await routes.searchPages({ query }, res);
    return (res.render.mock.calls[0][1] as { assetPickerNotice?: string }).assetPickerNotice;
  };

  test('the search page gets the note for that link, and none otherwise', async () => {
    expect(await searchNotice({ from: 'export' }, true)).toBe('Exports now start from search results. Search, then choose Export these results.');
    expect(await searchNotice({}, true)).toBeFalsy();
    expect(await searchNotice({ from: 'something else' }, true)).toBeFalsy();
  });

  test('a signed-out visitor gets no note, since they are not shown the Export button', async () => {
    expect(await searchNotice({ from: 'export' }, false)).toBeFalsy();
  });

  test('the search view shows the note', () => {
    expect(read('views/browse-attachments.ejs')).toContain('assetPickerNotice');
  });
});

describe('no link to the old screen', () => {
  test.each(['views/header.ejs', 'views/admin-dashboard.ejs', 'views/admin-settings.ejs'])('%s has no link to /export or /exports', (file) => {
    expect(read(file)).not.toMatch(/href="\/exports?"/);
  });

  test('the dashboard has no Export Data button or its help link', () => {
    expect(read('views/admin-dashboard.ejs')).not.toMatch(/Export Data|view\/export-data/);
  });
});

describe('the saved-exports list is gone', () => {
  test.each([
    ['get', '/exports'],
    ['get', '/download/export-1.zip'],
    ['delete', '/deleteExport/export-1.zip']
  ] as const)('%s %s is not a route', async (verb, url) => {
    const res = await request(makeApp())[verb](url);
    expect(res.status).toBe(404);
  });

  test('its views are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'views/export.ejs'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'views/exports.ejs'))).toBe(false);
  });

  test('the two help pages about it are gone', () => {
    const slugs = fs.readdirSync(path.join(ROOT, 'required-pages'))
      .map((f) => /^slug:\s*(.+)$/m.exec(read(`required-pages/${f}`))?.[1]?.trim());
    expect(slugs).not.toContain('export');
    expect(slugs).not.toContain('export-data');
  });
});

describe('what stays', () => {
  test('search export and page export are still registered', async () => {
    const app = makeApp();
    const search = await request(app).get('/export/search?q=trip');
    expect(search.status).not.toBe(404);
    const page = await request(app).get('/export/page/Alpha');
    expect(page.status).not.toBe(404);
  });
});
