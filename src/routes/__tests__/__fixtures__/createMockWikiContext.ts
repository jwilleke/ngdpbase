/**
 * Shared WikiContext mock fixture for WikiRoutes test files (#638).
 *
 * Pre-#638, every test file built its own slightly-different vi.mock factory.
 * Each WikiContext API addition (#625, #630, #633) required ~17 mock-factory
 * edits, and inconsistencies between factories caused subtle bugs:
 *
 *   - Closure-variable mismatch (`userContext` referenced as closure but only
 *     defined as a property on the returned object) → `hasPermission` delegate
 *     silently returned true in some tests.
 *   - Different `hasPermission` defaults (some `mockResolvedValue(true)`, others
 *     delegating to `mockUserManager.hasPermission`) → 403-path tests passed or
 *     failed depending on ordering.
 *
 * This fixture provides one canonical factory. Test files import and use it
 * inside their own vi.mock or vi.spyOn calls.
 *
 * Usage — vi.mock factory mode (most files):
 *
 * ```ts
 * import { createMockWikiContext, MOCK_WIKI_CONTEXT_CONSTANTS } from './__fixtures__/createMockWikiContext';
 *
 * let mockUserContext: UserContextLike | null = null;
 * const mockUserManager = { hasPermission: vi.fn() };
 *
 * vi.mock('../../context/WikiContext', () => {
 *   const MockWikiContext = vi.fn().mockImplementation(function (engine: unknown, options = {}) {
 *     return createMockWikiContext(options, { engine, fallbackUserContext: mockUserContext, mockUserManager });
 *   });
 *   (MockWikiContext as unknown as { CONTEXT: typeof MOCK_WIKI_CONTEXT_CONSTANTS }).CONTEXT = MOCK_WIKI_CONTEXT_CONSTANTS;
 *   return { default: MockWikiContext };
 * });
 * ```
 *
 * Usage — vi.spyOn mode (assetSearch, authorLock):
 *
 * ```ts
 * routes.createWikiContext = vi.fn((req) =>
 *   createMockWikiContext({ userContext: req.userContext }, { engine: routes.engine, mockUserManager })
 * );
 * ```
 */

import { vi } from 'vitest';

/** Shape compatible with both the WikiContext UserContext interface and test fixture user records */
export interface UserContextLike {
  username?: string;
  displayName?: string;
  email?: string;
  isAuthenticated?: boolean;
  roles?: string[];
  preferences?: Record<string, unknown>;
  isExternal?: boolean;
  [key: string]: unknown;
}

export interface MockWikiContextOptions {
  context?: string;
  pageName?: string | null;
  content?: string | null;
  userContext?: UserContextLike | null;
  request?: unknown;
  response?: unknown;
  pageMetadata?: unknown;
  /** Override renderMarkdown return value (default: '<p>Rendered</p>') */
  renderMarkdownReturn?: string;
  /** Override toParseOptions return value (default: { pageContext, engine }) */
  toParseOptionsReturn?: unknown;
}

export interface MockWikiContextDeps {
  /** The engine reference to attach to the mocked context */
  engine?: unknown;
  /** Module-scoped fallback userContext when options.userContext is missing.
   *  Pass the variable directly — caller re-evaluates on each construction
   *  by re-passing in the vi.mock factory body. */
  fallbackUserContext?: UserContextLike | null;
  /** Mocked UserManager for hasPermission delegation. When provided, the mocked
   *  hasPermission delegates to this. Otherwise defaults to true (permissive). */
  mockUserManager?: { hasPermission?: (u: string, a: string) => Promise<boolean> | boolean };
  /** When true, populate manager properties (pageManager, renderingManager, etc.)
   *  from engine.getManager. Only routes.test.ts needs this; default false. */
  resolveManagers?: boolean;
}

export const MOCK_WIKI_CONTEXT_CONSTANTS = {
  VIEW: 'view',
  EDIT: 'edit',
  PREVIEW: 'preview',
  DIFF: 'diff',
  INFO: 'info',
  NONE: 'none'
} as const;

/**
 * Build a single mocked WikiContext instance.
 *
 * Returns an object with the same surface area as the real WikiContext
 * (#625 access methods, render-pipeline methods, manager refs if requested).
 * Methods are vi.fn() so tests can assert on calls.
 */
export function createMockWikiContext(
  options: MockWikiContextOptions = {},
  deps: MockWikiContextDeps = {}
): Record<string, unknown> {
  const userContext = options.userContext ?? deps.fallbackUserContext ?? null;
  const roles = userContext?.roles ?? [];
  const engine = deps.engine;

  const managerRefs = deps.resolveManagers && engine ? {
    pageManager: (engine as { getManager?: (n: string) => unknown }).getManager?.('PageManager'),
    renderingManager: (engine as { getManager?: (n: string) => unknown }).getManager?.('RenderingManager'),
    pluginManager: (engine as { getManager?: (n: string) => unknown }).getManager?.('PluginManager'),
    variableManager: (engine as { getManager?: (n: string) => unknown }).getManager?.('VariableManager'),
    policyInformationPoint: (engine as { getManager?: (n: string) => unknown }).getManager?.('PolicyInformationPoint')
  } : {};

  return {
    engine,
    context: options.context || MOCK_WIKI_CONTEXT_CONSTANTS.NONE,
    pageName: options.pageName ?? null,
    content: options.content ?? null,
    userContext,
    request: options.request ?? null,
    response: options.response ?? null,
    pageMetadata: options.pageMetadata ?? null,
    ...managerRefs,

    // Render-pipeline methods
    getContext: vi.fn().mockReturnValue(options.context || MOCK_WIKI_CONTEXT_CONSTANTS.NONE),
    renderMarkdown: vi.fn().mockResolvedValue(options.renderMarkdownReturn ?? '<p>Rendered</p>'),
    toParseOptions: vi.fn().mockReturnValue(options.toParseOptionsReturn ?? {
      pageContext: { pageName: options.pageName ?? null, userContext },
      engine
    }),

    // #625 access-control methods — same shape as the real WikiContext
    hasRole: vi.fn((...names: string[]) => names.some(n => roles.includes(n))),
    hasPermission: vi.fn(async (action: string) => {
      if (deps.mockUserManager?.hasPermission) {
        try {
          return await deps.mockUserManager.hasPermission(userContext?.username ?? '', action);
        } catch {
          return true;
        }
      }
      return true;
    }),
    canAccess: vi.fn().mockResolvedValue(true),
    getPrincipals: vi.fn(() => {
      const username = userContext?.username;
      return username ? [...roles, username] : [...roles];
    })
  };
}
