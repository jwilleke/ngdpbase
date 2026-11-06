/**
 * #2272 — a refused POST /save records one `authorization-deny`.
 *
 * The route's `writeRefusal` asks `hasPermissionOn`, which records nothing, and
 * the refusal returns before PageManager's own door. So the route records it
 * (through the PIP's denial writer), with the deciding policy ids.
 */
import WikiRoutes from '../WikiRoutes';

function makeEngine({ existing, policyIds }: { existing: boolean; policyIds: string[] }) {
  const page = existing ? { content: 'old', metadata: { title: 'TestPage', uuid: 'u1', 'system-category': 'general' } } : null;
  const pageManager = {
    getPage: vi.fn().mockResolvedValue(page),
    getPageMetadata: vi.fn().mockResolvedValue(page?.metadata ?? null),
    pageExists: vi.fn().mockReturnValue(existing),
    savePage: vi.fn().mockResolvedValue({ name: 'TestPage' }),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } })
  };
  const recordPageRefusal = vi.fn().mockResolvedValue(undefined);
  const managers: Record<string, unknown> = {
    PageManager: pageManager,
    ValidationManager: {
      generateValidMetadata: vi.fn((title: string, meta: object) => ({ title, ...meta })),
      getAvailableCategories: vi.fn().mockReturnValue([]),
      getAvailableRoles: vi.fn().mockReturnValue([])
    },
    PolicyInformationPoint: {
      recordPageRefusal,
      evaluatePagePermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'policy' }),
      checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
    },
    PolicyDecisionPoint: {
      permits: vi.fn().mockResolvedValue(false),
      decide: vi.fn().mockResolvedValue({ permit: false, applicable: true, reason: 'deny', policyIds })
    },
    ConfigurationManager: {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? { general: { enabled: true, label: 'general', storageLocation: { defaultstore: 'pages/' } } } : def))
    }
  };
  return { engine: { getManager: vi.fn((n: string) => managers[n] ?? null) }, pageManager, recordPageRefusal };
}

const req = (userContext: unknown) => ({
  params: { page: 'TestPage' }, session: {}, path: '/save/TestPage', userContext, headers: {}, query: {},
  body: { title: 'TestPage', content: '# Test', categories: '', userKeywords: '', 'system-category': 'general', 'author-lock-present': '1' }
});
const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis()
});
const READER = { username: 'molly', roles: ['reader'], isAuthenticated: true };
const ANON = { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false };

describe('a refused /save is recorded (#2272)', () => {
  test('an edit refusal records page-edit', async () => {
    const { engine, pageManager, recordPageRefusal } = makeEngine({ existing: true, policyIds: [] });
    const r = res();
    await new WikiRoutes(engine).savePage(req(READER), r);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(pageManager.savePage).not.toHaveBeenCalled();
    expect(recordPageRefusal).toHaveBeenCalledTimes(1);
    expect(recordPageRefusal.mock.calls[0].slice(1, 3)).toEqual(['TestPage', 'page-edit']);
  });

  test('a create refusal records page-create', async () => {
    const { engine, recordPageRefusal } = makeEngine({ existing: false, policyIds: [] });
    await new WikiRoutes(engine).savePage(req(READER), res());
    expect(recordPageRefusal).toHaveBeenCalledTimes(1);
    expect(recordPageRefusal.mock.calls[0].slice(1, 3)).toEqual(['TestPage', 'page-create']);
  });

  test('a signed-out create refusal records too, once', async () => {
    const { engine, recordPageRefusal } = makeEngine({ existing: false, policyIds: [] });
    await new WikiRoutes(engine).savePage(req(ANON), res());
    expect(recordPageRefusal).toHaveBeenCalledTimes(1);
  });

  test.each([[true, 'page-edit'], [false, 'page-create']])('a matching deny policy is named (existing=%s)', async (existing, action) => {
    const { engine, recordPageRefusal } = makeEngine({ existing, policyIds: ['verify-deny-page-writes'] });
    await new WikiRoutes(engine).savePage(req(READER), res());
    expect(recordPageRefusal).toHaveBeenCalledTimes(1);
    const call = recordPageRefusal.mock.calls[0];
    expect(call[2]).toBe(action);
    expect(call[4]).toEqual(['verify-deny-page-writes']);
  });
});
