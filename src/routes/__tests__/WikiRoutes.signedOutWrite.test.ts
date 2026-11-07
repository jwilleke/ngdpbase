/**
 * #2289 — a page write refused to someone not signed in goes to sign-in.
 *
 * A signed-out GET /edit/<page> is redirected to /login; a signed-out form
 * POST /save/<page> (a session that expired mid-edit) used to get a bare 403.
 * A form is now redirected to sign-in with a same-site return URL (through
 * safeRedirect); JSON keeps a 401; a signed-in person who is refused keeps the
 * 403. Typed text is not touched here: the editor keeps it as a local draft
 * (public/js/editor-draft.js), cleared only after a successful save.
 */
import WikiRoutes from '../WikiRoutes';

function makeRoutes(page: string) {
  const metadata = { title: page, uuid: 'u1', 'system-category': 'general' };
  const pageManager = {
    getPage: vi.fn().mockResolvedValue({ content: 'old', metadata }),
    getPageMetadata: vi.fn().mockResolvedValue(metadata),
    pageExists: vi.fn().mockReturnValue(true),
    savePage: vi.fn().mockResolvedValue({ name: page }),
    deletePage: vi.fn().mockResolvedValue(true),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  };
  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    ValidationManager: { generateValidMetadata: vi.fn((title: string, m: object) => ({ title, ...m })), getAvailableCategories: vi.fn().mockReturnValue([]), getAvailableRoles: vi.fn().mockReturnValue([]) },
    PolicyInformationPoint: {
      recordPageRefusal: vi.fn().mockResolvedValue(undefined),
      evaluatePagePermission: vi.fn().mockResolvedValue({ allowed: false, reason: 'default_deny' }),
      checkPagePermissionWithContext: vi.fn().mockResolvedValue(false)
    },
    PolicyDecisionPoint: {
      permits: vi.fn().mockResolvedValue(false),
      decide: vi.fn().mockResolvedValue({ permit: false, applicable: false, reason: 'default_deny', policyIds: [] })
    },
    ConfigurationManager: {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { general: { enabled: true, label: 'general', storageLocation: { defaultstore: 'pages/' } } } : def))
    }
  };
  const routes = new WikiRoutes({ getManager: vi.fn((n: string) => managers[n] ?? null) });
  const renderError = vi.spyOn(routes as never, 'renderError').mockResolvedValue(undefined);
  return { routes, pageManager, renderError };
}

const ANON = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };
const EDITOR = { username: 'ed', roles: ['editor'], isAuthenticated: true };
const req = (page: string, userContext: unknown, headers: Record<string, string> = {}) => ({
  params: { page }, session: {}, path: `/save/${page}`, userContext, headers, query: {}, get: vi.fn(),
  body: { title: page, content: '# Test', categories: '', userKeywords: '', 'system-category': 'general', 'author-lock-present': '1' }
});
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis() });
describe('POST /save by someone not signed in (#2289)', () => {
  test('a form is redirected to sign-in, returning to the editor of that page, not shown a 403', async () => {
    const { routes, pageManager, renderError } = makeRoutes('TestPage');
    const r = res();
    await routes.savePage(req('TestPage', ANON), r);
    expect(r.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/edit/TestPage'));
    expect(renderError).not.toHaveBeenCalled();
    expect(r.status).not.toHaveBeenCalled();
    expect(pageManager.savePage).not.toHaveBeenCalled();
  });

  test('a JSON request (the editor\'s fetch) is a 401 with the message, not a redirect or a 403', async () => {
    const { routes } = makeRoutes('TestPage');
    const r = res();
    await routes.savePage(req('TestPage', ANON, { accept: 'application/json' }), r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Authentication required' }));
    expect(r.redirect).not.toHaveBeenCalled();
  });

  test('a return URL that is off-site is refused by safeRedirect: the sign-in address carries "/" instead', async () => {
    const { routes } = makeRoutes('P');
    for (const back of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '/ok\r\nSet-Cookie: x=1']) {
      const r = res();
      await (routes as unknown as { refuse: (...a: unknown[]) => Promise<void> }).refuse({ userContext: ANON }, {}, r, 'page', undefined, { back, signedIn: vi.fn() });
      expect(r.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/'));
    }
  });

  test('someone signed in who is refused still gets the 403, not the sign-in page', async () => {
    const { routes, renderError } = makeRoutes('TestPage');
    const r = res();
    await routes.savePage(req('TestPage', EDITOR), r);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), r, 403, 'Access Denied', expect.any(String));
    expect(r.redirect).not.toHaveBeenCalled();
  });
});

describe('POST /delete/<page> by someone not signed in (#2289)', () => {
  const del = (userContext: unknown, headers: Record<string, string> = {}) => ({ params: { page: 'TestPage' }, session: {}, path: '/delete/TestPage', userContext, headers, query: {}, body: {}, get: vi.fn() });

  test('a form is redirected to sign-in, returning to the page', async () => {
    const { routes, pageManager, renderError } = makeRoutes('TestPage');
    const r = res();
    await routes.deletePage(del(ANON), r);
    expect(r.redirect).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/view/TestPage'));
    expect(renderError).not.toHaveBeenCalled();
    expect(pageManager.deletePage).not.toHaveBeenCalled();
  });

  test('a JSON request is a 401', async () => {
    const { routes } = makeRoutes('TestPage');
    const r = res();
    await routes.deletePage(del(ANON, { accept: 'application/json' }), r);
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.redirect).not.toHaveBeenCalled();
  });

  test('someone signed in who is refused still gets the 403', async () => {
    const { routes, renderError } = makeRoutes('TestPage');
    const r = res();
    await routes.deletePage(del(EDITOR), r);
    expect(renderError).toHaveBeenCalledWith(expect.anything(), r, 403, 'Access Denied', expect.any(String));
  });
});

describe('signed-out save and delete answer the same whether a page exists (#2294)', () => {
  type Case = { label: string; page: { content: string; metadata: Record<string, unknown> } | null };
  const cases: Case[] = [
    { label: 'an existing page in another category', page: { content: 'old', metadata: { title: 'P', uuid: 'u1', 'system-category': 'other' } } },
    { label: 'an existing page in the same category', page: { content: 'old', metadata: { title: 'P', uuid: 'u1', 'system-category': 'general' } } },
    { label: 'an absent page', page: null }
  ];
  const request = (verb: 'save' | 'delete', headers: Record<string, string>) => ({
    params: { page: 'P' }, session: {}, path: `/${verb}/P`, userContext: ANON, headers, query: {}, get: vi.fn(),
    body: { title: 'P', content: '# Test', categories: '', userKeywords: '', 'system-category': 'general', 'author-lock-present': '1' }
  });
  const answer = async (verb: 'save' | 'delete', headers: Record<string, string>, page: Case['page']) => {
    const { routes, pageManager, renderError } = makeRoutes('P');
    pageManager.getPage.mockResolvedValue(page);
    // As the real one answers: only an administrator moves a page to another category.
    Object.assign(pageManager, { systemCategoryForWrite: vi.fn((_c: unknown, requested: unknown, current?: string) => Promise.resolve(current && current !== requested ? { ok: false, reason: 'Only administrators can set a page\'s system category' } : { ok: true, category: String(requested), admin: false })) });
    const r = res();
    const call = verb === 'save' ? routes.savePage.bind(routes) : routes.deletePage.bind(routes);
    await call(request(verb, headers), r);
    expect(renderError).not.toHaveBeenCalled();
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(pageManager.deletePage).not.toHaveBeenCalled();
    return { status: r.status.mock.calls, json: r.json.mock.calls, send: r.send.mock.calls, redirect: r.redirect.mock.calls };
  };

  for (const verb of ['save', 'delete'] as const) {
    test(`a signed-out form POST to /${verb} gets the sign-in redirect for every case`, async () => {
      const answers = await Promise.all(cases.map(c => answer(verb, {}, c.page)));
      expect(answers[0].redirect).toEqual([['/login?redirect=' + encodeURIComponent(verb === 'save' ? '/edit/P' : '/view/P')]]);
      expect(answers[0].status).toEqual([]);
      for (const a of answers) expect(a).toEqual(answers[0]);
    });

    test(`a signed-out JSON POST to /${verb} gets the same 401 for every case`, async () => {
      const answers = await Promise.all(cases.map(c => answer(verb, { accept: 'application/json' }, c.page)));
      expect(answers[0].status).toEqual([[401]]);
      expect(answers[0].redirect).toEqual([]);
      for (const a of answers) expect(a).toEqual(answers[0]);
    });
  }

  test('a refused signed-out save is still recorded, as an edit of an existing page and a create of an absent one', async () => {
    for (const [page, action] of [[cases[0].page, 'page-edit'], [null, 'page-create']] as const) {
      const { routes, pageManager } = makeRoutes('P');
      pageManager.getPage.mockResolvedValue(page);
      const record = vi.spyOn(routes as never, 'recordWriteRefusal').mockResolvedValue(undefined);
      await routes.savePage(request('save', {}), res());
      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(expect.anything(), 'P', action);
    }
  });
});
