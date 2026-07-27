/**
 * WikiContext - Request-scoped context for wiki operations
 *
 * Provides a request-scoped container for all contextual information needed
 * during page rendering, including the engine, current page, user, and
 * request/response objects.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import Showdown from 'showdown';
import logger from '../utils/logger.js';
import { guardShowdownInput } from '../utils/showdownGuard.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type PageManager from '../managers/PageManager.js';
import type RenderingManager from '../managers/RenderingManager.js';
import type PluginManager from '../managers/PluginManager.js';
import type VariableManager from '../managers/VariableManager.js';
import type ACLManager from '../managers/ACLManager.js';
import type UserManager from '../managers/UserManager.js';
import type MarkupParser from '../parsers/MarkupParser.js';
import type { VariableContext } from '../managers/VariableManager.js';
import { getThemeManager as getThemeManagerFor, type ThemeInfo } from '../managers/ThemeManager.js';
import type { PageFrontmatter } from '../types/Page.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Request information extracted from Express request
 */
export interface RequestInfo {
  /** Accept-Language header */
  acceptLanguage?: string;
  /** User-Agent header */
  userAgent?: string;
  /** Client IP address */
  clientIp?: string;
  /** Referer header */
  referer?: string;
  /** Session ID */
  sessionId?: string;
  /** Parsed query-string parameters (e.g. `?page=2&sort=count-desc`) */
  query?: Record<string, string>;
}

/**
 * User preferences for date/time formatting, locale, etc.
 */
export interface UserPreferences {
  /** User's preferred locale (e.g., 'en-US') */
  locale?: string;
  /** User's timezone (e.g., 'America/New_York') */
  timezone?: string;
  /** Date format preference (e.g., 'yyyy-MM-dd') */
  dateFormat?: string;
  /** Additional preferences */
  [key: string]: unknown;
}

/**
 * User context - session or authentication context
 */
export interface UserContext {
  /** Username */
  username?: string;
  /** User display name */
  displayName?: string;
  /** User roles */
  roles?: string[];
  /** Whether user is authenticated */
  authenticated?: boolean;
  /** User preferences for formatting, locale, etc. */
  preferences?: UserPreferences;
  /** Shorthand for preferences.locale */
  locale?: string;
  /** Shorthand for preferences.timezone */
  timezone?: string;
  /** Additional user context data */
  [key: string]: unknown;
}

/**
 * Theme context — active theme identity and user display preference
 */
export interface ThemeContext {
  /** Active theme folder name (e.g. 'default', 'flatly') */
  activeTheme: string;
  /** Metadata from the active theme's theme.json */
  themeInfo: ThemeInfo | null;
  /** User's light/dark/system display preference */
  displayTheme: string;
}

/**
 * Page context for rendering
 */
export interface PageContext {
  /** Name of the current page */
  pageName: string | null;
  /** User context/session */
  userContext: UserContext | null;
  /** Request information */
  requestInfo: RequestInfo;
  /** Theme context */
  themeContext?: ThemeContext;
  /** Page front matter metadata */
  pageMetadata?: PageFrontmatter | null;
}

/**
 * Options for MarkupParser.parse()
 */
export interface ParseOptions {
  /** Page-specific context */
  pageContext: PageContext;
  /** Wiki engine instance */
  engine: WikiEngine;
  /**
   * Optional reference to the parent WikiContext (#629). When present,
   * ParseContext getters delegate user/page-data lookups to it instead of
   * reading the constructor-time `pageContext` snapshot, keeping the
   * WikiContext as the single source of truth across the parse run.
   */
  wikiContext?: unknown;
}

/**
 * Options for WikiContext constructor
 */
export interface WikiContextOptions {
  /** Context type (VIEW, EDIT, PREVIEW, etc.) */
  context?: string;
  /** Name of the page */
  pageName?: string;
  /** Page content (markdown) */
  content?: string;
  /** User context/session */
  userContext?: UserContext;
  /** Express request object */
  request?: Request;
  /** Express response object */
  response?: Response;
  /** Active theme folder name (e.g. 'default', 'flatly') */
  activeTheme?: string;
  /** Metadata from theme.json */
  themeInfo?: ThemeInfo | null;
  /** Page front matter metadata — must be set before ACL checks */
  pageMetadata?: PageFrontmatter;
}

/**
 * Context type constants
 */
export interface ContextTypes {
  /** Viewing a page */
  VIEW: 'view';
  /** Editing a page */
  EDIT: 'edit';
  /** Previewing page changes */
  PREVIEW: 'preview';
  /** Viewing page diff */
  DIFF: 'diff';
  /** Viewing page information/metadata */
  INFO: 'info';
  /** No specific page context */
  NONE: 'none';
}

/**
 * WikiContext - Encapsulates the context of a single request or rendering operation
 *
 * Inspired by JSPWiki's WikiContext, this class provides a request-scoped container
 * for all contextual information needed during page rendering, including the engine,
 * current page, user, request/response objects, and manager references.
 *
 * @class WikiContext
 *
 * @property {WikiEngine} engine - The wiki engine instance
 * @property {string} context - The rendering context (VIEW, EDIT, PREVIEW, etc.)
 * @property {string|null} pageName - Name of the current page
 * @property {string|null} content - Page content (markdown)
 * @property {UserContext|null} userContext - Current user context/session
 * @property {Request|null} request - Express request object
 * @property {Response|null} response - Express response object
 * @property {PageManager} pageManager - Reference to PageManager
 * @property {RenderingManager} renderingManager - Reference to RenderingManager
 * @property {PluginManager} pluginManager - Reference to PluginManager
 * @property {VariableManager} variableManager - Reference to VariableManager
 * @property {ACLManager} aclManager - Reference to ACLManager
 * @property {Showdown.Converter} _fallbackConverter - Fallback markdown converter
 *
 * @see {@link WikiEngine} for the main engine
 * @see {@link RenderingManager} for rendering operations
 */
class WikiContext {
  /**
   * Context type constants for different rendering modes
   *
   * @static
   * @readonly
   */
  static readonly CONTEXT: ContextTypes = {
    /** Viewing a page */
    VIEW: 'view',
    /** Editing a page */
    EDIT: 'edit',
    /** Previewing page changes */
    PREVIEW: 'preview',
    /** Viewing page diff */
    DIFF: 'diff',
    /** Viewing page information/metadata */
    INFO: 'info',
    /** No specific page context */
    NONE: 'none'
  };

  /** The wiki engine instance */
  public readonly engine: WikiEngine;

  /** The rendering context type */
  public readonly context: string;

  /** Name of the current page */
  public readonly pageName: string | null;

  /** Page content (markdown) */
  public readonly content: string | null;

  /** Current user context/session */
  public readonly userContext: UserContext | null;

  /** Express request object */
  public readonly request: Request | null;

  /** Express response object */
  public readonly response: Response | null;

  /** Reference to PageManager */
  public readonly pageManager: PageManager;

  /** Reference to RenderingManager */
  public readonly renderingManager: RenderingManager;

  /** Reference to PluginManager */
  public readonly pluginManager: PluginManager;

  /** Reference to VariableManager */
  public readonly variableManager: VariableManager;

  /** Reference to ACLManager */
  public readonly aclManager: ACLManager;

  // Theme is resolved lazily — first read of `activeTheme` or `themeInfo` triggers
  // ConfigurationManager.getProperty('ngdpbase.theme.active') and ThemeManager
  // construction (cached engine-wide via getThemeManager). Permission-only callers
  // never trigger the resolution.
  /** Override passed via WikiContextOptions; bypasses the lazy resolver */
  private readonly _activeThemeOverride?: string;
  /** Override passed via WikiContextOptions; bypasses the lazy resolver */
  private readonly _themeInfoOverride?: ThemeInfo | null;
  /** Cached resolved activeTheme — populated on first read of `activeTheme` */
  private _resolvedActiveTheme?: string;
  /** Cached resolved themeInfo — populated on first read of `themeInfo` */
  private _resolvedThemeInfo?: ThemeInfo | null;

  /** Page front matter metadata — carries audience/access/user-keywords for ACL evaluation */
  public readonly pageMetadata: PageFrontmatter | null;

  /** Fallback markdown converter */
  private readonly _fallbackConverter: Showdown.Converter;

  /**
   * Per-instance memoization for hasPermission(action) results (#636).
   * The WikiContext is request-scoped, so this cache lifetime is the request.
   * We cache the Promise (not the resolved value) so concurrent callers all
   * await the same in-flight evaluation.
   */
  private readonly _permissionCache: Map<string, Promise<boolean>> = new Map();

  /**
   * Per-instance memoization for canAccess(action) results, keyed by
   * `${action}:${pageName}` to handle the rare case where a request mutates
   * pageName mid-handler (#636).
   */
  private readonly _canAccessCache: Map<string, Promise<boolean>> = new Map();

  /**
   * Creates a new WikiContext instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   * @param {WikiContextOptions} [options={}] - Context options
   * @throws {Error} If engine is not provided
   *
   * @example
   * const context = new WikiContext(engine, {
   *   context: WikiContext.CONTEXT.VIEW,
   *   pageName: 'Main',
   *   userContext: req.session.user,
   *   request: req,
   *   response: res
   * });
   */
  constructor(engine: WikiEngine, options: WikiContextOptions = {}) {
    if (!engine) {
      throw new Error('WikiContext requires a valid WikiEngine instance.');
    }

    this.engine = engine;
    this.context = options.context || WikiContext.CONTEXT.NONE;
    this.pageName = options.pageName || null;
    this.content = options.content || null;
    this.userContext = options.userContext || null;
    this.request = options.request || null;
    this.response = options.response || null;
    this._activeThemeOverride = options.activeTheme;
    this._themeInfoOverride = options.themeInfo;
    this.pageMetadata = options.pageMetadata ?? null;

    // Ensure essential managers are available on the context
    this.pageManager = engine.getManager<PageManager>('PageManager')!;
    this.renderingManager = engine.getManager<RenderingManager>('RenderingManager')!;
    this.pluginManager = engine.getManager<PluginManager>('PluginManager')!;
    this.variableManager = engine.getManager<VariableManager>('VariableManager')!;
    this.aclManager = engine.getManager<ACLManager>('ACLManager')!;

    this._fallbackConverter = new Showdown.Converter();
  }

  /**
   * Returns the current rendering context type
   *
   * @returns {string} The context type (VIEW, EDIT, PREVIEW, etc.)
   *
   * @example
   * if (context.getContext() === WikiContext.CONTEXT.EDIT) {
   *   // Show edit-specific UI
   * }
   */
  getContext(): string {
    return this.context;
  }

  /**
   * Returns true if the current user carries any of the given roles.
   *
   * Pure roles-array check; does not consult PolicyEvaluator. For policy-backed
   * permission checks, use {@link hasPermission} or {@link canAccess}.
   *
   * @param {...string} names - Role names to check (matches if user has at least one)
   * @returns {boolean} true if userContext.roles contains any of the given names
   *
   * @example
   * if (wikiContext.hasRole('admin', 'editor')) { ... }
   */
  hasRole(...names: string[]): boolean {
    return WikiContext.userHasRole(this.userContext, ...names);
  }

  /**
   * Static role check for callers that don't have a full WikiContext.
   *
   * Useful for hot-path middleware (maintenance gate, /metrics) that runs on
   * every request and shouldn't pay the cost of constructing a WikiContext just
   * to ask "is this user an admin?". Same semantics as the instance `hasRole`.
   *
   * @param userContext - userContext-like object (or null/undefined)
   * @param names - Role names (matches if user has at least one)
   * @returns true if userContext.roles contains any of the given names
   *
   * @example
   * if (WikiContext.userHasRole(req.userContext, 'admin')) { ... }
   */
  static userHasRole(
    userContext: { roles?: string[] } | null | undefined,
    ...names: string[]
  ): boolean {
    const roles = userContext?.roles;
    if (!Array.isArray(roles) || roles.length === 0 || names.length === 0) {
      return false;
    }
    const have = new Set(roles);
    return names.some((n) => have.has(n));
  }

  /**
   * Returns true if the current user is globally allowed to perform the given action.
   *
   * Delegates to {@link UserManager.hasPermission}, which evaluates through
   * PolicyEvaluator with role expansion (anonymous → 'All'; authenticated →
   * 'Authenticated' + 'All'). This is the canonical action-permission path.
   *
   * For page-resource-aware checks, use {@link canAccess} instead.
   *
   * @param {string} action - Permission action (e.g., 'admin-system', 'user-edit')
   * @returns {Promise<boolean>} true if the user has the permission
   *
   * @example
   * if (await wikiContext.hasPermission('admin-system')) { ... }
   */
  async hasPermission(action: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) return false;
    // #636: per-instance memoization — repeat calls share the same in-flight
    // promise. Cache the Promise (not the result) so concurrent callers all
    // wait on one evaluation.
    const cached = this._permissionCache.get(action);
    if (cached) return cached;
    // #637: pass the already-resolved userContext when we have one, so
    // UserManager.hasPermission can skip provider.getUser + resolveUserRoles.
    const promise = this.userContext
      ? userManager.hasPermission(this.userContext as { username: string; roles: string[]; isAuthenticated: boolean }, action)
      : userManager.hasPermission('', action);
    this._permissionCache.set(action, promise);
    return promise;
  }

  /**
   * Returns true if the current user is allowed to perform the given action
   * on the current page — or on a different page when `pageNameOverride` is
   * passed (#714 Slice B, the cross-page check used by linked-page visibility
   * filters and serveAttachment's owning-page lookup).
   *
   * Delegates to {@link ACLManager.checkPagePermissionWithContext} for the
   * current page (the no-override fast path) and {@link ACLManager.canUserAccessPage}
   * for cross-page checks (#714 Slice B — loads the target page's metadata
   * internally and runs the same evaluator).
   *
   * Returns false if the WikiContext has no pageName (and no override) or no
   * ACLManager.
   *
   * @param {string} action - Page action (e.g., 'view', 'edit', 'delete')
   * @param {string} [pageNameOverride] - When set, check access on this page
   *   instead of `this.pageName`. Used for cross-page checks (e.g., a private
   *   attachment whose owning page is not the current request's page).
   * @returns {Promise<boolean>} true if access is allowed
   *
   * @example
   * if (await wikiContext.canAccess('edit')) { ... }
   *
   * @example
   * // Cross-page check (Slice B): can the current user view the page that
   * // owns this attachment? Used at WikiRoutes.serveAttachment to enforce
   * // private-page access for attachments whose owning page is private.
   * if (!(await wikiContext.canAccess('view', owningPageName))) {
   *   return 403;
   * }
   */
  async canAccess(action: string, pageNameOverride?: string): Promise<boolean> {
    if (!this.aclManager) return false;

    // Resolve the page we're checking. When `pageNameOverride` is set, it
    // wins — that's the cross-page case. Otherwise use this.pageName (the
    // current page being rendered/edited).
    const targetPage = pageNameOverride ?? this.pageName;
    if (!targetPage) return false;

    // #636 / #714 Slice B: per-instance memoization. Cache key MUST include
    // the resolved target page (NOT this.pageName) — otherwise a cross-page
    // check via override returns a memoized result for the wrong page. Pre
    // -#714 this was keyed on `${action}:${this.pageName}` (silent bug).
    const key = `${action}:${targetPage}`;
    const cached = this._canAccessCache.get(key);
    if (cached) return cached;

    let promise: Promise<boolean>;
    if (pageNameOverride && pageNameOverride !== this.pageName) {
      // Cross-page check — go through canUserAccessPage so the target's
      // metadata is loaded internally (the current WikiContext's
      // pageMetadata describes a DIFFERENT page).
      promise = this.aclManager.canUserAccessPage(
        this.userContext,
        pageNameOverride,
        action
      );
    } else {
      // Same-page check — reuse the existing evaluator with this WikiContext
      // (its pageMetadata + content are already loaded for the current page).
      promise = this.aclManager.checkPagePermissionWithContext(
        this as unknown as Parameters<ACLManager['checkPagePermissionWithContext']>[0],
        action
      );
    }
    this._canAccessCache.set(key, promise);
    return promise;
  }

  /**
   * Returns the user's principals — the set of identifiers that match
   * audience-style filters (e.g., search-index private-page filters).
   *
   * Includes all roles, plus the username if present. Used by search providers
   * to filter results without invoking the full ACL evaluator per-result.
   *
   * @returns {string[]} Principals: [...roles, username] (username appended only if set)
   *
   * @example
   * const principals = wikiContext.getPrincipals();
   * if (principals.some((p) => audience.includes(p))) { ... }
   */
  getPrincipals(): string[] {
    const roles = Array.isArray(this.userContext?.roles) ? [...this.userContext.roles] : [];
    const username = this.userContext?.username;
    if (typeof username === 'string' && username.length > 0) {
      roles.push(username);
    }
    return roles;
  }

  /**
   * Active theme folder name (e.g. 'default', 'flatly').
   *
   * Lazy: resolves from ConfigurationManager on first access and caches the
   * result. Permission-only callers (route handlers that just call hasRole /
   * hasPermission) never trigger the lookup.
   */
  get activeTheme(): string {
    if (this._activeThemeOverride !== undefined) return this._activeThemeOverride;
    if (this._resolvedActiveTheme === undefined) {
      const cm = this.engine.getManager<{ getProperty(k: string, d?: unknown): unknown }>('ConfigurationManager');
      this._resolvedActiveTheme = (cm?.getProperty('ngdpbase.theme.active', 'default') as string) || 'default';
    }
    return this._resolvedActiveTheme;
  }

  /**
   * Metadata from the active theme's theme.json.
   *
   * Lazy: triggers theme resolution on first access (uses the engine-wide
   * `getThemeManager` cache). Returns the override if one was passed via
   * WikiContextOptions.
   */
  get themeInfo(): ThemeInfo | null {
    if (this._themeInfoOverride !== undefined) return this._themeInfoOverride;
    if (this._resolvedThemeInfo === undefined) {
      // Reading activeTheme triggers its own lazy resolution
      const themesDir = path.join(__dirname, '../../../themes');
      const tm = getThemeManagerFor(this.activeTheme, themesDir);
      this._resolvedThemeInfo = tm.paths.themeInfo;
    }
    return this._resolvedThemeInfo;
  }

  /**
   * Returns the user's display theme preference ('light' | 'dark' | 'system')
   * Derived from userContext.preferences['display.theme']; defaults to 'system'.
   */
  get displayTheme(): string {
    return (this.userContext?.preferences?.['display.theme'] as string) || 'system';
  }

  /**
   * Returns a ThemeContext snapshot for use in parse options and variable context
   */
  get themeContext(): ThemeContext {
    return {
      activeTheme: this.activeTheme,
      themeInfo: this.themeInfo,
      displayTheme: this.displayTheme
    };
  }

  /**
   * Renders the provided markdown content through the full rendering pipeline
   *
   * This method uses the MarkupParser for advanced parsing with plugin support,
   * variable expansion, and multi-phase processing. Falls back to simple Showdown
   * conversion if the parser is unavailable.
   *
   * @async
   * @param {string} [content=this.content] - The markdown content to render
   * @returns {Promise<string>} The rendered HTML
   *
   * @example
   * const html = await context.renderMarkdown('# Hello World');
   * // Returns: '<h1>Hello World</h1>'
   *
   * @example
   * // With plugins and variables
   * const html = await context.renderMarkdown('[{CurrentTimePlugin}]');
   * // Returns expanded plugin output
   */
  async renderMarkdown(content: string | null = this.content): Promise<string> {
    if (!content) {
      return '';
    }

    // The advanced parser should be the primary method
    const parser: MarkupParser | null = this.renderingManager.getParser();
    logger.info(`[CTX] renderMarkdown page=${this.pageName ?? 'unknown'} parser=${!!parser} contentLen=${content.length}`);

    if (parser) {
      // Cast to Record<string, unknown> for MarkupParser.parse() compatibility
      const parseContext = this.toParseOptions() as unknown as Record<string, unknown>;
      const html: string = await parser.parse(content, parseContext);
      logger.info(`[CTX] parsed via MarkupParser resultLen=${html.length}`);
      return html;
    }

    // Fallback for when the advanced parser is not available
    logger.warn(`[CTX] Using fallback renderer for page ${this.pageName ?? 'unknown'}.`);
    let expanded: string = content;
    if (this.variableManager) {
      const variableContext: VariableContext = this.toVariableContext();
      expanded = this.variableManager.expandVariables(expanded, variableContext);
      logger.info(`[CTX] variables expanded len=${expanded.length}`);
    }

    // Guarded (#1000). This fallback fires when RenderingManager has no parser,
    // and POST /api/preview reaches it with an arbitrary request body — so it is
    // exactly as exposed as the primary path, degraded or not.
    const html: string = this._fallbackConverter.makeHtml(guardShowdownInput(expanded));
    logger.info(`[CTX] fallback converter resultLen=${html.length}`);
    return html;
  }

  /**
   * Creates the options object needed for the MarkupParser
   *
   * Builds a comprehensive options object containing page context, user context,
   * request information, and engine reference for use during parsing.
   *
   * @returns {ParseOptions} Parse options object
   *
   * @example
   * const options = context.toParseOptions();
   * const html = await parser.parse(content, options);
   */
  toParseOptions(): ParseOptions {
    return {
      pageContext: {
        pageName: this.pageName,
        userContext: this.userContext,
        requestInfo: {
          acceptLanguage: this.request?.headers?.['accept-language'],
          userAgent: this.request?.headers?.['user-agent'],
          clientIp: this.request?.ip,
          referer: this.request?.headers?.referer,
          sessionId: this.request?.sessionID,
          query: this.request?.query as Record<string, string> | undefined
        },
        themeContext: this.themeContext,
        pageMetadata: this.pageMetadata
      },
      engine: this.engine,
      // #629: ParseContext getters delegate to this when present so the
      // WikiContext stays the single source of truth across the parse run.
      // The pageContext snapshot above is kept as a back-compat fallback for
      // callers that aren't ParseContext (or test fixtures that pass raw options).
      wikiContext: this
    };
  }

  /**
   * Converts the current context to a VariableContext for variable expansion
   *
   * @returns {VariableContext} Variable context for use with VariableManager
   * @private
   */
  private toVariableContext(): VariableContext {
    return {
      pageName: this.pageName ?? undefined,
      userContext: this.userContext ? {
        username: this.userContext.username,
        isAuthenticated: this.userContext.authenticated,
        roles: this.userContext.roles,
        displayName: this.userContext.displayName,
        // Include user preferences for date/time formatting
        locale: this.userContext.locale ?? this.userContext.preferences?.locale,
        timezone: this.userContext.timezone ?? this.userContext.preferences?.timezone,
        preferences: this.userContext.preferences
      } : undefined,
      requestInfo: {
        acceptLanguage: this.request?.headers?.['accept-language'],
        userAgent: this.request?.headers?.['user-agent'],
        clientIp: this.request?.ip,
        referer: this.request?.headers?.referer,
        sessionId: this.request?.sessionID
      },
      themeContext: this.themeContext
    };
  }
}

export default WikiContext;

