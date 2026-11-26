/**
 * @jest-environment node
 *
 * The Share Manager card on the admin dashboard links to the all-users view of
 * the Shared links page (slice 4 of #2247). That view needs share-manage-all,
 * so the link is offered only to a holder of it; anyone else is told what
 * permission it needs.
 */
import { describe, test, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WikiRoutes from '../WikiRoutes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

async function dashboard(granted: string[]): Promise<Record<string, unknown>> {
  const engine = {
    maintenance: { has: () => false, reasons: () => [] },
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return { getUsers: async () => [], hasPermission: async () => true };
      if (name === 'ConfigurationManager') return { getProperty: vi.fn((_k: string, def: unknown) => def), getResolvedDataPath: vi.fn(() => os.tmpdir()) };
      if (name === 'PageManager') return { getAllPages: async () => [] };
      if (name === 'ShareManager') return { isEnabled: () => true, list: () => [] };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as {
    adminDashboard(req: unknown, res: unknown): Promise<void>;
    createWikiContext: unknown;
    hasAdminViewAccess: unknown;
    getCommonTemplateData: unknown;
  };
  routes.createWikiContext = () => ({ userContext: admin, hasPermission: async (a: string) => granted.includes(a) });
  routes.hasAdminViewAccess = async () => true;
  routes.getCommonTemplateData = async () => ({});
  const res = {
    status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
  };
  await routes.adminDashboard({ session: { csrfToken: 't' }, userContext: admin, query: {}, path: '/admin', originalUrl: '/admin', get: () => 'localhost' }, res);
  expect(res.status).not.toHaveBeenCalledWith(500);
  return res.render.mock.calls[0][1] as Record<string, unknown>;
}

describe('admin dashboard: Share Manager card (slice 4 of #2247)', () => {
  test('the page is told whether the person may use the all-users view', async () => {
    expect(await dashboard(['share-manage-all'])).toMatchObject({ mayManageAllShares: true });
    expect(await dashboard(['admin-system'])).toMatchObject({ mayManageAllShares: false });
  });

  test('the link to the all-users view is shown only to a holder of the permission, others are told what it needs', () => {
    const view = fs.readFileSync(path.join(ROOT, 'views', 'admin-dashboard.ejs'), 'utf8');
    const link = view.indexOf('href="/my/shares?view=all"');
    expect(link).toBeGreaterThan(-1);
    const before = view.slice(Math.max(0, link - 300), link);
    expect(before).toMatch(/if \(typeof mayManageAllShares !== 'undefined' && mayManageAllShares\)/);
    expect(view).toContain("See and revoke everyone's shared links");
  });
});
