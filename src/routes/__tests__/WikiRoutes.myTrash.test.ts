/**
 * /my/trash — the owner's own private trash (#1459).
 *
 * Its own surface beside /my/private and /my/edits (operator, 2026-09-23):
 * /admin/trash stays public pages only, because one screen meaning two
 * different things depending on who opened it was rejected.
 *
 * What these cover is the route's side of it: the `profile-manage` gate, the
 * CSRF token the restore and purge forms need, and — the point of the whole
 * surface — that the listing and both actions are asked for the REQUESTER's
 * own container, with their own context and no username taken from the
 * request. That an admin's own context yields none of another user's items is
 * PageManager's rule, held in PageManager.privateTrash.test.ts.
 */

import { ANONYMOUS_SUBJECT } from '../../managers/UserManager';
import WikiRoutes from '../WikiRoutes';

const MOLLY = { username: 'molly', isAuthenticated: true, roles: ['reader'], privateStoreHandle: 'sid' };
const ADMIN = { username: 'root', isAuthenticated: true, roles: ['admin'] };

const NOW = new Date('2026-09-23T00:00:00.000Z').getTime();
const daysAgo = (n: number): string => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

const mollyTrash = [
  { uuid: 'uuid-a', store: 'default', creator: 'molly', title: 'Diary', deletedAt: daysAgo(2), deletedBy: 'molly' },
  { uuid: 'uuid-b', store: 'vault', creator: 'molly', title: 'Merger Notes', deletedAt: daysAgo(40), deletedBy: 'molly' }
];

const createReq = (userContext: unknown, over: Record<string, unknown> = {}) => ({
  params: {},
  query: {},
  body: {},
  session: { csrfToken: 'tok' },
  path: '/my/trash',
  originalUrl: '/my/trash',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext,
  ...over
});

const createRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis()
});

function makeRoutes(opts: {
  trash?: Array<Record<string, unknown>>;
  permits?: boolean;
  restore?: unknown;
  purged?: boolean;
} = {}) {
  const pageManager = {
    listOwnDeletedPrivatePages: vi.fn(async () => opts.trash ?? []),
    restoreOwnPrivatePage: vi.fn(async () => opts.restore ?? { ok: true, title: 'Diary', name: 'private/molly/default/Diary' }),
    purgeOwnPrivatePage: vi.fn(async () => opts.purged ?? true)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return pageManager;
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) =>
            (key === 'ngdpbase.page.delete.retentiondays' ? 30 : def))
        };
      }
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(opts.permits ?? true) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({});
  return { routes, pageManager };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /my/trash (#1459)', () => {
  test('an anonymous caller is refused and nothing is listed', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({ permits: false });
    await routes.myTrashPage(createReq(ANONYMOUS_SUBJECT), res);
    expect(pageManager.listOwnDeletedPrivatePages).not.toHaveBeenCalled();
    expect(res.render).not.toHaveBeenCalledWith('my-list', expect.anything());
  });

  test('lists the requester\'s own items with the CSRF token the forms need', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({ trash: mollyTrash });
    await routes.myTrashPage(createReq(MOLLY), res);

    // The requester's OWN context, and no username from the request.
    expect(pageManager.listOwnDeletedPrivatePages).toHaveBeenCalledTimes(1);
    expect(pageManager.listOwnDeletedPrivatePages).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly', privateStoreHandle: 'sid' })
    );

    const view = res.render.mock.calls[0][1] as Record<string, unknown>;
    expect(res.render.mock.calls[0][0]).toBe('my-list');
    expect(view.listKind).toBe('trash');
    expect(view.csrfToken).toBe('tok');
    expect(view.items).toEqual([
      expect.objectContaining({ uuid: 'uuid-a', store: 'default', title: 'Diary', daysLeft: 28 }),
      // Past the window already: the sweep simply has not run yet.
      expect.objectContaining({ uuid: 'uuid-b', store: 'vault', daysLeft: -10 })
    ]);
  });

  test('an admin\'s trash is their own: the listing is asked for THEIR context, not a user in the request', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({ trash: [] });
    // Even with another user named all over the request, nothing reads it.
    await routes.myTrashPage(createReq(ADMIN, { query: { user: 'molly' }, params: { owner: 'molly' } }), res);
    expect(pageManager.listOwnDeletedPrivatePages).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'root' })
    );
    expect(res.render.mock.calls[0][1].items).toEqual([]);
  });

  test('retention 0 shows no purge countdown rather than a date the site will not keep', async () => {
    const res = createRes();
    const engineRoutes = makeRoutes({ trash: mollyTrash });
    (engineRoutes.routes as unknown as { engine: { getManager: ReturnType<typeof vi.fn> } }).engine.getManager
      .mockImplementation((name: string) => {
        if (name === 'PageManager') return engineRoutes.pageManager;
        if (name === 'ConfigurationManager') return { getProperty: vi.fn((_k: string, _d: unknown) => 0) };
        if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
        return null;
      });
    await engineRoutes.routes.myTrashPage(createReq(MOLLY), res);
    const items = res.render.mock.calls[0][1].items as Array<Record<string, unknown>>;
    expect(items.every((i) => i.purgeAt === null && i.daysLeft === null)).toBe(true);
  });
});

describe('POST /my/trash/restore and /my/trash/purge (#1459)', () => {
  test('restore goes through the page door with the requester\'s own context', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({});
    await routes.myTrashRestore(createReq(MOLLY, { body: { store: 'vault', uuid: 'uuid-b' } }), res);
    expect(pageManager.restoreOwnPrivatePage).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly' }), 'vault', 'uuid-b'
    );
    expect(res.redirect).toHaveBeenCalledWith('/my/trash?notice=restored');
  });

  test('a refused restore says which title is in the way, and renames nothing', async () => {
    const res = createRes();
    const { routes } = makeRoutes({ restore: { ok: false, reason: 'title-conflict', detail: 'Diary' } });
    await routes.myTrashRestore(createReq(MOLLY, { body: { store: 'default', uuid: 'uuid-a' } }), res);
    expect(res.redirect).toHaveBeenCalledWith(`/my/trash?notice=${encodeURIComponent('title-conflict:Diary')}`);
  });

  test('purge goes through the page door with the requester\'s own context', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({});
    await routes.myTrashPurge(createReq(MOLLY, { body: { store: 'default', uuid: 'uuid-a' } }), res);
    expect(pageManager.purgeOwnPrivatePage).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'molly' }), 'default', 'uuid-a'
    );
    expect(res.redirect).toHaveBeenCalledWith('/my/trash?notice=purged');
  });

  test('neither action runs for a caller policy refuses', async () => {
    const res = createRes();
    const { routes, pageManager } = makeRoutes({ permits: false });
    await routes.myTrashRestore(createReq(ANONYMOUS_SUBJECT, { body: { store: 'default', uuid: 'uuid-a' } }), res);
    await routes.myTrashPurge(createReq(ANONYMOUS_SUBJECT, { body: { store: 'default', uuid: 'uuid-a' } }), res);
    expect(pageManager.restoreOwnPrivatePage).not.toHaveBeenCalled();
    expect(pageManager.purgeOwnPrivatePage).not.toHaveBeenCalled();
  });
});
