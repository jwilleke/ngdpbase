/**
 * Admin trash view tests (#969) — the human surface over the #947
 * deleted-pages API.
 *
 * The API itself is covered by VersioningFileProvider-SoftDelete.test.ts.
 * These cover what this slice adds: the authorisation gate answering in HTML
 * rather than JSON, the retention countdown, and the "provider has no soft
 * delete" case that otherwise looks identical to an empty trash.
 */

import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';

const adminUser = { username: 'admin', isAuthenticated: true, roles: ['admin'] };
const plainUser = { username: 'bob', isAuthenticated: true, roles: ['reader'] };

const createMockReq = (userContext: unknown = null) => ({
  params: {},
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/admin/trash',
  originalUrl: '/admin/trash',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

/** Fixed clock so countdown assertions are not time-of-run dependent. */
const NOW = new Date('2026-07-28T00:00:00.000Z').getTime();

function daysAgo(n: number): string {
  return new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeRoutes(opts: {
  deleted?: Array<Record<string, unknown>> | null;
  retentionDays?: number;
  hasPermission?: boolean;
} = {}) {
  const provider = opts.deleted === null
    ? {}                                        // provider WITHOUT soft-delete support
    : { getDeletedPages: () => opts.deleted ?? [] };

  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return { provider };
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) =>
            key === 'ngdpbase.page.delete.retentiondays'
              ? (opts.retentionDays ?? 30)
              : def
          )
        };
      }
      if (name === 'UserManager') {
        return { hasPermission: vi.fn().mockResolvedValue(opts.hasPermission ?? true) };
      }
      return null;
    })
  };

  const routes = new WikiRoutes(engine);
  // Site chrome needs a fully-wired engine that is irrelevant here.
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return routes;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /admin/trash — authorisation (#969)', () => {
  test('redirects an anonymous caller to login, not a JSON 401', async () => {
    // The API answers 401 JSON; a browser tab needs somewhere to go.
    const res = createMockRes();
    // #1198: policy refuses the anonymous subject; the refusal is the redirect.
    await makeRoutes({ hasPermission: false }).adminTrash(createMockReq(null), res);
    expect(res.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/admin/trash'));
    expect(res.render).not.toHaveBeenCalled();
  });

  test('refuses a non-admin with 403 and renders nothing', async () => {
    const res = createMockRes();
    await makeRoutes({ hasPermission: false }).adminTrash(createMockReq(plainUser), res);
    expect(res.status).toHaveBeenCalledWith(403);
    // #1198: the refusal renders the error page, never the trash page.
    expect(res.render).not.toHaveBeenCalledWith('admin-trash', expect.anything());
  });
});

describe('GET /admin/trash — provider capability (#969)', () => {
  test('distinguishes "no soft delete" from "empty trash"', async () => {
    // These look identical to an operator and mean very different things:
    // one is recoverable, the other means deletes are already permanent.
    const res = createMockRes();
    await makeRoutes({ deleted: null }).adminTrash(createMockReq(adminUser), res);
    expect(res.render).toHaveBeenCalledWith('admin-trash', expect.objectContaining({
      supported: false,
      pages: []
    }));
  });

  test('an empty trash on a capable provider is supported, not unsupported', async () => {
    const res = createMockRes();
    await makeRoutes({ deleted: [] }).adminTrash(createMockReq(adminUser), res);
    expect(res.render).toHaveBeenCalledWith('admin-trash', expect.objectContaining({
      supported: true,
      pages: []
    }));
  });
});

describe('GET /admin/trash — retention countdown (#969)', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    uuid: 'u1',
    title: 'Deleted Page',
    slug: 'deleted-page',
    deletedAt: daysAgo(10),
    deletedBy: 'admin',
    currentVersion: 3,
    ...over
  });

  test('computes purge date and days remaining from the retention window', async () => {
    const res = createMockRes();
    await makeRoutes({ deleted: [entry()], retentionDays: 30 })
      .adminTrash(createMockReq(adminUser), res);

    const rendered = res.render.mock.calls[0][1];
    expect(rendered.retentionDays).toBe(30);
    expect(rendered.pages).toHaveLength(1);
    // deleted 10 days ago, 30-day window → 20 days left
    expect(rendered.pages[0].daysLeft).toBe(20);
    expect(rendered.pages[0].purgeAt).toBe(new Date(NOW - 10 * 86400000 + 30 * 86400000).toISOString());
  });

  test('retention 0 means no purge date at all, not a date in the past', async () => {
    // Rendering a purge date when purging is disabled would be a lie the
    // operator might plan around.
    const res = createMockRes();
    await makeRoutes({ deleted: [entry()], retentionDays: 0 })
      .adminTrash(createMockReq(adminUser), res);

    const rendered = res.render.mock.calls[0][1];
    expect(rendered.retentionDays).toBe(0);
    expect(rendered.pages[0].purgeAt).toBeNull();
    expect(rendered.pages[0].daysLeft).toBeNull();
  });

  test('a page past its window reports a non-positive countdown', async () => {
    // The sweep runs on its own schedule, so "overdue but still listed" is a
    // real state. The view renders this as "due" rather than "-5 days left".
    const res = createMockRes();
    await makeRoutes({ deleted: [entry({ deletedAt: daysAgo(35) })], retentionDays: 30 })
      .adminTrash(createMockReq(adminUser), res);

    expect(res.render.mock.calls[0][1].pages[0].daysLeft).toBeLessThanOrEqual(0);
  });

  test('passes through the fields a row needs, without inventing any', async () => {
    const res = createMockRes();
    await makeRoutes({ deleted: [entry()] }).adminTrash(createMockReq(adminUser), res);

    expect(res.render.mock.calls[0][1].pages[0]).toMatchObject({
      uuid: 'u1',
      title: 'Deleted Page',
      slug: 'deleted-page',
      deletedBy: 'admin',
      currentVersion: 3
    });
  });

  test('preserves the provider ordering rather than re-sorting', async () => {
    // getDeletedPages already sorts newest-first with a title tie-break so the
    // listing does not jump between requests; re-sorting here would undo that.
    const res = createMockRes();
    await makeRoutes({
      deleted: [
        entry({ uuid: 'new', title: 'Newer', deletedAt: daysAgo(1) }),
        entry({ uuid: 'old', title: 'Older', deletedAt: daysAgo(20) })
      ]
    }).adminTrash(createMockReq(adminUser), res);

    expect(res.render.mock.calls[0][1].pages.map((p: { uuid: string }) => p.uuid))
      .toEqual(['new', 'old']);
  });
});

describe('admin-trash.ejs content invariants (#969)', () => {
  const view = fs.readFileSync(path.join(__dirname, '../../../views/admin-trash.ejs'), 'utf8');

  test('every mutation goes through csrfFetch (#727)', () => {
    // A raw fetch() for POST/DELETE gets an opaque text/plain 403 from the
    // app-wide CSRF middleware. The guard script enforces this repo-wide; this
    // pins it for the file the guard would flag first.
    expect(view).toContain('window.csrfFetch');
    expect(view).not.toMatch(/[^.]\bfetch\(\s*['"`]\/api\/admin\/deleted-pages/);
  });

  test('purge requires typing the title, not a single click', () => {
    // Purge is the only irreversible page operation left in the app.
    expect(view).toContain('purge-confirm-input');
    expect(view).toContain('cannot be undone');
    expect(view).toMatch(/confirmInput\.value\.trim\(\)\s*!==\s*pending\.title/);
  });

  test('restore surfaces a 409 as an instruction, not an error code', () => {
    expect(view).toContain('409');
    expect(view).toContain('Rename or delete that page');
  });

  test('escapes interpolated values in injected HTML', () => {
    expect(view).toContain('function escapeHtml');
    expect(view).toContain('&amp;');
  });

  test('the empty state states the retention window', () => {
    expect(view).toContain('Trash is empty');
    expect(view).toMatch(/retentionDays > 0/);
  });
});
