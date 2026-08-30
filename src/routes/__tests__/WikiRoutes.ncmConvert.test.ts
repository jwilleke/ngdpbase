/**
 * #1127 — Convert-to-NCM from the editor, gated on page-edit, not admin.
 *
 * The /admin/convert machinery (#728 S5a) already does preview+confirm; #1127
 * surfaces it per-page. Converting IS an edit — anyone who may edit the page
 * could paste the converted text by hand — so the gate moves from
 * admin-system to the page's own edit ACL, checked per page inside the
 * handler. The execute path saves through savePageWithContext so the audit
 * record names the USER who converted, not 'system'.
 */
import WikiRoutes from '../WikiRoutes';

const editor = { username: 'alice', isAuthenticated: true, roles: ['editor'] };

const makeReq = (body: Record<string, unknown> = {}) => ({
  params: {}, query: {}, body, ip: '10.0.0.9',
  session: { csrfToken: 't' }, path: '/', originalUrl: '/', protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: editor
});

const makeRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis()
});

function makeRoutes(canEdit: boolean) {
  const savePageWithContext = vi.fn().mockResolvedValue(undefined);
  const savePage = vi.fn().mockResolvedValue(undefined);
  const pageManager = {
    getPage: vi.fn().mockResolvedValue({
      // A CommonMark link the normalizer rewrites, so `changed` is true.
      content: 'See [the docs](https://example.org/docs) here.',
      metadata: { title: 'Target', uuid: 'uuid-t', 'system-category': 'general' }
    }),
    savePageWithContext,
    savePage
  };
  const aclManager = {
    checkPagePermissionWithContext: vi.fn().mockResolvedValue(canEdit)
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'PageManager') return pageManager;
      if (name === 'ACLManager') return aclManager;
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, r: unknown) => Promise<unknown>>;
  (routes as unknown as { createWikiContext: () => unknown }).createWikiContext =
    () => ({ userContext: editor, hasPermission: vi.fn().mockResolvedValue(false) });
  (routes as unknown as { localizePageImages: (...a: unknown[]) => Promise<unknown> }).localizePageImages =
    async (content: unknown) => ({ content, warnings: [] });
  return { routes, pageManager, aclManager, savePageWithContext, savePage };
}

describe('#1127 convert-to-NCM is gated on the page edit ACL', () => {
  test('a page-edit caller gets a preview', async () => {
    const { routes, aclManager } = makeRoutes(true);
    const res = makeRes();
    await routes.adminConvertPreview(makeReq({ page: 'Target' }), res);
    expect(aclManager.checkPagePermissionWithContext).toHaveBeenCalledWith(expect.anything(), 'edit');
    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.changed).toBe(true);
    expect(String(payload.proposed)).toContain('[the docs|https://example.org/docs');
  });

  test('a caller without page-edit is refused, admin-system not required', async () => {
    const { routes } = makeRoutes(false);
    const res = makeRes();
    await routes.adminConvertPreview(makeReq({ page: 'Target' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('execute saves through savePageWithContext — the audit names the user', async () => {
    const { routes, savePageWithContext, savePage } = makeRoutes(true);
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Target' }), res);
    expect(savePageWithContext).toHaveBeenCalledOnce();
    expect(savePage).not.toHaveBeenCalled();
    const [, metadata, options] = savePageWithContext.mock.calls[0] as [unknown, Record<string, unknown>, Record<string, unknown>];
    expect(metadata.uuid).toBe('uuid-t');
    expect(options).toMatchObject({ audit: { ipAddress: '10.0.0.9' } });
  });

  test('execute without page-edit is refused before any save', async () => {
    const { routes, savePageWithContext, savePage } = makeRoutes(false);
    const res = makeRes();
    await routes.adminConvertExecute(makeReq({ page: 'Target' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(savePageWithContext).not.toHaveBeenCalled();
    expect(savePage).not.toHaveBeenCalled();
  });
});
