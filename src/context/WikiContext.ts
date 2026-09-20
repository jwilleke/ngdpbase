/**
 * WikiContext - Request-scoped context for wiki operations
 *
 * Provides a request-scoped container for all contextual information needed
 * during page rendering, including the engine, current page, user, and
 * request/response objects.
 */

import path from 'path';
import type { PermissionSubject } from '../managers/UserManager.js';
import { BaseContext } from './BaseContext.js';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { createMarkdownConverter, type MarkdownConverter } from '../rendering/markdownConverter.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type PageManager from '../managers/PageManager.js';
import type RenderingManager from '../managers/RenderingManager.js';
import type PluginManager from '../managers/PluginManager.js';
import type VariableManager from '../managers/VariableManager.js';
import type ACLManager from '../managers/ACLManager.js';
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
export interface UserContext extends PermissionSubject {
  // #1399: the authorisation fields are PermissionSubject's, declared once.
  // They were repeated here and in ParseContext, and the repetition is the
  // #1173 failure mode — `privateStoreHandle` (#1382) was added to the subject
  // and to neither copy, so the one field that reaches a sealed page survived
  // only because of the index signature below, untyped. A field added to the
  // subject now arrives here on its own.
  //
  // What stays is display-only: things a template reads and the evaluator
  // never does.
  /** User display name */
  displayName?: string;
  /** Alias for isAuthenticated (legacy templates) */
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
  /** The caller's subject. Required (#1399) — see the constructor. */
  userContext: UserContext;
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
 * @property {MarkdownConverter} _fallbackConverter - Fallback markdown converter (#1273)
 *
 * @see {@link WikiEngine} for the main engine
 * @see {@link RenderingManager} for rendering operations
 */
class WikiContext extends BaseContext {
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
  /**
   * The caller's subject, as the middleware wrote it.
   *
   * #1399: stored once, on BaseContext, and read here under the name the
   * render path and the templates already use. A UserContext IS a
   * PermissionSubject plus display-only extras, so this is a view of the same
   * object — never a copy, which is what would drop `privateStoreHandle` and
   * make a sealed page vanish for its owner (#1382, #1173).
   */
  get userContext(): UserContext {
    // #1399: non-null by construction — the constructor refuses a context with
    // no subject, and the session middleware writes one on every request. The
    // routes' `if (!currentUser)` guards that used to follow this read were
    // guarding a state the system cannot produce.
    return this._subject as UserContext;
  }

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
  private readonly _fallbackConverter: MarkdownConverter;

  /**
   * Per-instance memoization for hasPermission(action) results (#636).
   * The WikiContext is request-scoped, so this cache lifetime is the request.
   * We cache the Promise (not the resolved value) so concurrent callers all
   * await the same in-flight evaluation.
   */

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
  constructor(engine: WikiEngine, options: WikiContextOptions) {
    if (!engine) {
      throw new Error('WikiContext requires a valid WikiEngine instance.');
    }

    // #1399, operator 2026-09-20: a context ALWAYS has a subject. The session
    // middleware writes one on every request — the signed-in user, or the
    // anonymous principal it assigns when nobody has signed in — so a context
    // built without one is a failure upstream, not an anonymous visitor.
    // Refused here, at the mistake, rather than substituting a caller nobody
    // chose (security-posture P1; the same reason #1418 made
    // `req.userContext` required rather than optional).
    //
    // Checked at runtime, not only in the type: `tsconfig.json` excludes every
    // `__tests__` directory (#1428), so a missing field in a fixture would
    // otherwise reach the permission door unnoticed.
    if (!options.userContext) {
      throw new Error(
        'WikiContext requires a subject: forward the caller, or pass ANONYMOUS_SUBJECT by name (security-posture P1)'
      );
    }
    super(engine, options.userContext);
    this.engine = engine;
    this.context = options.context || WikiContext.CONTEXT.NONE;
    this.pageName = options.pageName || null;
    // `??`, not `||`: an empty page body is real content, not an absent one.
    // `||` turned '' into null, the save path crashed on it, and the journal
    // addon worked around that by creating entries with a single space — which
    // the author then typed after, storing ` # heading` (#1328).
    this.content = options.content ?? null;
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

    // Degraded path, when RenderingManager has no parser (#1273).
    this._fallbackConverter = createMarkdownConverter('fallback');
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

  // #1399: the instance `hasRole` is gone (security-posture P2). A door asks
  // for a permission — hasPermission / canAccess — and a role name skips the
  // policy evaluator, deny policies and the token and share ceilings. It had
  // no callers left after the #1198 series; removing it means the question
  // cannot be asked of a context at all. The STATIC userHasRole below survives
  // for the one remaining justified read: counting how many accounts hold a
  // role, which is data about users rather than a decision about a caller.

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

  // #1399: hasPermission(action) is BaseContext's — one implementation of the
  // global door, asking UserManager with the subject this context holds, with
  // the same #636 per-instance promise memoisation this class had. The
  // resource-aware check stays here, because it needs a page.

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

  // #1399: getPrincipals() is BaseContext's — [...roles, username] off the
  // subject this context holds, one implementation for every context.

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
   * variable expansion, and multi-phase processing. Falls back to plain markdown-it
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

    // This fallback fires when RenderingManager has no parser, and POST
    // /api/preview reaches it with an arbitrary request body.
    const html: string = this._fallbackConverter.makeHtml(expanded);
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

