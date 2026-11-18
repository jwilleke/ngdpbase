/**
 * @jest-environment node
 *
 * The dashboard "needs sync" count (#2389). A live copy whose front matter
 * does not parse needs a sync; it must not abort the count, and the parse must
 * skip gray-matter's cache (a parse that threw is cached as the whole file as
 * body, so the next call returns it without an error).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import WikiRoutes from '../WikiRoutes';

const BROKEN = '2f6c8e1a-9b3d-4c7e-a5f0-1d2e3f4a5b6c';
const GOOD = '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const page = (uuid: string, body: string, extra = '') => `---\ntitle: T${uuid.slice(0, 4)}\nuuid: ${uuid}\nslug: s${uuid.slice(0, 4)}\n${extra}---\n${body}\n`;

describe('admin dashboard: required pages that need sync (#2389)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-dash-sync-'));
    await fs.mkdir(path.join(root, 'required-pages'));
    await fs.mkdir(path.join(root, 'pages'));
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(root, { recursive: true, force: true });
  });

  async function needed(): Promise<number> {
    const requiredDir = path.join(root, 'required-pages');
    const pagesDir = path.join(root, 'pages');
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir' ? requiredDir : def)),
      getResolvedDataPath: vi.fn(() => pagesDir)
    };
    const engine = {
      maintenance: { has: () => false, reasons: () => [] },
      getManager: vi.fn((name: string) => {
        if (name === 'UserManager') return { getUsers: async () => [], hasPermission: async () => true };
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'PageManager') return { getAllPages: async () => [] };
        return null;
      })
    };
    const routes = new WikiRoutes(engine) as unknown as {
      adminDashboard(req: unknown, res: unknown): Promise<void>;
      createWikiContext: unknown;
      hasAdminViewAccess: unknown;
      getCommonTemplateData: unknown;
    };
    routes.createWikiContext = () => ({ userContext: admin, hasPermission: async () => true });
    routes.hasAdminViewAccess = async () => true;
    routes.getCommonTemplateData = async () => ({});
    const res = {
      status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
      render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
    };
    await routes.adminDashboard({ session: { csrfToken: 't' }, userContext: admin, query: {}, path: '/admin', originalUrl: '/admin', get: () => 'localhost' }, res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.render).toHaveBeenCalledWith('admin-dashboard', expect.anything());
    return (res.render.mock.calls[0][1] as { requiredPagesSyncNeeded: number }).requiredPagesSyncNeeded;
  }

  test('a live copy with broken front matter counts as needing sync, and the pages after it are still counted', { retry: 0 }, async () => {
    // retry: 0 — a retry would find the text in gray-matter's cache and pass.
    const requiredDir = path.join(root, 'required-pages');
    const pagesDir = path.join(root, 'pages');
    // Files read in name order: the broken one first.
    await fs.writeFile(path.join(requiredDir, `${BROKEN}.md`), page(BROKEN, 'shipped'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${BROKEN}.md`), `---\ntitle: Broken\nuuid: ${BROKEN}\n\nbroken dashboard body\n- list\n`, 'utf8');
    await fs.writeFile(path.join(requiredDir, `${GOOD}.md`), page(GOOD, 'new body'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${GOOD}.md`), page(GOOD, 'old body'), 'utf8');

    expect(await needed()).toBe(2);
  });
});
