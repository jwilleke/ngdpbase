/**
 * ParseContext - Context object for markup parsing operations
 *
 * Provides access to page context, user information, engine managers,
 * and parsing state throughout the processing pipeline.
 *
 * Related Issue: #55 - Core Infrastructure and Phase System
 */

import { ANONYMOUS_SUBJECT, type PermissionSubject } from '../../managers/UserManager.js';
import type { AgentTokenGrant } from '../../managers/UserManager.js';
import type { ShareGrant } from '../../types/Share.js';

/**
 * User context interface
 */
export interface UserContext {
  /** #1212: the three authorisation fields are required — a parse runs as the request's own subject. */
  username: string;
  userName?: string;
  isAuthenticated: boolean;
  roles: string[];
  permissions?: string[];
  /** The delegations a request carries; declared so the index signature does not erase their type. */
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
  [key: string]: unknown;
}

/**
 * Request information
 */
export interface RequestInfo {
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

/**
 * Minimal page frontmatter for parse context (uuid is the key consumer)
 */
export interface PageFrontmatter {
  uuid?: string;
  title?: string;
  [key: string]: unknown;
}

/**
 * Page context interface
 */
export interface PageContext {
  pageName?: string;
  userName?: string;
  userContext?: UserContext | null;
  requestInfo?: RequestInfo | null;
  pageMetadata?: PageFrontmatter | null;
  [key: string]: unknown;
}

/**
 * WikiEngine minimal interface (until WikiEngine.ts is fully typed)
 * TODO: Replace with proper WikiEngine import once converted
 */
export interface WikiEngine {
  getManager<T = unknown>(name: string): T | undefined;
}

/**
 * Minimal WikiContext interface for the parser side (#629).
 *
 * ParseContext holds a reference to its parent WikiContext so user/page-data
 * fields don't have to be copied. We define a structural interface here rather
 * than importing the full WikiContext class to avoid coupling the parser
 * package to context internals (and to side-step circular imports).
 *
 * Only the fields/methods ParseContext needs to delegate are listed.
 */
export interface WikiContextLike {
  readonly engine: WikiEngine;
  readonly pageName: string | null;
  readonly userContext: UserContext | null;
  readonly pageMetadata: PageFrontmatter | null;
  hasRole(...names: string[]): boolean;
  hasPermission(action: string): Promise<boolean>;
  canAccess(action: string): Promise<boolean>;
  getPrincipals(): string[];
}

/**
 * Nested context structure (from WikiContext.toParseOptions())
 */
export interface NestedContextOptions {
  pageContext: PageContext;
  engine?: WikiEngine;
  /**
   * #629: optional reference to the parent WikiContext. When provided,
   * ParseContext getters delegate user/page-data lookups to it instead of
   * the constructor-time snapshot in `pageContext`. Lets the WikiContext
   * stay the single source of truth across the parse run.
   */
  wikiContext?: WikiContextLike;
}

/**
 * Direct context structure (legacy or alternative calling pattern)
 */
export type DirectContextOptions = PageContext;

/**
 * Combined context options
 */
export type ParseContextOptions = NestedContextOptions | DirectContextOptions;

/**
 * Context summary for logging
 */
export interface ContextSummary {
  pageName: string;
  userName: string;
  authenticated: boolean;
  roles: string[];
  contentLength: number;
  variableCount: number;
  handlerResultCount: number;
  processingTime: number;
  phaseCount: number;
}

/**
 * Error context for debugging
 */
export interface ParseErrorContext {
  error: string;
  phase: string;
  pageName: string;
  userName: string;
  processingTime: number;
  contentLength: number;
  timestamp: string;
}

/**
 * Exported user context for caching
 */
export interface ExportedUserContext {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
}

/**
 * Cached context data
 */
export interface CachedContextData {
  pageName: string;
  userName: string;
  userContext: ExportedUserContext | null;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: number;
}

/**
 * Synthesize a minimal WikiContextLike from a PageContext snapshot. Used when
 * ParseContext is constructed without a real WikiContext (legacy callers, test
 * fixtures).
 *
 * - hasRole / getPrincipals: pure functions over the snapshot's roles array
 * - hasPermission / canAccess: delegate to the engine's UserManager / ACLManager
 *   when registered, so legacy callers that wired up these managers (mostly
 *   tests) keep getting the same policy-evaluated answer they did before
 *   Pass 2. When neither manager is available the stub denies (conservative).
 */
function pageContextToWikiContextLike(pc: PageContext, engine: WikiEngine, content = ''): WikiContextLike {
  const pageName = pc.pageName ?? null;
  const pageMetadata = pc.pageMetadata ?? null;
  // Fold the legacy top-level `userName` field into the synthesized userContext
  // so getters that derive from `userContext.username` see it. Without this
  // legacy fixtures that pass `userName` outside the userContext lose the
  // username.
  let userContext = pc.userContext ?? null;
  if (pc.userName && (!userContext || (!userContext.username && !userContext.userName))) {
    // permission-subject-ignore: #1212 — the fold produces a complete subject.
    // A legacy fixture that named a user and nothing else gets the CLOSED
    // defaults — no roles, not authenticated — never a widened one. Nothing
    // here asserts authority; it is the shape a nobody has.
    userContext = { roles: [], isAuthenticated: false, ...(userContext ?? {}), username: pc.userName };
  }
  return {
    engine,
    pageName,
    userContext,
    pageMetadata,
    hasRole: (...names: string[]): boolean => {
      if (names.length === 0) return false;
      const have = new Set(userContext?.roles ?? []);
      return names.some((n) => have.has(n));
    },
    hasPermission: async (action: string): Promise<boolean> => {
      const userManager = engine.getManager<{
        hasPermission(subject: PermissionSubject, a: string): Promise<boolean>;
          }>('UserManager');
      if (!userManager) return false;
      const username = userContext?.username ?? userContext?.userName ?? '';
      // #1173: forward the caller's context, do not rebuild one. The rebuilt
      // three-field object dropped `viaToken`, so an agent token's scope
      // ceiling had nothing to find and the check resolved against the token
      // OWNER's live roles — the #1164 defect, reached through a context class
      // and invisible to a guard that only scans src/routes/.
      if (userContext && typeof username === 'string' && username) {
        return userManager.hasPermission(userContext, action);
      }
      return userManager.hasPermission(ANONYMOUS_SUBJECT, action);
    },
    canAccess: async (action: string): Promise<boolean> => {
      const aclManager = engine.getManager<{
        checkPagePermissionWithContext(ctx: unknown, action: string): Promise<boolean>;
          }>('ACLManager');
      if (!aclManager || !pageName || pageName === 'unknown') return false;
      return aclManager.checkPagePermissionWithContext({
        pageName,
        content,
        userContext: userContext ?? undefined,
        pageMetadata
      }, action);
    },
    getPrincipals: (): string[] => {
      const roles = [...(userContext?.roles ?? [])];
      const username = userContext?.username ?? userContext?.userName;
      if (typeof username === 'string' && username.length > 0 && username !== 'anonymous') {
        roles.push(username);
      }
      return roles;
    }
  };
}

/**
 * ParseContext - Context object for markup parsing operations
 *
 * #629 Pass 2: holds a non-nullable reference to a WikiContextLike. For HTTP
 * requests this is the actual WikiContext (passed through toParseOptions);
 * for tests / direct construction it's a synthesized stub from the supplied
 * PageContext. Consumers should always read user/page-data via
 * `parseContext.wikiContext.X` — the duplicating getters from Pass 1
 * (pageName / userContext / pageMetadata) have been removed.
 *
 * Helpers that derive (not duplicate) from wikiContext are still here:
 * userName, isAuthenticated, getUserRoles.
 */
class ParseContext {
  readonly originalContent: string;
  readonly pageContext: PageContext;
  readonly engine: WikiEngine;

  /**
   * Reference to the parent WikiContext (#629). Always non-null after
   * construction — for callers without a real WikiContext, a stub is
   * synthesized from the PageContext snapshot.
   */
  readonly wikiContext: WikiContextLike;

  /**
   * Request info. Built from request headers by toParseOptions; not
   * duplicated from wikiContext (the stub lacks the headers anyway).
   * Static after construction.
   */
  readonly requestInfo: RequestInfo | null;

  // Mutable processing state
  protectedBlocks: unknown[];
  syntaxTokens: unknown[];
  variables: Map<string, unknown>;
  handlerResults: Map<string, unknown>;
  metadata: Record<string, unknown>;

  // Performance tracking
  private startTime: number;
  private phaseTimings: Map<string, number>;

  constructor(content: string, context: ParseContextOptions, engine: WikiEngine) {
    // Original content and processing context
    this.originalContent = content;

    // Handle nested structure from WikiContext.toParseOptions()
    // Context structure: { pageContext: { pageName, userContext, requestInfo }, engine, wikiContext? }
    if ('pageContext' in context && context.pageContext) {
      // Nested structure from WikiContext
      const nestedContext = context as NestedContextOptions;
      this.pageContext = nestedContext.pageContext;
      this.engine = nestedContext.engine || engine;
      this.wikiContext = nestedContext.wikiContext
        ?? pageContextToWikiContextLike(nestedContext.pageContext, this.engine, content);
      this.requestInfo = nestedContext.pageContext.requestInfo ?? null;
    } else {
      // Direct structure (legacy / alternative calling pattern; tests). The
      // synthesized wikiContext is a static view of the supplied PageContext.
      const directContext = context as DirectContextOptions;
      this.pageContext = directContext;
      this.engine = engine;
      this.wikiContext = pageContextToWikiContextLike(directContext, engine, content);
      this.requestInfo = directContext.requestInfo ?? null;
    }

    // Processing state
    this.protectedBlocks = [];
    this.syntaxTokens = [];
    this.variables = new Map();
    this.handlerResults = new Map();
    this.metadata = {};

    // Performance tracking
    this.startTime = Date.now();
    this.phaseTimings = new Map();
  }

  /**
   * Caller's username — derivation helper over `wikiContext.userContext`.
   * Returns 'anonymous' when no userContext is bound.
   */
  get userName(): string {
    const uc = this.wikiContext.userContext;
    return uc?.username ?? uc?.userName ?? 'anonymous';
  }

  /**
   * Get manager instance from engine
   * @param managerName - Name of manager to retrieve
   * @returns Manager instance or null
   */
  getManager(managerName: string): unknown {
    return this.engine.getManager(managerName);
  }

  /**
   * Check if user is authenticated — derivation helper over `wikiContext.userContext`.
   */
  isAuthenticated(): boolean {
    return Boolean(this.wikiContext.userContext?.isAuthenticated);
  }

  /**
   * Get user roles — derivation helper over `wikiContext.userContext`.
   */
  getUserRoles(): string[] {
    return this.wikiContext.userContext?.roles ?? [];
  }

  /**
   * Set variable value
   * @param name - Variable name
   * @param value - Variable value
   */
  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  /**
   * Get variable value
   * @param name - Variable name
   * @param defaultValue - Default value if not found
   * @returns Variable value
   */
  getVariable(name: string, defaultValue: unknown = null): unknown {
     
    const value = this.variables.get(name);
    return value ?? defaultValue;
  }

  /**
   * Store handler result
   * @param handlerId - Handler identifier
   * @param result - Handler result
   */
  setHandlerResult(handlerId: string, result: unknown): void {
    this.handlerResults.set(handlerId, result);
  }

  /**
   * Get handler result
   * @param handlerId - Handler identifier
   * @returns Handler result or null
   */
  getHandlerResult(handlerId: string): unknown {
     
    const result = this.handlerResults.get(handlerId);
    return result ?? null;
  }

  /**
   * Set metadata value
   * @param key - Metadata key
   * @param value - Metadata value
   */
  setMetadata(key: string, value: unknown): void {
     
    this.metadata[key] = value;
  }

  /**
   * Get metadata value
   * @param key - Metadata key
   * @param defaultValue - Default value if not found
   * @returns Metadata value
   */
  getMetadata(key: string, defaultValue: unknown = null): unknown {
     
    const value = this.metadata[key];
    return value ?? defaultValue;
  }

  /**
   * Record phase timing
   * @param phaseName - Name of phase
   * @param duration - Duration in milliseconds
   */
  recordPhaseTiming(phaseName: string, duration: number): void {
    this.phaseTimings.set(phaseName, duration);
  }

  /**
   * Get phase timing
   * @param phaseName - Name of phase
   * @returns Duration in milliseconds or 0
   */
  getPhaseTiming(phaseName: string): number {
    return this.phaseTimings.get(phaseName) ?? 0;
  }

  /**
   * Get total processing time
   * @returns Total time in milliseconds
   */
  getTotalTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Clone context for sub-processing
   * @param overrides - Properties to override
   * @returns New context instance
   */
  clone(overrides: Partial<PageContext> = {}): ParseContext {
    // #629: preserve the wikiContext reference on clone. Use the nested form
    // so the constructor picks up the wikiContext. If the source ParseContext
    // didn't have one, this falls back to the direct path.
    const newContext = this.wikiContext
      ? new ParseContext(
        this.originalContent,
        {
          pageContext: { ...this.pageContext, ...overrides },
          engine: this.engine,
          wikiContext: this.wikiContext
        },
        this.engine
      )
      : new ParseContext(
        this.originalContent,
        { ...this.pageContext, ...overrides },
        this.engine
      );

    // Copy current state
    newContext.protectedBlocks = [...this.protectedBlocks];
    newContext.syntaxTokens = [...this.syntaxTokens];
    newContext.variables = new Map(this.variables);
    newContext.metadata = { ...this.metadata };

    return newContext;
  }

  /**
   * Create error context for debugging
   * @param error - Error that occurred
   * @param phase - Phase where error occurred
   * @returns Error context
   */
  createErrorContext(error: Error, phase: string): ParseErrorContext {
    return {
      error: error.message,
      phase: phase,
      pageName: this.wikiContext.pageName ?? 'unknown',
      userName: this.userName,
      processingTime: this.getTotalTime(),
      contentLength: this.originalContent.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get context summary for logging
   * @returns Context summary
   */
  getSummary(): ContextSummary {
    return {
      pageName: this.wikiContext.pageName ?? 'unknown',
      userName: this.userName,
      authenticated: this.isAuthenticated(),
      roles: this.getUserRoles(),
      contentLength: this.originalContent.length,
      variableCount: this.variables.size,
      handlerResultCount: this.handlerResults.size,
      processingTime: this.getTotalTime(),
      phaseCount: this.phaseTimings.size
    };
  }

  /**
   * Export context data for caching
   * @returns Serializable context data
   */
  exportForCache(): CachedContextData {
    const uc = this.wikiContext.userContext;
    return {
      pageName: this.wikiContext.pageName ?? 'unknown',
      userName: this.userName,
      userContext: uc ? {
        isAuthenticated: uc.isAuthenticated || false,
        roles: uc.roles || [],
        permissions: uc.permissions || []
      } : null,
      variables: Object.fromEntries(this.variables),
      metadata: this.metadata,
      timestamp: Date.now()
    };
  }

  /**
   * Import context data from cache
   * @param data - Cached context data
   */
  importFromCache(data: CachedContextData): void {
    if (data.variables) {
      this.variables = new Map(Object.entries(data.variables));
    }
    if (data.metadata) {
      this.metadata = { ...data.metadata };
    }
  }
}

// Export class as named export for type imports
export { ParseContext };

// Export for ES modules
export default ParseContext;

// Export for CommonJS (Jest compatibility)
