/**
 * Saving a NEW page whose title another public page already has (#2376).
 *
 * The whole save path is real: the editor's POST /save, PageManager.savePage,
 * ValidationManager.checkConflicts and the file provider. Only the policy
 * gates and the page chrome are stood in. The same title always gives the same
 * slug, and checkConflicts checks the slug first, so the clash used to come
 * back as a slug clash: a 500 naming the other page's id.
 *
 * - same title (any case): 409 "Page Conflict", the other page linked, no id;
 * - another title with the same slug: 409, "too close", the other page linked;
 * - both in the HTML and in the editor's JSON; the log keeps the id;
 * - a private-store clash is unchanged and names nothing.
 */
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import express from 'express';
import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import type ValidationManager from '../../managers/ValidationManager';
import logger from '../../utils/logger';
import { actor } from '../../test-support/actors';
import { vaultCategories } from '../../test-support/vaults';
import { authorshipSite, type AuthorshipSite } from '../../test-support/authorshipSite';
import { allowingWriteDoor } from '../../__tests__/__fixtures__/pageWriteDoor';

const ERROR_VIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../views/error.ejs');
const ERROR_TEMPLATE = fs.readFileSync(ERROR_VIEW, 'utf8').replace(/<%- include\([^%]*%>/g, '');
const UUID_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

describe('a new page with a taken title or slug (#2376)', () => {
  let site: AuthorshipSite;
  let app: express.Express;
  let existingId: string;
  let lastRender: { view: string; data: Record<string, unknown>; html: string } | undefined;

  const post = (typed: string) => request(app).post('/save/Untitled').type('json').send({
    content: '# New', title: typed, 'system-category': 'general', _csrf: 'test-csrf-token'
  });

  beforeEach(async () => {
    lastRender = undefined;
    site = await authorshipSite({
      accounts: { jim: 'urn:uuid:11111111-1111-4111-8111-111111111111' },
      config: { 'ngdpbase.system-category': vaultCategories() }
    });
    for (const [name, decider] of Object.entries(allowingWriteDoor())) site.managers.set(name, decider);

    // The existing public pages, saved through the same door the editor uses.
    // Made as the editor makes a page, so each has its slug.
    const seed = async (title: string) => {
      const validation = site.managers.get('ValidationManager') as ValidationManager;
      const metadata = validation.generateValidMetadata(title, { 'system-category': 'general' });
      return site.pageManager.savePage(title, `# ${title}`, metadata as never, actor('jim'));
    };
    ({ uuid: existingId } = await seed('Entero'));
    await seed('R-D Plans v2');

    const routes = new WikiRoutes({ getManager: (name: string) => site.managers.get(name) ?? null });
    const user = actor('jim');
    vi.spyOn(routes as never, 'createWikiContext').mockImplementation((() => ({
      userContext: user,
      hasPermission: async () => true,
      hasPermissionOn: async () => true
    })));
    vi.spyOn(routes as never, 'getSystemCategories').mockReturnValue(['general'] as never);
    vi.spyOn(routes as never, 'systemCategoryForWrite').mockResolvedValue({ ok: true, category: 'general', admin: false });
    vi.spyOn(routes as never, 'writeRefusal').mockResolvedValue(null);
    vi.spyOn(routes as never, 'isSignedOut').mockReturnValue(false);
    vi.spyOn(routes as never, 'getCommonTemplateData').mockResolvedValue({});

    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      (req as unknown as { userContext: unknown }).userContext = user;
      (req as unknown as { session: unknown }).session = { csrfToken: 'test-csrf-token' };
      // The real error view, so what is asserted is what the reader sees.
      res.render = ((view: string, data: Record<string, unknown>) => {
        const html = ejs.render(ERROR_TEMPLATE, { error: { status: 409 }, originalUrl: '/', ...data });
        lastRender = { view, data, html };
        res.send(html);
      }) as never;
      next();
    });
    app.post('/save/:page', (req, res) => { void routes.savePage(req, res); });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await site.remove();
  });

  describe('the same title', () => {
    test('the page shows Page Conflict, the other page as a link, and no id', async () => {
      const response = await post('Entero');
      expect(response.status).toBe(409);
      expect(lastRender?.data.title).toBe('Page Conflict');
      expect(lastRender?.data.message).toBe('A page called "Entero" already exists.');
      expect(lastRender?.html).toContain('A page called "<a href="/view/Entero">Entero</a>" already exists.');
      expect(response.text).not.toMatch(UUID_SHAPE);
      expect(response.text).not.toContain(existingId);
    });

    test('the editor’s JSON has the same text and the link target, and no id', async () => {
      const response = await post('Entero').set('Accept', 'application/json');
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        ok: false,
        error: 'A page called "Entero" already exists.',
        conflictingPage: { title: 'Entero', url: '/view/Entero' }
      });
      expect(response.text).not.toContain(existingId);
    });

    test('a title that differs only by case links the other page by its own title', async () => {
      const response = await post('entero').set('Accept', 'application/json');
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        ok: false,
        error: 'A page called "Entero" already exists.',
        conflictingPage: { title: 'Entero', url: '/view/Entero' }
      });
    });

    test('nothing was saved', async () => {
      await post('Entero');
      const pages = await site.pageManager.getAllPageNames();
      expect(pages.filter((n: string) => n.toLowerCase() === 'entero')).toEqual(['Entero']);
      expect(pages).not.toContain('Untitled');
    });

    test('the log keeps the id', async () => {
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
      await post('Entero');
      expect(errorLog.mock.calls.flat().map(String).join(' ')).toContain(existingId);
    });
  });

  describe('a different title with the same slug', () => {
    // "R&D Plans v2" and "R-D Plans v2" both give the slug r-d-plans-v2.
    const typed = 'R&D Plans v2';

    test('the page shows Page Conflict, says the name is too close, and links the other page', async () => {
      const response = await post(typed);
      expect(response.status).toBe(409);
      expect(lastRender?.data.title).toBe('Page Conflict');
      expect(lastRender?.data.message).toBe('That name is too close to the name of an existing page, "R-D Plans v2".');
      expect(lastRender?.html).toContain('That name is too close to the name of an existing page, "<a href="/view/R-D%20Plans%20v2">R-D Plans v2</a>".');
      expect(response.text).not.toMatch(UUID_SHAPE);
      expect(response.text).not.toContain('slug');
    });

    test('the editor’s JSON has the text, the link target and no id', async () => {
      const response = await post(typed).set('Accept', 'application/json');
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        ok: false,
        error: 'That name is too close to the name of an existing page, "R-D Plans v2".',
        conflictingPage: { title: 'R-D Plans v2', url: '/view/R-D%20Plans%20v2', tooClose: true }
      });
      expect(response.text).not.toMatch(UUID_SHAPE);
    });

    test('the log keeps the id', async () => {
      const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => logger);
      await post(typed);
      expect(errorLog.mock.calls.flat().map(String).join(' ')).toMatch(UUID_SHAPE);
    });
  });

  test('a title nobody has is saved', async () => {
    const response = await post('Something New').set('Accept', 'application/json');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  test('a private-store clash is unchanged: it names no title and no page', async () => {
    const jim = actor('jim');
    await site.pageManager.savePage('Diary', 'one', { private: true, 'system-category': 'general' }, jim);
    const err = await site.pageManager.savePage('Diary', 'two', { private: true, 'system-category': 'general' }, jim).catch((e: unknown) => e);
    expect((err as Error).message).toBe('A page with this title is already in use in this store');
    expect((err as Error).name).toBe('Error');
  });
});
