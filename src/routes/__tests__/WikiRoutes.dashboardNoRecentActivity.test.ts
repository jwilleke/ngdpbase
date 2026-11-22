/**
 * @jest-environment node
 *
 * The admin dashboard has no "Recent Activity" panel (#2469). It showed two
 * made-up lines ("User logged in", "System started"). The audit log's own
 * recent events are a separate thing and live on the audit page.
 */
import { describe, test, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WikiRoutes from '../WikiRoutes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

describe('admin dashboard: no Recent Activity panel (#2469)', () => {
  test('the render does not pass a recentActivity local', async () => {
    const engine = {
      maintenance: { has: () => false, reasons: () => [] },
      getManager: vi.fn((name: string) => {
        if (name === 'UserManager') return { getUsers: async () => [], hasPermission: async () => true };
        if (name === 'ConfigurationManager') return { getProperty: vi.fn((_k: string, def: unknown) => def), getResolvedDataPath: vi.fn(() => os.tmpdir()) };
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
    expect(res.render.mock.calls[0][1]).not.toHaveProperty('recentActivity');
  });

  test('the dashboard view has no Recent Activity panel', () => {
    const view = fs.readFileSync(path.join(ROOT, 'views', 'admin-dashboard.ejs'), 'utf8');
    expect(/Recent Activity/i.test(view)).toBe(false);
    expect(/recentActivity/.test(view)).toBe(false);
  });
});
