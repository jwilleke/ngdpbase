/**
 * GET /view/{title} — the requester's own private page (#1457, epic #1454).
 *
 * `/view/` serves public pages only (#1456): a private page lives at
 * `/private/{owner}/{store}/{title}`. But its owner types, bookmarks and
 * links its plain title, and got a 404 for a page they have. So when the
 * public ladder misses, the requester's OWN stores are asked, and only theirs.
 *
 * The security property is the whole point: the answer depends on who is
 * asking, and nobody learns anything about anyone else's pages. A reader with
 * no such page of their own gets exactly the 404 they get today.
 */
import WikiRoutes from '../WikiRoutes';
import type { Request, Response } from 'express';

type Res = Response & { redirect: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> };

const newRes = (): Res => {
  const res = { redirect: vi.fn(), render: vi.fn(), set: vi.fn(), send: vi.fn() } as unknown as Res;
  (res as unknown as { status: unknown }).status = vi.fn(() => res);
  return res;
};

function makeRoutes(options: {
  publicPages?: Record<string, string>;
  creatorPages?: Array<{ name: string; isPrivate?: boolean }>;
  formerTitle?: string | null;
}) {
  const getPagesByCreator = vi.fn(async () => options.creatorPages ?? []);
  const pageManager = {
    getPageContent: vi.fn(async (name: string) => {
      const content = options.publicPages?.[name];
      if (content === undefined) throw new Error(`Page "${name}" not found`);
      return content;
    }),
    getPageMetadata: vi.fn(async (name: string) => ({ title: name, uuid: `uuid-${name}` })),
    getPagesByCreator,
    resolveFormerTitle: vi.fn(async () => options.formerTitle ?? null),
    isSharedIndexable: vi.fn(() => true),
    provider: null
  };

  const managers: Record<string, unknown> = {
    ConfigurationManager: { getProperty: (_key: string, def: unknown) => def },
    PageManager: pageManager,
    RenderingManager: { textToHTML: vi.fn(async () => '<p>html</p>') },
    PolicyInformationPoint: { checkPagePermissionWithContext: vi.fn(async () => true) },
    CacheManager: { isInitialized: () => false, get: vi.fn(), set: vi.fn() }
  };

  const routes = new WikiRoutes({ getManager: (name: string) => managers[name] ?? null });
  vi.spyOn(routes, 'createWikiContext').mockImplementation((req: Request) =>
    ({ userContext: req.userContext, hasPermission: async () => true }) as never);
  vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
  const renderError = vi.fn(async () => undefined);
  vi.spyOn(routes, 'renderError').mockImplementation(renderError as never);

  return { routes, renderError, getPagesByCreator };
}

const req = (page: string, username: string | null) =>
  ({
    params: { page },
    query: {},
    userContext: username ? { username, isAuthenticated: true, roles: ['reader'] } : undefined
  }) as unknown as Request;

const JIMS_DIARY = { name: 'private/jim/vault/Diary', isPrivate: true };

describe('viewPage — the requester\'s own private page (#1457)', () => {
  test('the owner is sent to their own page\'s URL', async () => {
    const { routes } = makeRoutes({ creatorPages: [JIMS_DIARY] });
    const res = newRes();

    await routes.viewPage(req('Diary', 'jim'), res);

    // 302, not 301: the answer depends on who is asking and must not be cached.
    expect(res.redirect).toHaveBeenCalledWith(302, '/private/jim/vault/Diary');
  });

  test('everybody else gets the 404 they get today, and no store is read for them', async () => {
    const { routes, renderError, getPagesByCreator } = makeRoutes({ creatorPages: [JIMS_DIARY] });
    const res = newRes();

    // Molly has no page of that title; the lookup is over HER stores.
    await routes.viewPage(req('Diary', 'molly'), res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 404, 'Not Found', expect.any(String));
    expect(getPagesByCreator).toHaveBeenCalledWith('molly', expect.objectContaining({ username: 'molly' }), { onlyPrivate: true });
  });

  test('an anonymous visitor gets the 404 and no store is read at all', async () => {
    const { routes, renderError, getPagesByCreator } = makeRoutes({ creatorPages: [JIMS_DIARY] });
    const res = newRes();

    await routes.viewPage(req('Diary', null), res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 404, 'Not Found', expect.any(String));
    expect(getPagesByCreator).not.toHaveBeenCalled();
  });

  test('another user\'s private page of that title is never the answer', async () => {
    // What a store index carried is re-checked against the requester.
    const { routes, renderError } = makeRoutes({
      creatorPages: [{ name: 'private/alice/vault/Diary', isPrivate: true }]
    });
    const res = newRes();

    await routes.viewPage(req('Diary', 'jim'), res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(renderError).toHaveBeenCalledWith(expect.anything(), res, 404, 'Not Found', expect.any(String));
  });

  test('a public page of the same title still wins — no private lookup is made', async () => {
    const { routes, getPagesByCreator } = makeRoutes({
      publicPages: { Diary: '# The public Diary' },
      creatorPages: [JIMS_DIARY]
    });
    const res = newRes();

    await routes.viewPage(req('Diary', 'jim'), res);

    expect(getPagesByCreator).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test('a former public title still wins: the public ladder is asked first', async () => {
    const { routes, getPagesByCreator } = makeRoutes({
      creatorPages: [JIMS_DIARY],
      formerTitle: 'Journal'
    });
    const res = newRes();

    await routes.viewPage(req('Diary', 'jim'), res);

    expect(res.redirect).toHaveBeenCalledWith(301, expect.stringContaining('/view/Journal'));
    expect(getPagesByCreator).not.toHaveBeenCalled();
  });
});

// ───────────────────── the private gate's 404 (#1457) ────────────────────────
//
// A refusal and a missing page must be one answer. The message also names no
// path: what it would echo is the private name the reader asked for, and the
// page it belongs to may be somebody else's.

describe('the 404 a private page answers with (#1457)', () => {
  const gate = async (owner: string, reader: { username: string } | undefined) => {
    const { routes, renderError } = makeRoutes({});
    const managers = (routes as unknown as { engine: { getManager: (n: string) => unknown } }).engine;
    const pip = managers.getManager('PolicyInformationPoint') as Record<string, unknown>;
    pip.canAccessPrivateContainer = vi.fn(() => false);
    pip.currentSubject = vi.fn(async () => ({ username: 'anonymous' }));

    const req = {
      params: { owner, store: 'vault', title: 'Diary' },
      userContext: reader
    } as unknown as Request;
    await (routes as unknown as {
      privatePageRoute: (r: Request, res: Response, a: string, h: () => Promise<unknown>) => Promise<unknown>
    }).privatePageRoute(req, {} as Response, 'view', async () => 'handled');
    return renderError.mock.calls[0] as unknown as [Request, Response, number, string, string];
  };

  test('a reader who may not open it is told only that the page does not exist', async () => {
    const [, , status, heading, message] = await gate('molly', { username: 'bob' });
    expect(status).toBe(404);
    expect(heading).toBe('Not Found');
    expect(message).toBe('The page does not exist.');
  });

  test('the answer names no owner, store or title', async () => {
    const [, , , , message] = await gate('molly', { username: 'bob' });
    expect(message).not.toMatch(/molly|vault|Diary|private\//);
  });

  test('an anonymous reader gets the same answer', async () => {
    const [, , status, , message] = await gate('molly', undefined);
    expect(status).toBe(404);
    expect(message).toBe('The page does not exist.');
  });
});

