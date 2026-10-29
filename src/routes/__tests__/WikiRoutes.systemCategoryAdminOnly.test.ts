/**
 * #1503 (operator, 2026-10-29): nobody but an administrator sets or changes a
 * page's system-category. For anyone else a new page is the default
 * (`general`) and an existing page keeps its own; a request naming any other
 * is refused with a 403, never rewritten. Asked through the PDP
 * (`admin-system`) with the requester's context, never a role name.
 *
 * The rule is PageManager.systemCategoryForWrite; these drive it through the
 * save, create and ingest routes.
 */
import fs from 'fs';
import path from 'path';
import WikiRoutes from '../WikiRoutes';
import PageManager, { SYSTEM_CATEGORY_ADMIN_ONLY } from '../../managers/PageManager';

const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
const CATEGORIES = shipped['ngdpbase.system-category'] as Record<string, { enabled?: boolean; label: string }>;
const ENABLED = Object.values(CATEGORIES).filter((c) => c.enabled !== false).map((c) => c.label);
const ALL_BUT_GENERAL = [...Object.values(CATEGORIES).map((c) => c.label), 'journal'].filter((c) => c !== 'general');

const EDITOR = ['page-read', 'page-create', 'page-edit'];
const ADMIN = [...EDITOR, 'admin-system'];
const JIM = { username: 'jim', roles: ['contributor'], isAuthenticated: true };

function makeEngine({ existing, granted, category = 'general' }: { existing: boolean; granted: string[]; category?: string }) {
  const existingPage = existing ? { content: 'old', metadata: { title: 'TestPage', uuid: 'u1', author: 'jim', 'system-category': category } } : null;
  const permits = vi.fn((_s: unknown, action: string) => Promise.resolve(granted.includes(action)));
  const managers: Record<string, unknown> = {
    ValidationManager: {
      generateValidMetadata: vi.fn((title: string, meta: object) => ({ title, ...meta })),
      getAvailableCategories: vi.fn().mockReturnValue([]),
      getAvailableRoles: vi.fn().mockReturnValue([]),
      getDefaultSystemCategory: vi.fn().mockReturnValue('general')
    },
    PolicyInformationPoint: {
      evaluatePagePermission: vi.fn().mockResolvedValue({ allowed: true, reason: 'policy' }),
      checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
    },
    PolicyDecisionPoint: {
      permits,
      decide: vi.fn((_s: unknown, { action }: { action: string }) => Promise.resolve({ permit: granted.includes(action), applicable: true, reason: 'test' }))
    },
    ConfigurationManager: {
      getProperty: vi.fn((key: string, def: unknown) => (key === 'ngdpbase.system-category' ? CATEGORIES : def))
    }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  // The real rule, on a stand-in page store.
  const rule = Object.create(PageManager.prototype) as PageManager;
  (rule as unknown as { engine: unknown }).engine = engine;
  const pageManager = {
    getPage: vi.fn().mockResolvedValue(existingPage),
    getPageMetadata: vi.fn().mockResolvedValue(existingPage?.metadata ?? null),
    pageExists: vi.fn().mockReturnValue(existing),
    savePage: vi.fn().mockResolvedValue({ name: 'TestPage' }),
    getCurrentPageProvider: vi.fn().mockReturnValue({ pageIndex: { pages: {} } }),
    isShippedPageCopy: vi.fn().mockResolvedValue(false),
    shippedSystemCategories: vi.fn().mockResolvedValue(new Set<string>()),
    systemCategoryForWrite: rule.systemCategoryForWrite.bind(rule)
  };
  managers.PageManager = pageManager;
  return { engine, pageManager, permits };
}

const res = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis()
});

const saveReq = (category: string | undefined) => ({
  params: { page: 'TestPage' },
  session: {},
  path: '/save/TestPage',
  userContext: JIM,
  headers: {},
  query: {},
  body: {
    title: 'TestPage', content: '# Test', categories: '', userKeywords: '', 'author-lock-present': '1',
    ...(category !== undefined ? { 'system-category': category } : {})
  }
});

const savedCategory = (pageManager: { savePage: ReturnType<typeof vi.fn> }) =>
  (pageManager.savePage.mock.calls[0][2] as Record<string, unknown>)['system-category'];

describe('only an administrator sets a page system-category (#1503)', () => {
  describe('save', () => {
    test('a non-admin new page is general, named or not', async () => {
      for (const category of [undefined, '', 'general', 'General']) {
        const { engine, pageManager } = makeEngine({ existing: false, granted: EDITOR });
        await new WikiRoutes(engine).savePage(saveReq(category), res());
        expect(savedCategory(pageManager)).toBe('general');
      }
    });

    test('a non-admin save of an existing page keeps its category', async () => {
      const { engine, pageManager } = makeEngine({ existing: true, granted: EDITOR, category: 'documentation' });
      await new WikiRoutes(engine).savePage(saveReq('documentation'), res());
      expect(savedCategory(pageManager)).toBe('documentation');
    });

    test.each(ALL_BUT_GENERAL)('a non-admin naming %s is refused with 403, new page or existing', async (category) => {
      for (const existing of [false, true]) {
        const { engine, pageManager, permits } = makeEngine({ existing, granted: EDITOR });
        const r = res();
        await new WikiRoutes(engine).savePage(saveReq(category), r);
        expect(pageManager.savePage).not.toHaveBeenCalled();
        expect(r.status).toHaveBeenCalledWith(403);
        expect(r.send).toHaveBeenCalledWith(SYSTEM_CATEGORY_ADMIN_ONLY);
        expect(permits).toHaveBeenCalledWith(JIM, 'admin-system');
      }
    });

    test.each(ENABLED)('an admin can set %s', async (category) => {
      const { engine, pageManager } = makeEngine({ existing: true, granted: ADMIN });
      await new WikiRoutes(engine).savePage(saveReq(category), res());
      expect(savedCategory(pageManager)).toBe(category);
    });
  });

  describe('create and ingest', () => {
    test('a non-admin create naming another category is refused; naming none is general', async () => {
      const routes = (granted: string[]) => {
        const built = makeEngine({ existing: false, granted });
        return { ...built, routes: new WikiRoutes(built.engine) };
      };
      const refused = routes(EDITOR);
      const r = res();
      await refused.routes.createPageFromTemplate({ ...saveReq(undefined), body: { pageName: 'New One', templateName: 'Default', 'system-category': 'system' } }, r);
      expect(r.status).toHaveBeenCalledWith(403);
      expect(r.send).toHaveBeenCalledWith(SYSTEM_CATEGORY_ADMIN_ONLY);
    });

    test('a non-admin ingest naming another category is refused with 403', async () => {
      const { engine, pageManager } = makeEngine({ existing: false, granted: [...EDITOR, 'page-ingest'] });
      const r = res();
      await new WikiRoutes(engine).ingestPageMarkdown({ ...saveReq(undefined), body: { pageName: 'Ingested', markdown: '# Hi', category: 'documentation' } }, r);
      expect(pageManager.savePage).not.toHaveBeenCalled();
      expect(r.status).toHaveBeenCalledWith(403);
      expect(r.json).toHaveBeenCalledWith({ success: false, error: SYSTEM_CATEGORY_ADMIN_ONLY });
    });
  });
});
