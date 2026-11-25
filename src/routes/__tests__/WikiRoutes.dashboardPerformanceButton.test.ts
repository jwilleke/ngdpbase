/**
 * The admin dashboard's "Page building speed" button (#2468): the page opens for an account that
 * passes the admin-read permission check, so the button is shown to it too, not only to
 * accounts that pass the admin-system one.
 */
import { describe, test, expect, vi } from 'vitest';
import ejs from 'ejs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WikiRoutes from '../WikiRoutes';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

async function locals(): Promise<Record<string, unknown>> {
  const engine = {
    maintenance: { has: () => false, reasons: () => [] },
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return { getUsers: async () => [], hasPermission: async () => true };
      if (name === 'ConfigurationManager') return { getProperty: vi.fn((_k: string, def: unknown) => def), getResolvedDataPath: vi.fn(() => os.tmpdir()) };
      if (name === 'PageManager') return { getAllPages: async () => [] };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, unknown> & { adminDashboard(req: unknown, res: unknown): Promise<void> };
  routes.createWikiContext = () => ({ userContext: admin, hasPermission: async () => true });
  routes.hasAdminViewAccess = async () => true;
  routes.getCommonTemplateData = async () => ({});
  const res = {
    status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
  };
  await routes.adminDashboard({ session: { csrfToken: 't' }, userContext: admin, query: {}, path: '/admin', originalUrl: '/admin', get: () => 'localhost' }, res);
  return res.render.mock.calls[0][1] as Record<string, unknown>;
}

async function dashboard(granted: string[]): Promise<string> {
  const data = await locals();
  return ejs.renderFile(path.join(VIEWS, 'admin-dashboard.ejs'), {
    pageName: '', title: 'Admin', csrfToken: 't', lockedUnless: () => '', currentUser: { displayName: 'Admin', username: 'admin' }, capabilities: {},
    jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`,
    ...data,
    can: (permission: string) => granted.includes(permission)
  });
}

describe('the dashboard button for Page building speed (#2468)', () => {
  test.each([['admin-system'], ['admin-read']])('an account that passes the %s permission check sees it', async (permission) => {
    const html = await dashboard([permission]);
    expect(html).toContain('href="/admin/parser-performance"');
  });

  test('an account with neither does not', async () => {
    const html = await dashboard([]);
    expect(html).not.toContain('href="/admin/parser-performance"');
  });

  test('an account with only admin-read sees that button and none of the admin-system tools', async () => {
    const html = await dashboard(['admin-read']);
    expect(html).not.toContain('onclick="confirmRestart()"');
    expect(html).not.toContain('href="/admin/backup"');
  });
});
