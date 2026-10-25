/**
 * #2067 — the admin roles page shows the scheduled jobs and what each may do.
 *
 * Since #1999 a scheduled job a policy names (`{ type: 'job', value: '<id>' }`)
 * acts as itself and holds only what those policies grant; a job no policy
 * names runs with the system roles. The page's Jobs part says which, with the
 * policy that grants each permission. The role part and the access check are
 * as before. Route data and the real view, rendered as Express does.
 */
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(__dirname, '../../../views');

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const reader = { username: 'rita', isAuthenticated: true, roles: ['reader'] };

const POLICIES = [
  { id: 'admin-everything', name: 'Administrators', effect: 'allow', priority: 100, subjects: [{ type: 'role', value: 'admin' }], actions: ['page-read', 'admin-system'] },
  { id: 'digest-reads', name: 'Digest reads pages', effect: 'allow', priority: 10, subjects: [{ type: 'job', value: 'news.digest' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
  { id: 'digest-notes', effect: 'allow', priority: 20, subjects: [{ type: 'job', value: 'news.digest' }], actions: ['notification-send'] }
];

const CONFIG: Record<string, unknown> = {
  'ngdpbase.roles.definitions': { admin: { name: 'admin', displayname: 'Administrator' }, reader: { name: 'reader', displayname: 'Reader' } },
  'ngdpbase.permissions.definitions': {
    'page-read': { description: 'Read pages', label: 'Read pages' },
    'admin-system': { description: 'Run the site', label: 'Run the site' },
    'notification-send': { description: 'Send notifications', label: 'Send notifications' }
  }
};

const createMockReq = (userContext: unknown) => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' }, path: '/admin/roles', originalUrl: '/admin/roles',
  protocol: 'http', get: vi.fn().mockReturnValue('localhost:3000'), userContext
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis()
});

function makeRoutes(granted: string[]) {
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PluginManager') return TEST_PLUGIN_MANAGER;
      if (name === 'PolicyDecisionPoint') {
        return {
          permits: vi.fn((_u: string, p: string) => Promise.resolve(granted.includes(p))),
          rolePermissionLists: vi.fn(() => ({ admin: ['admin-system', 'page-read'] })),
          policies: vi.fn(() => POLICIES)
        };
      }
      if (name === 'ConfigurationManager') return { getProperty: vi.fn((key: string, def: unknown) => CONFIG[key] ?? def) };
      if (name === 'BackgroundJobManager') {
        return {
          scheduledJobNames: () => [{ id: 'news.digest', displayName: 'News digest' }, { id: 'core.cleanup', displayName: 'Clean up old sessions' }],
          displayNameOf: (id: string) => id
        };
      }
      if (name === 'PolicyInformationPoint') return { systemSubject: () => ({ username: 'system', roles: ['admin'], isAuthenticated: true }) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes;
}

type Locals = Record<string, unknown> & { jobs: Array<Record<string, unknown>>; roles: Array<Record<string, unknown>> };

async function rolesPageLocals(): Promise<Locals> {
  const res = createMockRes();
  await makeRoutes(['admin-roles', 'admin-read']).adminRoles(createMockReq(admin), res);
  const call = res.render.mock.calls.find((c) => c[0] === 'admin-roles');
  expect(call).toBeDefined();
  return call[1] as Locals;
}

async function renderPage(locals: Locals): Promise<Document> {
  const html = await ejs.renderFile(path.join(VIEWS, 'admin-roles.ejs'), {
    pageName: '', csrfToken: 'csrf', jsonForScript: (v: unknown) => JSON.stringify(v), pageUrl: (n: string) => `/view/${n}`, lockedUnless: () => '',
    ...locals
  });
  return new JSDOM(html).window.document;
}

const text = (el: { textContent: string | null } | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

beforeEach(() => vi.clearAllMocks());

describe('#2067 the roles page shows what each scheduled job may do', () => {
  test('a job a policy names lists its permissions and the policy granting each', async () => {
    const { jobs } = await rolesPageLocals();
    const digest = jobs.find((j) => j.id === 'news.digest');
    expect(digest).toMatchObject({
      displayName: 'News digest',
      scheduled: true,
      ownPermissions: true,
      systemRoles: [],
      grants: [
        { key: 'notification-send', label: 'Send notifications', limited: false, policies: ['digest-notes'] },
        { key: 'page-read', label: 'Read pages', limited: false, policies: ['Digest reads pages'] }
      ]
    });

    const doc = await renderPage(await rolesPageLocals());
    const row = text(doc.querySelector('[data-job="news.digest"]'));
    expect(row).toContain('News digest');
    expect(row).toContain('Read pages — granted by Digest reads pages');
    expect(row).toContain('Send notifications — granted by digest-notes');
    expect(row).not.toContain('system roles');
  });

  test('a job no policy names runs with the system roles', async () => {
    const { jobs } = await rolesPageLocals();
    expect(jobs.find((j) => j.id === 'core.cleanup')).toMatchObject({ ownPermissions: false, grants: [], systemRoles: ['Administrator'] });

    const doc = await renderPage(await rolesPageLocals());
    expect(text(doc.querySelector('[data-job="core.cleanup"]'))).toContain('Clean up old sessions core.cleanup Runs with the system roles (Administrator)');
  });

  test('the role part is as before', async () => {
    const locals = await rolesPageLocals();
    expect(locals.roles).toEqual([
      { name: 'admin', displayname: 'Administrator', permissions: ['admin-system', 'page-read'], limited: {} },
      { name: 'reader', displayname: 'Reader', permissions: [], limited: {} }
    ]);
    const doc = await renderPage(locals);
    const headers = [...doc.querySelectorAll('table:not([data-testid="roles-jobs"]) thead th')].map((th) => text(th));
    expect(headers).toEqual(['Permission', 'Administrator', 'Reader']);
  });

  test('access is refused as before: a caller without admin-read or admin-roles gets an error page', async () => {
    const res = createMockRes();
    await makeRoutes([]).adminRoles(createMockReq(reader), res);
    expect(res.render.mock.calls.some((c) => c[0] === 'admin-roles')).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
