/* eslint-disable @typescript-eslint/explicit-function-return-type -- ~148 methods need return types; deferred */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- req.body/req.query/dynamic Express values; getManager calls are now typed via overloads */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- req.body/req.query/dynamic Express values; getManager calls are now typed via overloads */
/* eslint-disable @typescript-eslint/no-unsafe-call -- req.body/req.query/dynamic Express values; getManager calls are now typed via overloads */
/* eslint-disable @typescript-eslint/no-unsafe-argument -- req.body/req.query/dynamic Express values; getManager calls are now typed via overloads */
/* eslint-disable @typescript-eslint/no-unsafe-return -- req.body/req.query/dynamic Express values; getManager calls are now typed via overloads */

/**
 * Modern route handlers using manager-based architecture
 *
 * @module WikiRoutes
 */

import path from 'path';
import { fileURLToPath } from 'url';
import multer, { StorageEngine, Multer } from 'multer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fse from 'fs-extra';
import matter from 'gray-matter';
import { normalizeExistingPageToNcm, localizeNcmImages } from '../converters/ncm/index.js';
import type { NcmImageDeps } from '../converters/ncm/index.js';
import { createPatch } from 'diff';
import { exec } from 'child_process';
import { Request, Response, Application } from 'express';
import SchemaGenerator from '../utils/SchemaGenerator.js';
import logger from '../utils/logger.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import { extractSection, spliceSection } from '../utils/SectionUtils.js';
import { shuffleArray } from '../utils/pluginFormatters.js';
import { SimpleRateLimiter } from '../utils/SimpleRateLimiter.js';
import { ContactSubmissionLog, type SubmissionEntry, type MailResult } from '../utils/ContactSubmissionLog.js';
import { stringifyJsonLdForScript, wantsJsonLd } from '../utils/buildPageJsonLd.js';
import { articleToPageJsonLd } from '../utils/articleToPageJsonLd.js';
import type { Article } from '../types/Schema.js';
import { buildConceptSchemeJsonLd } from '../utils/buildConceptSchemeJsonLd.js';
import { renderFootnoteListHtml } from '../plugins/FootnotesPlugin.js';
import { renderCommentListHtml } from '../plugins/CommentsPlugin.js';
import WikiContext from '../context/WikiContext.js';
import { ThemeManager, getThemeManager } from '../managers/ThemeManager.js';
import type { ReportProgress } from '../managers/BackgroundJobManager.js';
import type { WikiPage, PageFrontmatter } from '../types/Page.js';
import type AddonsManager from '../managers/AddonsManager.js';
import type AssetManager from '../managers/AssetManager.js';
import type AssetService from '../managers/AssetService.js';
import type AttachmentManager from '../managers/AttachmentManager.js';
import type AuthManager from '../managers/AuthManager.js';
import type BackgroundJobManager from '../managers/BackgroundJobManager.js';
import type BackupManager from '../managers/BackupManager.js';
import type CacheManager from '../managers/CacheManager.js';
import type CatalogManager from '../managers/CatalogManager.js';
import type ExportManager from '../managers/ExportManager.js';
import type ImportManager from '../managers/ImportManager.js';
import type MediaManager from '../managers/MediaManager.js';
import type MetricsManager from '../managers/MetricsManager.js';
import type CommentManager from '../managers/CommentManager.js';
import type FootnoteManager from '../managers/FootnoteManager.js';
import type NotificationManager from '../managers/NotificationManager.js';
import type PolicyValidator from '../managers/PolicyValidator.js';
import type RenderingManager from '../managers/RenderingManager.js';
import type TemplateManager from '../managers/TemplateManager.js';
import type ValidationManager from '../managers/ValidationManager.js';
import type VariableManager from '../managers/VariableManager.js';
import { ApiContext, ApiError } from '../context/ApiContext.js';

/** Helper to extract error message from unknown error */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

interface WikiConfig {
  features?: { maintenance?: { enabled?: boolean; allowAdmins?: boolean }; [key: string]: unknown };
  [key: string]: unknown;
}

// ── Local manager interfaces ──────────────────────────────────────────────────
// Minimal structural types derived from how each manager is used in this file.
// Using the full imported class types would surface 200+ pre-existing type
// mismatches (private property access, method renames, widened signatures).
// These interfaces precisely describe the contract expected by the call sites.

interface IVersionEntry {
  version: number;
  timestamp: string;
  author?: string;
  changeType?: string;
  comment?: string;
  [key: string]: unknown;
}

interface IComparisonResult {
  version1?: unknown;
  version2?: unknown;
  diff?: unknown;
  stats?: unknown;
  [key: string]: unknown;
}

interface IValidationReport {
  fixedFiles: number;
  invalidFiles: number;
  [key: string]: unknown;
}

interface IUserManager {
  getCurrentUser(req: Request): Promise<UserContext>;
  getUser(username: string): Promise<UserContext | null>;
  getUsers(): Promise<UserContext[]>;
  createUser(data: unknown): Promise<unknown>;
  updateUser(username: string, data: unknown): Promise<unknown>;
  deleteUser(username: string): Promise<unknown>;
  hasPermission(username: string | undefined, permission: string): Promise<boolean>;
  hasRole(username: string, roleName: string): Promise<boolean>;
  resolveUserRoles(username: string): Promise<string[]>;
  getUserPermissions(username: string): Promise<string[]>;
  getPermissions(): Map<string, string>;
  getRoles(): unknown[];
  createRole(data: unknown): Promise<unknown>;
  deleteRole(name: string): Promise<unknown>;
  updateRolePermissions(role: string, permissions: unknown): Promise<unknown>;
  authenticateUser(username: string, password: string): Promise<unknown>;
  getSession(req: Request): Promise<unknown>;
  searchUsers(query: string, options?: { role?: string; limit?: number; activeOnly?: boolean }): Promise<{ username: string; displayName?: string; email?: string; roles?: string[]; [key: string]: unknown }[]>;
  getContactRecipient(recipientOverride: string): Promise<string | null>;
}

interface IConfigManager {
  getProperty(key: string, defaultValue: string): string;
  getProperty(key: string, defaultValue: null): unknown;
  getProperty(key: string, defaultValue?: unknown): unknown;
  setProperty(key: string, value: unknown): Promise<void> | void;
  getCustomProperty(key: string): unknown;
  getCustomProperties(): unknown;
  getDefaultProperties(): unknown;
  getAllProperties(): unknown;
  getResolvedDataPath(key: string, defaultValue?: string): string;
  getInstanceDataFolder?(): string;
  resetToDefaults(): Promise<void> | void;
  getFencedCodeTags?(): Set<string>;
}

interface IVersioningProvider {
  getVersionHistory?(name: string, limit?: number): Promise<IVersionEntry[]>;
  compareVersions?(name: string, v1: number, v2: number): Promise<IComparisonResult | null>;
  restoreVersion?(name: string, version: number, options?: { author?: string; comment?: string }): Promise<number>;
  getPageVersion?(name: string, version: number): Promise<{ content: string; metadata: unknown }>;
  pageIndex?: { pages: Record<string, { location?: string; creator?: string }> } | null;
  invalidatePageCache?(identifier: string): string | null;
}

interface IPageManager {
  getPage(name: string): Promise<WikiPage | null>;
  getPageContent(name: string): Promise<string>;
  getAllPages(): Promise<string[]>;
  getAllPageNames(): Promise<string[]>;
  getPageNames?(): Promise<string[]>;
  getPageMetadata(name: string): Promise<PageFrontmatter | null>;
  pageExists(name: string): boolean;
  savePage(name: string, content: string, metadata?: Partial<PageFrontmatter>, options?: unknown): Promise<void>;
  savePageWithContext(wikiContext: unknown, metadata?: Partial<PageFrontmatter>): Promise<void>;
  deletePage(name: string, options?: unknown): Promise<boolean>;
  deletePageWithContext(wikiContext: unknown): Promise<boolean>;
  getCurrentPageProvider(): IVersioningProvider | null;
  getPageUUID?(identifier: string): string | null;
  /** Direct provider reference — prefer getCurrentPageProvider() for new code */
  provider?: IVersioningProvider | null;
  refreshPageList(): Promise<void>;
  validateAndFixAllFiles(options?: unknown): Promise<IValidationReport>;
}

interface IACLManager {
  checkPagePermissionWithContext(wikiContext: WikiContext, action: string): Promise<boolean>;
  getAccessLog(limit?: number, filters?: unknown): unknown[];
  removeACLMarkup(content: string): string;
  getAccessControlStats(): unknown;
}

interface ISchemaManager {
  getSchema(name: string): unknown;
  getAllSchemaNames(): string[];
  getComprehensiveSiteData(options?: unknown): Promise<unknown>;
  getPerson(id: string): Promise<unknown>;
  // #624 (iteration 3c): the org-CRUD methods that used to live here were
  // phantoms — typed but never implemented on SchemaManager. Org records are
  // owned by OrganizationManager (see IOrganizationManager).
}

interface IOrganizationRecord {
  '@context'?: string;
  '@type'?: string;
  '@id': string;
  name?: string;
  url?: string;
  [key: string]: unknown;
}

interface IOrganizationManager {
  list(): Promise<IOrganizationRecord[]>;
  getById(id: string): Promise<IOrganizationRecord | null>;
  getByFile(filename: string): Promise<IOrganizationRecord | null>;
  create(org: IOrganizationRecord, filename?: string): Promise<IOrganizationRecord>;
  update(id: string, patch: Record<string, unknown>): Promise<IOrganizationRecord | null>;
  delete(id: string): Promise<boolean>;
  getInstallOrg(): Promise<IOrganizationRecord | null>;
}

interface ISearchManager {
  search(query: string, options?: unknown): Promise<unknown[]>;
  advancedSearch(options: unknown): Promise<unknown[]>;
  advancedSearchWithContext(context: unknown, options?: unknown): Promise<unknown[]>;
  updatePageInIndex(pageName: string, pageData: unknown): Promise<void>;
  removePageFromIndex(pageName: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  rebuildFromDisk(): Promise<void>;
  getSuggestions(partial: string): Promise<string[]>;
  getStatistics(): Promise<{ totalDocuments?: number; [key: string]: unknown }>;
  getStats(): unknown;
  getAllDocuments(): Promise<unknown[]>;
  getAllCategories(): Promise<string[]>;
  getAllUserKeywords(): Promise<string[]>;
  getAllSystemKeywords(): Promise<string[]>;
  getPageSystemKeywords(pageName: string): Promise<string[]>;
  searchByCategory(category: string): Promise<unknown[]>;
  searchByCategories(categories: string[]): Promise<unknown[]>;
  searchByUserKeywords(keyword: string): Promise<unknown[]>;
  searchByUserKeywordsList(keywords: string[]): Promise<unknown[]>;
  searchBySystemKeywordsList(keywords: string[]): Promise<unknown[]>;
}

interface IPolicyManager {
  getPolicy(id: string): unknown;
  getAllPolicies(): unknown[];
  getPolicies(): unknown[];
  deletePolicy(id: string): Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────

interface WikiEngine {
  // Managers with local minimal interfaces (call-site-derived types)
  getManager(name: 'UserManager'): IUserManager;
  getManager(name: 'ConfigurationManager'): IConfigManager;
  getManager(name: 'PageManager'): IPageManager;
  getManager(name: 'ACLManager'): IACLManager;
  getManager(name: 'SchemaManager'): ISchemaManager;
  getManager(name: 'OrganizationManager'): IOrganizationManager;
  getManager(name: 'SearchManager'): ISearchManager;
  getManager(name: 'PolicyManager'): IPolicyManager;
  // Managers using full typed imports
  getManager(name: 'AddonsManager'): AddonsManager;
  getManager(name: 'AssetManager'): AssetManager;
  getManager(name: 'AssetService'): AssetService;
  getManager(name: 'AttachmentManager'): AttachmentManager;
  getManager(name: 'AuthManager'): AuthManager;
  getManager(name: 'BackgroundJobManager'): BackgroundJobManager;
  getManager(name: 'BackupManager'): BackupManager;
  getManager(name: 'CacheManager'): CacheManager;
  getManager(name: 'CatalogManager'): CatalogManager;
  getManager(name: 'CommentManager'): CommentManager;
  getManager(name: 'FootnoteManager'): FootnoteManager;
  getManager(name: 'ExportManager'): ExportManager;
  getManager(name: 'ImportManager'): ImportManager;
  getManager(name: 'MediaManager'): MediaManager;
  getManager(name: 'MetricsManager'): MetricsManager;
  getManager(name: 'NotificationManager'): NotificationManager;
  getManager(name: 'PolicyValidator'): PolicyValidator;
  getManager(name: 'RenderingManager'): RenderingManager;
  getManager(name: 'TemplateManager'): TemplateManager;
  getManager(name: 'ValidationManager'): ValidationManager;
  getManager(name: 'VariableManager'): VariableManager;
  getManager<T = unknown>(name: string): T | undefined;
  config?: WikiConfig;
  getCapabilities?(): Record<string, boolean>;
}

interface UserContext {
  username?: string;
  email?: string;
  roles?: string[];
  isSystem?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensible interface; compatible with UserManager.UserContext and req.userContext
  [key: string]: any;
}

interface WikiContextOptions {
  context?: string;
  pageName?: string | null;
  content?: string | null;
  userContext?: UserContext | null;
  request?: Request;
  response?: Response | null;
}

interface TemplateData {
  currentUser?: UserContext | null;
  userContext?: UserContext | null;
  user?: UserContext | null;
  pageName?: string | null;
  wikiContext?: unknown;
  engine?: WikiEngine;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensible template data; templates access arbitrary properties
  [key: string]: any;
}

interface RequestInfo {
  userAgent: string;
  clientIp: string;
  referer: string;
  acceptLanguage: string;
  sessionId: string;
}

// Configure multer for image uploads
/**
 * Module-scope rate limiter for #658 POST /contact. 5 submissions per IP per
 * 15-minute window. Exported so tests can call `.reset()` between cases.
 */
export const contactRateLimiter = new SimpleRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

const imageStorage: StorageEngine = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = path.join(__dirname, '../../public/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for general attachments (memory storage)
const attachmentUpload: Multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit (can be overridden by config)
});

const imageUpload: Multer = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error('Only image files (jpeg, jpg, png|gif|webp|svg) are allowed')
    );
  }
});

class WikiRoutes {
  private engine: WikiEngine;
  /** Connected admin SSE clients — used to push real-time events to admin pages */
  private sseAdminClients = new Set<Response>();

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  /**
   * Push a JSON event to all connected admin SSE clients.
   * Automatically removes clients whose connections have closed.
   */
  private pushAdminEvent(event: string, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseAdminClients) {
      try {
        client.write(payload);
      } catch {
        this.sseAdminClients.delete(client);
      }
    }
  }

  /**
   * Check whether the current user may access a private page.
   * Reads the page index entry for pageName and applies the following rules:
   * - If the page is not private (location !== 'private') → allow
   * - If not authenticated → deny
   * - If admin role → allow
   * - If username === entry.creator → allow
   * - Otherwise → deny
   *
   * Returns true to allow, false to deny (caller should return 403).
   */
  private async checkPrivatePageAccess(wikiContext: WikiContext, pageName: string): Promise<boolean> {
    try {
      const pageManager = this.engine.getManager('PageManager');
      if (!pageManager) return true; // No page manager — allow (will fail elsewhere)

      // Get page metadata to find the UUID
      const pageMetadata = await pageManager.getPageMetadata(pageName);
      if (!pageMetadata?.uuid) return true; // No UUID — cannot check index, allow

      // Access the provider's page index entry via provider reference
       
      const provider = pageManager.getCurrentPageProvider?.() ?? (pageManager).provider;
      if (!provider) return true;

       
      const pageIndex = (provider).pageIndex as { pages: Record<string, { location?: string; creator?: string }> } | null;
      if (!pageIndex) return true;

      const entry = pageIndex.pages[pageMetadata.uuid];
      if (!entry || entry.location !== 'private') return true; // Not a private page

      // Page is private — apply access rules
      const username = wikiContext.userContext?.username;
      if (!username) return false; // Not authenticated
      if (wikiContext.hasRole('admin')) return true; // Admin
      if (username === entry.creator) return true; // Creator
      return false; // Deny
    } catch {
      // If check fails for any reason, allow (conservative — will fail elsewhere if truly missing)
      return true;
    }
  }

  /**
   * Create a WikiContext for the given request and page
   * This should be the single source of truth for all context information
   * @param {object} req - Express request object
   * @param {object} options - Additional context options (pageName, content, context type)
   * @returns {WikiContext} WikiContext instance
   */
  createWikiContext(req: Request, options: WikiContextOptions = {}): WikiContext {
    // #625 Step 1 — theme is resolved lazily by WikiContext.activeTheme/themeInfo
    // getters on first access. Permission-only callers (route handlers that just
    // call hasRole / hasPermission) don't pay for ConfigurationManager.getProperty
    // and ThemeManager construction.
    return new WikiContext(this.engine as unknown as import('../types/WikiEngine.js').WikiEngine, {
      context: options.context || WikiContext.CONTEXT.NONE,
      pageName: options.pageName ?? undefined,
      content: options.content ?? undefined,
      userContext: req.userContext,
      request: req,
      response: options.response ?? undefined
    });
  }

  /**
   * Extract template data from WikiContext
   * This ensures all templates get consistent data structure
   * @param {WikiContext} wikiContext - The wiki context
   * @returns {object} Template data object
   */
  getTemplateDataFromContext(wikiContext: WikiContext): TemplateData {
    return {
      // User context (both names for compatibility)
      currentUser: wikiContext.userContext,
      userContext: wikiContext.userContext,
      user: wikiContext.userContext,

      // Page context
      pageName: wikiContext.pageName,

      // WikiContext itself for advanced usage
      wikiContext: wikiContext,

      // Engine reference
      engine: wikiContext.engine
    };
  }

  /**
   * Parse file size string (e.g., '5MB', '1GB') to bytes
   * @param {string} sizeStr - Size string
   * @returns {number} Size in bytes
   */
  parseFileSize(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024
    };

    const match = sizeStr
      .toUpperCase()
      .match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const size = parseFloat(match[1]);
    const unit = match[2] || 'B';

    return Math.round(size * units[unit]);
  }

  /**
   * Extract request information for variable expansion
   * @param {object} req - Express request object
   * @returns {object} Request information object
   */
  getRequestInfo(req: Request): RequestInfo {
    return {
      userAgent: req.headers['user-agent'] || 'Unknown',
      clientIp:
        req.ip ||
        req.socket?.remoteAddress ||
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        'Unknown',
      referer: (req.headers.referer || req.headers.referrer || 'Direct') as string,
      acceptLanguage: req.headers['accept-language'] || 'Unknown',
      sessionId: req.session?.id || req.sessionID || 'None'
    };
  }

  /**
   * Get common template data that all pages need.
   * This is now the single source of truth for common data.
   * @param {object} req - Express request object.
   */
  async getCommonTemplateData(req: Request): Promise<TemplateData> {
    const userManager = this.engine.getManager('UserManager');
    const aclManager = this.engine.getManager('ACLManager');
    const renderingManager = this.engine.getManager('RenderingManager');
    const pageManager = this.engine.getManager('PageManager');
    const configManager = this.engine.getManager('ConfigurationManager');

    // Get the user context directly from the request.
    const userContext =
      req.userContext || (await userManager.getCurrentUser(req));

    // Resolve active theme paths
    const activeTheme = (configManager?.getProperty('ngdpbase.theme.active', 'default')) || 'default';
    const themesDir = path.join(__dirname, '../../../themes');
    const themeManager = getThemeManager(activeTheme, themesDir);
    const themePaths = themeManager.paths;

    // Collect addon stylesheets registered via AddonsManager.registerStylesheet()
    const addonsManager = this.engine.getManager('AddonsManager');
    const addonStylesheets: string[] = addonsManager?.getRegisteredStylesheets?.() ?? [];

    const allowRegistration = (configManager?.getProperty(
      'ngdpbase.application.registration',
      true
    ) as boolean) ?? true;
    const registrationRedirectPage = (configManager?.getProperty(
      'ngdpbase.application.registration.redirect-page',
      'request-access'
    )) || 'request-access';

    // #670 Phase A: derive `contactAvailable` once per render so the footer
    // link, future header chrome, and page bodies all read the same answer.
    // Short-circuits — only iterates users when both contact + mail are on.
    const contactEnabled = (configManager?.getProperty(
      'ngdpbase.application.contact.enabled',
      true
    ) as boolean) ?? true;
    const contactFooterEnabled = (configManager?.getProperty(
      'ngdpbase.application.contact.footer.enabled',
      true
    ) as boolean) ?? true;
    const emailManager = this.engine.getManager('EmailManager') as
      | { isEnabled(): boolean }
      | null;
    const mailEnabled = emailManager?.isEnabled?.() ?? false;
    let contactAvailable = false;
    if (contactEnabled && mailEnabled && userManager) {
      const recipientOverride = (configManager?.getProperty(
        'ngdpbase.application.contact.recipient',
        ''
      )) ?? '';
      const recipient = await userManager.getContactRecipient(recipientOverride);
      contactAvailable = !!recipient;
    }

    const templateData: {
      currentUser: UserContext | null;
      user: UserContext | null;
      userContext: UserContext | null;
      appName: unknown;
      applicationName: unknown;
      faviconPath: unknown;
      pages: unknown;
      activeTheme: string;
      coreCssPath: string;
      variablesCssPath: string;
      logoPath: string;
      locationCssPath: string;
      themeFontUrls: string[];
      addonStylesheets: string[];
      capabilities: Record<string, boolean>;
      allowRegistration: boolean;
      registrationRedirectPage: string;
      contactAvailable: boolean;
      contactFooterEnabled: boolean;
      csrfToken: string;
      leftMenu?: string;
      footer?: string;
      systemCategoryDefs?: Record<string, unknown>;
    } = {
      currentUser: userContext,
      user: userContext,       // alias
      userContext: userContext, // used by page-history.ejs and other templates
      csrfToken: req.session?.csrfToken || '', // #663: token for header meta + form _csrf inputs
      appName: configManager?.getProperty(
        'ngdpbase.application-name',
        'ngdpbase'
      ),
      applicationName: configManager?.getProperty(
        'ngdpbase.application-name',
        'ngdpbase'
      ),
      // Theme owns favicon/logo; config key only overrides when explicitly set in custom config
      // (app-default-config.json sets a fallback but should not win over a theme's own assets)
      faviconPath: (configManager?.getCustomProperty('ngdpbase.favicon-path') as string) || themePaths.faviconPath,
      pages: await pageManager.getAllPages(),
      activeTheme: themePaths.activeTheme,
      coreCssPath: themePaths.coreCssPath,
      variablesCssPath: themePaths.variablesCssPath,
      logoPath: (configManager?.getCustomProperty('ngdpbase.favicon-path') as string) || themePaths.logoPath,
      locationCssPath: themePaths.locationCssPath,
      themeFontUrls: themePaths.fontUrls,
      addonStylesheets,
      capabilities: this.engine.getCapabilities?.() ?? {},
      allowRegistration,
      registrationRedirectPage,
      contactAvailable,
      contactFooterEnabled
    };

    // Load LeftMenu — prefer 'left-menu-content' page (instance/addon override) over 'LeftMenu'
    // Use getPage() (returns null) rather than getPageContent() (throws) so the ?? fallback works
    try {
      const leftMenuPage = await pageManager.getPage('left-menu-content')
        ?? await pageManager.getPage('LeftMenu');
      if (!leftMenuPage) {
        logger.warn('[LeftMenu] LeftMenu page not found — sidebar will be empty. Create a "LeftMenu" page to populate navigation.');
      }
      const leftMenuContent = leftMenuPage?.content ?? null;
      logger.info(
        `[TEMPLATE] Loading LeftMenu for user=${
          userContext?.username
        } roles=${userContext?.roles?.join('|')}`
      );

      // #632: build the WikiContext once and use it for both the ACL check and
      // the render. checkPagePermissionWithContext runs the full 3-tier evaluator
      // (private user-keyword → frontmatter audience → global policies) where
      // the deprecated checkPagePermission only ran tier 2.
      const leftMenuCtx = leftMenuContent !== null
        ? new WikiContext(this.engine as unknown as import('../types/WikiEngine.js').WikiEngine, {
          pageName: 'LeftMenu',
          content: leftMenuContent,
          userContext,
          request: req,
          pageMetadata: leftMenuPage?.metadata ?? undefined
        })
        : null;
      const canViewLeftMenu = leftMenuCtx !== null
        && await aclManager.checkPagePermissionWithContext(leftMenuCtx, 'view');
      logger.info(`[TEMPLATE] LeftMenu ACL decision: ${canViewLeftMenu}`);

      if (canViewLeftMenu && leftMenuCtx !== null && leftMenuContent !== null) {
        templateData.leftMenu = await renderingManager.textToHTML(
          leftMenuCtx,
          leftMenuContent
        );
      } else {
        templateData.leftMenu = '';
      }
    } catch (error: unknown) {
      logger.warn('Could not load or render LeftMenu content.', {
        error: error instanceof Error ? getErrorMessage(error) : String(error)
      });
      templateData.leftMenu = '';
    }

    // Load Footer — prefer 'footer-content' page (instance/addon override) over 'Footer'
    // Use getPage() (returns null) rather than getPageContent() (throws) so the ?? fallback works
    try {
      const footerPage = await pageManager.getPage('footer-content')
        ?? await pageManager.getPage('Footer');
      const footerContent = footerPage?.content ?? null;
      logger.info(
        `[TEMPLATE] Loading Footer for user=${
          userContext?.username
        } roles=${userContext?.roles?.join('|')}`
      );

      // #632: same pattern as LeftMenu — single WikiContext for ACL + render.
      const footerCtx = footerContent !== null
        ? new WikiContext(this.engine as unknown as import('../types/WikiEngine.js').WikiEngine, {
          pageName: 'Footer',
          content: footerContent,
          userContext,
          request: req,
          pageMetadata: footerPage?.metadata ?? undefined
        })
        : null;
      const canViewFooter = footerCtx !== null
        && await aclManager.checkPagePermissionWithContext(footerCtx, 'view');
      logger.info(`[TEMPLATE] Footer ACL decision: ${canViewFooter}`);

      if (canViewFooter && footerCtx !== null && footerContent !== null) {
        templateData.footer = await renderingManager.textToHTML(
          footerCtx,
          footerContent
        );
      } else {
        templateData.footer = '';
      }
    } catch (error: unknown) {
      logger.warn('Could not load or render Footer content.', {
        error: error instanceof Error ? getErrorMessage(error) : String(error)
      });
      templateData.footer = '';
    }

    // Expose the system-category catalog so templates (header.ejs) can render
    // the (System) / (Documentation) / (Addon) / (Profile) badges from config
    // instead of hardcoding category names. Each entry's optional `page-badge`
    // block carries { color, label, title } — categories without it (e.g.
    // `general`, `developer`) render no badge.
    templateData.systemCategoryDefs = (configManager?.getProperty('ngdpbase.system-category', {}) as Record<string, unknown>) ?? {};

    return templateData;
  }

  /**
   * Extract request context for access control
   * @param {Object} req - Express request object
   * @returns {Object} Context information
   */
  getRequestContext(req: Request): { ip: string; userAgent: string | undefined; referer: string | undefined; timestamp: string } {
    return {
      ip: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Session count (uses app.js sessionStore)
   */
  getActiveSesssionCount(req: Request, res: Response): void {
    try {
      const store = req.sessionStore;
      if (!store) {
        res.status(503).json({ error: 'Session store not available' });
        return;
      }

      if (typeof store.length === 'function') {
        store.length((err: unknown, count?: number) => {
          if (err) {
            res.status(500).json({ error: 'Failed to obtain session count' });
            return;
          }
          res.json({
            sessionCount: count || 0,
            distinctUsers: count || 0
          });
        });
        return;
      }

      if (typeof store.all === 'function') {
        store.all((err: unknown, sessions) => {
          if (err)
            return res
              .status(500)
              .json({ error: 'Failed to obtain session count' });

          // Convert to array if needed
          const sessionArray = Array.isArray(sessions)
            ? sessions
            : sessions
              ? Object.values(sessions)
              : [];

          const sessionCount = sessionArray.length;

          // Count distinct users (unique usernames, including anonymous)
          const usernames = new Set();
          for (const session of sessionArray) {
            if (session && session.username) {
              usernames.add(session.username);
            } else {
              // Session without username is also counted as 'anonymous'
              usernames.add('anonymous');
            }
          }
          const distinctUsers = usernames.size;

          return res.json({
            sessionCount: sessionCount,
            distinctUsers: distinctUsers
          });
        });
      }

      res
        .status(501)
        .json({ error: 'Session count not supported by store' });
      return;
    } catch {
      res.status(500).json({ error: 'Failed to obtain session count' });
      return;
    }
  }

  /**
   * Active session users — lists authenticated usernames and anonymous session count.
   * Used by SessionsPlugin property=users.
   */
  getActiveSessionUsers(req: Request, res: Response): void {
    try {
      const store = req.sessionStore;
      if (!store) {
        res.status(503).json({ error: 'Session store not available' });
        return;
      }

      if (typeof store.all === 'function') {
        store.all((err: unknown, sessions) => {
          if (err) {
            res.status(500).json({ error: 'Failed to obtain session users' });
            return;
          }
          const sessionsObj = sessions as Record<string, unknown> | unknown[] | null;
          const sessionArray = Array.isArray(sessionsObj)
            ? sessionsObj
            : sessionsObj ? Object.values(sessionsObj) : [];

          const userSet = new Set<string>();
          let anonymous = 0;
          for (const rawSession of sessionArray) {
            const session = rawSession as Record<string, unknown>;
            if (typeof session?.username === 'string' && session.username) {
              userSet.add(session.username);
            } else {
              anonymous++;
            }
          }
          res.json({
            users: Array.from(userSet).sort(),
            anonymous,
            total: sessionArray.length
          });
        });
        return;
      }

      // Fallback: store.length only — return counts without user list
      if (typeof store.length === 'function') {
        store.length((err: unknown, count?: number) => {
          if (err) {
            res.status(500).json({ error: 'Failed to obtain session users' });
            return;
          }
          res.json({ users: [], anonymous: count || 0, total: count || 0 });
        });
        return;
      }

      res.status(501).json({ error: 'Session user list not supported by store' });
    } catch {
      res.status(500).json({ error: 'Failed to obtain session users' });
    }
  }

  /**
   * GET /api/check-updates
   * Compare running version against latest GitHub release.
   * Returns { currentVersion, latestVersion, updateAvailable, releaseUrl }
   */
  async checkForUpdates(_req: Request, res: Response): Promise<void> {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      const currentVersion = configManager.getProperty('ngdpbase.version', '0.0.0');
      const githubRepo = configManager.getProperty('ngdpbase.github.repo', 'jwilleke/ngdpbase');

      const apiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
      let latestVersion: string | null = null;
      let releaseUrl: string | null = null;

      try {
        const resp = await fetch(apiUrl, {
          headers: { 'User-Agent': 'ngdpbase-update-check', 'Accept': 'application/vnd.github+json' }
        });
        if (resp.ok) {
          const data = await resp.json() as { tag_name?: string; html_url?: string };
          latestVersion = (data.tag_name ?? '').replace(/^v/, '');
          releaseUrl = data.html_url ?? null;
        }
      } catch {
        // GitHub unreachable — return current version only
      }

      const semverGt = (a: string, b: string): boolean => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
          if (diff !== 0) return diff > 0;
        }
        return false;
      };
      const updateAvailable = latestVersion ? semverGt(latestVersion, currentVersion) : false;

      res.json({ currentVersion, latestVersion, updateAvailable, releaseUrl });
    } catch (err: unknown) {
      res.status(500).json({ error: 'Failed to check for updates', details: getErrorMessage(err) });
    }
  }

  /**
   * Extract categories from System Categories page
   */
  async getCategories() {
    try {
      const pageManager = this.engine.getManager('PageManager');
      const categoriesPage = await pageManager.getPage('System Categories');

      if (!categoriesPage) {
        return ['General', 'Documentation', 'Project', 'Reference'];
      }

      // Extract categories from the content (lines that start with *)
      const categories = [];
      const lines = categoriesPage.content.split('\n');

      for (const line of lines) {
        const match = line.match(/^\* (.+?) \(/);
        if (match) {
          const category = match[1];
          // Exclude admin-only categories from regular user dropdown
          if (category !== 'System/Admin') {
            categories.push(category);
          }
        }
      }

      return categories.length > 0
        ? categories
        : ['General', 'Documentation', 'Project', 'Reference'];
    } catch (err: unknown) {
      logger.error('Error loading categories:', err);
      return ['General', 'Documentation', 'Project', 'Reference'];
    }
  }

  /**
   * Get all categories including admin-only categories
   */
  async getAllCategories() {
    try {
      const pageManager = this.engine.getManager('PageManager');
      const categoriesPage = await pageManager.getPage('System Categories');

      if (!categoriesPage) {
        return ['General', 'Documentation', 'System/Admin'];
      }

      // Extract all categories from the content (lines that start with *)
      const categories = [];
      const lines = categoriesPage.content.split('\n');

      for (const line of lines) {
        const match = line.match(/^\* (.+?) \(/);
        if (match) {
          categories.push(match[1]);
        }
      }

      // Ensure System/Admin category is always available
      if (!categories.includes('System/Admin')) {
        categories.push('System/Admin');
      }

      return categories.length > 0
        ? categories
        : ['General', 'Documentation', 'System/Admin'];
    } catch (err: unknown) {
      logger.error('Error loading all categories:', err);
      return ['General', 'Documentation', 'System/Admin'];
    }
  }

  /**
   * Build complete default metadata for a new or existing page.
   * Single source of truth — delegates to ValidationManager.generateValidMetadata().
   */
  buildNewPageMetadata(
    title: string,
    options: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const validationManager = this.engine.getManager('ValidationManager');

    // Filter undefined/null so generateValidMetadata defaults apply
    const cleanOptions: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        cleanOptions[key] = value;
      }
    }

    if (validationManager && typeof validationManager.generateValidMetadata === 'function') {
      return validationManager.generateValidMetadata(title, cleanOptions);
    }

    // Fallback when ValidationManager unavailable — get defaults from ConfigurationManager
    const configManager = this.engine.getManager('ConfigurationManager');
    let defaultCategory = 'general';
    if (configManager) {
      const systemCategoriesConfig = configManager.getProperty('ngdpbase.system-category', null) as Record<string, { label: string; default?: boolean; enabled?: boolean }> | null;
      if (systemCategoriesConfig) {
        // Find category with default: true
        for (const config of Object.values(systemCategoriesConfig)) {
          if (config.default === true && config.enabled !== false) {
            defaultCategory = config.label;
            break;
          }
        }
        // If no explicit default, use first enabled category
        if (defaultCategory === 'general') {
          for (const config of Object.values(systemCategoriesConfig)) {
            if (config.enabled !== false) {
              defaultCategory = config.label;
              break;
            }
          }
        }
      }
    }

    return {
      title: title.trim(),
      'system-category': cleanOptions['system-category'] || defaultCategory,
      'user-keywords': cleanOptions['user-keywords'] || [],
      uuid: cleanOptions.uuid || '',
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      lastModified: new Date().toISOString(),
      ...cleanOptions
    };
  }

  /**
   * Get category labels whose storageLocation is 'required' (i.e. tracked in required-pages/).
   * Used to determine whether to set the user-modified flag and whether a page is protected.
   */
  getRequiredPageCategories(): string[] {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      if (!configManager) return [];
      const systemCategories = configManager.getProperty('ngdpbase.system-category', {}) as
        Record<string, { storageLocation?: string; label?: string; enabled?: boolean }>;
      const labels: string[] = [];
      for (const [key, cfg] of Object.entries(systemCategories)) {
        if (cfg.enabled !== false && cfg.storageLocation === 'required') {
          labels.push((cfg.label || key).toLowerCase());
        }
      }
      return labels;
    } catch {
      return [];
    }
  }

  /**
   * Get system categories from configuration (admin-only)
   */
  getSystemCategories() {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      if (!configManager) {
        return [];
      }

      // Load system categories from configuration
      const systemCategories = configManager.getProperty('ngdpbase.system-category', {}) as
        Record<string, { enabled?: boolean; label?: string; storageLocation?: string }>;

      // Filter enabled categories — exclude 'github' storage locations since those
      // pages live in the docs/ folder only and cannot be created via the wiki form.
      const categories: string[] = [];
      for (const [key, config] of Object.entries(systemCategories)) {
        const cfg = config;
        if (cfg.enabled !== false && cfg.storageLocation !== 'github') {
          // Use label if available, otherwise use key (both lowercase)
          const label = (cfg.label || key).toLowerCase();
          categories.push(label);
        }
      }

      // Sort alphabetically for consistent ordering
      categories.sort();

      return categories;
    } catch (err: unknown) {
      logger.error('Error loading system categories:', err);
      return [];
    }
  }

  /**
   * #691: keyword catalogs for the asset-picker Pages filters. Sourced from
   * SearchManager (index-accurate — reflects what is actually filterable);
   * gracefully empty if the provider does not support them.
   */
  private async getPickerKeywordCatalogs(): Promise<{ userKeywords: string[]; systemKeywords: string[]; categories: string[] }> {
    const sm = this.engine.getManager('SearchManager') as {
      getAllUserKeywords?: () => Promise<string[]>;
      getAllSystemKeywords?: () => Promise<string[]>;
      getAllCategories?: () => Promise<string[]>;
    } | undefined;
    const [userKeywords, systemKeywords, categories] = await Promise.all([
      sm?.getAllUserKeywords ? sm.getAllUserKeywords() : Promise.resolve([]),
      sm?.getAllSystemKeywords ? sm.getAllSystemKeywords() : Promise.resolve([]),
      // #691: Pages-only category multi-select catalog (mirrors keywords).
      sm?.getAllCategories ? sm.getAllCategories() : Promise.resolve([])
    ]);
    return {
      userKeywords: Array.isArray(userKeywords) ? userKeywords : [],
      systemKeywords: Array.isArray(systemKeywords) ? systemKeywords : [],
      categories: Array.isArray(categories) ? categories : []
    };
  }

  /**
   * #745: available media years for the asset-picker Year filter. Sourced
   * from MediaManager.getYears() (the same list /media/ uses); gracefully
   * empty if MediaManager / the provider is unavailable. Years are public
   * (per MediaManager.getYears — no wikiContext filtering needed).
   */
  private async getPickerYears(): Promise<number[]> {
    const mm = this.engine.getManager('MediaManager') as { getYears?: () => Promise<number[]> } | undefined;
    if (!mm?.getYears) return [];
    try {
      const ys = await mm.getYears();
      return Array.isArray(ys) ? ys : [];
    } catch {
      return [];
    }
  }

  /**
   * Extract user keywords from User-Keywords page
   */
  async getUserKeywords() {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');

      // Try to get user keywords from configuration first
      if (configManager) {
        const userKeywordsConfig = configManager.getProperty('ngdpbase.user-keywords', null);

        if (userKeywordsConfig && typeof userKeywordsConfig === 'object') {
          const keywords: string[] = [];

          // Extract all enabled keyword labels from configuration
          for (const config of Object.values(userKeywordsConfig)) {
            const cfg = config as { enabled?: boolean; label?: string };
            if (cfg.enabled !== false && cfg.label) {
              keywords.push(cfg.label);
            }
          }

          if (keywords.length > 0) {
            logger.info(`Loaded ${keywords.length} user keywords from configuration`);
            return keywords.sort((a, b) => a.localeCompare(b));
          }
        }
      }

      // Fallback: read from User Keywords page (legacy method)
      logger.info('Falling back to reading user keywords from page');
      const pageManager = this.engine.getManager('PageManager');
      const keywordsPage = await pageManager.getPage('User Keywords');

      if (!keywordsPage) {
        return ['geology', 'medicine', 'test'];
      }

      // Extract keywords only from the bullet list under '## Current User Keywords'
      const keywords: string[] = [];
      const lines = keywordsPage.content.split('\n');
      let inKeywordsSection = false;
      for (const line of lines) {
        if (line.trim().startsWith('## ')) {
          // Enter keywords section
          inKeywordsSection = line
            .trim()
            .toLowerCase()
            .includes('current user keywords');
          continue;
        }
        if (inKeywordsSection) {
          // Stop if we hit another heading
          if (line.trim().startsWith('## ')) break;
          const bulletMatch = line.match(/^\s*-\s*(.+)$/);
          if (bulletMatch) {
            const keyword = bulletMatch[1].trim();
            if (keyword && !keywords.includes(keyword)) {
              keywords.push(keyword);
            }
          }
        }
      }
      return keywords.length > 0 ? keywords.sort((a, b) => a.localeCompare(b)) : ['geology', 'medicine', 'test'];
    } catch (err: unknown) {
      logger.error('Error loading user keywords:', err);
      return ['geology', 'medicine', 'test'];
    }
  }

  /**
   * Get user keywords with their descriptions for display in dropdowns
   * @returns Array of {id, label, description} objects sorted alphabetically
   */
  getUserKeywordsWithDescriptions(): Array<{ id: string; label: string; description: string }> {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');

      if (configManager) {
        const userKeywordsConfig = configManager.getProperty('ngdpbase.user-keywords', null);

        if (userKeywordsConfig && typeof userKeywordsConfig === 'object') {
          const keywords: Array<{ id: string; label: string; description: string }> = [];

          for (const [key, config] of Object.entries(userKeywordsConfig)) {
            const cfg = config as { enabled?: boolean; label?: string; description?: string };
            if (cfg.enabled !== false && cfg.label) {
              keywords.push({
                id: key,
                label: cfg.label,
                description: cfg.description || ''
              });
            }
          }

          if (keywords.length > 0) {
            const sorted = keywords.sort((a, b) => a.label.localeCompare(b.label));
            // Disambiguate entries that share the same label by appending (id)
            const labelCounts = new Map<string, number>();
            for (const kw of sorted) {
              labelCounts.set(kw.label, (labelCounts.get(kw.label) || 0) + 1);
            }
            return sorted.map(kw =>
              labelCounts.get(kw.label)! > 1 ? { ...kw, label: `${kw.label} (${kw.id})` } : kw
            );
          }
        }
      }

      // Fallback: return basic keywords without descriptions
      return [
        { id: 'geology', label: 'geology', description: '' },
        { id: 'medicine', label: 'medicine', description: '' },
        { id: 'test', label: 'test', description: '' }
      ];
    } catch (err: unknown) {
      logger.error('Error loading user keywords with descriptions:', err);
      return [
        { id: 'geology', label: 'geology', description: '' },
        { id: 'medicine', label: 'medicine', description: '' },
        { id: 'test', label: 'test', description: '' }
      ];
    }
  }

  /**
   * Generate Schema.org JSON-LD markup for a page
   * @param {Object} pageData - Page metadata and content
   * @param {Object} req - Express request object for URL generation
   * @returns {string} HTML script tag with JSON-LD
   */
  generatePageSchema(pageData: Record<string, unknown>, req: Request) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const pageUrl = `${baseUrl}${req.originalUrl}`;

      // Get current user for permission context
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      const schema = SchemaGenerator.generatePageSchema(pageData, {
        baseUrl: baseUrl,
        pageUrl: pageUrl,
        engine: this.engine, // Pass engine for DigitalDocumentPermission generation
        user: currentUser // Pass user context for permission generation
      });

      return SchemaGenerator.generateScriptTag(schema);
    } catch (err: unknown) {
      logger.error('Error generating page schema:', err);
      return '';
    }
  }

  /**
   * Generate site-wide Schema.org markup (Organization, SoftwareApplication)
   * @param {Object} req - Express request object
   * @returns {string} HTML script tags with JSON-LD
   */
  async generateSiteSchema(req: Request) {
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const configManager = this.engine.getManager('ConfigurationManager');

      // Check if SchemaManager is available, fallback to legacy method
      let siteData: { organizations?: Array<{ name?: string }>; [key: string]: unknown };
      try {
        const schemaManager = this.engine.getManager('SchemaManager');
        siteData = await schemaManager.getComprehensiveSiteData() as typeof siteData;
      } catch (err: unknown) {
        logger.warn(
          'SchemaManager not available, using legacy data sources:',
          getErrorMessage(err)
        );

        // Fallback to legacy data structure using ConfigurationManager
        const configData = {
          applicationName: configManager.getProperty('ngdpbase.application-name', 'ngdpbase'),
          version: configManager.getProperty('ngdpbase.version', '1.0.0'),
          server: {
            port: configManager.getProperty('ngdpbase.server.port', 3000),
            host: configManager.getProperty('ngdpbase.server.host', 'localhost')
          },
          features: {
            export: { html: configManager.getProperty('ngdpbase.features.export.html', true) },
            attachments: { enabled: configManager.getProperty('ngdpbase.attachment.enabled', true) },
            llm: { enabled: configManager.getProperty('ngdpbase.features.llm.enabled', false) }
          }
        };

        // Load user data (admins only for privacy)
        // #617 iteration 3b: admin status resolved via RoleManager via
        // userManager.hasRole, not the deprecated User.roles[] field.
        const userManager = this.engine.getManager('UserManager');
        const allUsersArray = await userManager.getUsers(); // This returns array without passwords
        const publicUsers: Record<string, unknown> = {};

        for (const userData of allUsersArray as Array<{ username?: string; isSystem?: boolean; [key: string]: unknown }>) {
          if (!userData.username || userData.isSystem) continue;
          if (await userManager.hasRole(userData.username, 'admin')) {
            publicUsers[userData.username] = userData;
          }
        }

        siteData = {
          config: configData,
          users: publicUsers
        };
      }

      const schemas = SchemaGenerator.generateComprehensiveSchema(siteData, {
        baseUrl: baseUrl,
        organizationName:
          siteData.organizations?.[0]?.name || 'ngdpbase Platform',
        repository: 'https://github.com/jwilleke/ngdpbase'
      });

      // Generate script tags for all schemas
      return schemas
        .map((schema) => SchemaGenerator.generateScriptTag(schema))
        .join('\n    ');
    } catch (err: unknown) {
      logger.error('Error generating site schema:', err);
      return '';
    }
  }

  /**
   * Render error page with consistent template data
   */
  async renderError(req: Request, res: Response, status: number, title: string, message: string) {
    try {
      // Pass the request object to get all common data
      const commonData = await this.getCommonTemplateData(req);

      return res.status(status).render('error', {
        ...commonData,
        title: title,
        message: message,
        error: { status: status },
        originalUrl: req.originalUrl || '/'
      });
    } catch (err: unknown) {
      logger.error('Error rendering error page:', err);
      return res.status(status).send(`${title}: ${message}`);
    }
  }

  /**
   * Check if a page is a protected page (admin-only edit)
   *
   * Protected pages include:
   * - Hardcoded required pages (backward compatibility)
   * - Pages with system-category: system or documentation
   *
   * These pages are considered core system pages that may be overwritten
   * by future updates to the application.
   *
   * @param {string} pageName - The page name to check
   * @returns {Promise<boolean>} True if page requires admin permission to edit
   */
  /** Returns true when the page lives in the private storage location. */
  private async _isPagePrivate(pageName: string): Promise<boolean> {
    try {
      const pageManager = this.engine.getManager('PageManager');
      if (!pageManager) return false;
      const meta = await pageManager.getPageMetadata(pageName);
      if (!meta?.uuid) return false;
      const provider = pageManager.getCurrentPageProvider?.() ?? (pageManager).provider;
      const pageIndex = provider?.pageIndex as { pages: Record<string, { location?: string }> } | null;
      const entry = pageIndex?.pages[meta.uuid];
      return entry?.location === 'private';
    } catch {
      return false;
    }
  }

  /**
   * Parses Template:PageTabs content and renders each tab section independently,
   * returning Bootstrap nav-tabs HTML. Each tab's content is rendered via a
   * separate textToHTML call so plugins execute with the correct page context.
   *
   * Template:PageTabs format:
   *   [{Tab name='Label'}]
   *   [{SomePlugin}]
   *   [{/Tab}]
   */
  private async buildPageTabsHtml(
    templateContent: string,
    wikiContext: WikiContext,
    renderingManager: ReturnType<typeof this.engine.getManager>,
    configManager: ReturnType<typeof this.engine.getManager>
  ): Promise<string> {
    const TAB_SECTION_RE = /\[\{Tab\s+name='([^']+)'\s*\}\]([\s\S]*?)\[\{\/Tab\}\]/g;
    const tabs: Array<{ name: string; content: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = TAB_SECTION_RE.exec(templateContent)) !== null) {
      tabs.push({ name: m[1].trim(), content: m[2].trim() });
    }
    if (tabs.length === 0) return '';

    const style = (configManager as { getProperty?(k: string, d: unknown): unknown } | null)
      ?.getProperty?.('ngdpbase.tab.style', 'tabs') as string ?? 'tabs';
    const persist = (configManager as { getProperty?(k: string, d: unknown): unknown } | null)
      ?.getProperty?.('ngdpbase.tab.persist', true) as boolean ?? true;

    const uid = (wikiContext.pageName || 'page')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'pg';
    const navClass = style === 'pills' ? 'nav-pills' : style === 'underline' ? 'nav-underline' : 'nav-tabs';

    const renderedTabs = await Promise.all(tabs.map(async (tab, i) => ({
      name: tab.name,
      slug: tab.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      html: await (renderingManager as { textToHTML(ctx: WikiContext, c: string): Promise<string> })
        .textToHTML(wikiContext, tab.content),
      active: i === 0
    })));

    const navItems = renderedTabs.map(t =>
      '<li class="nav-item" role="presentation">' +
      `<button class="nav-link${t.active ? ' active' : ''}" id="tab-${uid}-${t.slug}" ` +
      `data-bs-toggle="tab" data-bs-target="#pane-${uid}-${t.slug}" ` +
      `type="button" role="tab" aria-selected="${t.active}">${t.name}</button></li>`
    ).join('\n');

    const panes = renderedTabs.map(t =>
      `<div class="tab-pane fade${t.active ? ' show active' : ''}" id="pane-${uid}-${t.slug}" ` +
      `role="tabpanel" aria-labelledby="tab-${uid}-${t.slug}">\n${t.html}\n</div>`
    ).join('\n');

    const persistScript = persist ? `
<script>
(function(){
  var restore=sessionStorage.getItem('ngdp-restore-tab');
  if(restore){sessionStorage.removeItem('ngdp-restore-tab');var _r=restore;function _act(){var re=document.querySelector('[data-bs-target$="-'+_r+'"]');if(re)re.click();}document.readyState==='complete'?_act():window.addEventListener('load',_act);return;}
  var key='ngdp-tab-${uid}';
  var saved=localStorage.getItem(key);
  if(saved){var el=document.getElementById('tab-${uid}-'+saved);if(el)el.click();}
  document.querySelectorAll('#tabs-${uid} .nav-link').forEach(function(btn){
    btn.addEventListener('shown.bs.tab',function(){
      localStorage.setItem(key,btn.dataset.bsTarget.replace('#pane-${uid}-',''));
    });
  });
})();
</script>` : '';

    return `<div class="ngdp-tabs" id="tabs-${uid}">
<ul class="nav ${navClass} mb-3" role="tablist">
${navItems}
</ul>
<div class="tab-content">
${panes}
</div>
</div>${persistScript}`;
  }

  async isRequiredPage(pageName: string): Promise<boolean> {
    // Check if page has a protected system-category
    try {
      const pageManager = this.engine.getManager('PageManager');
      const metadata = await pageManager.getPageMetadata(pageName);
      if (metadata) {
        const systemCategory = (metadata['system-category'] || '').toLowerCase();
        const category = (metadata.category || '').toLowerCase();

        // Protected categories that require admin permission to edit (config-driven)
        const protectedCategories = this.getRequiredPageCategories();

        if (protectedCategories.includes(systemCategory) ||
            protectedCategories.includes(category)) {
          return true;
        }
      }
    } catch (err: unknown) {
      logger.error('Error checking page category:', err);
    }

    return false;
  }

  /**
   * Get and format left menu content from LeftMenu page
   */
  async getLeftMenu(userContext: UserContext | null = null) {
    try {
      const pageManager = this.engine.getManager('PageManager');
      const renderingManager = this.engine.getManager('RenderingManager');

      // Try to get LeftMenu page
      const leftMenuPage = await pageManager.getPage('LeftMenu');
      if (!leftMenuPage) {
        return null; // Return null to use fallback
      }

      // Render markdown to HTML with user context (this will automatically expand system variables)
      const requestInfo = null; // getLeftMenu doesn't have access to req currently
      const renderedContent = await renderingManager.renderMarkdown(
        leftMenuPage.content,
        'LeftMenu',
        userContext,
        requestInfo
      );

      // Format for Bootstrap navigation
      return this.formatLeftMenuContent(renderedContent);
    } catch (err: unknown) {
      logger.error('Error loading left menu:', err);
      return null; // Return null to use fallback
    }
  }

  /**
   * Format left menu content for Bootstrap navigation
   */
  formatLeftMenuContent(content: string): string {
    // Convert basic markdown list to Bootstrap nav structure
    content = content.replace(/<ul>/g, '<ul class="nav flex-column">');
    content = content.replace(/<li>/g, '<li class="nav-item">');
    content = content.replace(
      /<a href="([^"]*)">/g,
      '<a class="nav-link" href="$1">'
    );

    // Add icons to common menu items
    content = content.replace(
      /(<a class="nav-link"[^>]*>)Main page/g,
      '$1<i class="fas fa-home"></i> Main page'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)About/g,
      '$1<i class="fas fa-info-circle"></i> About'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)Find pages/g,
      '$1<i class="fas fa-search"></i> Find pages'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)Search/g,
      '$1<i class="fas fa-search"></i> Search'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)News/g,
      '$1<i class="fas fa-newspaper"></i> News'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)Recent Changes/g,
      '$1<i class="fas fa-history"></i> Recent Changes'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)Page Index/g,
      '$1<i class="fas fa-list"></i> Page Index'
    );
    content = content.replace(
      /(<a class="nav-link"[^>]*>)SystemInfo/g,
      '$1<i class="fas fa-server"></i> SystemInfo'
    );

    return content;
  }

  /**
   * Display a wiki page
   */
  async viewPage(req: Request, res: Response) {
    const _metricsStart = Date.now();
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      const frontPage = configManager.getProperty(
        'ngdpbase.front-page',
        'Welcome'
      );
      const pageName = (req.params.page || frontPage).trim();

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.VIEW,
        pageName: pageName,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const userContext = wikiContext.userContext;
      const pageManager = this.engine.getManager('PageManager');
      const renderingManager = this.engine.getManager('RenderingManager');
      const aclManager = this.engine.getManager('ACLManager');

      logger.info(
        `[VIEW] pageName=${pageName} user=${userContext?.username} roles=${(
          userContext?.roles || []
        ).join('|')}`
      );

      // Gracefully handle page not found
      const markdown = await pageManager
        .getPageContent(pageName)
        .catch((err: unknown) => {
          if (getErrorMessage(err).includes('not found')) return null;
          throw err;
        });

      if (markdown === null) {
        return await this.renderError(
          req,
          res,
          404,
          'Not Found',
          `The page '${pageName}' does not exist.`
        );
      }

      // Load page metadata before ACL checks so Tier 0 / Tier 1.5 have full context
      const metadata = await pageManager.getPageMetadata(pageName);
      // Coerce keyword fields to arrays — JSPWiki imports may store them as
      // space-separated scalars (e.g. `user-keywords: foo bar baz`).
      if (metadata) {
        if (!Array.isArray(metadata['user-keywords'])) {
          metadata['user-keywords'] = metadata['user-keywords']
            ? String(metadata['user-keywords']).split(/[\s,]+/).filter(Boolean)
            : [];
        }
        if (!Array.isArray(metadata['system-keywords'])) {
          const sk = metadata['system-keywords'];
          metadata['system-keywords'] = (typeof sk === 'string' && sk) ? [sk] : [];
        }
      }
      (wikiContext as { pageMetadata: unknown }).pageMetadata = metadata ?? null;

      // Check private page access before rendering
      const canAccessPrivate = await this.checkPrivatePageAccess(wikiContext, pageName);
      if (!canAccessPrivate) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to view this page.');
      }

      // Update WikiContext with page content for ACL checking
      (wikiContext as { content: string | null }).content = markdown;

      const canView = await aclManager.checkPagePermissionWithContext(wikiContext, 'view');
      logger.info(`[VIEW] ACL decision for ${pageName}: ${canView}`);
      if (!canView) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to view this page.'
        );
      }

      // Check if user can edit this page
      const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');

      // Rendered-pages cache — keyed by UUID + sorted role set (#588)
      const cacheManager = this.engine.getManager('CacheManager');
      const renderCacheEnabled = configManager?.getProperty('ngdpbase.cache.rendered-pages.enabled', true) as boolean;
      const roleKey = (userContext?.roles ?? []).slice().sort().join(',');
      const pageUUID = (metadata as { uuid?: string } | null)?.uuid ?? pageName;
      const renderCacheKey = `rendered-pages:${pageUUID}:${roleKey}`;
      type RenderCacheEntry = { html: string; tabSectionHtml: string };

      let html: string;
      let tabSectionHtml = '';

      const cachedRender = renderCacheEnabled && cacheManager?.isInitialized?.()
        ? (await cacheManager.get(renderCacheKey) as RenderCacheEntry | undefined) ?? null
        : null;

      if (cachedRender) {
        html = cachedRender.html;
        tabSectionHtml = cachedRender.tabSectionHtml;
        logger.debug(`[VIEW] render cache HIT: ${renderCacheKey}`);
      } else {
        // Render page content
        html = await renderingManager.textToHTML(wikiContext, markdown);

        // Auto-inject Template:PageTabs tab section for all pages (#551)
        // Excluded pages are configured in ngdpbase.page.notabs.
        // Rendered separately from page content so each tab's plugins execute cleanly.
        const tabsEnabled = configManager?.getProperty('ngdpbase.tab.pagetabs', true) as boolean;
        if (tabsEnabled) {
          const noTabsList = (configManager?.getProperty('ngdpbase.page.notabs', []) as string[]);
          if (!noTabsList.includes(pageName)) {
            const tabTemplateName = (configManager?.getProperty('ngdpbase.tab.pagetabs.template', 'Template:PageTabs'));
            const tabTemplateContent = await pageManager.getPageContent(tabTemplateName).catch(() => null);
            if (tabTemplateContent) {
              tabSectionHtml = await this.buildPageTabsHtml(tabTemplateContent, wikiContext, renderingManager, configManager);
            }
          }
        }

        // Store rendered output in cache (invalidated on save/delete/rename)
        if (renderCacheEnabled && cacheManager?.isInitialized?.()) {
          const ttl = configManager?.getProperty('ngdpbase.cache.rendered-pages.ttl', 0) as number;
          await cacheManager.set(renderCacheKey, { html, tabSectionHtml }, ttl ? { ttl } : {}).catch(() => { /* non-fatal */ });
          logger.debug(`[VIEW] render cache SET: ${renderCacheKey}`);
        }
      }

      // Get version information if versioning is enabled
      let versionInfo = null;
      const provider = pageManager.provider;
      if (provider && typeof provider.getVersionHistory === 'function') {
        try {
          const versions = await provider.getVersionHistory(pageName);
          if (versions && versions.length > 0) {
            const latestVersion = versions[0]; // Versions are returned newest first
            versionInfo = {
              currentVersion: latestVersion.version,
              totalVersions: versions.length,
              lastModified: latestVersion.timestamp,
              lastAuthor: latestVersion.author
            };
          }
        } catch (error: unknown) {
          // Silently fail if versioning not available for this page
          logger.debug(`[VIEW] Could not get version info for ${pageName}: ${getErrorMessage(error)}`);
        }
      }

      // Pass the request object to get all common data
      const templateData = await this.getCommonTemplateData(req);

      // Suppress footer for pages in ngdpbase.page.nofooter list
      const noFooterList = (configManager?.getProperty('ngdpbase.page.nofooter', []) as string[]);
      if (noFooterList.includes(pageName)) templateData.footer = '';

      // Check if reader view is requested
      const viewMode = req.query.view;
      const template = viewMode === 'reader' ? 'reader' : 'view';

      this.engine.getManager('MetricsManager')?.recordPageView?.(Date.now() - _metricsStart);
      const _unknownTagsParam = Array.isArray(req.query['unknown-tags'])
        ? (req.query['unknown-tags'] as unknown[]).filter(v => typeof v === 'string').join(',')
        : typeof req.query['unknown-tags'] === 'string'
          ? req.query['unknown-tags']
          : '';
      const warningMessage = req.query.warning === 'github-page'
        ? 'This page is managed in GitHub — edits here will not be reflected in the source repository.'
        : _unknownTagsParam
          ? `This page contains unrecognised fenced code block language tag(s): ${_unknownTagsParam.replace(/,/g, ', ')}. Add them to <code>ngdpbase.markup.fenced-code-tags</code> in configuration if they are valid, or change the tag in the page content.`
          : null;
      const sectionEditingEnabled =
        canEdit && !!userContext?.preferences?.['display.sectionEditing'];

      // Phase 3 (#424): pre-resolve keyword URIs for microdata itemid attributes.
      // CatalogManager.resolveUri() returns null until a provider populates URIs.
      const keywordUris: Record<string, string> = {};
      const catalogManager = this.engine.getManager('CatalogManager');
      if (catalogManager && typeof catalogManager.resolveUri === 'function' && metadata) {
        const allKws = [
          ...((metadata['user-keywords']) ?? []),
          ...((metadata['system-keywords'] as string[] | undefined) ?? []),
          ...(metadata['system-category'] ? [metadata['system-category']] : [])
        ];
        for (const kw of allKws) {
          const uri = await catalogManager.resolveUri(kw);
          if (uri) keywordUris[kw] = uri;
        }
      }

      // #507: fetch auto-tagged systemKeywords from ES index (may include terms
      // not in page frontmatter — auto-tagged at index time by TaggingService).
      let autoTaggedKeywords: string[] = [];
      const searchManager = this.engine.getManager('SearchManager');
      if (searchManager && typeof searchManager.getPageSystemKeywords === 'function') {
        autoTaggedKeywords = await searchManager.getPageSystemKeywords(pageName);
      }

      // #773 — build the page's JSON-LD via the unified CatalogSource path.
      // PageManager (registered as CatalogSource per #772, Slice 4 of #755)
      // produces the internal Article record from frontmatter; the render
      // adapter `articleToPageJsonLd` converts to the `<script
      // type="application/ld+json">` shape. Single source of truth for the
      // page→Article mapping; replaces the direct buildPageJsonLd call from
      // Slice 6a (#765). `stringifyJsonLdForScript` escapes < / > / & as
      // \uXXXX so attacker-controlled metadata can't close the <script> tag.
      const baseUrl = configManager?.getProperty('ngdpbase.base-url', '');
      // pageManager is in scope from line ~1633; reuse it. Cast to the
      // CatalogSource-shaped subset we need — IPageManager doesn't declare
      // toCreativeWork yet (it's a Slice 4 / #772 addition).
      const pageManagerCatalog = pageManager as unknown as {
        toCreativeWork?: (
          name: string,
          meta: typeof metadata,
          opts?: { baseUrl?: string; autoTaggedKeywords?: string[] }
        ) => Article;
      };
      const article = typeof pageManagerCatalog.toCreativeWork === 'function'
        ? pageManagerCatalog.toCreativeWork(pageName, metadata, {
          baseUrl: baseUrl || undefined,
          autoTaggedKeywords
        })
        : null;
      // Fallback path: if PageManager is unavailable (or hasn't loaded the
      // CatalogSource surface for any reason), still emit a JSON-LD block by
      // calling the wrapped mapper directly. Same code path either way after
      // #773's buildPageJsonLd compose refactor.
      const pageJsonLd = article
        ? articleToPageJsonLd(article)
        : articleToPageJsonLd({ '@id': '/view/' + pageName, '@type': 'Article', identifier: pageName, name: pageName, url: '/view/' + pageName });
      const pageJsonLdScript = stringifyJsonLdForScript(pageJsonLd);

      // Slice 6b of #760 (#766) — content-negotiation. When the client sends
      // `Accept: application/ld+json`, return the JSON-LD body alone (no HTML
      // envelope) with the correct Content-Type. ACL gates already fired
      // above; the JSON-LD response respects the same authorization.
      if (wantsJsonLd(req)) {
        this.engine.getManager('MetricsManager')?.recordPageView?.(Date.now() - _metricsStart);
        res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
        return res.send(JSON.stringify(pageJsonLd));
      }

      res.render(template, {
        ...templateData,
        pageName,
        title: pageName, // For reader view template
        content: html,
        tabSection: tabSectionHtml,
        canEdit,
        sectionEditingEnabled,
        metadata,
        keywordUris,
        autoTaggedKeywords,
        pageJsonLd,
        pageJsonLdScript,
        pageIsPrivate: !canAccessPrivate ? false : await this._isPagePrivate(pageName),
        versionInfo,
        lastModified: metadata?.lastModified,
        referringPages: [], // TODO: Implement backlink detection
        warningMessage
      });
    } catch (error: unknown) {
      this.engine.getManager('MetricsManager')?.recordPageView?.(Date.now() - _metricsStart);
      logger.error('[VIEW] Error viewing page', {
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      await this.renderError(
        req,
        res,
        500,
        'Error',
        'Could not render the page.'
      );
    }
  }

  /**
   * Display create new page form with template selection
   */
  async createPage(req: Request, res: Response) {
    try {
      const pageName = (req.query.name as string) || '';

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;
      const userManager = this.engine.getManager('UserManager');

      logger.debug(
        '[CREATE-DEBUG] currentUser:',
        currentUser ? currentUser.username : 'null',
        'isAuth:',
        currentUser?.isAuthenticated
      );
      logger.debug(
        '[CREATE-DEBUG] checking page:create permission for user:',
        currentUser?.username
      );

      // Check if user is authenticated
      if (!currentUser || !currentUser.isAuthenticated) {
        logger.debug(
          '[CREATE-DEBUG] User not authenticated, redirecting to login'
        );
        return res.redirect('/login?redirect=' + encodeURIComponent('/create'));
      }

      const hasPermission = await userManager.hasPermission(
        currentUser.username,
        'page-create'
      );
      logger.debug('[CREATE-DEBUG] hasPermission result:', hasPermission);

      // Check if user has permission to create pages
      if (!hasPermission) {
        logger.debug(
          '[CREATE-DEBUG] Permission denied for user:',
          currentUser.username
        );
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to create pages. Please contact an administrator.'
        );
      }

      const templateManager = this.engine.getManager('TemplateManager');

      // Get common template data (includes theme paths, user, pages, etc.)
      const commonData = await this.getCommonTemplateData(req);

      // Get available templates
      const templates = templateManager.getTemplates();

      // Get categories and keywords for the form (defensive array handling)
      const rawCategories = this.getSystemCategories();
      const systemCategories = Array.isArray(rawCategories) ? rawCategories : [];
      const rawKeywords = this.getUserKeywordsWithDescriptions();
      const userKeywords = Array.isArray(rawKeywords) ? rawKeywords : [];

      const configManager = this.engine.getManager('ConfigurationManager');
      const maxUserKeywords = configManager
        ? configManager.getProperty('ngdpbase.maximum.user-keywords', 5)
        : 5;

      // Get default system category from ValidationManager (falls back to config)
      const validationManager = this.engine.getManager('ValidationManager');
      const defaultCategory = validationManager?.getDefaultSystemCategory?.() || 'general';

      // Build availableRoles for the audience picker (mirror edit handler at line 2316)
      const rolesConfig = configManager
        ? (configManager.getProperty('ngdpbase.roles.definitions', {}) as Record<string, { name: string; displayname: string; issystem?: boolean }>)
        : {};
      const availableRoles = Object.values(rolesConfig).filter(r => r.name && r.displayname);

      res.render('create', {
        ...commonData,
        title: 'Create New Page',
        pageName: pageName,
        templates: templates,
        systemCategories: systemCategories,
        userKeywords: userKeywords,
        maxUserKeywords: maxUserKeywords,
        defaultCategory: defaultCategory,
        availableRoles: availableRoles,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading create page:', err);
      res.status(500).send('Error loading create page form');
    }
  }

  /**
   * Handle /edit route without page parameter
   */
  async editPageIndex(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Check if user is authenticated
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect('/login?redirect=' + encodeURIComponent('/edit'));
      }

      // Check if user has permission to edit pages
      if (
        !(await wikiContext.hasPermission('page-edit'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to edit pages. Please contact an administrator.'
        );
      }

      // Get all pages for selection
      const pageManager = this.engine.getManager('PageManager');
      const allPages = await pageManager.getAllPages();

      // Sort pages alphabetically
      const sortedPages = allPages.sort((a: string, b: string) => a.localeCompare(b));

      // Get common template data with user context
      const commonData = await this.getCommonTemplateData(req);

      res.render('edit-index', {
        ...commonData,
        title: 'Select Page to Edit',
        pages: sortedPages
      });
    } catch (err: unknown) {
      logger.error('Error loading edit page index:', err);
      res.status(500).send('Error loading edit page selector');
    }
  }

  /**
   * Create a new page from template
   */
  async createPageFromTemplate(req: Request, res: Response) {
    try {
      const { pageName, templateName, categories } = req.body;
      const userKeywords = req.body['user-keywords'] || req.body.userKeywords;
      const systemCategory = req.body['system-category'] || 'general';

      if (!pageName || !templateName) {
        return res.status(400).send('Page name and template are required');
      }

      // Reject page names with characters that break URL routing or YAML parsing
      const invalidChars = /[/\\#?%"<>|*]/;
      if (invalidChars.test(pageName)) {
        return res.status(400).send(
          'Page name contains invalid characters. The following are not allowed: / \\ # ? % " < > | *'
        );
      }

      // Validate system-category against allowed list (case-insensitive)
      const validCategories = this.getSystemCategories();
      const normalizedSubmitted = systemCategory.trim().toLowerCase();
      const matchedCategory = validCategories.find(
        (cat: string) => cat.toLowerCase() === normalizedSubmitted
      );
      if (!matchedCategory) {
        const validCategoryList = validCategories.join(', ');
        return res.status(400).send(
          `Invalid system-category: "${systemCategory}". Valid categories are: ${validCategoryList}`
        );
      }

      // Ensure categories is an array and always include 'default'
      const categoriesArray = Array.isArray(categories)
        ? categories
        : categories
          ? [categories]
          : [];
      if (!categoriesArray.includes('default')) {
        categoriesArray.unshift('default');
      }
      if (categoriesArray.length > 3) {
        return res.status(400).send('Maximum 3 categories allowed');
      }

      const templateManager = this.engine.getManager('TemplateManager');

      // Apply template with variables
      const templateVars = {
        pageName: pageName,
        category: categoriesArray[0] || '', // Use first category for backward compatibility
        categories: categoriesArray.join(', '),
        userKeywords: Array.isArray(userKeywords)
          ? userKeywords.join(', ')
          : userKeywords || '',
        date: new Date().toISOString().split('T')[0]
      };

      const content = templateManager.applyTemplate(templateName, templateVars);

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName: pageName,
        content: content,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;
      const pageManager = this.engine.getManager('PageManager');

      // Check if user is authenticated
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect('/login?redirect=' + encodeURIComponent('/create'));
      }

      // Check if user has permission to create pages
      if (
        !(await wikiContext.hasPermission('page-create'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to create pages. Please contact an administrator.'
        );
      }

      // Check if page already exists
      const existingPage = await pageManager.getPage(pageName);
      if (existingPage) {
        logger.debug(
          `DEBUG: createPageFromTemplate - Page ${pageName} already exists, rendering error template`
        );
        try {
          const commonData = await this.getCommonTemplateData(req);

          return res.status(409).render('error', {
            ...commonData,
            currentUser,
            error: { status: 409 },
            title: 'Page Already Exists',
            message: `A page named "${pageName}" already exists.`,
            details:
              'You can view the existing page or edit it if you have permission.',
            actions: [
              {
                label: 'View Page',
                url: `/view/${encodeURIComponent(pageName)}`,
                class: 'btn-primary'
              },
              {
                label: 'Edit Page',
                url: `/edit/${encodeURIComponent(pageName)}`,
                class: 'btn-secondary'
              },
              {
                label: 'Back to Create',
                url: '/create',
                class: 'btn-outline-secondary'
              }
            ]
          });
        } catch (templateError) {
          logger.debug(
            'DEBUG: Error rendering template, falling back to simple message',
            templateError
          );
          return res.status(409).send('Page already exists');
        }
      }

      // #697: thread the Private + Author-lock checkboxes from /create form
      // through to the new page's metadata. Every authenticated creator may set
      // these on their own new page (they are the page's future author/creator);
      // the /save flow's stricter "admin or author" gate applies on subsequent
      // edits.
      const authorLockOnCreate = req.body['author-lock'] === 'true';
      const privateOnCreate = req.body['private'] === 'true';

      // Audience (view access) — mirror the /save handler's parsing at line 2630.
      const submittedAudience = req.body['audience'];
      const audienceArray: string[] = (Array.isArray(submittedAudience)
        ? submittedAudience.filter(Boolean)
        : submittedAudience
          ? [String(submittedAudience)]
          : []
      ).map(String);

      // Save the new page using WikiContext
      const metadata = this.buildNewPageMetadata(pageName, {
        'system-category': matchedCategory,
        categories: categoriesArray,
        'user-keywords': Array.isArray(userKeywords) ? userKeywords : userKeywords ? [userKeywords] : [],
        author: currentUser?.username || 'anonymous',
        ...(authorLockOnCreate ? { 'author-lock': true } : {}),
        ...(privateOnCreate ? { private: true } : {}),
        ...(audienceArray.length ? { audience: audienceArray } : {})
      });

      await pageManager.savePageWithContext(wikiContext, metadata);

      // Sync attachment mentions for any references in the new page content. #405 Phase 4
      const _am1 = this.engine.getManager('AttachmentManager');
      if (_am1?.syncPageMentions) _am1.syncPageMentions(pageName, content).catch(() => {});
      // Sync pageAssets reverse index. #438
      const _asm1 = this.engine.getManager('AssetManager');
      if (_asm1?.syncPageAssets) _asm1.syncPageAssets(pageName, content).catch(() => {});

      // Use incremental updates instead of full rebuilds for performance (#245)
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');

      // Add to page cache and update link graph incrementally
      renderingManager.addPageToCache(pageName);
      renderingManager.updatePageInLinkGraph(pageName, content);

      // Update search index for just this page
      await searchManager.updatePageInIndex(pageName, {
        name: pageName,
        content: content,
        metadata: metadata
      });

      // Clear rendered cache for this page and pages that might link to it
      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        const referringPages = renderingManager.getReferringPages(pageName);
        const _uuid1 = pageManager?.getPageUUID?.(pageName) ?? pageName;
        await cacheManager.clear(undefined, `rendered-pages:${_uuid1}:*`);
        for (const refPage of referringPages) {
          const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
          await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
        }
        logger.debug(`🗑️  Cleared rendered cache for ${pageName} and ${referringPages.length} referring pages`);
      }

      // Redirect to edit the new page
      res.redirect(`/edit/${pageName}`);
    } catch (err: unknown) {
      logger.error('Error creating page from template:', err);
      res.status(500).send('Error creating page');
    }
  }
  async editPage(req: Request, res: Response) {
    try {
      const pageName = req.params.page;

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName: pageName,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;
      const pageManager = this.engine.getManager('PageManager');
      const userManager = this.engine.getManager('UserManager');
      const aclManager = this.engine.getManager('ACLManager');

      // Check if user is authenticated - redirect to login if not
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect(
          '/login?redirect=' + encodeURIComponent(req.originalUrl)
        );
      }

      // Get page data to check ACL (if page exists)
      let pageData = await pageManager.getPage(pageName);

      // Check private page access for existing pages
      if (pageData) {
        const canAccessPrivate = await this.checkPrivatePageAccess(wikiContext, pageName);
        if (!canAccessPrivate) {
          return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to edit this page.');
        }
      }

      // Check if this is a required page that needs admin access
      if (await this.isRequiredPage(pageName)) {
        if (
          !currentUser ||
          !(await userManager.hasPermission(
            currentUser.username,
            'admin-system'
          ))
        ) {
          return await this.renderError(
            req,
            res,
            403,
            'Access Denied',
            'Only administrators can edit this page'
          );
        }
      } else {
        // For existing pages, check ACL edit permission
        if (pageData) {
          // Load metadata before ACL check so Tier 0 / Tier 1.5 have full context
          (wikiContext as { pageMetadata: unknown }).pageMetadata = pageData.metadata ?? null;
          // Update WikiContext with page content for ACL checking
          (wikiContext as { content: string | null }).content = pageData.content;

          const hasEditPermission = await aclManager.checkPagePermissionWithContext(
            wikiContext,
            'edit'
          );

          if (!hasEditPermission) {
            return await this.renderError(
              req,
              res,
              403,
              'Access Denied',
              'You do not have permission to edit this page'
            );
          }

          // Author-lock check: if set, only the page author and admins may edit.
          // Private pages bypass this — `private: true` is the higher-priority
          // rule (admin + creator only) and is already enforced upstream by
          // ACLManager Tier 0 / checkPrivatePageAccess. Formalizing the
          // supersedes relationship in code matches the documented model
          // (see required-pages "Page Private" precedence table).
          if (pageData.metadata?.['author-lock'] && pageData.metadata?.private !== true) {
            const isAdmin = wikiContext.hasRole('admin');
            const isAuthor = pageData.metadata?.author === currentUser.username;
            if (!isAdmin && !isAuthor) {
              return await this.renderError(
                req,
                res,
                403,
                'Access Denied',
                'This page is author-locked. Only the page author and administrators can edit it.'
              );
            }
          }
        } else {
          // For new pages, check general page creation permission
          if (
            !currentUser ||
            !(await userManager.hasPermission(
              currentUser.username,
              'page-create'
            ))
          ) {
            return await this.renderError(
              req,
              res,
              403,
              'Access Denied',
              'You do not have permission to create pages'
            );
          }
        }
      }

      // Get common template data (includes theme paths, user, pages, etc.)
      const commonData = await this.getCommonTemplateData(req);

      // Get categories and keywords (defensive array handling)
      const rawCategories = this.getSystemCategories();
      const systemCategories = Array.isArray(rawCategories) ? rawCategories : [];
      const rawKeywords = this.getUserKeywordsWithDescriptions();
      const userKeywords = Array.isArray(rawKeywords) ? rawKeywords : [];

      // If page doesn't exist, create empty page data for new page
      if (!pageData) {
        pageData = {
          title: pageName,
          uuid: '',
          filePath: '',
          content: '',
          metadata: this.buildNewPageMetadata(pageName, {
            author: currentUser.username || 'Anonymous'
          }) as PageFrontmatter
        };
      }

      // Ensure content is a string for ACL processing
      if (!pageData.content || typeof pageData.content !== 'string') {
        pageData.content = '';
      }

      // Remove ACL markup from content for editing
      const cleanContent = aclManager.removeACLMarkup(pageData.content);
      pageData.content = cleanContent;

      // Section editing: if ?section=N is provided, edit only that section
      const sectionParam = req.query.section;
      let sectionIndex: number | null = null;
      if (sectionParam !== undefined && sectionParam !== '') {
        const idx = parseInt(typeof sectionParam === 'string' ? sectionParam : '', 10);
        if (!isNaN(idx) && idx >= 0) {
          const sectionContent = extractSection(pageData.content, idx);
          if (sectionContent !== null) {
            pageData.content = sectionContent;
            sectionIndex = idx;
          }
        }
      }

      // Extract current categories and keywords from metadata - handle both old and new format
      const selectedCategories =
        pageData.metadata?.categories ||
        (pageData.metadata?.category ? [pageData.metadata.category] : []);
      const selectedUserKeywords = pageData.metadata?.['user-keywords'] || [];

      const configManager = this.engine.getManager('ConfigurationManager');
      const maxUserKeywords = configManager
        ? configManager.getProperty('ngdpbase.maximum.user-keywords', 5)
        : 5;

      // Build availableRoles for the audience picker
      const rolesConfig = configManager
        ? (configManager.getProperty('ngdpbase.roles.definitions', {}) as Record<string, { name: string; displayname: string; issystem?: boolean }>)
        : {};
      const availableRoles = Object.values(rolesConfig).filter(r => r.name && r.displayname);

      // Default system category — used when the page has no system-category in its metadata
      const validationManager = this.engine.getManager('ValidationManager');
      const defaultCategory = validationManager?.getDefaultSystemCategory?.() || 'general';

      const attachmentManager = this.engine.getManager('AttachmentManager');
      let pageAttachments: unknown[] = [];
      try {
        if (attachmentManager) {
          pageAttachments = await attachmentManager.getAttachmentsForPage(pageName);
        }
      } catch (err) {
        logger.warn('Could not load attachments for edit page:', err);
      }

      const pageIsRequired = await this.isRequiredPage(pageName);

      res.render('edit', {
        ...commonData,
        title: sectionIndex !== null ? `Edit section of ${pageName}` : `Edit ${pageName}`,
        pageName: pageName,
        content: pageData.content,
        metadata: pageData.metadata,
        pageIsPrivate: await this._isPagePrivate(pageName),
        systemCategories: systemCategories,
        selectedCategories: selectedCategories,
        userKeywords: userKeywords,
        selectedUserKeywords: selectedUserKeywords,
        maxUserKeywords: maxUserKeywords,
        availableRoles: availableRoles,
        pageData: pageData,
        defaultCategory: defaultCategory,
        pageAttachments: pageAttachments,
        csrfToken: req.session.csrfToken,
        isRequiredPage: pageIsRequired,
        sectionIndex: sectionIndex
      });
    } catch (err: unknown) {
      logger.error('Error loading edit page:', err);
      res.status(500).send('Error loading edit page');
    }
  }

  /**
   * Create a new wiki page via POST /wiki/:page
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  async createWikiPage(req: Request, res: Response) {
    try {
      const pageName = decodeURIComponent(req.params.page);
      const { content, templateName, categories, userKeywords } = req.body;

      let finalContent = content;

      // If a template was selected, apply it
      if (templateName && templateName !== 'none') {
        const templateManager = this.engine.getManager('TemplateManager');

        // Ensure categories is an array
        const categoriesArray = Array.isArray(categories)
          ? categories
          : categories
            ? [categories]
            : ['General'];

        // Apply template with variables
        const templateVars = {
          pageName: pageName,
          category: categoriesArray[0] || 'General',
          categories: categoriesArray.join(', '),
          userKeywords: Array.isArray(userKeywords)
            ? userKeywords.join(', ')
            : userKeywords || '',
          date: new Date().toISOString().split('T')[0]
        };

        finalContent = templateManager.applyTemplate(
          templateName,
          templateVars
        );
      } else if (!content) {
        return res.status(400).send('Content or template is required');
      }

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName: pageName,
        content: finalContent,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;
      const pageManager = this.engine.getManager('PageManager');

      // Check if user is authenticated
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect(
          '/login?redirect=' + encodeURIComponent(req.originalUrl)
        );
      }

      // Check if user has permission to create pages
      if (
        !(await wikiContext.hasPermission('page-create'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to create pages.'
        );
      }

      // Check if page already exists
      const existingPage = await pageManager.getPage(pageName);
      if (existingPage) {
        const commonData = await this.getCommonTemplateData(req);

        return res.status(409).render('error', {
          ...commonData,
          currentUser,
          error: { status: 409 },
          title: 'Page Already Exists',
          message: `A page named "${pageName}" already exists.`,
          details:
            'You can view the existing page or edit it if you have permission.',
          actions: [
            {
              label: 'View Page',
              url: `/view/${encodeURIComponent(pageName)}`,
              class: 'btn-primary'
            },
            {
              label: 'Edit Page',
              url: `/edit/${encodeURIComponent(pageName)}`,
              class: 'btn-secondary'
            },
            {
              label: 'Back to Create',
              url: '/create',
              class: 'btn-outline-secondary'
            }
          ]
        });
      }

      // Create metadata for new page
      const metadata = this.buildNewPageMetadata(pageName, {
        'system-category': categories || undefined,
        'user-keywords': Array.isArray(userKeywords) ? userKeywords : userKeywords ? [userKeywords] : [],
        author: currentUser?.username || 'anonymous'
      });

      // Save the new page using WikiContext
      await pageManager.savePageWithContext(wikiContext, metadata);

      // Sync attachment mentions for any references in the new page content. #405 Phase 4
      const _am2 = this.engine.getManager('AttachmentManager');
      if (_am2?.syncPageMentions) _am2.syncPageMentions(pageName, finalContent).catch(() => {});
      // Sync pageAssets reverse index. #438
      const _asm2 = this.engine.getManager('AssetManager');
      if (_asm2?.syncPageAssets) _asm2.syncPageAssets(pageName, finalContent).catch(() => {});

      // Use incremental updates instead of full rebuilds for performance (#245)
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');

      // Add to page cache and update link graph incrementally
      renderingManager.addPageToCache(pageName);
      renderingManager.updatePageInLinkGraph(pageName, finalContent);

      // Update search index for just this page
      await searchManager.updatePageInIndex(pageName, {
        name: pageName,
        content: finalContent,
        metadata: metadata
      });

      // Clear rendered cache for this page and pages that might link to it
      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        const referringPages = renderingManager.getReferringPages(pageName);
        const _uuid2 = pageManager?.getPageUUID?.(pageName) ?? pageName;
        await cacheManager.clear(undefined, `rendered-pages:${_uuid2}:*`);
        for (const refPage of referringPages) {
          const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
          await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
        }
        logger.debug(`🗑️  Cleared rendered cache for ${pageName} and ${referringPages.length} referring pages`);
      }

      // Redirect to edit the new page (so user can see template result)
      res.redirect(`/edit/${encodeURIComponent(pageName)}`);
    } catch (error: unknown) {
      logger.error('Error creating wiki page:', error);
      return await this.renderError(
        req,
        res,
        500,
        'Internal Server Error',
        'Failed to create page'
      );
    }
  }

  /**
   * Save a page
   */
  async savePage(req: Request, res: Response) {
    const _metricsStart = Date.now();
    try {
      const pageName = req.params.page;
      logger.debug(`💾 Save request received for page: ${pageName}`);
      logger.debug(`💾 Request body keys: ${Object.keys(req.body).join(', ')}`);
      const { content: _rawContent, title, categories: _categories, userKeywords: _userKeywords } = req.body;

      // Reject titles containing characters that break URL routing or YAML parsing
      if (title && typeof title === 'string') {
        const invalidChars = /[/\\#?%"<>|*]/;
        if (invalidChars.test(title)) {
          return res.status(400).send(
            'Page title contains invalid characters. The following are not allowed: / \\ # ? % " < > | *'
          );
        }
      }

      // Section editing: if a section index was submitted, splice edited section
      // back into the full page content before saving
      let content = _rawContent;
      const sectionBodyParam = req.body.section;
      if (sectionBodyParam !== undefined && sectionBodyParam !== '') {
        const sectionIdx = parseInt(String(sectionBodyParam), 10);
        if (!isNaN(sectionIdx) && sectionIdx >= 0) {
          const pageManager0 = this.engine.getManager('PageManager');
          const fullPage = await pageManager0.getPage(pageName);
          if (fullPage?.content) {
            const aclManager0 = this.engine.getManager('ACLManager');
            const fullClean = aclManager0.removeACLMarkup(fullPage.content);
            content = spliceSection(fullClean, sectionIdx, _rawContent);
          }
        }
      }

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName: pageName,
        content: content,
        response: res
      });

      const pageManager = this.engine.getManager('PageManager');
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');
      const userManager = this.engine.getManager('UserManager');

      // Get user context from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;

      // Get existing page data for ACL checking
      const existingPage = await pageManager.getPage(pageName);

      // Accept system-category as required field (new metadata format)
      const systemCategory = req.body['system-category'] || '';
      if (
        !systemCategory ||
        typeof systemCategory !== 'string' ||
        systemCategory.trim() === ''
      ) {
        return res.status(400).send('A system-category is required');
      }

      // Validate that the submitted category is valid (case-insensitive match)
      const validCategories = this.getSystemCategories();
      const normalizedSubmitted = systemCategory.trim().toLowerCase();
      const matchedCategory = validCategories.find(
        (cat: string) => cat.toLowerCase() === normalizedSubmitted
      );
      if (!matchedCategory) {
        const validCategoryList = validCategories.join(', ');
        return res.status(400).send(
          `Invalid system-category: "${systemCategory}". Valid categories are: ${validCategoryList}`
        );
      }
      // Validate user keywords (preserve existing if none submitted)
      const submittedUserKeywords =
        typeof req.body.userKeywords !== 'undefined'
          ? req.body.userKeywords
          : typeof req.body['user-keywords'] !== 'undefined'
            ? req.body['user-keywords']
            : undefined;

      let userKeywordsArray;
      if (typeof submittedUserKeywords === 'undefined') {
        // No keywords submitted: keep existing ones
        userKeywordsArray = existingPage?.metadata?.['user-keywords'] || [];
      } else {
        userKeywordsArray = Array.isArray(submittedUserKeywords)
          ? submittedUserKeywords
          : submittedUserKeywords
            ? [submittedUserKeywords]
            : [];
      }

      // Extract audience from POST body (checkbox array)
      const submittedAudience = req.body['audience'];
      const audienceArray: string[] = Array.isArray(submittedAudience)
        ? submittedAudience.filter(Boolean)
        : submittedAudience
          ? [String(submittedAudience)]
          : [];

      // Resolve author-lock: admins and the page author may set or clear it
      const isAdmin = wikiContext.hasRole('admin');
      const existingCreator = existingPage?.metadata?.author;
      const isPageAuthor = currentUser?.username === existingCreator;
      let authorLock: boolean;
      if (isAdmin || isPageAuthor) {
        // Privileged user — honour the checkbox (present = true, absent = false)
        authorLock = req.body['author-lock-present'] === '1'
          ? req.body['author-lock'] === 'true'
          : Boolean(existingPage?.metadata?.['author-lock'] ?? false);
      } else {
        // Other editors: preserve whatever was already stored, ignore submitted value
        authorLock = Boolean(existingPage?.metadata?.['author-lock'] ?? false);
      }

      // #639 Slice C: resolve private — top-level frontmatter field (peer of
      // author-lock and audience). When the form posts `private-present=1` we
      // honour the checkbox; otherwise preserve the existing top-level value.
      //
      // #712: the legacy `user-keywords: [private]` fallback was removed here.
      // ACLManager dropped its parallel fallback in #639 Slice E (v3.7.0) once
      // all datasets had migrated; the /save handler was the lone holdout still
      // honouring the legacy form. PageManager.savePageWithContext defensively
      // strips any stray `'private'` from `user-keywords` on every save, so
      // dead legacy data can't reappear and slip past this read.
      const existingPrivate = existingPage?.metadata?.private === true;
      const privateFlag: boolean = req.body['private-present'] === '1'
        ? req.body['private'] === 'true'
        : existingPrivate;

      // Preserve existing author on edits — never overwrite with the editor's username
      const pageAuthor = existingPage?.metadata?.author || currentUser?.username || 'anonymous';

      // Prepare metadata ONCE, preserving UUID if editing
      // Use matchedCategory (properly capitalized) instead of submitted systemCategory
      const metadata = this.buildNewPageMetadata(title || pageName, {
        'system-category': matchedCategory,
        'user-keywords': userKeywordsArray,
        ...(audienceArray.length ? { audience: audienceArray } : {}),
        ...(authorLock ? { 'author-lock': true } : {}),
        ...(privateFlag ? { private: true } : {}),
        author: pageAuthor,
        uuid: existingPage?.metadata?.uuid || undefined
      });

      // Mark pages as user-modified based on their storageLocation in config
      const _catConfigManager = this.engine.getManager('ConfigurationManager');
      const _allCategoryConfig = (_catConfigManager
        ? _catConfigManager.getProperty('ngdpbase.system-category', {})
        : {}) as Record<string, { storageLocation?: string; label?: string }>;
      const _catKey = Object.keys(_allCategoryConfig).find(
        k => (_allCategoryConfig[k].label || k).toLowerCase() === matchedCategory.toLowerCase()
      );
      const storageLocation = _catKey
        ? (_allCategoryConfig[_catKey].storageLocation || 'regular')
        : 'regular';
      if (storageLocation === 'required' || storageLocation === 'github') {
        metadata['user-modified'] = true;
      }
      // Warn when editing a page whose source lives in GitHub, not in required-pages/
      const saveWarning = storageLocation === 'github'
        ? 'This page is managed in GitHub — edits here will not be reflected in the source repository.'
        : undefined;

      // Warn about unrecognised fenced code block language tags
      const _configManager = this.engine.getManager('ConfigurationManager');
      const _knownTags = _configManager?.getFencedCodeTags?.() ?? new Set<string>();
      const _tagMatches = content?.matchAll(/^```(\S+)/gm) ?? [];
      const _unknownTags = [...new Set(
        [..._tagMatches].map(m => m[1]).filter(t => !_knownTags.has(t.toLowerCase()))
      )];
      const unknownTagWarning = _unknownTags.length > 0 ? _unknownTags.join(',') : undefined;

      // Prevent required-pages from being marked private (they live in GitHub).
      // #639: also check the new top-level field; either signal counts.
      const isCurrentlyRequired = await this.isRequiredPage(pageName);
      if (isCurrentlyRequired && (privateFlag || userKeywordsArray.includes('private'))) {
        return res.status(400).send('Required pages cannot be marked as private');
      }

      // Check if the new metadata will make this a required page
      const willBeRequired = this.getRequiredPageCategories().includes(
        ((metadata['system-category'] as string) || '').toLowerCase()
      );
      if (isCurrentlyRequired || willBeRequired) {
        if (
          !currentUser ||
          !(await userManager.hasPermission(
            currentUser.username,
            'admin-system'
          ))
        ) {
          return await this.renderError(
            req,
            res,
            403,
            'Access Denied',
            'Only administrators can edit this page or assign a system category'
          );
        }
      } else {
        // For existing pages, check ACL edit permission
        if (existingPage) {
          if (
            !currentUser ||
            !(await userManager.hasPermission(
              currentUser.username,
              'page-create'
            ))
          ) {
            return await this.renderError(
              req,
              res,
              403,
              'Access Denied',
              'You do not have permission to create pages'
            );
          }
        }
      }

      // Save-time validation (#596). Delegates to ValidationManager which
      // delegates to MarkupParser's FilterChain. Only severity:'error' rule
      // violations block the save; warnings are surfaced at render time as
      // HTML comments. Editor uses the structured array to surface the rule,
      // message, and optional line/column to the user.
      const validationManager = this.engine.getManager('ValidationManager');
      if (validationManager?.collectContentErrors) {
        const validationErrors = await validationManager.collectContentErrors(content ?? '', {
          pageName,
          userName: currentUser?.username
        });
        if (validationErrors.length > 0) {
          logger.info(
            `🛑 savePage(${pageName}) blocked: ${validationErrors.length} validation error(s)`
          );
          return res.status(400).json({
            ok: false,
            error: 'Validation failed',
            validationErrors
          });
        }
      }

      // Save the page using WikiContext (author is automatically extracted from context)
      await pageManager.savePageWithContext(wikiContext, metadata);

      // Notify admins when a required page is edited in the wiki UI
      if (storageLocation === 'required') {
        const pageTitle = (metadata.title as string) || pageName;
        const editor = currentUser?.username || 'unknown';
        try {
          const notificationManager = this.engine.getManager('NotificationManager');
          if (notificationManager?.createNotification) {
            await notificationManager.createNotification({
              type: 'system',
              level: 'warning',
              title: 'Required page edited in wiki UI',
              message: `"${pageTitle}" was edited by ${editor}. Visit <a href="/admin/required-pages">Required Pages Sync</a> to review.`
            });
          }
        } catch {
          // non-fatal — save already succeeded
        }
        // Push real-time SSE event to connected admin clients
        this.pushAdminEvent('required-page-modified', {
          title: pageTitle,
          editor,
          url: '/admin/required-pages'
        });
      }

      // Sync attachment mentions — fire-and-forget so a metadata write failure never blocks save.
      // Replaces the per-render lazy attachToPage() with a deterministic save-time scan. #405 Phase 4
      const attachmentManager = this.engine.getManager('AttachmentManager');
      if (attachmentManager?.syncPageMentions) {
        attachmentManager.syncPageMentions(pageName, content).catch(() => {});
      }
      // Sync pageAssets reverse index. #438
      const assetManager = this.engine.getManager('AssetManager');
      if (assetManager?.syncPageAssets) {
        assetManager.syncPageAssets(pageName, content).catch(() => {});
      }

      // Use incremental updates instead of full rebuilds for performance
      const isNewPage = !existingPage;
      const finalTitle = (metadata.title as string) || pageName;
      const isRename = !isNewPage && pageName !== finalTitle;

      // Capture old referring pages BEFORE removing from link graph (used for cache invalidation)
      const oldReferringPages = isRename ? renderingManager.getReferringPages(pageName) : [];

      // Update link graph incrementally (much faster than full rebuild)
      if (isNewPage) {
        renderingManager.addPageToCache(finalTitle);
      } else if (isRename) {
        // Remove old title from link graph and register new title
        renderingManager.removePageFromLinkGraph(pageName);
        renderingManager.addPageToCache(finalTitle);
        logger.info(`[WikiRoutes] Page renamed: '${pageName}' → '${finalTitle}', link graph updated`);
      }
      renderingManager.updatePageInLinkGraph(finalTitle, content);

      // Update search index — on rename, remove old title entry first
      if (isRename) {
        await searchManager.removePageFromIndex(pageName);
      }
      await searchManager.updatePageInIndex(finalTitle, {
        name: finalTitle,
        content: content,
        metadata: metadata
      });

      // Clear rendered cache for this page and pages that link to it
      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        const referringPages = renderingManager.getReferringPages(finalTitle);
        // UUID is stable across renames — one clear covers both old and new title
        const _uuid3 = pageManager?.getPageUUID?.(finalTitle) ?? finalTitle;
        await cacheManager.clear(undefined, `rendered-pages:${_uuid3}:*`);
        for (const refPage of referringPages) {
          const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
          await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
        }
        if (isRename) {
          for (const refPage of oldReferringPages) {
            const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
            await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
          }
          logger.debug(`🗑️  Cleared rendered cache for old title '${pageName}' and ${oldReferringPages.length} referring pages`);
        }
        logger.debug(`🗑️  Cleared rendered cache for ${finalTitle} and ${referringPages.length} referring pages`);
      }

      // Redirect to the updated page title if it changed (fallback to original name)
      const redirectName = (metadata.title as string) || pageName;
      this.engine.getManager('MetricsManager')?.recordPageSave?.(Date.now() - _metricsStart);
      const warnParams = new URLSearchParams();
      if (saveWarning) warnParams.set('warning', 'github-page');
      if (unknownTagWarning) warnParams.set('unknown-tags', unknownTagWarning);
      const warnParam = warnParams.size > 0 ? `?${warnParams.toString()}` : '';
      res.redirect(`/view/${encodeURIComponent(redirectName)}${warnParam}`);
    } catch (err: unknown) {
      this.engine.getManager('MetricsManager')?.recordPageSave?.(Date.now() - _metricsStart);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error saving page:', err);

      // Return 409 for duplicate title/UUID conflicts
      if (errorMessage.includes('is already in use') || errorMessage.includes('is already assigned')) {
        return await this.renderError(
          req,
          res,
          409,
          'Page Conflict',
          errorMessage
        );
      }

      return await this.renderError(
        req,
        res,
        500,
        'Error Saving Page',
        `Failed to save page: ${errorMessage}`
      );
    }
  }

  /**
   * Delete a page
   */
  async deletePage(req: Request, res: Response) {
    const _metricsStart = Date.now();
    try {
      const pageName = req.params.page;
      logger.debug(`🗑️ Delete request received for page: ${pageName}`);

      // Create WikiContext as single source of truth for this operation
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.NONE,
        pageName: pageName,
        response: res
      });

      // Extract user from WikiContext (single source of truth)
      const currentUser = wikiContext.userContext;
      const pageManager = this.engine.getManager('PageManager');
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');
      const userManager = this.engine.getManager('UserManager');
      const aclManager = this.engine.getManager('ACLManager');

      // Check if page exists
      const pageData = await pageManager.getPage(pageName);
      if (!pageData) {
        logger.debug(`❌ Page not found: ${pageName}`);
        return res.status(404).send('Page not found');
      }

      // Check private page access
      const canAccessPrivateForDelete = await this.checkPrivatePageAccess(wikiContext, pageName);
      if (!canAccessPrivateForDelete) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to delete this page.');
      }

      // Check if this is a required page that needs admin access
      if (await this.isRequiredPage(pageName)) {
        if (
          !currentUser ||
          !(await userManager.hasPermission(
            currentUser.username,
            'admin-system'
          ))
        ) {
          return await this.renderError(
            req,
            res,
            403,
            'Access Denied',
            'Only administrators can delete this page'
          );
        }
      } else {
        // Check ACL delete permission using WikiContext
        // Load metadata before ACL check so Tier 0 / Tier 1.5 have full context
        (wikiContext as { pageMetadata: unknown }).pageMetadata = pageData.metadata ?? null;
        // Update WikiContext with page content for ACL checking
        (wikiContext as { content: string | null }).content = pageData.content;

        const hasDeletePermission = await aclManager.checkPagePermissionWithContext(
          wikiContext,
          'delete'
        );

        if (!hasDeletePermission) {
          return await this.renderError(
            req,
            res,
            403,
            'Access Denied',
            'You do not have permission to delete this page'
          );
        }
      }

      logger.debug(`✅ Page found, proceeding to delete: ${pageName}`);

      // Capture UUID before deletion — pageCache entry is removed by deletePage
      const _deleteUUID = (pageData.metadata as { uuid?: string } | undefined)?.uuid ?? pageName;
      // Capture referring pages before deletion removes the link graph entry
      const _deleteRefPages = renderingManager.getReferringPages(pageName);

      // Delete the page using WikiContext (includes audit logging with user info)
      const deleteResult = await pageManager.deletePageWithContext(wikiContext);
      logger.debug(`🗑️ Delete result: ${deleteResult}`);

      if (deleteResult) {
        // Use incremental removal instead of full rebuilds for performance
        logger.debug('🔄 Updating indexes after deletion...');
        renderingManager.removePageFromLinkGraph(pageName);
        await searchManager.removePageFromIndex(pageName);

        // Clear rendered cache for deleted page and any pages that linked to it
        const cacheManager = this.engine.getManager('CacheManager');
        if (cacheManager?.isInitialized?.()) {
          await cacheManager.clear(undefined, `rendered-pages:${_deleteUUID}:*`);
          for (const refPage of _deleteRefPages) {
            const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
            await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
          }
        }

        logger.debug(`✅ Page deleted successfully: ${pageName}`);
        this.engine.getManager('MetricsManager')?.recordPageDelete?.(Date.now() - _metricsStart);

        // Return JSON for AJAX requests, redirect for form submissions
        if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
          res.json({ success: true, message: 'Page deleted successfully', redirect: '/' });
        } else {
          res.redirect('/');
        }
      } else {
        this.engine.getManager('MetricsManager')?.recordPageDelete?.(Date.now() - _metricsStart);
        logger.debug(`❌ Failed to delete page: ${pageName}`);
        if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
          res.status(500).json({ success: false, error: 'Failed to delete page' });
        } else {
          res.status(500).send('Failed to delete page');
        }
      }
    } catch (err: unknown) {
      this.engine.getManager('MetricsManager')?.recordPageDelete?.(Date.now() - _metricsStart);
      logger.error('❌ Error deleting page:', err);
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
        res.status(500).json({ success: false, error: 'Error deleting page' });
      } else {
        res.status(500).send('Error deleting page');
      }
    }
  }

  /**
   * Search pages with advanced options
   */
  /**
   * GET /kiosk — kiosk-style page slideshow.
   *
   * Picks random accessible pages (or a curated list) and renders them as
   * full-screen kiosk cards.  Clicking a card opens the full page in a new tab.
   *
   * Query params:
   *   pages    — comma-separated page names to show (overrides count/random)
   *   count    — number of random pages (default 10, max 50; ignored when pages= set)
   *   interval — seconds per slide (default 8)
   */
  async kiosk(req: Request, res: Response) {
    try {
      const interval = Math.max(1, parseInt(req.query.interval as string, 10) || 8);

      const pageManager      = this.engine.getManager('PageManager') as {
        getAllPages(): Promise<string[]>;
        getPage(name: string): Promise<{ title?: string; content?: string; rawContent?: string } | null>;
      };
      const renderingManager = this.engine.getManager('RenderingManager') as {
        textToHTML(ctx: unknown, markdown: string): Promise<string>;
      };

      let names: string[];
      const pagesParam = (req.query.pages as string || '').trim();

      if (pagesParam) {
        // Curated list — preserve order, strip blanks
        names = pagesParam.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        const count = Math.min(50, Math.max(1, parseInt(req.query.count as string, 10) || 10));
        const all   = await pageManager.getAllPages();
        names = shuffleArray([...all]).slice(0, count);
      }

      // Render each page through the wiki engine (reader mode — full HTML)
      const slides: { name: string; title: string; html: string; url: string }[] = [];
      for (const name of names) {
        const page = await pageManager.getPage(name);
        if (!page) continue;
        const raw = String(page.rawContent ?? page.content ?? '');
        const wikiCtx = this.createWikiContext(req, { pageName: name });
        const html = await renderingManager.textToHTML(wikiCtx, raw);
        slides.push({
          name,
          title: String(page.title ?? name),
          html,
          url: '/view/' + encodeURIComponent(name)
        });
      }

      const commonData = await this.getCommonTemplateData(req);
      return res.render('kiosk', {
        ...commonData,
        title: 'Kiosk',
        slides,
        interval,
        pages: pagesParam,
        count: names.length
      });
    } catch (err: unknown) {
      logger.error('[kiosk] Error:', err);
      return this.renderError(req, res, 500, 'Kiosk Error', 'Could not load kiosk.');
    }
  }

  /**
   * GET /search — unified search/browse surface (#693 slice 3 of unification).
   *
   * Renders the asset-picker UI shell (`views/browse-attachments.ejs`) and
   * threads URL params through as initial picker state. The picker JS then
   * calls `/api/assets/search` on load to populate results. All server-side
   * result rendering moved to that JSON API; this handler is intentionally
   * minimal.
   *
   * Legacy param aliases honoured so bookmarked URLs continue to work:
   *   tab=attachments|media|pages|users → types=attachment|media|page|user
   *   attachmentQuery / mediaQuery      → q
   *   mimeType                          → mimeCategory
   *
   * Page-search filters (category / keywords / systemKeywords / searchIn)
   * thread through to `/api/assets/search?types=page` (UI controls deferred
   * to #691; the params still apply at the API level).
   */
  async searchPages(req: Request, res: Response) {
    try {
      // Helpers (local to keep the rewrite self-contained).
      const firstString = (val: unknown): string =>
        Array.isArray(val) ? (typeof val[0] === 'string' ? val[0] : '')
          : typeof val === 'string' ? val
            : '';
      const queryParamArray = (val: unknown): string[] => {
        const arr = Array.isArray(val)
          ? val.filter((v): v is string => typeof v === 'string')
          : typeof val === 'string' ? [val] : [];
        return arr.filter(s => s.trim() !== '');
      };

      const initQuery = firstString(req.query.q)
        || firstString(req.query.attachmentQuery)
        || firstString(req.query.mediaQuery)
        || '';

      const legacyTab = firstString(req.query.tab);
      const explicitTypes = firstString(req.query.types);
      const initSource = explicitTypes
        || (legacyTab === 'attachments' ? 'attachment'
          : legacyTab === 'media' ? 'media'
            : legacyTab === 'pages' || legacyTab === 'page' ? 'page'
              : legacyTab === 'users' || legacyTab === 'user' ? 'user'
                : '');

      const initMime = firstString(req.query.mimeCategory)
        || firstString(req.query.mimeType)
        || '';

      const initFilters = {
        category:       queryParamArray(req.query.category),
        keywords:       queryParamArray(req.query.keywords),
        systemKeywords: queryParamArray(req.query.systemKeywords),
        searchIn:       queryParamArray(req.query.searchIn)
      };

      // #745: pre-populate the Pages date inputs from a bookmarked URL.
      // `date` (whole-day) seeds both bounds; the assetSearch route does the
      // authoritative YYYY-MM-DD validation, so this is best-effort seeding.
      const initDate  = firstString(req.query.date);
      const initSince = initDate || firstString(req.query.since);
      const initUntil = initDate || firstString(req.query.until);

      const commonData = await this.getCommonTemplateData(req);
      const pickerKw = await this.getPickerKeywordCatalogs();
      const pickerYears = await this.getPickerYears();

      return res.render('browse-attachments', {
        ...commonData,
        title: 'Search',
        assetPickerInitQuery:   initQuery,
        assetPickerInitSource:  initSource,
        assetPickerInitMime:    initMime,
        assetPickerInitSince:   initSince,
        assetPickerInitUntil:   initUntil,
        assetPickerInitFilters: initFilters,
        assetPickerUserKeywords:   pickerKw.userKeywords,
        assetPickerSystemKeywords: pickerKw.systemKeywords,
        assetPickerCategories:     pickerKw.categories,
        assetPickerYears:          pickerYears
      });
    } catch (err: unknown) {
      logger.error('Error rendering search page:', err);
      return res.status(500).send('Error performing search');
    }
  }

  /**
   * API endpoint for search suggestions
   */
  searchSuggestions(req: Request, res: Response) {
    try {
      const partialRaw = req.query.q;
      const partial = typeof partialRaw === 'string' ? partialRaw : '';
      const searchManager = this.engine.getManager('SearchManager');

      const suggestions = searchManager.getSuggestions(partial);

      res.json({ suggestions });
    } catch (err: unknown) {
      logger.error('Error getting suggestions:', err);
      res.status(500).json({ error: 'Error getting suggestions' });
    }
  }

  /**
   * API endpoint for getting all page names
   */
  async getPageNames(_req: Request, res: Response) {
    try {
      const pageManager = this.engine.getManager('PageManager');
      const pageNames = await pageManager.getAllPageNames();

      res.json(pageNames);
    } catch (err: unknown) {
      logger.error('Error getting page names:', err);
      res.status(500).json({ error: 'Error getting page names' });
    }
  }

  /**
   * Home page - show main index
   */
  homePage(_req: Request, res: Response) {
    const configManager = this.engine.getManager('ConfigurationManager');
    const frontPage = configManager.getProperty('ngdpbase.front-page', 'Welcome');
    res.redirect(`/view/${frontPage}`);
  }

  /**
   * API endpoint to get page preview
   */
  async previewPage(req: Request, res: Response) {
    try {
      const { content, pageName } = req.body;
      const renderingManager = this.engine.getManager('RenderingManager');

      // Use WikiContext so preview goes through the same rendering path as viewPage
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.PREVIEW,
        pageName: pageName
      });

      const renderedContent = await renderingManager.textToHTML(wikiContext, content);

      res.json({
        html: renderedContent,
        success: true
      });
    } catch (err: unknown) {
      logger.error('Error generating preview:', err);
      res.status(500).json({
        error: 'Error generating preview',
        success: false
      });
    }
  }

  /**
   * Upload attachment — page context is optional and used only for privacy
   * detection (private/ storage dir). Page-asset linkage is driven by
   * content scanning on page save, not by the upload itself (#403 / Phase 3).
   *
   * pageName may be supplied via:
   *   - URL param  : POST /attachments/upload/:page  (legacy)
   *   - Body field : POST /attachments/upload  { pageName: '...' }
   */
  async uploadAttachment(req: Request, res: Response) {
    try {
      const pageName = req.params.page
        ? decodeURIComponent(req.params.page)
        : (typeof req.body.pageName === 'string' ? req.body.pageName : undefined);
      const attachmentManager = this.engine.getManager('AttachmentManager');

      // 🔒 SECURITY: Check authentication
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to upload attachments'
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Prepare file info
      const fileBuffer = req.file.buffer;
      const fileInfo = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size
      };

      // Prepare options with full user context for permission checks.
      // pageName is for private-page storage detection only — not for linkage.
      const options = {
        pageName: pageName,
        description: req.body.description || req.file.originalname,
        context: currentUser // Pass full userContext for PolicyManager
      };

      // Upload via AttachmentManager (handles permission checks)
      const attachment = await attachmentManager.uploadAttachment(
        fileBuffer,
        fileInfo,
        options
      );

      return res.json({
        success: true,
        attachment: attachment,
        attachmentId: attachment.identifier,
        url: attachment.url,
        message: 'File uploaded successfully'
      });
    } catch (err: unknown) {
      logger.error('Error uploading attachment:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error uploading file'
      });
    }
  }

  /**
   * Upload image file
   */
  uploadImage(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file uploaded' });
      }

      // Return the image path that can be used in the Image plugin
      const imagePath = `/images/${req.file.filename}`;

      return res.json({
        success: true,
        imagePath: imagePath,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        message: 'Image uploaded successfully'
      });
    } catch (err: unknown) {
      logger.error('Error uploading image:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error uploading image'
      });
    }
  }

  /**
   * Serve attachment file
   */
  async serveAttachment(req: Request, res: Response) {
    try {
      const { attachmentId } = req.params;
      const attachmentManager = this.engine.getManager('AttachmentManager');

      // 🔒 PRIVACY: Check if this attachment belongs to a private page before serving
      const meta = await attachmentManager.getAttachmentMetadata(attachmentId);
      if (meta?.isPrivate) {
        // Determine linked page name from mentions (first mention) or pageName field
        const linkedPageName: string =
          (Array.isArray(meta.mentions) && meta.mentions.length > 0
            ? (meta.mentions[0] as { name?: string }).name
            : undefined) ??
          (meta.pageName as string | undefined) ??
          '';
        const wikiContext = this.createWikiContext(req, { pageName: linkedPageName });
        const canAccess = await this.checkPrivatePageAccess(wikiContext, linkedPageName);
        if (!canAccess) {
          return res.status(403).render('error', {
            code: 403,
            message: 'You do not have permission to access this attachment',
            currentUser: req.userContext
          });
        }
      }

      // Slice 6b of #760 (#766) — content-negotiation. When `Accept:
      // application/ld+json`, return the DigitalDocument CreativeWork shape
      // (Slice 5 / #759) as JSON instead of streaming the file bytes. ACL
      // gate already fired above; we never reach this branch with an
      // unauthorized private attachment.
      if (wantsJsonLd(req)) {
        const cw = await attachmentManager.get(attachmentId);
        if (!cw) {
          return res.status(404).send('Attachment not found');
        }
        res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
        return res.send(JSON.stringify(cw));
      }

      // Get attachment with buffer and metadata
      const result = await attachmentManager.getAttachment(attachmentId);
      if (!result) {
        return res.status(404).send('Attachment not found');
      }

      const { buffer, metadata } = result;

      // Set headers
      //
      // #719: Chrome (and most non-Safari browsers) won't decode
      // `video/quicktime` and falls back to download. The vast majority of
      // .mov files from phones/cameras are H.264/AAC inside a QuickTime
      // container — relabeling them as `video/mp4` lets Chrome play them
      // inline. Bitstream is identical; only the MIME differs. Files that
      // are genuinely incompatible (ProRes, etc.) will show a player error
      // rather than download — same end state but a less surprising path.
      const fileName = String(metadata.name ?? 'attachment');
      const rawMime = String(metadata.encodingFormat ?? 'application/octet-stream');
      const contentType = (rawMime === 'video/quicktime' || /\.mov$/i.test(fileName))
        ? 'video/mp4'
        : rawMime;
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${fileName}"`
      );
      res.setHeader('Content-Length', typeof metadata.contentSize === 'number' ? String(metadata.contentSize) : '');

      // Send buffer
      return res.send(buffer);
    } catch (err: unknown) {
      logger.error('Error serving attachment:', err);
      return res.status(500).send('Error serving attachment');
    }
  }

  /**
   * GET /attachments/thumb/:attachmentId
   * Return a cached JPEG thumbnail for an image attachment.
   * Query param: size (e.g. "150x150", default "150x150") — #405 Phase 6
   */
  async attachmentThumb(req: Request, res: Response) {
    try {
      const { attachmentId } = req.params;
      const size = (req.query.size as string) || '150x150';
      const attachmentManager = this.engine.getManager('AttachmentManager');
      if (!attachmentManager) {
        return res.status(503).send('Attachment manager not available');
      }
      const buffer = await attachmentManager.getThumbnail(attachmentId, size);
      if (!buffer) {
        return res.status(404).send('Thumbnail not available');
      }
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (err: unknown) {
      logger.error('[attachments] Error generating thumbnail:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(req: Request, res: Response) {
    try {
      const { attachmentId } = req.params;
      const attachmentManager = this.engine.getManager('AttachmentManager');

      // 🔒 SECURITY: Check authentication
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required to delete attachments'
        });
      }

      // Delete via AttachmentManager (handles permission checks)
      // Pass full userContext for PolicyManager
      const deleted = await attachmentManager.deleteAttachment(
        attachmentId,
        currentUser
      );

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Attachment not found'
        });
      }

      return res.json({
        success: true,
        message: 'Attachment deleted successfully'
      });
    } catch (err: unknown) {
      logger.error('Error deleting attachment:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error deleting attachment'
      });
    }
  }

  /**
   * Export page selection form
   */
  async exportPage(req: Request, res: Response) {
    try {
      const commonData = await this.getCommonTemplateData(req);
      const pageManager = this.engine.getManager('PageManager');
      const pageNames = await pageManager.getAllPages();

      return res.render('export', {
        ...commonData,
        title: 'Export Pages',
        pageNames: pageNames
      });
    } catch (err: unknown) {
      logger.error('Error loading export page:', err);
      return res.status(500).send('Error loading export page');
    }
  }

  /**
   * Export page to HTML
   */
  async exportPageHtml(req: Request, res: Response) {
    try {
      const { page: pageName } = req.params;
      const exportManager = this.engine.getManager('ExportManager');

      const html = await exportManager.exportPageToHtml(pageName);
      const filePath = await exportManager.saveExport(html, pageName, 'html');

      const filename = path.basename(filePath);

      // Send file as download
      return res.download(filePath, filename, (err) => {
        if (err) {
          logger.error('Error downloading export:', err);
        }
      });

    } catch (err: unknown) {
      logger.error('Error exporting to HTML:', err);
      return res.status(500).send('Error exporting page');
    }
  }

  /**
   * Export page to Markdown
   */
  async exportPageMarkdown(req: Request, res: Response) {
    try {
      const { page: pageName } = req.params;
      const exportManager = this.engine.getManager('ExportManager');

      const markdown = await exportManager.exportToMarkdown(pageName);
      const filePath = await exportManager.saveExport(markdown, pageName, 'md');

      const filename = path.basename(filePath);

      // Send file as download
      return res.download(filePath, filename, (err) => {
        if (err) {
          logger.error('Error downloading export:', err);
        }
      });

    } catch (err: unknown) {
      logger.error('Error exporting to Markdown:', err);
      return res.status(500).send('Error exporting page');
    }
  }

  /**
   * List available exports
   */
  async listExports(req: Request, res: Response) {
    try {
      const commonData = await this.getCommonTemplateData(req);
      const exportManager = this.engine.getManager('ExportManager');
      const exports = await exportManager.getExports();

      res.render('exports', {
        ...commonData,
        title: 'Exports',
        exports: exports
      });
    } catch (err: unknown) {
      logger.error('Error listing exports:', err);
      res.status(500).send('Error listing exports');
    }
  }

  /**
   * Download export file
   */
  async downloadExport(req: Request, res: Response) {
    try {
      const { filename } = req.params;
      const exportManager = this.engine.getManager('ExportManager');
      const exports = await exportManager.getExports();

      const exportFile = exports.find((e: { filename?: string; path?: string }) => e.filename === filename);
      if (!exportFile) {
        return res.status(404).send('Export not found');
      }

      return res.download(exportFile.path, filename);
    } catch (err: unknown) {
      logger.error('Error downloading export:', err);
      return res.status(500).send('Error downloading export');
    }
  }

  /**
   * Delete export file
   */
  async deleteExport(req: Request, res: Response) {
    try {
      const { filename } = req.params;
      const exportManager = this.engine.getManager('ExportManager');
      
      await exportManager.deleteExport(filename);
      res.sendStatus(204);
    }
    catch (err) {
      logger.error('Error deleting export:', err);
      res.status(500).json({ message:'Error deleting export' });
    }
  }

  /**
   * Login page
   */
  async loginPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Redirect if already logged in
      if (currentUser && currentUser.isAuthenticated) {
        const redirect = (req.query.redirect as string) || '/';
        return res.redirect(redirect);
      }

      const commonData = await this.getCommonTemplateData(req);

      const authManager = this.engine.getManager('AuthManager');
      res.render('login', {
        ...commonData,
        title: 'Login',
        error: req.query.error,
        success: req.query.success,
        magic: req.query.magic,
        redirect: req.query.redirect,
        magicLinkEnabled: authManager?.isEnabled('magic-link') ?? false,
        googleOIDCEnabled: authManager?.isEnabled('google-oidc') ?? false,
        passwordAuthEnabled: authManager?.isEnabled('password') ?? true,
        csrfToken: req.session?.csrfToken || ''
      });
    } catch (err: unknown) {
      logger.error('Error loading login page:', err);
      res.status(500).send('Error loading login page');
    }
  }

  /**
   * Admin emergency login — always shows password form regardless of OAuth config.
   * Accessible at /admin/login for situations where OAuth is unavailable.
   */
  async adminLoginPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (currentUser && currentUser.isAuthenticated) {
        return res.redirect('/admin');
      }
      const commonData = await this.getCommonTemplateData(req);
      res.render('login', {
        ...commonData,
        title: 'Admin Login',
        error: req.query.error,
        success: req.query.success,
        magic: undefined,
        redirect: req.query.redirect || '/admin',
        magicLinkEnabled: false,
        googleOIDCEnabled: false,
        passwordAuthEnabled: true,
        csrfToken: req.session?.csrfToken || ''
      });
    } catch (err: unknown) {
      logger.error('Error loading admin login page:', err);
      res.status(500).send('Error loading login page');
    }
  }

  /**
   * Process login
   */
  async processLogin(req: Request, res: Response) {
    try {
      const { username, password, redirect = '/' } = req.body;
      const userManager = this.engine.getManager('UserManager');
      const configManager = this.engine.getManager('ConfigurationManager');
      const debugLogin = configManager.getProperty(
        'ngdpbase.logging.debug.login',
        false
      );

      this.engine.getManager('MetricsManager')?.recordLoginAttempt?.();

      if (debugLogin) logger.debug('DEBUG: Login attempt for:', username);

      const authManager = this.engine.getManager('AuthManager');
      const result = authManager
        ? await authManager.authenticate('password', { username, password })
        : { success: await userManager.authenticateUser(username, password).then(Boolean), username };

      if (!result.success) {
        if (debugLogin)
          logger.debug('DEBUG: Authentication failed for:', username);
        return res.redirect(
          '/login?error=Invalid username or password&redirect=' +
            encodeURIComponent(redirect)
        );
      }

      // Store username in express-session
      req.session.username = result.username || username;
      req.session.isAuthenticated = true;

      logger.info(`👤 User logged in: ${result.username || username}`);

      if (debugLogin) {
        logger.debug('DEBUG: Session ID:', req.sessionID);
        logger.debug(
          'DEBUG: Session data before save:',
          JSON.stringify(req.session)
        );
        logger.debug('DEBUG: Session set, redirecting to:', redirect);
      }

      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session:', err);
          return res.redirect('/login?error=Session save failed');
        }
        if (debugLogin)
          logger.debug('DEBUG: Session saved successfully, now redirecting');
        res.redirect(redirect);
      });
    } catch (err: unknown) {
      logger.error('Error processing login:', err);
      res.redirect('/login?error=Login failed');
    }
  }

  /**
   * Request a magic link — POST /auth/magic-link
   */
  async requestMagicLink(req: Request, res: Response) {
    try {
      const { email, redirect = '/' } = req.body;
      const authManager = this.engine.getManager('AuthManager');

      if (authManager?.isEnabled('magic-link')) {
        // #642 Iteration 3: provider derives baseUrl from
        // ConfigurationManager.getBaseURL() at runtime. The provider is
        // only registered when base-url is explicitly configured.
        await authManager.initiate('magic-link', { email, redirect });
      }

      // Always redirect with success — never reveal whether email exists
      res.redirect('/login?magic=sent' + (redirect !== '/' ? '&redirect=' + encodeURIComponent(redirect) : ''));
    } catch (err: unknown) {
      logger.error('Error requesting magic link:', err);
      res.redirect('/login?error=Request+failed');
    }
  }

  /**
   * Verify a magic link token — GET /auth/magic-link/verify
   */
  async verifyMagicLink(req: Request, res: Response) {
    try {
      const token = req.query.token as string;
      const authManager = this.engine.getManager('AuthManager');

      if (!token || !authManager) {
        return res.redirect('/login?error=Invalid+link');
      }

      // Get redirect before consuming (token is deleted in consumeToken)
      const redirect = authManager.getMagicLinkRedirect(token);

      const result = await authManager.authenticate('magic-link', { token });
      if (!result.success) {
        return res.redirect('/login?error=Link+expired+or+already+used');
      }

      // Consume token — single-use
      authManager.consumeToken('magic-link', token);

      req.session.username = result.username;
      req.session.isAuthenticated = true;

      logger.info(`👤 User logged in via magic link: ${result.username}`);

      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after magic link login:', err);
          return res.redirect('/login?error=Session+save+failed');
        }
        res.redirect(redirect || '/');
      });
    } catch (err: unknown) {
      logger.error('Error verifying magic link:', err);
      res.redirect('/login?error=Verification+failed');
    }
  }

  /**
   * Initiate Google OIDC sign-in — POST /auth/oauth/google
   */
  initiateGoogleOIDC(req: Request, res: Response) {
    try {
      const authManager = this.engine.getManager('AuthManager');
      if (!authManager?.isEnabled('google-oidc')) {
        return res.redirect('/login?error=Google+sign-in+not+enabled');
      }
      const redirect = (req.body.redirect as string) || '/';
      const authUrl = authManager.initiateGoogleOIDC(redirect);
      res.redirect(authUrl);
    } catch (err: unknown) {
      logger.error('Error initiating Google OIDC:', err);
      res.redirect('/login?error=Google+sign-in+failed');
    }
  }

  /**
   * Handle Google OIDC callback — GET /auth/oauth/google/callback
   */
  async verifyGoogleOIDCCallback(req: Request, res: Response) {
    try {
      const code  = req.query.code  as string | undefined;
      const state = req.query.state as string | undefined;
      const error = req.query.error as string | undefined;

      const authManager = this.engine.getManager('AuthManager');

      if (error || !code || !state || !authManager) {
        logger.warn(`[GoogleOIDC] Callback error: ${error ?? 'missing code/state'}`);
        return res.redirect('/login?error=Google+sign-in+cancelled');
      }

      // Get redirect URL before consuming state (state deleted in consumeToken)
      const redirect = authManager.getGoogleOIDCRedirect(state);

      const result = await authManager.authenticate('google-oidc', {
        token: code,
        state
      } as Parameters<typeof authManager.authenticate>[1]);

      if (!result.success) {
        const configManager = this.engine.getManager('ConfigurationManager');
        const denyRedirect = configManager
          ? (configManager.getProperty('ngdpbase.auth.google-oidc.deny-redirect', '/login?error=Access+denied'))
          : '/login?error=Access+denied';
        return res.redirect(denyRedirect);
      }

      // Consume state — single-use
      authManager.consumeToken('google-oidc', state);

      req.session.username = result.username;
      req.session.isAuthenticated = true;

      logger.info(`👤 User logged in via Google: ${result.username}`);

      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after Google login:', err);
          return res.redirect('/login?error=Session+save+failed');
        }
        res.redirect(redirect || '/');
      });
    } catch (err: unknown) {
      logger.error('Error in Google OIDC callback:', err);
      res.redirect('/login?error=Google+sign-in+failed');
    }
  }

  /**
   * Process logout
   */
  processLogout(req: Request, res: Response) {
    try {
      // Destroy express-session
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session:', err);
        }
        res.redirect('/');
      });
    } catch (err: unknown) {
      logger.error('Error processing logout:', err);
      res.redirect('/');
    }
  }

  /**
   * User info debug page (shows current user state)
   */
  async userInfo(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      const sessionId = req.cookies?.sessionId;
      const session = sessionId ? await userManager.getSession(sessionId) : null;

      const info = {
        currentUser: currentUser,
        sessionId: sessionId,
        sessionExists: !!session,
        sessionExpired: sessionId && !session,
        userType: !currentUser
          ? 'No User/Anonymous'
          : currentUser.username === 'anonymous'
            ? 'Anonymous'
            : currentUser.username === 'asserted'
              ? 'Asserted (has cookie)'
              : currentUser.isAuthenticated
                ? 'Authenticated'
                : 'Unknown',
        hasSessionCookie: !!sessionId,
        permissions: currentUser
          ? userManager.getUserPermissions(currentUser.username ?? '')
          : (await userManager.hasPermission(undefined, 'page-read'))
            ? ['anonymous permissions']
            : []
      };

      res.json(info);
    } catch (err: unknown) {
      logger.error('Error getting user info:', err);
      res.status(500).json({ error: getErrorMessage(err) });
    }
  }

  /**
   * GET /api/users/search?q=&role=&limit=&activeOnly=
   *
   * Requires search-user permission (derived from caller's roles via WikiContext).
   * Returns full profile when caller also has user-read; otherwise strips to
   * { username, displayName } only to protect PII.
   */
  async apiUsersSearch(req: Request, res: Response): Promise<void> {
    try {
      const ctx = ApiContext.from(req, this.engine as unknown as import('../types/WikiEngine.js').WikiEngine);
      ctx.requireAuthenticated();
      await ctx.requirePermission('search-user');

      const userManager = this.engine.getManager('UserManager') as IUserManager | null;
      if (!userManager) { res.status(503).json({ error: 'UserManager not available' }); return; }

      const q          = typeof req.query['q']          === 'string' ? req.query['q']    : '';
      const role       = typeof req.query['role']       === 'string' ? req.query['role'] : undefined;
      const limitRaw   = parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '50', 10);
      const limit      = isNaN(limitRaw) ? 50 : limitRaw;
      const activeOnly = req.query['activeOnly'] !== 'false';

      const results = await userManager.searchUsers(q, { role, limit, activeOnly });

      const canReadFull = await ctx.hasPermission('user-read');
      const payload = canReadFull
        ? results
        : results.map((u: { username: string; displayName?: string }) => ({ username: u.username, displayName: u.displayName }));

      res.json({ results: payload, total: payload.length });
    } catch (err: unknown) {
      if (err instanceof ApiError) { res.status(err.status).json({ error: err.message }); return; }
      res.status(500).json({ error: getErrorMessage(err) });
    }
  }

  /**
   * #658: GET /contact handler. State matrix:
   *
   * - contact.enabled = false             → 404 (kill switch)
   * - contact.page = "<slug>"             → 302 → /view/<slug>
   * - contact.page = "" + recipient ok    → render form view (state: "form")
   * - contact.page = "" + recipient null  → render not-configured view
   *
   * Recipient resolution (UserManager.getContactRecipient): explicit
   * `contact.recipient` config, else first admin user with email !=
   * "admin@localhost". The recipient is never written into the rendered
   * HTML — it stays server-side only.
   *
   * Loop guard for `contact.page === "contact"` is enforced at startup
   * by ConfigurationManager.assertContactPageNotLoop; this handler also
   * defends in depth.
   */
  async contactPage(req: Request, res: Response) {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');

      const enabled = (configManager?.getProperty(
        'ngdpbase.application.contact.enabled',
        true
      ) as boolean | undefined) ?? true;
      if (!enabled) {
        res.status(404).send('Not found');
        return;
      }

      const redirectPage = ((configManager?.getProperty(
        'ngdpbase.application.contact.page',
        ''
      ) as string | undefined) ?? '').trim();
      if (redirectPage && redirectPage !== 'contact') {
        res.redirect(302, `/view/${encodeURIComponent(redirectPage)}`);
        return;
      }
      if (redirectPage === 'contact') {
        // Defence in depth — startup invariant should have prevented this.
        logger.warn('[contactPage] contact.page === "contact" would create a redirect loop; ignoring');
      }

      const recipientOverride = (configManager?.getProperty(
        'ngdpbase.application.contact.recipient',
        ''
      ) as string | undefined) ?? '';

      const userManager = this.engine.getManager('UserManager');
      const recipient = userManager
        ? await userManager.getContactRecipient(recipientOverride)
        : null;

      // #670 Phase B: mail must be enabled for the form to render. If mail is
      // off, surface "not configured" rather than the form so visitors don't
      // submit a message that would be silently dropped. Logged at error level
      // because a public form pretending to work is an operator-visible bug.
      const emailManager = this.engine.getManager('EmailManager') as
        | { isEnabled(): boolean }
        | null;
      const mailEnabled = emailManager?.isEnabled?.() ?? false;
      if (!emailManager) {
        logger.error('[contactPage] EmailManager not registered — rendering not-configured view; mail subsystem is unavailable');
      } else if (!mailEnabled) {
        logger.error('[contactPage] ngdpbase.mail.enabled is false — rendering not-configured view; visitors cannot submit until mail is configured');
      }

      const fullyAvailable = !!recipient && mailEnabled && !!emailManager;

      const commonData = await this.getCommonTemplateData(req);
      res.render('contact', {
        ...commonData,
        title: 'Contact',
        // Never render the recipient address itself — only whether the
        // feature has resolved one.
        state: fullyAvailable ? 'form' : 'not-configured',
        submitted: false,
        formError: null,
        formValues: { name: '', email: '', subject: '', message: '' },
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading contact page:', err);
      res.status(500).send('Error loading contact page');
    }
  }

  /**
   * #658 iteration 3: POST /contact handler.
   *
   * State matrix mirrors GET (kill switch / redirect-page / dormant) plus:
   *  - rate limit per `req.ip` (5 / 15 min) → 429
   *  - honeypot field `_website` filled → 200 silent success, no mail
   *  - validation errors → re-render form with formError + formValues
   *  - happy path → EmailManager.sendTo(recipient, subject, body),
   *                 then re-render with state="submitted"
   *
   * CSRF: validated by the app-wide csrf middleware (`src/middleware/csrf.ts`,
   * wired in `src/app.ts`) before this handler runs. For this unauthenticated
   * mail-send surface, honeypot + rate limit + recipient sentinel remain the
   * primary anti-abuse defenses (CSRF protects against forged authenticated
   * requests, not raw spam).
   */
  async processContact(req: Request, res: Response) {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');

      const enabled = (configManager?.getProperty(
        'ngdpbase.application.contact.enabled',
        true
      ) as boolean | undefined) ?? true;
      if (!enabled) {
        res.status(404).send('Not found');
        return;
      }

      const redirectPage = ((configManager?.getProperty(
        'ngdpbase.application.contact.page',
        ''
      ) as string | undefined) ?? '').trim();
      if (redirectPage && redirectPage !== 'contact') {
        // Operator pointed /contact at their own page; we're not handling submissions.
        res.status(405).send('Method not allowed');
        return;
      }

      // #670 Phase E: anti-spam defenses are individually toggleable and
      // tunable. honeypot.enabled and rate-limit.enabled gate the two
      // mechanisms; rate-limit max/window come from config too. Defaults
      // preserve the pre-3.13 hard-coded values (5 / 15 min, both on).
      const honeypotEnabled = (configManager?.getProperty(
        'ngdpbase.mail.honeypot.enabled',
        true
      ) as boolean | undefined) ?? true;
      const rateLimitEnabled = (configManager?.getProperty(
        'ngdpbase.mail.rate-limit.enabled',
        true
      ) as boolean | undefined) ?? true;
      const rateLimitMax = (configManager?.getProperty(
        'ngdpbase.mail.rate-limit.max-submissions',
        5
      ) as number | undefined) ?? 5;
      const rateLimitWindowMin = (configManager?.getProperty(
        'ngdpbase.mail.rate-limit.window-minutes',
        15
      ) as number | undefined) ?? 15;

      // Apply current config to the module-scope limiter. Cheap; existing
      // bucket state is preserved by configure() — operators tightening or
      // loosening the limit don't have to wait out the old window.
      contactRateLimiter.configure({
        max: rateLimitMax,
        windowMs: rateLimitWindowMin * 60 * 1000
      });

      // Rate limit per source IP. Trust proxy headers iff express has been
      // configured with `trust proxy` upstream; req.ip falls back to remote.
      const limitKey = req.ip || 'unknown';
      if (rateLimitEnabled) {
        const rl = contactRateLimiter.consume(limitKey);
        if (!rl.allowed) {
          const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
          res.set('Retry-After', String(retryAfterSec));
          res.status(429).send('Too many contact submissions. Please try again later.');
          return;
        }
      }

      const body = (req.body || {}) as Record<string, unknown>;

      // Honeypot: a real human leaves this blank; bots fill every field.
      // Hidden via inline CSS in the view; if filled, log and silently 200.
      // When honeypot.enabled=false (Phase E), the field is ignored — the
      // bot's submission proceeds through normal validation + send.
      if (honeypotEnabled) {
        const honeypot = typeof body._website === 'string' ? body._website.trim() : '';
        if (honeypot) {
          logger.warn(`[processContact] honeypot filled (${honeypot.length} chars) from ip=${limitKey} — silently succeeding without sending mail`);
          const commonData = await this.getCommonTemplateData(req);
          res.render('contact', {
            ...commonData,
            title: 'Contact',
            state: 'submitted',
            submitted: true,
            formError: null,
            formValues: { name: '', email: '', subject: '', message: '' },
            csrfToken: req.session.csrfToken
          });
          return;
        }
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      const recipientOverride = (configManager?.getProperty(
        'ngdpbase.application.contact.recipient',
        ''
      ) as string | undefined) ?? '';

      const userManager = this.engine.getManager('UserManager');
      const recipient = userManager
        ? await userManager.getContactRecipient(recipientOverride)
        : null;

      // #670 Phase B: resolve EmailManager up-front so a mail-disabled deploy
      // surfaces "not configured" rather than accepting a submission that
      // would never ship. Logged at error level — the previous "warn + proceed"
      // path lied to visitors when mail was off.
      const emailManager = this.engine.getManager('EmailManager') as
        | { sendTo(to: string, subject: string, text: string, html?: string): Promise<void>; isEnabled(): boolean }
        | null;
      const mailReady = !!emailManager && emailManager.isEnabled();

      // Validate input. `subject` is optional; everything else required.
      // httpStatus defaults to the formError heuristic — non-null formError is
      // a client-side validation failure, so 400. The mail-send-failure path
      // overrides to 200: the visitor's input was fine, the server just could
      // not relay the message (#677).
      const renderForm = async (
        state: 'form' | 'not-configured',
        formError: string | null,
        httpStatus?: number
      ): Promise<void> => {
        const status = httpStatus ?? (formError ? 400 : 200);
        const commonData = await this.getCommonTemplateData(req);
        res.status(status).render('contact', {
          ...commonData,
          title: 'Contact',
          state,
          submitted: false,
          formError,
          formValues: { name, email, subject, message },
          csrfToken: req.session.csrfToken
        });
      };

      // #670 Phase C: persist every legitimate POST attempt to a JSONL audit
      // log so `mail-failed` and `mail-disabled` outcomes survive the loss of
      // mail delivery. Honeypot- and rate-limit-rejected submissions are NOT
      // logged — they're already in the warn/429 paths and would inflate the
      // audit file. Best-effort — failures here never block the response.
      const persistSubmission = async (
        mailResult: MailResult,
        recipientForLog: string | null
      ): Promise<void> => {
        const persistEnabled = (configManager?.getProperty(
          'ngdpbase.application.contact.persist.enabled',
          true
        ) as boolean | undefined) ?? true;
        if (!persistEnabled) return;

        const persistPathOverride = ((configManager?.getProperty(
          'ngdpbase.application.contact.persist.path',
          ''
        ) as string | undefined) ?? '').trim();
        const dataFolder = configManager?.getInstanceDataFolder?.() ?? './data';
        const filePath = persistPathOverride || path.join(dataFolder, 'contact-submissions.log');

        const entry: SubmissionEntry = {
          ts: new Date().toISOString(),
          ip: req.ip ?? null,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
          referer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
          name,
          email,
          subject,
          message,
          recipient: recipientForLog,
          mailResult
        };

        await new ContactSubmissionLog(filePath).append(entry);
      };

      if (!emailManager) {
        logger.error('[processContact] EmailManager not registered — rejecting submission with not-configured view');
        await persistSubmission('mail-disabled', null);
        await renderForm('not-configured', null);
        return;
      }
      if (!emailManager.isEnabled()) {
        logger.error('[processContact] ngdpbase.mail.enabled is false — rejecting submission with not-configured view (was previously a silent drop)');
        await persistSubmission('mail-disabled', null);
        await renderForm('not-configured', null);
        return;
      }
      if (!recipient) {
        await persistSubmission('no-recipient', null);
        await renderForm('not-configured', null);
        return;
      }

      if (!name) { await renderForm('form', 'Please enter your name.'); return; }
      if (name.length > 100) { await renderForm('form', 'Name is too long (max 100 characters).'); return; }
      if (!email) { await renderForm('form', 'Please enter your email address.'); return; }
      if (email.length > 254) { await renderForm('form', 'Email is too long (max 254 characters).'); return; }
      // Pragmatic email shape check — RFC-perfect validation is famously
      // brittle. SMTP verifies on send anyway.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await renderForm('form', 'Please enter a valid email address.');
        return;
      }
      if (subject.length > 200) { await renderForm('form', 'Subject is too long (max 200 characters).'); return; }
      if (!message) { await renderForm('form', 'Please enter a message.'); return; }
      if (message.length > 5000) { await renderForm('form', 'Message is too long (max 5000 characters).'); return; }

      // mailReady was checked above; we keep this assertion path so future
      // refactors don't accidentally call sendTo on a disabled provider.
      if (!mailReady) {
        logger.error('[processContact] mailReady invariant violated post-validation — rejecting');
        await persistSubmission('mail-disabled', null);
        await renderForm('not-configured', null);
        return;
      }

      const finalSubject = subject || `Contact form submission from ${name}`;
      const text = [
        `From: ${name} <${email}>`,
        subject ? `Subject: ${subject}` : null,
        '',
        message
      ].filter(line => line !== null).join('\n');

      try {
        await emailManager.sendTo(recipient, finalSubject, text);
      } catch (mailErr: unknown) {
        logger.error('[processContact] EmailManager.sendTo failed:', mailErr);
        await persistSubmission('mail-failed', recipient);
        await renderForm('form', 'We could not send your message right now. Please try again later.', 200);
        return;
      }

      await persistSubmission('sent', recipient);

      const commonData = await this.getCommonTemplateData(req);
      res.render('contact', {
        ...commonData,
        title: 'Contact',
        state: 'submitted',
        submitted: true,
        formError: null,
        formValues: { name: '', email: '', subject: '', message: '' },
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error processing contact submission:', err);
      res.status(500).send('Error processing contact submission');
    }
  }

  /**
   * Registration page
   *
   * Returns 404 when self-registration is disabled
   * (`ngdpbase.application.registration: false`). Operators who lock down
   * registration repurpose the header button to a "Request access" wiki page
   * — see `getCommonTemplateData()` and `views/header.ejs`.
   */
  async registerPage(req: Request, res: Response) {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      const allowReg = (configManager?.getProperty(
        'ngdpbase.application.registration',
        true
      ) as boolean | undefined) ?? true;
      if (!allowReg) {
        res.status(404).send('Not found');
        return;
      }

      const commonData = await this.getCommonTemplateData(req);

      res.render('register', {
        ...commonData,
        title: 'Register',
        error: req.query.error,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading register page:', err);
      res.status(500).send('Error loading register page');
    }
  }

  /**
   * Process registration
   *
   * Returns 404 when self-registration is disabled
   * (`ngdpbase.application.registration: false`). Defence in depth — the GET
   * route also 404s, but rejecting the POST keeps the flag honest if the
   * route is somehow reachable (test harness, future refactor).
   */
  async processRegister(req: Request, res: Response) {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      const allowReg = (configManager?.getProperty(
        'ngdpbase.application.registration',
        true
      ) as boolean | undefined) ?? true;
      if (!allowReg) {
        res.status(404).send('Not found');
        return;
      }

      const { username, email, displayName, password, confirmPassword } =
        req.body;
      const userManager = this.engine.getManager('UserManager');

      // Validation
      if (!username || !email || !password) {
        return res.redirect('/register?error=All fields are required');
      }

      if (password !== confirmPassword) {
        return res.redirect('/register?error=Passwords do not match');
      }

      if (password.length < 6) {
        return res.redirect(
          '/register?error=Password must be at least 6 characters'
        );
      }

      await userManager.createUser({
        username,
        email,
        displayName: displayName || username,
        password,
        roles: ['reader'], // Default role
        isExternal: false, // Local user
        acceptLanguage: req.headers['accept-language'] // Pass browser locale
      });

      logger.debug(`👤 User registered: ${username}`);
      res.redirect('/login?success=Registration successful');
    } catch (err: unknown) {
      logger.error('Error processing registration:', err);
      const errorMessage = getErrorMessage(err) || 'Registration failed';
      res.redirect('/register?error=' + encodeURIComponent(errorMessage));
    }
  }

  /**
   * User profile page
   */
  async profilePage(req: Request, res: Response) {
    logger.debug('DEBUG: profilePage accessed');
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      logger.debug(
        'DEBUG: currentUser from req.userContext:',
        currentUser ? currentUser.username : 'null'
      );

      if (!currentUser || !currentUser.isAuthenticated) {
        logger.debug('DEBUG: No authenticated user, redirecting to login');
        return res.redirect('/login?redirect=/profile');
      }

      // Get fresh user data from database to ensure we have latest preferences
      const freshUser = await userManager.getUser(currentUser.username ?? '');
      // #617 iteration 3b: attach RoleManager-resolved roles so profile.ejs
      // can render the role badges.
      if (freshUser && currentUser.username) {
        (freshUser as { roles?: string[] }).roles = await userManager.resolveUserRoles(currentUser.username);
      }
      logger.debug(
        'DEBUG: profilePage - fresh user preferences:',
        freshUser ? freshUser.preferences : 'no fresh user'
      );

      const commonData = await this.getCommonTemplateData(req);
      const userPermissions = await userManager.getUserPermissions(
        currentUser.username ?? ''
      );

      // Get timezone and date format configuration
      const configManager = this.engine.getManager('ConfigurationManager');
      const availableTimezones = configManager
        ? configManager.getProperty('ngdpbase.timezones', [])
        : [];


      const availableDateFormats = LocaleUtils.getDateFormatOptions();

      // #640: contributions counts for the "My Contributions" card
      const contributions = currentUser.username
        ? await this.getMyContributionsCounts(currentUser.username, freshUser as { preferences?: Record<string, unknown> } | null)
        : { pages: undefined, private: undefined, journal: undefined, links: undefined };

      res.render('profile', {
        ...commonData,
        title: 'Profile',
        user: freshUser || currentUser, // Use fresh user data if available
        permissions: userPermissions,
        availableTimezones: availableTimezones,
        availableDateFormats: availableDateFormats,
        contributions, // #640
        error: req.query.error,
        success: req.query.success,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading profile page:', err);
      res.status(500).send('Error loading profile page');
    }
  }

  /**
   * Compute the four "My Contributions" counts in one call so the profile
   * card can render without N round-trips. Called from profilePage. Failures
   * for any sub-count fall back to undefined so a single broken manager
   * doesn't break the whole card. (#640)
   */
  private async getMyContributionsCounts(
    username: string,
    user: { preferences?: Record<string, unknown>; roles?: string[] } | null
  ): Promise<{
    pages: number | undefined;
    private: number | undefined;
    journal: number | undefined;
    links: number | undefined;
    edits: number | undefined;
    shared: number | undefined;
  }> {
    const counts: {
      pages: number | undefined;
      private: number | undefined;
      journal: number | undefined;
      links: number | undefined;
      edits: number | undefined;
      shared: number | undefined;
    } = { pages: undefined, private: undefined, journal: undefined, links: undefined, edits: undefined, shared: undefined };

    try {
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesByCreator?: (u: string, o?: { onlyPrivate?: boolean }) => Promise<unknown[]>;
        getPagesByEditor?: (u: string) => Promise<unknown[]>;
        getPagesSharedWith?: (principals: string[]) => Promise<unknown[]>;
      };
      if (pageManager?.getPagesByCreator) {
        const all = await pageManager.getPagesByCreator(username);
        const privateOnly = await pageManager.getPagesByCreator(username, { onlyPrivate: true });
        counts.pages = all.length;
        counts.private = privateOnly.length;
      }
      if (pageManager?.getPagesByEditor) {
        const edits = await pageManager.getPagesByEditor(username);
        counts.edits = edits.length;
      }
      if (pageManager?.getPagesSharedWith) {
        const principals = [...(user?.roles ?? []), username];
        const shared = await pageManager.getPagesSharedWith(principals);
        counts.shared = shared.length;
      }
    } catch (err) {
      logger.warn('[/profile] getMyContributionsCounts: pages count failed', { error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const journalManager = this.engine.getManager('JournalDataManager') as {
        countByAuthor?: (u: string) => number;
      };
      if (journalManager?.countByAuthor) {
        counts.journal = journalManager.countByAuthor(username);
      }
    } catch (err) {
      logger.warn('[/profile] getMyContributionsCounts: journal count failed', { error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const pinned = (user?.preferences?.['nav.pinnedPages'] ?? []) as Array<{ url: string }>;
      counts.links = Array.isArray(pinned) ? pinned.length : 0;
    } catch {
      counts.links = 0;
    }

    return counts;
  }

  /**
   * GET /my/pages — list of pages owned by the current user (#640).
   */
  async myPagesPage(req: Request, res: Response) {
    return this.renderMyContributionsList(req, res, {
      title: 'My Pages',
      icon: 'fa-file-alt',
      onlyPrivate: false,
      emptyMessage: 'You haven\'t created any pages yet.'
    });
  }

  /**
   * GET /my/private — list of private pages owned by the current user (#640).
   */
  async myPrivatePagesPage(req: Request, res: Response) {
    return this.renderMyContributionsList(req, res, {
      title: 'My Private Pages',
      icon: 'fa-eye-slash',
      onlyPrivate: true,
      emptyMessage: 'You don\'t have any private pages yet.'
    });
  }

  private async renderMyContributionsList(
    req: Request,
    res: Response,
    spec: { title: string; icon: string; onlyPrivate: boolean; emptyMessage: string }
  ) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
      }
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesByCreator?: (u: string, o?: { onlyPrivate?: boolean }) => Promise<Array<{
          title: string; uuid: string; lastModified: string; isPrivate?: boolean; editor?: string
        }>>;
      };
      const items = pageManager?.getPagesByCreator
        ? await pageManager.getPagesByCreator(currentUser.username, { onlyPrivate: spec.onlyPrivate })
        : [];
      const commonData = await this.getCommonTemplateData(req);
      res.render('my-list', {
        ...commonData,
        title: spec.title,
        icon: spec.icon,
        items,
        listKind: 'pages',
        emptyMessage: spec.emptyMessage
      });
    } catch (err) {
      logger.error('Error rendering My Contributions list:', err);
      res.status(500).send('Error loading list');
    }
  }

  /**
   * GET /my/edits — pages most recently edited by the current user (#640 Phase 2).
   */
  async myEditsPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=/my/edits');
      }
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesByEditor?: (u: string) => Promise<Array<{
          title: string; uuid: string; lastModified: string; isPrivate?: boolean; editor?: string
        }>>;
      };
      const items = pageManager?.getPagesByEditor
        ? await pageManager.getPagesByEditor(currentUser.username)
        : [];
      const commonData = await this.getCommonTemplateData(req);
      res.render('my-list', {
        ...commonData,
        title: 'My Recent Edits',
        icon: 'fa-history',
        items,
        listKind: 'pages',
        emptyMessage: 'You haven\'t edited any pages yet.'
      });
    } catch (err) {
      logger.error('Error rendering My Edits list:', err);
      res.status(500).send('Error loading edits list');
    }
  }

  /**
   * GET /my/shared — pages shared with the current user via frontmatter audience (#640 Phase 2).
   */
  async mySharedPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=/my/shared');
      }
      const principals = [...(currentUser.roles ?? []), currentUser.username];
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesSharedWith?: (p: string[]) => Promise<Array<{
          title: string; uuid: string; lastModified: string; isPrivate?: boolean; editor?: string
        }>>;
      };
      const items = pageManager?.getPagesSharedWith
        ? await pageManager.getPagesSharedWith(principals)
        : [];
      const commonData = await this.getCommonTemplateData(req);
      res.render('my-list', {
        ...commonData,
        title: 'Pages Shared With Me',
        icon: 'fa-share-alt',
        items,
        listKind: 'pages',
        emptyMessage: 'No pages have been shared with you via the audience field.'
      });
    } catch (err) {
      logger.error('Error rendering My Shared list:', err);
      res.status(500).send('Error loading shared list');
    }
  }

  /**
   * GET /my/journal — list of journal entries authored by the current user (#640).
   * Delegates to the JournalDataManager from the journal addon if present.
   */
  async myJournalPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=/my/journal');
      }
      const journalManager = this.engine.getManager('JournalDataManager') as {
        listByAuthor?: (u: string, o?: { limit?: number; offset?: number }) => Array<{
          slug: string; title: string; date: string; preview?: string
        }>;
      };
      const addonsManager = this.engine.getManager('AddonsManager');
      const journalEnabled = addonsManager?.isEnabled?.('journal') ?? false;
      const entries = journalManager?.listByAuthor
        ? journalManager.listByAuthor(currentUser.username, { limit: 1000, offset: 0 })
        : [];
      // Adapt journal entries to the my-list shape so we can reuse the view.
      const items = entries.map(e => ({
        title: e.title,
        uuid: e.slug,
        lastModified: e.date,
        preview: e.preview
      }));
      const commonData = await this.getCommonTemplateData(req);
      res.render('my-list', {
        ...commonData,
        title: 'My Journal Entries',
        icon: 'fa-book',
        items,
        listKind: 'journal',
        journalEnabled,
        emptyMessage: journalManager
          ? 'You haven\'t made any journal entries yet.'
          : 'Journal addon is not enabled on this install.'
      });
    } catch (err) {
      logger.error('Error rendering My Journal list:', err);
      res.status(500).send('Error loading journal list');
    }
  }

  /**
   * GET /my/links — current user's pinned MyLinks pages from preferences (#640).
   */
  async myLinksPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=/my/links');
      }
      const userManager = this.engine.getManager('UserManager');
      const freshUser = await userManager.getUser(currentUser.username);
      const pinnedRaw = (freshUser?.preferences?.['nav.pinnedPages'] ?? []) as Array<{ url?: string; title?: string; pinnedAt?: string }>;
      const items = (Array.isArray(pinnedRaw) ? pinnedRaw : []).map(p => ({
        title: p.title ?? p.url ?? '(untitled)',
        url: p.url ?? '',
        pinnedAt: p.pinnedAt
      }));
      const commonData = await this.getCommonTemplateData(req);
      res.render('my-list', {
        ...commonData,
        title: 'My Links',
        icon: 'fa-link',
        items,
        listKind: 'links',
        emptyMessage: 'You haven\'t pinned any pages yet. Pin pages from the page menu to add them here.'
      });
    } catch (err) {
      logger.error('Error rendering My Links list:', err);
      res.status(500).send('Error loading links list');
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect('/login');
      }

      const {
        displayName,
        email,
        profilePage,
        originalProfilePage,
        renameProfilePage,
        currentPassword,
        newPassword,
        confirmPassword
      } = req.body;
      const updates: { displayName?: string; email?: string; password?: string; profilePage?: string } = {};

      if (displayName) updates.displayName = displayName;
      if (email) updates.email = email;
      updates.profilePage = (profilePage as string || '').trim() || undefined;

      // Handle password change for local users only
      if (newPassword && !currentUser.isExternal) {
        if (!currentPassword) {
          return res.redirect(
            '/profile?error=Current password required to change password'
          );
        }

        if (newPassword !== confirmPassword) {
          return res.redirect('/profile?error=New passwords do not match');
        }

        if (newPassword.length < 6) {
          return res.redirect(
            '/profile?error=Password must be at least 6 characters'
          );
        }

        // Verify current password
        const isValidPassword = await userManager.authenticateUser(
          currentUser.username ?? '',
          currentPassword
        );
        if (!isValidPassword) {
          return res.redirect('/profile?error=Current password is incorrect');
        }

        updates.password = newPassword;
      } else if (newPassword && currentUser.isExternal) {
        return res.redirect(
          '/profile?error=Cannot change password for OAuth accounts'
        );
      }

      await userManager.updateUser(currentUser.username ?? '', updates);

      // Rename profile page if requested
      const oldPageName = (originalProfilePage as string || '').trim();
      const newPageName = updates.profilePage || '';
      if (renameProfilePage === 'on' && oldPageName && newPageName && oldPageName !== newPageName) {
        const pageManager = this.engine.getManager('PageManager');
        if (pageManager) {
          try {
            if (pageManager.pageExists(newPageName)) {
              return res.redirect('/profile?error=Cannot rename: a page named "' + newPageName + '" already exists&success=Profile updated successfully');
            }
            const page = await pageManager.getPage(oldPageName);
            if (page) {
              const content = page.content;
              const oldMeta = (page.metadata ?? {}) as Record<string, unknown>;
              const displayName = currentUser.displayName ?? currentUser.username ?? '';
              // #661: re-apply / back-fill profile-page metadata on rename so
              // the renamed page carries author-lock + description + badge
              // regardless of how the original was created.
              //
              // #662 follow-up: new profile page gets a fresh UUID + slug so
              // it is a distinct entity from the old (now demoted) page;
              // without this the conflict guard in PageManager.savePage trips.
              const { uuid: _uuid, slug: _slug, created: _created, ...metaForNew } = oldMeta;
              await pageManager.savePage(newPageName, content, {
                ...metaForNew,
                title: newPageName,
                'system-category': 'user-profile',
                'author-lock': true,
                description: `${displayName}'s profile page`,
                badge: `Profile ${displayName}`
              });
              // #662: demote the old profile page to system-category 'general'
              // instead of hard-deleting it. Preserves the user's prior
              // content as a regular page they can later edit or delete
              // themselves. author-lock is preserved so write access stays
              // with the original author. description/badge are profile-only
              // and are stripped.
              const { description: _description, badge: _badge, ...metaForOld } = oldMeta;
              await pageManager.savePage(oldPageName, content, {
                ...metaForOld,
                'system-category': 'general'
              });
            }
          } catch (renameErr: unknown) {
            logger.error('Error renaming profile page:', renameErr);
            return res.redirect('/profile?error=Profile updated but page rename failed&success=Profile updated successfully');
          }
        }
      }

      res.redirect('/profile?success=Profile updated successfully');
    } catch (err: unknown) {
      logger.error('Error updating profile:', err);
      res.redirect('/profile?error=Failed to update profile');
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(req: Request, res: Response) {
    logger.debug('=== updatePreferences method called ===');
    try {
      logger.debug('DEBUG: Request body:', req.body);
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      logger.debug(
        'DEBUG: Current user:',
        currentUser ? currentUser.username : 'null'
      );

      if (!currentUser || !currentUser.isAuthenticated) {
        logger.debug('DEBUG: No current user, redirecting to login');
        return res.redirect('/login');
      }

      logger.debug('DEBUG: updatePreferences - req.body:', req.body);
      logger.debug(
        'DEBUG: updatePreferences - currentUser:',
        currentUser.username
      );

      // Get current user's existing preferences
      const currentPreferences = currentUser.preferences || {};
      logger.debug(
        'DEBUG: updatePreferences - current preferences:',
        currentPreferences
      );

      // Extract preference values from form and merge with existing
      const preferences: Record<string, string | boolean | undefined> = { ...(currentPreferences as Record<string, string | boolean | undefined>) };

      // Helper: resolve dotted field names from nested req.body (qs extended parsing)
      // e.g. form field "editor.plain.smartpairs" is parsed as { editor: { plain: { smartpairs: 'on' } } }
      const getBodyValue = (key: string): string | undefined => {
        if (req.body[key] !== undefined) return req.body[key];
        const parts = key.split('.');
        let current: unknown = req.body;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return undefined;
          }
        }
        return typeof current === 'string' ? current : undefined;
      };

      // Editor preferences
      preferences['editor.plain.smartpairs'] =
        getBodyValue('editor.plain.smartpairs') === 'on';
      preferences['editor.autoindent'] = getBodyValue('editor.autoindent') === 'on';
      preferences['editor.linenumbers'] =
        getBodyValue('editor.linenumbers') === 'on';
      preferences['editor.theme'] = getBodyValue('editor.theme') || 'default';

      // Display preferences
      preferences['display.pagesize'] = getBodyValue('display.pagesize') || '25';
      preferences['display.tooltips'] = getBodyValue('display.tooltips') === 'on';
      preferences['display.readermode'] =
        getBodyValue('display.readermode') === 'on';
      preferences['display.sectionEditing'] =
        getBodyValue('display.sectionEditing') === 'on';
      preferences['display.theme'] = getBodyValue('display.theme') || 'system';

      // Locale preferences (new system)
      if (getBodyValue('preferences.locale')) {
        preferences['locale'] = getBodyValue('preferences.locale');
      }
      if (getBodyValue('preferences.timeFormat')) {
        preferences['timeFormat'] = getBodyValue('preferences.timeFormat');
      }
      if (getBodyValue('preferences.timezone')) {
        preferences['timezone'] = getBodyValue('preferences.timezone');
      }

      // Handle date format preference
      const dateFormatValue = getBodyValue('preferences.dateFormat');
      if (dateFormatValue) {
        if (dateFormatValue === 'auto') {
          // Use locale-based format
    
          preferences['dateFormat'] = LocaleUtils.getDateFormatFromLocale(
            getBodyValue('preferences.locale') || 'en-US'
          );
        } else {
          // Use manually selected format
          preferences['dateFormat'] = dateFormatValue;
        }
      } else if (getBodyValue('preferences.locale')) {
        // Fallback: Update dateFormat based on locale if locale is provided but no explicit dateFormat
  
        preferences['dateFormat'] = LocaleUtils.getDateFormatFromLocale(
          getBodyValue('preferences.locale') ?? ''
        );
      }

      logger.debug(
        'DEBUG: updatePreferences - preferences to save:',
        preferences
      );

      // Update user with new preferences
      await userManager.updateUser(currentUser.username ?? '', { preferences });

      logger.debug('DEBUG: updatePreferences - preferences saved successfully');
      res.redirect('/profile?success=Preferences saved successfully');
    } catch (err: unknown) {
      logger.error('Error updating preferences:', err);
      res.redirect('/profile?error=Failed to save preferences');
    }
  }

  /**
   * AJAX endpoint — update only display.theme preference.
   * Used by the navbar light/dark toggle so it persists server-side
   * without resetting other preferences (POST /preferences resets all).
   */
  async updateDisplayTheme(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const theme = req.body?.theme;
      if (!['light', 'dark', 'system'].includes(theme)) {
        return res.status(400).json({ error: 'Invalid theme value' });
      }
      const userManager = this.engine.getManager('UserManager');
      const prefs = { ...(currentUser.preferences as Record<string, unknown> || {}), 'display.theme': theme };
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true });
    } catch (err: unknown) {
      logger.error('Error updating display theme:', err);
      return res.status(500).json({ error: 'Failed to save theme' });
    }
  }

  // ─── My Links (pinned pages) ───────────────────────────────────────────────

  /** POST /api/user/pinned-pages — add current page to My Links */
  async addPinnedPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const pageName = typeof req.body?.pageName === 'string' ? req.body.pageName.trim() : '';
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : pageName;
      if (!pageName) return res.status(400).json({ error: 'pageName required' });
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const pinned: Array<{ pageName: string; title: string }> =
        Array.isArray(prefs['nav.pinnedPages']) ? [...(prefs['nav.pinnedPages'] as Array<{ pageName: string; title: string }>)] : [];
      if (pinned.length >= 20) return res.status(400).json({ error: 'Maximum 20 pinned pages reached' });
      if (!pinned.find(p => p.pageName === pageName)) {
        pinned.push({ pageName, title: title || pageName });
      }
      prefs['nav.pinnedPages'] = pinned;
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true, pinnedPages: pinned });
    } catch (err) {
      logger.error('Error adding pinned page:', err);
      return res.status(500).json({ error: 'Failed to add pinned page' });
    }
  }

  /** DELETE /api/user/pinned-pages/:pageName — remove a page from My Links */
  async removePinnedPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const pageName = decodeURIComponent(req.params.pageName ?? '');
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const pinned: Array<{ pageName: string; title: string }> =
        Array.isArray(prefs['nav.pinnedPages']) ? (prefs['nav.pinnedPages'] as Array<{ pageName: string; title: string }>).filter(p => p.pageName !== pageName) : [];
      prefs['nav.pinnedPages'] = pinned;
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true, pinnedPages: pinned });
    } catch (err) {
      logger.error('Error removing pinned page:', err);
      return res.status(500).json({ error: 'Failed to remove pinned page' });
    }
  }

  /** PUT /api/user/pinned-pages/order — reorder My Links */
  async reorderPinnedPages(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const order: string[] = Array.isArray(req.body?.order) ? req.body.order : [];
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const pinned: Array<{ pageName: string; title: string }> =
        Array.isArray(prefs['nav.pinnedPages']) ? (prefs['nav.pinnedPages'] as Array<{ pageName: string; title: string }>) : [];
      const reordered = order
        .map(name => pinned.find(p => p.pageName === name))
        .filter((p): p is { pageName: string; title: string } => p !== undefined);
      prefs['nav.pinnedPages'] = reordered;
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true });
    } catch (err) {
      logger.error('Error reordering pinned pages:', err);
      return res.status(500).json({ error: 'Failed to reorder pinned pages' });
    }
  }

  async addComment(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required to post comments' });
      }

      const { pageUuid } = req.params;
      const { content } = req.body as { content?: string };
      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: 'Comment content is required' });
      }
      if (content.trim().length > 2000) {
        return res.status(400).json({ success: false, error: 'Comment exceeds 2000 character limit' });
      }

      const commentManager = this.engine.getManager('CommentManager');
      if (!commentManager || !commentManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Comments are not enabled' });
      }

      const displayName = (currentUser.displayName ?? currentUser.username) ?? 'Unknown';
      const comment = await commentManager.addComment(pageUuid, currentUser.username ?? '', displayName, content.trim());
      await this.flushPluginCaches();
      return res.json({ success: true, comment });
    } catch (err: unknown) {
      logger.error('Error adding comment:', err);
      return res.status(500).json({ success: false, error: 'Failed to add comment' });
    }
  }

  async deleteComment(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { pageUuid, commentId } = req.params;
      const commentManager = this.engine.getManager('CommentManager');
      if (!commentManager || !commentManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Comments are not enabled' });
      }

      const comment = await commentManager.getComment(pageUuid, commentId);
      if (!comment) {
        return res.status(404).json({ success: false, error: 'Comment not found' });
      }

      const isAdmin = wikiContext.hasRole('admin');
      if (!isAdmin && comment.author !== currentUser.username) {
        return res.status(403).json({ success: false, error: 'Not authorised to delete this comment' });
      }

      await commentManager.deleteComment(pageUuid, commentId, currentUser.username ?? '');
      await this.flushPluginCaches();
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error('Error deleting comment:', err);
      return res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
  }

  async getFootnotes(req: Request, res: Response) {
    try {
      const { pageUuid } = req.params;
      const footnoteManager = this.engine.getManager('FootnoteManager');
      if (!footnoteManager || !footnoteManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Footnotes are not enabled' });
      }
      const footnotes = await footnoteManager.getFootnotes(pageUuid);
      return res.json({ success: true, footnotes });
    } catch (err: unknown) {
      logger.error('Error fetching footnotes:', err);
      // #709 (same family): surface the underlying reason.
      const reason = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Failed to fetch footnotes: ${reason}` });
    }
  }

  /**
   * #590 partial-render: returns just the inner footnote-list HTML the
   * FootnotesPlugin would render for this page + caller. The plugin's
   * client-side script swaps this into `#footnote-list-host` after a
   * successful add/edit/delete, replacing the old `location.reload()` flow.
   *
   * GET /api/footnotes/:pageUuid/html — text/html. No auth required to
   * read; the underlying buttons enforce per-row permissions.
   */
  async getFootnoteListHtml(req: Request, res: Response) {
    try {
      const { pageUuid } = req.params;
      const footnoteManager = this.engine.getManager('FootnoteManager');
      if (!footnoteManager || !footnoteManager.isEnabled?.()) {
        return res.status(404).type('text/html').send('<p class="no-footnotes"><em>Footnotes are not enabled.</em></p>');
      }
      const html = await renderFootnoteListHtml(footnoteManager, pageUuid, req.userContext);
      return res.type('text/html').send(html);
    } catch (err: unknown) {
      logger.error('Error rendering footnote list HTML:', err);
      return res.status(500).type('text/html').send('<p class="text-danger">Failed to render footnote list.</p>');
    }
  }

  /**
   * #590 partial-render: returns just the inner comment-list HTML the
   * CommentsPlugin would render for this page + caller. The plugin's
   * client-side script swaps this into `#comment-list-host` after a
   * successful add/delete.
   *
   * GET /api/comments/:pageUuid/html — text/html.
   */
  async getCommentListHtml(req: Request, res: Response) {
    try {
      const { pageUuid } = req.params;
      const commentManager = this.engine.getManager('CommentManager');
      if (!commentManager || !commentManager.isEnabled?.()) {
        return res.status(404).type('text/html').send('<p class="no-comments"><em>Comments are not enabled.</em></p>');
      }
      const comments = await commentManager.getComments(pageUuid);
      const u = req.userContext;
      const html = renderCommentListHtml(
        comments,
        u?.isAuthenticated === true,
        u?.username ?? '',
        (u?.roles ?? []).includes('admin'),
        pageUuid
      );
      return res.type('text/html').send(html);
    } catch (err: unknown) {
      logger.error('Error rendering comment list HTML:', err);
      return res.status(500).type('text/html').send('<p class="text-danger">Failed to render comment list.</p>');
    }
  }

  async addFootnote(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (!(await wikiContext.hasPermission('page-edit'))) {
        return res.status(403).json({ success: false, error: 'Editor role required to add footnotes' });
      }

      const { pageUuid } = req.params;
      const { display, url, note } = req.body as { display?: string; url?: string; note?: string };
      if (!display?.trim() || !url?.trim()) {
        return res.status(400).json({ success: false, error: 'display and url are required' });
      }

      const footnoteManager = this.engine.getManager('FootnoteManager');
      if (!footnoteManager || !footnoteManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Footnotes are not enabled' });
      }

      const footnote = await footnoteManager.addFootnote(
        pageUuid, { display: display.trim(), url: url.trim(), note: (note ?? '').trim() },
        currentUser.username ?? 'anonymous'
      );
      await this.flushPluginCaches();
      return res.json({ success: true, footnote });
    } catch (err: unknown) {
      logger.error('Error adding footnote:', err);
      // #709: surface the underlying reason so the client dialog shows
      // something actionable instead of an opaque "Failed to add footnote".
      const reason = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Failed to add footnote: ${reason}` });
    }
  }

  async updateFootnote(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (!(await wikiContext.hasPermission('page-edit'))) {
        return res.status(403).json({ success: false, error: 'Editor role required to edit footnotes' });
      }

      const { pageUuid, footnoteId } = req.params;
      const { display, url, note } = req.body as { display?: string; url?: string; note?: string };
      if (!display?.trim() || !url?.trim()) {
        return res.status(400).json({ success: false, error: 'display and url are required' });
      }

      const footnoteManager = this.engine.getManager('FootnoteManager');
      if (!footnoteManager || !footnoteManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Footnotes are not enabled' });
      }

      const footnote = await footnoteManager.updateFootnote(
        pageUuid, footnoteId, { display: display.trim(), url: url.trim(), note: (note ?? '').trim() }
      );
      if (!footnote) return res.status(404).json({ success: false, error: 'Footnote not found' });
      await this.flushPluginCaches();
      return res.json({ success: true, footnote });
    } catch (err: unknown) {
      logger.error('Error updating footnote:', err);
      // #709 (same family): surface the underlying reason.
      const reason = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Failed to update footnote: ${reason}` });
    }
  }

  private async flushPluginCaches(): Promise<void> {
    const markupParser = this.engine.getManager<{ invalidateHandlerCache(): Promise<void> }>('MarkupParser');
    const cacheManager = this.engine.getManager<{ clear(r: string | undefined, p?: string): Promise<void> }>('CacheManager');
    const tasks: Promise<void>[] = [];
    if (markupParser) tasks.push(markupParser.invalidateHandlerCache().catch(() => {}));
    if (cacheManager) {
      // Clear both the outer rendered-pages cache and the MarkupParser parseResults cache.
      // parseResults is keyed by page markdown content — it doesn't know about footnote/comment
      // sidecar data, so it returns stale HTML after a mutation unless explicitly cleared.
      tasks.push(cacheManager.clear(undefined, 'rendered-pages:*').catch(() => {}));
      tasks.push(cacheManager.clear('MarkupParser-ParseResults').catch(() => {}));
    }
    await Promise.all(tasks);
  }

  async deleteFootnote(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { pageUuid, footnoteId } = req.params;
      const footnoteManager = this.engine.getManager('FootnoteManager');
      if (!footnoteManager || !footnoteManager.isEnabled?.()) {
        return res.status(404).json({ success: false, error: 'Footnotes are not enabled' });
      }

      // Only admin or the footnote's creator may delete
      const footnotes = await footnoteManager.getFootnotes(pageUuid);
      const target = footnotes.find((f: { id: string }) => f.id === footnoteId);
      if (!target) return res.status(404).json({ success: false, error: 'Footnote not found' });

      const isAdmin = wikiContext.hasRole('admin');
      if (!isAdmin && target.createdBy !== currentUser.username) {
        return res.status(403).json({ success: false, error: 'Not authorised to delete this footnote' });
      }

      await footnoteManager.deleteFootnote(pageUuid, footnoteId);
      await this.flushPluginCaches();
      return res.json({ success: true });
    } catch (err: unknown) {
      logger.error('Error deleting footnote:', err);
      // #709 (same family): surface the underlying reason.
      const reason = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: `Failed to delete footnote: ${reason}` });
    }
  }

  /**
   * Admin dashboard
   */
  async adminDashboard(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req, { pageName: 'AdminDashboard' });
      const currentUser = wikiContext.userContext;
      const aclManager = this.engine.getManager('ACLManager');

      // #632: migrated from deprecated checkPagePermission(name, action, ctx, '')
      // to canonical checkPagePermissionWithContext. AdminDashboard isn't a real
      // wiki page (no frontmatter, no private user-keyword) so the decision still
      // falls through to PolicyEvaluator — same effective behavior.
      const hasAccess = await aclManager.checkPagePermissionWithContext(
        wikiContext,
        'view'
      );

      if (!currentUser || !currentUser.isAuthenticated || !hasAccess) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access the admin dashboard'
        );
      }

      const userManager = this.engine.getManager('UserManager');

      const commonData = await this.getCommonTemplateData(req);
      const users = await userManager.getUsers();
      const roles = userManager.getRoles();

      // Get all required pages for the admin dashboard
      const pageManager = this.engine.getManager('PageManager');
      const allPageNames = await pageManager.getAllPages();
      const requiredPages: Array<{ name: string; userModified: boolean }> = [];

      for (const pageName of allPageNames) {
        if (await this.isRequiredPage(pageName)) {
          const page = await pageManager.getPage(pageName);
          requiredPages.push({
            name: pageName,
            userModified: page?.metadata?.['user-modified'] === true
          });
        }
      }

      // Gather system statistics
      const configManager = this.engine.getManager('ConfigurationManager');
      const stats = {
        totalUsers: users.length,
        uptime: Math.floor(process.uptime()) + ' seconds',
        version: configManager.getProperty('ngdpbase.version', '1.0.0')
      };

      // Mock recent activity (in a real implementation, this would come from logs)
      const recentActivity = [
        {
          timestamp: new Date().toLocaleString(),
          description: 'User logged in: ' + currentUser.username
        },
        {
          timestamp: new Date(Date.now() - 60000).toLocaleString(),
          description: 'System started'
        }
      ];

      // Get system notifications
      let notifications: unknown[] = [];
      let totalNotificationCount = 0;
      try {
        const notificationManager = this.engine.getManager(
          'NotificationManager'
        );
        const allNotifications = notificationManager.getAllNotifications();
        notifications = allNotifications.slice(-10); // Show last 10 on dashboard
        totalNotificationCount = allNotifications.length; // Pass true total for "View All" button
      } catch (error: unknown) {
        logger.error(
          'Error fetching notifications for admin dashboard:',
          error
        );
      }

      // Count required-pages that need syncing (new or modified vs data/pages/)
      let requiredPagesSyncNeeded = 0;
      try {

        const configManager = this.engine.getManager('ConfigurationManager');
        const requiredDirRaw: string = configManager.getProperty(
          'ngdpbase.page.provider.filesystem.requiredpagesdir',
          './required-pages'
        );
        const requiredDirResolved = path.isAbsolute(requiredDirRaw)
          ? requiredDirRaw
          : path.join(process.cwd(), requiredDirRaw);
        const pagesDirResolved: string = configManager.getResolvedDataPath(
          'ngdpbase.page.provider.filesystem.storagedir',
          './data/pages'
        );


        const volatileFields = ['lastModified', 'user-modified', 'editor'];
        const normalize = (raw: string): string => {
          const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
          const stable = { ...parsed.data };
          for (const f of volatileFields) delete stable[f];
          return matter.stringify(parsed.content, stable);
        };
        const allFiles: string[] = await fse.readdir(requiredDirResolved);
        for (const file of allFiles.filter((f: string) => f.endsWith('.md'))) {
          const destPath = path.join(pagesDirResolved, file);
          if (!(await fse.pathExists(destPath))) {
            requiredPagesSyncNeeded++;
          } else {
            const src: string = await fse.readFile(
              path.join(requiredDirResolved, file),
              'utf8'
            );
            const dst: string = await fse.readFile(destPath, 'utf8');
            if (normalize(src) !== normalize(dst)) requiredPagesSyncNeeded++;
          }
        }
      } catch {
        // non-fatal — badge just won't show
      }

      // Gather add-ons summary and registered dashboard cards
      let addonsSummary = { total: 0, loaded: 0, errored: 0, disabled: 0 };
      let addonCards: Array<{ addonName: string; title: string; icon: string; adminUrl: string; statusDetails?: unknown }> = [];
      try {
        const addonsManager = this.engine.getManager('AddonsManager');
        if (addonsManager) {
          const addonStatuses = await addonsManager.getStatus();
          addonsSummary = {
            total: addonStatuses.length,
            loaded: addonStatuses.filter((a: { loaded: boolean }) => a.loaded).length,
            errored: addonStatuses.filter((a: { error: string | null }) => a.error).length,
            disabled: addonStatuses.filter((a: { enabled: boolean }) => !a.enabled).length
          };
          addonCards = addonsManager.getDashboardCards().map((card: { addonName: string; title: string; icon: string; adminUrl: string }) => ({
            ...card,
            statusDetails: addonStatuses.find((s: { name: string }) => s.name === card.addonName)?.details
          }));
        }
      } catch {
        // non-fatal — summary card just won't show counts
      }

      const templateData = {
        ...commonData,
        title: 'Admin Dashboard',
        users: users,
        roles: roles,
        userCount: users.length,
        roleCount: roles.length,
        stats: stats,
        recentActivity: recentActivity,
        requiredPages: requiredPages,
        requiredPagesSyncNeeded,
        notifications: notifications,
        totalNotificationCount: totalNotificationCount,
        maintenanceMode:
          this.engine.config?.features?.maintenance?.enabled || false,
        csrfToken: req.session.csrfToken,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null,
        addonsSummary,
        addonCards
      };

      res.render('admin-dashboard', templateData);
    } catch (err: unknown) {
      logger.error('Error loading admin dashboard:', err);
      res.status(500).send('Error loading admin dashboard');
    }
  }

  /**
   * Toggle maintenance mode (admin only)
   */
  async adminToggleMaintenance(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      // Toggle maintenance mode in config
      const config = this.engine.config ?? {};
      const currentMode = config.features?.maintenance?.enabled || false;

      // Ensure nested config structure exists before writing
      if (!config.features) {
        config.features = {};
      }
      if (!config.features.maintenance) {
        config.features.maintenance = { enabled: false, allowAdmins: true };
      }
      config.features.maintenance.enabled = !currentMode;

      // Log the maintenance mode change
      logger.info(
        `Maintenance mode ${
          config.features.maintenance.enabled ? 'ENABLED' : 'DISABLED'
        } by ${currentUser.username}`,
        {
          action: 'maintenance_mode_toggle',
          newState: config.features.maintenance.enabled,
          user: currentUser.username,
          userIP: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString()
        }
      );

      // Create notification for all users about maintenance mode change
      try {
        const notificationManager = this.engine.getManager(
          'NotificationManager'
        );
        await notificationManager.createMaintenanceNotification(
          config.features.maintenance.enabled,
          currentUser.username ?? '',
          config.features.maintenance
        );

        logger.info('Maintenance notification created for mode change', {
          action: 'maintenance_notification_created',
          mode: config.features.maintenance.enabled ? 'enabled' : 'disabled',
          triggeredBy: currentUser.username,
          timestamp: new Date().toISOString()
        });
      } catch (notificationError: unknown) {
        logger.error('Failed to create maintenance notification', {
          action: 'maintenance_notification_failed',
          error: getErrorMessage(notificationError),
          mode: config.features.maintenance.enabled ? 'enabled' : 'disabled',
          triggeredBy: currentUser.username,
          timestamp: new Date().toISOString()
        });
      }

      // Create detailed success message
      const action = config.features.maintenance.enabled
        ? 'ENABLED'
        : 'DISABLED';
      const message =
        `Maintenance mode has been ${action.toLowerCase()}. ` +
        (config.features.maintenance.enabled
          ? 'Regular users will see a maintenance page until it is disabled.'
          : 'The system is now fully accessible to all users.');

      // Redirect back to admin dashboard with detailed success message
      return res.redirect(`/admin?success=${encodeURIComponent(message)}`);
    } catch (err: unknown) {
      logger.error('Error toggling maintenance mode', {
        error: getErrorMessage(err),
        stack: err instanceof Error ? err.stack : undefined,
        user: (req.session as { user?: { username?: string } })?.user?.username || 'unknown'
      });
      return res.redirect('/admin?error=Failed to toggle maintenance mode');
    }
  }

  /**
   * Admin policy management dashboard
   */
  async adminPolicies(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access policy management'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const policyManager = this.engine.getManager('PolicyManager');

      if (!policyManager) {
        return await this.renderError(
          req,
          res,
          500,
          'Configuration Error',
          'PolicyManager is not available'
        );
      }

      const policies = policyManager.getPolicies();

      res.render('admin-policies', {
        ...commonData,
        title: 'Policy Management',
        policies: policies,
        user: currentUser,
        csrfToken: req.session.csrfToken || '',
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null
      });
    } catch (err: unknown) {
      logger.error('Error loading policy management:', err);
      res.status(500).send('Error loading policy management');
    }
  }

  /**
   * Create a new policy
   */
  async adminCreatePolicy(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const policyManager = this.engine.getManager('PolicyManager');
      const policyValidator = this.engine.getManager('PolicyValidator');

      if (!policyManager || !policyValidator) {
        return res.status(500).json({ error: 'Policy system not available' });
      }

      const policyData = req.body;

      // Validate and save the policy
      const result = await policyValidator.validateAndSavePolicy(policyData);

      return res.json({
        success: true,
        policy: result.policy,
        message: 'Policy created successfully'
      });
    } catch (err: unknown) {
      logger.error('Error creating policy:', err);
      return res.status(500).json({
        error: 'Failed to create policy',
        details: getErrorMessage(err)
      });
    }
  }

  /**
   * Get a specific policy
   */
  async adminGetPolicy(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const policyManager = this.engine.getManager('PolicyManager');
      const policyId = req.params.id;

      if (!policyManager) {
        return res.status(500).json({ error: 'Policy system not available' });
      }

      const policy = policyManager.getPolicy(policyId);

      if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
      }

      return res.json(policy);
    } catch (err: unknown) {
      logger.error('Error retrieving policy:', err);
      return res.status(500).json({
        error: 'Failed to retrieve policy',
        details: getErrorMessage(err)
      });
    }
  }

  /**
   * Update an existing policy
   */
  async adminUpdatePolicy(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const policyManager = this.engine.getManager('PolicyManager');
      const policyValidator = this.engine.getManager('PolicyValidator');
      const policyId = req.params.id;
      const policyData = { ...req.body, id: policyId };

      if (!policyManager || !policyValidator) {
        return res.status(500).json({ error: 'Policy system not available' });
      }

      // Validate and save the updated policy
      const result = await policyValidator.validateAndSavePolicy(policyData);

      return res.json({
        success: true,
        policy: result.policy,
        message: 'Policy updated successfully'
      });
    } catch (err: unknown) {
      logger.error('Error updating policy:', err);
      return res.status(500).json({
        error: 'Failed to update policy',
        details: getErrorMessage(err)
      });
    }
  }

  /**
   * Delete a policy
   */
  async adminDeletePolicy(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const policyManager = this.engine.getManager('PolicyManager');
      const policyId = req.params.id;

      if (!policyManager) {
        return res.status(500).json({ error: 'Policy system not available' });
      }

      const success = await policyManager.deletePolicy(policyId);

      if (!success) {
        return res.status(404).json({ error: 'Policy not found' });
      }

      return res.json({
        success: true,
        message: 'Policy deleted successfully'
      });
    } catch (err: unknown) {
      logger.error('Error deleting policy:', err);
      return res.status(500).json({
        error: 'Failed to delete policy',
        details: getErrorMessage(err)
      });
    }
  }

  /**
   * Admin users management
   */
  async adminUsers(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('user-read'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access user management'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const usersRaw = await userManager.getUsers();
      // #617 iteration 3b: User.roles[] is no longer persisted; resolve
      // each user's roles from RoleManager so admin-users.ejs can keep
      // reading `u.roles` directly (templates unchanged).
      const users = await Promise.all(usersRaw.map(async (u: { username?: string; [key: string]: unknown }) => ({
        ...u,
        roles: u.username ? await userManager.resolveUserRoles(u.username) : []
      })));
      const roles = userManager.getRoles();

      return res.render('admin-users', {
        ...commonData,
        title: 'User Management',
        users: users,
        roles: roles,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading admin users:', err);
      return res.status(500).send('Error loading user management');
    }
  }

  /**
   * Render the full-page user edit form.
   * Named userEdit (not adminUserEdit) so the handler is not conceptually
   * locked to admin-only — future user-admin roles can reuse it by changing
   * only the permission check.
   */
  async userEdit(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('user-read'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to edit users'
        );
      }

      const username = req.params.username;
      const user = await userManager.getUser(username);

      if (!user) {
        return await this.renderError(req, res, 404, 'Not Found', `User "${username}" not found`);
      }

      // #617 iteration 3b: attach RoleManager-resolved roles so the
      // role-checkbox UI in admin-user-edit.ejs can pre-tick the user's
      // current memberships.
      (user as { roles?: string[] }).roles = await userManager.resolveUserRoles(username);

      const configManager = this.engine.getManager('ConfigurationManager');
      const coreFields: string[] = configManager.getProperty('ngdpbase.user.coreFields', [
        'username', 'email', 'displayName', 'password',
        'roles', 'isActive', 'isExternal', 'isSystem',
        'createdAt', 'loginCount', 'lastLogin',
        'preferences', 'profilePage', 'allowedAuthMethods', 'avatar'
      ]) as string[];

      const extendedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(user)) {
        if (!coreFields.includes(key)) {
          extendedFields[key] = value;
        }
      }

      const commonData = await this.getCommonTemplateData(req);
      const roles = userManager.getRoles();

      return res.render('admin-user-edit', {
        ...commonData,
        title: `Edit User: ${username}`,
        editUser: user,
        roles,
        extendedFields,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading user edit page:', err);
      return res.status(500).send('Error loading user edit page');
    }
  }

  /**
   * Create new user (admin)
   */
  async adminCreateUser(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('user-create'))
      ) {
        return res.status(403).send('Access denied');
      }

      const { username, email, displayName, password, roles } = req.body;

      logger.debug(`[admin/users] Attempting to create user: "${username}" with display name: "${displayName}"`);

      const success = await userManager.createUser({
        username,
        email,
        displayName,
        password,
        roles: Array.isArray(roles) ? roles : [roles],
        acceptLanguage: req.headers['accept-language'] // Pass browser locale
      });

      if (success) {
        return res.redirect('/admin/users?success=User created successfully');
      } else {
        return res.redirect('/admin/users?error=Failed to create user');
      }
    } catch (err: unknown) {
      logger.error('Error creating user:', err);
      const errorMessage = encodeURIComponent(getErrorMessage(err) || 'Error creating user');
      return res.redirect(`/admin/users?error=${errorMessage}`);
    }
  }

  /**
   * Update user (admin)
   */
  async adminUpdateUser(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('user-edit'))
      ) {
        return res
          .status(403)
          .json({ success: false, message: 'Access denied' });
      }

      const username = req.params.username;
      const updates = req.body;

      // Normalise isExternal from JSON body (may arrive as string or boolean)
      if ('isExternal' in updates) {
        updates.isExternal = updates.isExternal === true || updates.isExternal === 'true';
      }

      // Admin-role users must always be local accounts.
      // (Data validation on submitted form input, not a permission check on the caller.)
      // eslint-disable-next-line no-restricted-syntax -- form-data validation, not auth
      if (updates.isExternal === true && Array.isArray(updates.roles) && updates.roles.includes('admin')) {
        return res.status(400).json({ success: false, message: 'Admin users cannot be marked as external OAuth accounts.' });
      }

      const success = await userManager.updateUser(username, updates);

      if (success) {
        return res.json({ success: true, message: 'User updated successfully' });
      } else {
        return res
          .status(400)
          .json({ success: false, message: 'Failed to update user' });
      }
    } catch (err: unknown) {
      logger.error('Error updating user:', err);
      return res.status(500).json({ success: false, message: 'Error updating user' });
    }
  }

  /**
   * Delete user (admin)
   */
  async adminDeleteUser(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('user-delete'))
      ) {
        return res.status(403).send('Access denied');
      }

      const username = req.params.username;
      const success = await userManager.deleteUser(username);

      if (success) {
        return res.json({ success: true, message: 'User deleted successfully' });
      } else {
        return res
          .status(400)
          .json({ success: false, message: 'Failed to delete user' });
      }
    } catch (err: unknown) {
      logger.error('Error deleting user:', err);
      return res.status(500).json({ success: false, message: 'Error deleting user' });
    }
  }

  /**
   * Admin roles management
   */
  async adminRoles(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-roles'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to manage roles'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const roles = userManager.getRoles();
      const permissions = userManager.getPermissions();

      return res.render('admin-roles', {
        ...commonData,
        title: 'Security Policy Management',
        roles: Array.from(roles.values()),
        permissions: Array.from(permissions.entries() as Iterable<[string, string]>).map(([key, desc]) => ({
          key,
          description: desc
        }))
      });
    } catch (err: unknown) {
      logger.error('Error loading admin roles:', err);
      return res.status(500).send('Error loading role management');
    }
  }

  /**
   * Update role permissions (admin only)
   */
  async adminUpdateRole(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-roles'))
      ) {
        return res
          .status(403)
          .json({ success: false, message: 'Access denied' });
      }

      const { roleName, permissions, displayName, description } = req.body;

      if (!roleName) {
        return res
          .status(400)
          .json({ success: false, message: 'Role name required' });
      }

      const success = await userManager.updateRolePermissions(roleName, {
        permissions: permissions || [],
        displayName: displayName || roleName,
        description: description || ''
      });

      if (success) {
        return res.json({ success: true, message: 'Role updated successfully' });
      } else {
        return res
          .status(400)
          .json({ success: false, message: 'Failed to update role' });
      }
    } catch (err: unknown) {
      logger.error('Error updating role:', err);
      return res.status(500).json({ success: false, message: 'Error updating role' });
    }
  }

  /**
   * Create new role (admin only)
   */
  async adminCreateRole(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-roles'))
      ) {
        return res
          .status(403)
          .json({ success: false, message: 'Access denied' });
      }

      const { name, displayName, description, permissions } = req.body;

      if (!name) {
        return res
          .status(400)
          .json({ success: false, message: 'Role name required' });
      }

      const roleData = {
        name,
        displayName: displayName || name,
        description: description || '',
        permissions: Array.isArray(permissions) ? permissions : []
      };

      const role = await userManager.createRole(roleData);

      if (role) {
        return res.json({ success: true, message: 'Role created successfully', role });
      } else {
        return res
          .status(400)
          .json({ success: false, message: 'Failed to create role' });
      }
    } catch (err: unknown) {
      logger.error('Error creating role:', err);
      if (getErrorMessage(err) === 'Role already exists') {
        return res
          .status(409)
          .json({ success: false, message: 'Role already exists' });
      } else {
        return res
          .status(500)
          .json({ success: false, message: 'Error creating role' });
      }
    }
  }

  /**
   * Delete role (admin only)
   */
  async adminDeleteRole(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-roles'))
      ) {
        return res
          .status(403)
          .json({ success: false, message: 'Access denied' });
      }

      const { role } = req.params;

      if (!role) {
        return res
          .status(400)
          .json({ success: false, message: 'Role name required' });
      }

      await userManager.deleteRole(role);

      return res.json({ success: true, message: 'Role deleted successfully' });
    } catch (err: unknown) {
      logger.error('Error deleting role:', err);
      if (getErrorMessage(err) === 'Role not found') {
        return res.status(404).json({ success: false, message: 'Role not found' });
      } else if (getErrorMessage(err) === 'Cannot delete system role') {
        return res
          .status(403)
          .json({ success: false, message: 'Cannot delete system role' });
      } else {
        return res
          .status(500)
          .json({ success: false, message: 'Error deleting role' });
      }
    }
  }

  /**
   * Admin backup - Create and download full system backup
   */
  /**
   * GET /admin/backup — Backup management page
   */
  async adminBackupPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to manage backups');
      }
      const backupManager = this.engine.getManager('BackupManager');
      if (!backupManager) {
        return await this.renderError(req, res, 500, 'Backup Unavailable', 'BackupManager is not available');
      }
      const status = await backupManager.getAutoBackupStatus();
      const recentBackups = await backupManager.listBackups();
      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-backup', {
        ...commonData,
        status,
        recentBackups,
        success: req.query.success as string | undefined,
        error: req.query.error as string | undefined,
        title: 'Backup Management'
      });
    } catch (err: unknown) {
      logger.error('Error rendering backup page:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * POST /admin/backup/config — Save auto-backup configuration
   */
  async adminBackupConfig(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to manage backups');
      }
      const backupManager = this.engine.getManager('BackupManager');
      if (!backupManager) {
        return res.redirect('/admin/backup?error=BackupManager+not+available');
      }

      const body = req.body as Record<string, string>;
      const enabled = body.autoBackup === 'true' || body.autoBackup === 'on';
      const time = body.autoBackupTime ?? '02:00';
      const days = body.autoBackupDays ?? 'daily';
      const maxBackups = parseInt(body.maxBackups ?? '10', 10);
      const directory = body.directory ?? '';

      await backupManager.updateAutoBackupConfig({
        enabled,
        time,
        days,
        maxBackups: isNaN(maxBackups) ? 10 : maxBackups,
        ...(directory ? { directory } : {})
      });

      return res.redirect('/admin/backup?success=Auto-backup+configuration+saved');
    } catch (err: unknown) {
      logger.error('Error saving backup config:', err);
      return res.redirect('/admin/backup?error=' + encodeURIComponent(getErrorMessage(err)));
    }
  }

  /**
   * POST /admin/backup/create — Create backup and download
   */
  async adminBackup(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Check admin permission for system operations
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to create system backups'
        );
      }

      const backupManager = this.engine.getManager('BackupManager');
      if (!backupManager) {
        return await this.renderError(
          req,
          res,
          500,
          'Backup Unavailable',
          'BackupManager is not available'
        );
      }

      logger.debug(`📦 Admin backup requested by: ${currentUser.username}`);

      // Create backup
      const backupPath = await backupManager.createBackup();
      logger.debug(`✅ Backup created: ${backupPath}`);

      // Get backup filename
      const filename = path.basename(backupPath);

      // Send backup file as download
      res.download(backupPath, filename, (err) => {
        if (err) {
          logger.error('Error downloading backup:', err);
          // Don't send response here as headers may already be sent
        } else {
          logger.debug(`✅ Backup downloaded by: ${currentUser.username}`);
        }
      });

    } catch (err: unknown) {
      logger.error('Error creating backup:', err);
      res.status(500).send('Error creating backup: ' + getErrorMessage(err));
    }
  }

  /**
   * Admin configuration management page
   */
  async adminConfiguration(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access configuration management'
        );
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const defaultProperties = configManager.getDefaultProperties();
      const customProperties = configManager.getCustomProperties();
      const mergedProperties = configManager.getAllProperties();

      const commonData = await this.getCommonTemplateData(req);

      const templateData = {
        ...commonData,
        title: 'Configuration Management',
        message: req.query.success,
        error: req.query.error,
        defaultProperties,
        customProperties,
        mergedProperties,
        csrfToken: req.session.csrfToken
      };

      res.render('admin-configuration', templateData);
    } catch (err: unknown) {
      logger.error('Error loading admin configuration:', err);
      res.status(500).send('Error loading configuration management');
    }
  }

  /**
   * Update configuration property
   */
  async adminUpdateConfiguration(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const { property, value } = req.body;

      if (!property) {
        return res.status(400).json({ error: 'Property name is required' });
      }

      // Validate property name (must start with ngdpbase.)
      if (!property.startsWith('ngdpbase.') && !property.startsWith('log4j.')) {
        return res
          .status(400)
          .json({ error: 'Property must start with ngdpbase. or log4j.' });
      }

      // Attempt JSON parse so array/object values entered in the UI (e.g. ["/a","/b"]) are
      // stored as native JSON types rather than raw strings.
      let parsedValue: unknown = value;
      if (typeof value === 'string') {
        try { parsedValue = JSON.parse(value); } catch { /* keep as string */ }
      }
      await configManager.setProperty(property, parsedValue);

      // Return JSON for AJAX requests, redirect for regular form submissions
      const wantsJson = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
      if (wantsJson) {
        return res.json({ success: true, message: 'Configuration updated successfully' });
      }
      return res.redirect(
        '/admin/configuration?success=Configuration updated successfully'
      );
    } catch (err: unknown) {
      logger.error('Error updating configuration:', err);
      const wantsJson = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
      if (wantsJson) {
        return res.status(500).json({ error: 'Failed to update configuration' });
      }
      return res.redirect('/admin/configuration?error=Failed to update configuration');
    }
  }

  /**
   * Reset configuration to defaults
   */
  async adminResetConfiguration(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      await configManager.resetToDefaults();
      return res.redirect(
        '/admin/configuration?success=Configuration reset to defaults'
      );
    } catch (err: unknown) {
      logger.error('Error resetting configuration:', err);
      return res.redirect('/admin/configuration?error=Failed to reset configuration');
    }
  }

  /**
   * Admin InterWiki management page
   */
  async adminInterwiki(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access InterWiki management'
        );
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const sites = configManager.getProperty('ngdpbase.interwiki.sites', {}) as Record<string, Record<string, unknown>>;
      const enabled = configManager.getProperty('ngdpbase.interwiki.enabled', true) as boolean;
      const options = configManager.getProperty('ngdpbase.interwiki.options', {}) as Record<string, unknown>;

      const commonData = await this.getCommonTemplateData(req);

      const templateData = {
        ...commonData,
        title: 'InterWiki Management',
        message: req.query.success,
        error: req.query.error,
        sites,
        enabled,
        options,
        csrfToken: req.session.csrfToken
      };

      return res.render('admin-interwiki', templateData);
    } catch (err: unknown) {
      logger.error('Error loading admin interwiki page:', err);
      return res.status(500).send('Error loading InterWiki management');
    }
  }

  /**
   * Add or update an InterWiki site
   */
  async adminInterwikiSaveSite(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.redirect('/admin/interwiki?error=Access denied');
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const { siteName, url, description, icon, enabled, openInNewWindow, originalName } = req.body;

      if (!siteName || !(siteName as string).trim()) {
        return res.redirect('/admin/interwiki?error=Site name is required');
      }
      if (!url || !(url as string).trim()) {
        return res.redirect('/admin/interwiki?error=URL is required');
      }
      if (!(url as string).includes('%s')) {
        return res.redirect('/admin/interwiki?error=URL must contain %25s as the page placeholder');
      }

      const sites = configManager.getProperty('ngdpbase.interwiki.sites', {}) as Record<string, Record<string, unknown>>;
      const name = (siteName as string).trim();

      // If renaming, remove old key
      if (originalName && (originalName as string) !== name) {
        delete sites[originalName as string];
      }

      sites[name] = {
        url: (url as string).trim(),
        description: ((description as string) || '').trim(),
        icon: ((icon as string) || '').trim(),
        enabled: enabled === 'on' || enabled === 'true' || enabled === '1',
        openInNewWindow: openInNewWindow === 'on' || openInNewWindow === 'true' || openInNewWindow === '1'
      };

      await configManager.setProperty('ngdpbase.interwiki.sites', sites);
      return res.redirect('/admin/interwiki?success=Site saved. Restart required for changes to take effect.');
    } catch (err: unknown) {
      logger.error('Error saving interwiki site:', err);
      return res.redirect('/admin/interwiki?error=Failed to save site');
    }
  }

  /**
   * Delete an InterWiki site
   */
  async adminInterwikiDeleteSite(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.redirect('/admin/interwiki?error=Access denied');
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const siteName = decodeURIComponent(req.params.siteName);
      const sites = configManager.getProperty('ngdpbase.interwiki.sites', {}) as Record<string, Record<string, unknown>>;

      if (!sites[siteName]) {
        return res.redirect(`/admin/interwiki?error=Site not found: ${siteName}`);
      }

      delete sites[siteName];
      await configManager.setProperty('ngdpbase.interwiki.sites', sites);
      return res.redirect('/admin/interwiki?success=Site deleted. Restart required for changes to take effect.');
    } catch (err: unknown) {
      logger.error('Error deleting interwiki site:', err);
      return res.redirect('/admin/interwiki?error=Failed to delete site');
    }
  }

  /**
   * Save InterWiki global options
   */
  async adminInterwikiSaveOptions(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.redirect('/admin/interwiki?error=Access denied');
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const { globalEnabled, openInNewWindow, addIconIndicator, caseSensitive, showTooltips } = req.body;

      await configManager.setProperty(
        'ngdpbase.interwiki.enabled',
        globalEnabled === 'on' || globalEnabled === 'true' || globalEnabled === '1'
      );

      const currentOptions = configManager.getProperty('ngdpbase.interwiki.options', {}) as Record<string, unknown>;
      await configManager.setProperty('ngdpbase.interwiki.options', {
        ...currentOptions,
        openInNewWindow: openInNewWindow === 'on' || openInNewWindow === 'true' || openInNewWindow === '1',
        addIconIndicator: addIconIndicator === 'on' || addIconIndicator === 'true' || addIconIndicator === '1',
        caseSensitive: caseSensitive === 'on' || caseSensitive === 'true' || caseSensitive === '1',
        showTooltips: showTooltips === 'on' || showTooltips === 'true' || showTooltips === '1'
      });

      return res.redirect('/admin/interwiki?success=Options saved. Restart required for changes to take effect.');
    } catch (err: unknown) {
      logger.error('Error saving interwiki options:', err);
      return res.redirect('/admin/interwiki?error=Failed to save options');
    }
  }

  /**
   * Admin variable management page
   */
  async adminVariables(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access variable management'
        );
      }

      const variableManager = this.engine.getManager('VariableManager');
      if (!variableManager) {
        return await this.renderError(
          req,
          res,
          500,
          'Service Unavailable',
          'VariableManager not available'
        );
      }

      const debugInfo = variableManager.getDebugInfo();
      const commonData = await this.getCommonTemplateData(req);
      const leftMenuContent = await this.getLeftMenu();

      const templateData = {
        ...commonData,
        title: 'Variable Management',
        message: req.query.success,
        error: req.query.error,
        variableManager: variableManager,
        systemVariables: debugInfo.systemVariables,
        contextualVariables: debugInfo.contextualVariables,
        debugInfo: {
          systemVariables: debugInfo.systemVariables.length,
          contextualVariables: debugInfo.contextualVariables.length,
          totalVariables: debugInfo.totalVariables
        },
        leftMenu: leftMenuContent,
        csrfToken: req.session.csrfToken
      };

      return res.render('admin-variables', templateData);
    } catch (err: unknown) {
      logger.error('Error loading admin variables:', err);
      return res.status(500).send('Error loading variable management');
    }
  }

  /**
   * Test variable expansion
   */
  async adminTestVariables(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const variableManager = this.engine.getManager('VariableManager');
      if (!variableManager) {
        return res.status(500).json({ error: 'VariableManager not available' });
      }

      const { content, pageName } = req.body;

      const context = {
        userContext: currentUser,
        pageName: pageName || 'Test Page'
      };

      const result = variableManager.expandVariables(content || '', context);

      // Redirect back with the result
      const debugInfo = variableManager.getDebugInfo();
      const templateData = {
        title: 'Variable Management',
        user: currentUser,
        message: 'Variable expansion test completed',
        testResult: result,
        variableManager: variableManager,
        systemVariables: debugInfo.systemVariables,
        contextualVariables: debugInfo.contextualVariables,
        debugInfo: {
          systemVariables: debugInfo.systemVariables.length,
          contextualVariables: debugInfo.contextualVariables.length,
          totalVariables: debugInfo.totalVariables
        },
        csrfToken: req.session.csrfToken
      };

      return res.render('admin-variables', templateData);
    } catch (err: unknown) {
      logger.error('Error testing variables:', err);
      return res.redirect('/admin/variables?error=Failed to test variables');
    }
  }

  /**
   * Admin settings page
   */
  async adminSettings(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access system settings'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const configManager = this.engine.getManager('ConfigurationManager');

      const activeTheme = configManager?.getProperty('ngdpbase.theme.active', 'default');
      const themesDir = path.join(__dirname, '../../../themes');
      const availableThemes = ThemeManager.listAvailable(themesDir);
      const themeManager = getThemeManager(activeTheme, themesDir);

      const maxFileSizeBytes = Number(configManager?.getProperty('ngdpbase.attachment.maxsize', 10485760)) || 10485760;
      const sessionMaxAgeMs = Number(configManager?.getProperty('ngdpbase.session.max-age', 86400000)) || 86400000;

      const settings = {
        systemName: configManager?.getProperty('ngdpbase.application-name', 'ngdpbase'),
        version: configManager?.getProperty('ngdpbase.version', ''),
        activeTheme,
        availableThemes,
        themeInfo: themeManager.paths.themeInfo,
        maxFileSizeMB: Math.round(maxFileSizeBytes / (1024 * 1024)),
        allowRegistration: configManager?.getProperty('ngdpbase.user.allowregistration', true),
        sessionTimeoutHours: Math.round(sessionMaxAgeMs / 3600000)
      };

      return res.render('admin-settings', {
        ...commonData,
        title: 'System Settings',
        settings,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null,
        restartRequired: req.query.restart === '1'
      });
    } catch (err: unknown) {
      logger.error('Error loading admin settings:', err);
      return res.status(500).send('Error loading system settings');
    }
  }

  async adminUpdateTheme(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).redirect('/admin/settings?error=Access+denied');
      }

      const { theme } = req.body as { theme: string };
      if (!theme || typeof theme !== 'string') {
        return res.redirect('/admin/settings?error=Invalid+theme+selection');
      }

      const themesDir = path.join(__dirname, '../../../themes');
      const available = ThemeManager.listAvailable(themesDir);
      if (!available.includes(theme)) {
        return res.redirect('/admin/settings?error=Theme+not+found');
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      await configManager.setProperty('ngdpbase.theme.active', theme);

      logger.info(`Admin theme changed to "${theme}" by ${currentUser.username}`);
      return res.redirect('/admin/settings?success=Theme+updated+to+' + encodeURIComponent(theme));
    } catch (err: unknown) {
      logger.error('Error updating theme:', err);
      return res.redirect('/admin/settings?error=Failed+to+update+theme');
    }
  }

  async adminUpdateGeneralSettings(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.redirect('/admin/settings?error=Access+denied');
      }

      const body = req.body as { maxFileSizeMB?: string; sessionTimeoutHours?: string; allowRegistration?: string };
      const configManager = this.engine.getManager('ConfigurationManager');

      const maxFileSizeMB = parseInt(body.maxFileSizeMB || '10', 10);
      if (!isNaN(maxFileSizeMB) && maxFileSizeMB > 0) {
        await configManager.setProperty('ngdpbase.attachment.maxsize', maxFileSizeMB * 1024 * 1024);
      }

      const sessionTimeoutHours = parseInt(body.sessionTimeoutHours || '24', 10);
      if (!isNaN(sessionTimeoutHours) && sessionTimeoutHours > 0) {
        await configManager.setProperty('ngdpbase.session.max-age', sessionTimeoutHours * 3600000);
      }

      await configManager.setProperty('ngdpbase.user.allowregistration', body.allowRegistration === 'on');

      logger.info(`Admin general settings updated by ${currentUser.username}`);
      return res.redirect('/admin/settings?success=Settings+saved&restart=1');
    } catch (err: unknown) {
      logger.error('Error updating general settings:', err);
      return res.redirect('/admin/settings?error=Failed+to+save+settings');
    }
  }

  /**
   * Restart the system (PM2)
   * Dynamically detects PM2 app name to match server.sh convention
   */
  async adminRestart(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to restart the system'
        });
      }



      // Detect PM2 app name dynamically (matches server.sh convention: ngdpbase-$DIR_NAME)
      const dirName = path.basename(process.cwd());
      const expectedAppName = `ngdpbase-${dirName}`;

      logger.info(`System restart requested by: ${currentUser.username}`);

      // First, try to find actual PM2 app name from running processes
      exec('pm2 jlist', (listError: Error | null, listStdout: string) => {
        let appName = expectedAppName;

        if (!listError && listStdout) {
          try {
            const apps = JSON.parse(listStdout);
            // Find app matching our expected name or any ngdpbase app
            const matchingApp = apps.find((app: { name: string }) =>
              app.name === expectedAppName ||
              app.name.startsWith('ngdpbase')
            );
            if (matchingApp) {
              appName = matchingApp.name;
            }
          } catch {
            // JSON parse failed, use expected name
          }
        }

        logger.info(`Restarting PM2 app: ${appName}`);

        // Execute pm2 restart with detected app name
        exec(`pm2 restart "${appName}"`, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            logger.error(`Restart error: ${getErrorMessage(error)}`);
            return;
          }
          if (stderr) {
            logger.error(`Restart stderr: ${stderr}`);
          }
          logger.info(`Restart output: ${stdout}`);
        });
      });

      // Send response immediately before restart
      return res.json({
        success: true,
        message: 'System is restarting...'
      });
    } catch (err: unknown) {
      logger.error('Error restarting system:', err);
      return res.status(500).json({
        success: false,
        error: 'Error restarting system'
      });
    }
  }

  /**
   * Admin reindex - enqueues the pages.reindex background job and returns immediately.
   */
  async adminReindex(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to reindex pages'
        });
      }

      logger.info(`Page reindex requested by: ${currentUser.username}`);

      const jobManager = this.engine.getManager('BackgroundJobManager');
      const runId = await jobManager.enqueue('pages.reindex');
      return res.status(202).json({ runId });
    } catch (err: unknown) {
      logger.error('Error enqueueing reindex job:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error starting reindex'
      });
    }
  }

  /**
   * SSE endpoint for admin real-time events (e.g. required-page-modified).
   * Keeps the connection open and pushes events via pushAdminEvent().
   * Only accessible to authenticated admins.
   */
  adminEvents(req: Request, res: Response): void {
    const wikiContext = this.createWikiContext(req);
    const currentUser = wikiContext.userContext;

    // Auth check — must be a logged-in admin. Fire-and-forget async check then stream.
    void (async () => {
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        res.status(403).end();
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Send an initial heartbeat so the client knows it's connected
      res.write(': connected\n\n');

      this.sseAdminClients.add(res);

      // Keep alive every 30s (prevents proxy timeouts)
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
      }, 30_000);

      req.on('close', () => {
        clearInterval(keepAlive);
        this.sseAdminClients.delete(res);
      });
    })();
  }

  /**
   * Admin required-pages sync — compare required-pages/ source against live data/pages/
   */
  async adminRequiredPages(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const configManager = this.engine.getManager('ConfigurationManager');



      const requiredDirRaw: string = configManager.getProperty(
        'ngdpbase.page.provider.filesystem.requiredpagesdir',
        './required-pages'
      );
      const requiredDirResolved = path.isAbsolute(requiredDirRaw)
        ? requiredDirRaw
        : path.join(process.cwd(), requiredDirRaw);
      const pagesDirResolved: string = configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );

      const allFiles: string[] = await fse.readdir(requiredDirResolved);
      const mdFiles = allFiles.filter((f: string) => f.endsWith('.md'));

      const validationManager = this.engine.getManager('ValidationManager');

      // Fields that legitimately diverge between source and live (set by the wiki on
      // save/sync) — strip before comparing so cosmetic differences don't inflate counts.
      const VOLATILE_FRONTMATTER = ['lastModified', 'user-modified', 'editor'];
      const normalizeForCompare = (raw: string): string => {
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        const stable = { ...parsed.data };
        for (const f of VOLATILE_FRONTMATTER) delete stable[f];
        return matter.stringify(parsed.content, stable);
      };

      const comparison: Array<{
        uuid: string;
        title: string;
        slug: string;
        lastModified: string;
        status: 'new' | 'modified' | 'current' | 'uuid-mismatch';
        userModified: boolean;
        liveUuid?: string;
        titleDrift?: boolean;
        liveTitle?: string;
        affectedLinks?: number;
      }> = [];

      // Pre-load all required-pages source contents for link-drift scanning
      const allSourceContents: string[] = [];
      for (const file of mdFiles) {
        try {
          allSourceContents.push(await fse.readFile(path.join(requiredDirResolved, file), 'utf8'));
        } catch { /* skip unreadable files */ }
      }

      for (const file of mdFiles) {
        const uuid = path.basename(file, '.md');
        const sourcePath = path.join(requiredDirResolved, file);
        const sourceContent: string = await fse.readFile(sourcePath, 'utf8');

        let title = uuid;
        let slug = '';
        let lastModified = '';
        try {
          const { data } = matter(sourceContent);
          title = (data.title as string) || uuid;
          slug = (data.slug as string) || '';
          lastModified = (data.lastModified as string) || '';
        } catch {
          // use defaults
        }
        // Fall back to filesystem mtime when front-matter has no lastModified
        if (!lastModified) {
          try {
            const stat = await fse.stat(sourcePath);
            lastModified = stat.mtime.toISOString();
          } catch {
            // leave empty
          }
        }

        const destPath = path.join(pagesDirResolved, file);
        let status: 'new' | 'modified' | 'current' | 'uuid-mismatch';
        let userModified = false;
        let liveUuid: string | undefined;
        let titleDrift = false;
        let liveTitle: string | undefined;
        let affectedLinks = 0;

        if (!(await fse.pathExists(destPath))) {
          status = 'new';
          // Check for slug/title conflict: page exists under a different UUID
          const conflict = await validationManager.checkConflicts(uuid, title, slug);
          if (conflict.hasConflict && conflict.conflictingUuid) {
            status = 'uuid-mismatch';
            liveUuid = conflict.conflictingUuid;
          }
        } else {
          const destContent: string = await fse.readFile(destPath, 'utf8');
          let destData: Record<string, unknown> = {};
          try {
            ({ data: destData } = matter(destContent));
          } catch (yamlErr) {
            // Live copy has malformed YAML frontmatter (e.g. missing closing ---).
            // Treat as modified so the admin can re-sync to heal it.
            logger.warn(`[adminRequiredPages] malformed frontmatter in live copy ${uuid}: ${String(yamlErr)}`);
            status = 'modified';
            comparison.push({ uuid, title, slug, lastModified, status, userModified, liveUuid, titleDrift, liveTitle, affectedLinks });
            continue;
          }
          // Auto-heal System/Admin → system (invalid legacy category)
          if ((destData['system-category'] as string | undefined)?.toLowerCase() === 'system/admin') {
            destData['system-category'] = 'system';
            const healed = matter.stringify(destContent.replace(/^---[\s\S]*?---\n?/, ''), destData);
            await fse.writeFile(destPath, healed, 'utf8');
            logger.info(`auto-healed system-category System/Admin → system for ${uuid}`);
          }
          // Track whether a human has edited the live copy (separate from modified/current status).
          userModified = destData['user-modified'] === true;
          // Compare normalized content — strip volatile frontmatter fields so cosmetic
          // divergence (lastModified, user-modified, editor) doesn't inflate the count.
          status = normalizeForCompare(sourceContent) !== normalizeForCompare(destContent)
            ? 'modified'
            : 'current';

          // Detect title drift: source title vs live title
          const liveTitleRaw = (destData.title as string | undefined) || '';
          if (liveTitleRaw && liveTitleRaw !== title) {
            titleDrift = true;
            liveTitle = liveTitleRaw;
            // Count other required-pages source files that still link to the live title
            const linkPattern = new RegExp(`\\[${liveTitleRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
            affectedLinks = allSourceContents.reduce((n, src) => n + (linkPattern.test(src) ? 1 : 0), 0);
          }
        }

        comparison.push({ uuid, title, slug, lastModified, status, userModified, liveUuid, titleDrift, liveTitle, affectedLinks });
      }

      const statusOrder: Record<string, number> = { 'uuid-mismatch': 0, new: 1, modified: 2, current: 3 };
      comparison.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

      const counts = {
        uuidMismatch: comparison.filter(p => p.status === 'uuid-mismatch').length,
        new: comparison.filter(p => p.status === 'new').length,
        modified: comparison.filter(p => p.status === 'modified').length,
        current: comparison.filter(p => p.status === 'current').length,
        titleDrift: comparison.filter(p => p.titleDrift).length
      };

      // Scan enabled addon pages/ directories using the same comparison logic
      const addonComparison: Array<{
        addonName: string;
        uuid: string;
        title: string;
        slug: string;
        lastModified: string;
        status: 'new' | 'modified' | 'current';
        userModified: boolean;
      }> = [];

      const addonsManager = this.engine.getManager('AddonsManager');
      if (addonsManager) {
        const addonDirs = addonsManager.getEnabledAddonPagesDirectories();
        for (const { name: addonName, pagesDir } of addonDirs) {
          if (!(await fse.pathExists(pagesDir))) continue;
          const addonFiles: string[] = (await fse.readdir(pagesDir)).filter((f: string) => f.endsWith('.md'));

          for (const file of addonFiles) {
            const uuid = path.basename(file, '.md');
            const sourcePath = path.join(pagesDir, file);
            const sourceContent: string = await fse.readFile(sourcePath, 'utf8');

            let title = uuid;
            let slug = '';
            let lastModified = '';
            try {
              const { data } = matter(sourceContent);
              title = (data.title as string) || uuid;
              slug = (data.slug as string) || '';
              lastModified = (data.lastModified as string) || '';
            } catch { /* use defaults */ }
            if (!lastModified) {
              try {
                const stat = await fse.stat(sourcePath);
                lastModified = stat.mtime.toISOString();
              } catch { /* leave empty */ }
            }

            const destPath = path.join(pagesDirResolved, file);
            let status: 'new' | 'modified' | 'current';
            let userModified = false;

            if (!(await fse.pathExists(destPath))) {
              status = 'new';
            } else {
              const destContent: string = await fse.readFile(destPath, 'utf8');
              const { data: destData } = matter(destContent);
              userModified = destData['user-modified'] === true;
              status = normalizeForCompare(sourceContent) !== normalizeForCompare(destContent)
                ? 'modified'
                : 'current';
            }

            addonComparison.push({ addonName, uuid, title, slug, lastModified, status, userModified });
          }
        }
        addonComparison.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
      }

      const addonCounts = {
        new: addonComparison.filter(p => p.status === 'new').length,
        modified: addonComparison.filter(p => p.status === 'modified').length,
        current: addonComparison.filter(p => p.status === 'current').length
      };

      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-required-pages', {
        ...commonData,
        title: 'Required Pages Sync',
        comparison,
        counts,
        addonComparison,
        addonCounts,
        csrfToken: req.session.csrfToken,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null
      });
    } catch (err: unknown) {
      logger.error('Error loading required pages sync:', err);
      return res.status(500).send('Error loading required pages sync');
    }
  }

  /**
   * Admin required-pages sync — copy selected pages from required-pages/ to data/pages/
   */
  async adminSyncRequiredPages(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const configManager = this.engine.getManager('ConfigurationManager');


      const requiredDirRaw: string = configManager.getProperty(
        'ngdpbase.page.provider.filesystem.requiredpagesdir',
        './required-pages'
      );
      const requiredDirResolved = path.isAbsolute(requiredDirRaw)
        ? requiredDirRaw
        : path.join(process.cwd(), requiredDirRaw);
      const pagesDirResolved: string = configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );



      const body = req.body as {
        uuids?: string[];
        force?: boolean;
        reconcile?: { sourceUuid: string; liveUuid: string }[];
        adoptUuid?: { sourceUuid: string; liveUuid: string }[];
        pushToSource?: string[];
      };
      const uuids = Array.isArray(body.uuids) ? body.uuids : [];
      const forceSync = body.force === true;
      const reconcileItems = Array.isArray(body.reconcile) ? body.reconcile : [];
      const adoptItems = Array.isArray(body.adoptUuid) ? body.adoptUuid : [];
      const pushToSourceUuids = Array.isArray(body.pushToSource) ? body.pushToSource : [];

      if (uuids.length === 0 && reconcileItems.length === 0 && adoptItems.length === 0 && pushToSourceUuids.length === 0) {
        return res.status(400).json({ success: false, error: 'No pages selected' });
      }

      await fse.ensureDir(pagesDirResolved);

      // Build a combined UUID → source-file-path map covering both required-pages/ and
      // enabled addon pages/ directories. Required-pages takes precedence on collision.
      const sourceFileMap = new Map<string, string>();
      const addonsManagerPost = this.engine.getManager('AddonsManager');
      if (addonsManagerPost) {
        for (const { pagesDir } of addonsManagerPost.getEnabledAddonPagesDirectories()) {
          if (await fse.pathExists(pagesDir)) {
            for (const f of (await fse.readdir(pagesDir))) {
              if (f.endsWith('.md')) sourceFileMap.set(path.basename(f, '.md'), path.join(pagesDir, f));
            }
          }
        }
      }
      // Required-pages overrides addon pages on UUID collision
      for (const f of (await fse.readdir(requiredDirResolved))) {
        if (f.endsWith('.md')) sourceFileMap.set(path.basename(f, '.md'), path.join(requiredDirResolved, f));
      }

      const synced: string[] = [];
      const protected_: string[] = [];

      /**
       * Write source content to dest, stripping user-modified so a synced page
       * immediately shows as 'current' on the next Required Pages Sync load.
       */
      const syncFile = async (srcPath: string, dstPath: string): Promise<void> => {
        const raw: string = await fse.readFile(srcPath, 'utf8');
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        delete parsed.data['user-modified'];
        const cleaned: string = matter.stringify(parsed.content, parsed.data);
        await fse.writeFile(dstPath, cleaned, 'utf8');
      };

      // Normal sync: copy source UUID file to pages dir (stripping user-modified).
      // Pages with user-modified: true were edited in the wiki UI and are protected —
      // skip them and return them in the protected list so the caller can inform the user.
      for (const uuid of uuids) {
        const fileName = `${uuid}.md`;
        const sourcePath = sourceFileMap.get(uuid) ?? path.join(requiredDirResolved, fileName);
        const destPath = path.join(pagesDirResolved, fileName);

        if (await fse.pathExists(sourcePath)) {
          if (!forceSync && await fse.pathExists(destPath)) {
            const liveRaw: string = await fse.readFile(destPath, 'utf8');
            const liveParsed = matter(liveRaw) as { data: Record<string, unknown> };
            if (liveParsed.data['user-modified'] === true) {
              protected_.push(uuid);
              continue;
            }
          }
          await syncFile(sourcePath, destPath);
          synced.push(uuid);
        }
      }

      // Reconcile uuid-mismatch: create canonical UUID file from source, remove the old UUID file
      for (const { sourceUuid, liveUuid } of reconcileItems) {
        const sourcePath = path.join(requiredDirResolved, `${sourceUuid}.md`);
        const canonicalPath = path.join(pagesDirResolved, `${sourceUuid}.md`);
        const oldPath = path.join(pagesDirResolved, `${liveUuid}.md`);

        if (await fse.pathExists(sourcePath)) {
          await syncFile(sourcePath, canonicalPath);
          if (liveUuid !== sourceUuid && (await fse.pathExists(oldPath))) {
            await fse.remove(oldPath);
          }
          synced.push(sourceUuid);
        }
      }

      // Adopt UUID: preserve live page content, rename file to canonical UUID.
      // Updates the uuid frontmatter field and writes to data/pages/{sourceUuid}.md.
      // Falls back to required-pages/{liveUuid}.md if not found in data/pages/ (stale copy).
      // Also always removes stale required-pages/{liveUuid}.md copies when found.
      const adoptedUuids: Array<{ sourceUuid: string; liveUuid: string }> = [];
      for (const { sourceUuid, liveUuid } of adoptItems) {
        const oldDataPath = path.join(pagesDirResolved, `${liveUuid}.md`);
        const oldRequiredPath = path.join(requiredDirResolved, `${liveUuid}.md`);
        const canonicalPath = path.join(pagesDirResolved, `${sourceUuid}.md`);

        let oldPath: string | null = null;
        let removeOldData = false;
        if (await fse.pathExists(oldDataPath)) {
          oldPath = oldDataPath;
          removeOldData = true;
        } else if (await fse.pathExists(oldRequiredPath)) {
          // Live file is a stale copy in required-pages/ — write canonical to data/pages/
          // and remove the stale required-pages copy to prevent it loading on restart.
          oldPath = oldRequiredPath;
        }

        if (oldPath) {
          const liveContent: string = await fse.readFile(oldPath, 'utf8');
          const parsed = matter(liveContent) as { data: Record<string, unknown>; content: string };
          // Update the UUID in frontmatter to the canonical source UUID
          parsed.data.uuid = sourceUuid;
          const updatedContent: string = matter.stringify(parsed.content, parsed.data);
          await fse.ensureDir(pagesDirResolved);
          await fse.writeFile(canonicalPath, updatedContent, 'utf8');
          if (liveUuid !== sourceUuid) {
            // Remove old NAS file if it existed there
            if (removeOldData) {
              await fse.remove(oldDataPath);
            }
            // Always clean up stale required-pages copy (may exist alongside a NAS copy)
            if (await fse.pathExists(oldRequiredPath)) {
              await fse.remove(oldRequiredPath);
              logger.info(`Adopt UUID: removed stale required-pages copy ${liveUuid}`);
            }
          }
          adoptedUuids.push({ sourceUuid, liveUuid });
          synced.push(sourceUuid);
        } else {
          logger.warn(`Adopt UUID: live file not found for liveUuid=${liveUuid}, skipping`);
        }
      }

      // Push live edits back to required-pages/ source (live → source direction).
      // Strip user-modified so the source is canonical and won't show as modified on next sync.
      for (const uuid of pushToSourceUuids) {
        const fileName = `${uuid}.md`;
        const livePath = path.join(pagesDirResolved, fileName);
        const sourcePath = path.join(requiredDirResolved, fileName);
        if (await fse.pathExists(livePath)) {
          const raw: string = await fse.readFile(livePath, 'utf8');
          const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
          delete parsed.data['user-modified'];
          const cleaned: string = matter.stringify(parsed.content, parsed.data);
          await fse.writeFile(sourcePath, cleaned, 'utf8');
          synced.push(uuid);
          logger.info(`Required pages push-to-source: ${uuid} by ${currentUser.username}`);
        } else {
          logger.warn(`Push to source: live file not found for ${uuid}, skipping`);
        }
      }

      const pageManager = this.engine.getManager('PageManager');
      await pageManager.refreshPageList();

      // Update page-index.json for each adopted UUID so next restart uses fast init.
      // Access VersioningFileProvider directly via the provider property.
      if (adoptedUuids.length > 0) {
        const provider = (pageManager as unknown as { provider: { renamePageInIndex?: (o: string, n: string) => Promise<void> } }).provider;
        if (provider?.renamePageInIndex) {
          for (const { sourceUuid, liveUuid } of adoptedUuids) {
            await provider.renamePageInIndex(liveUuid, sourceUuid).catch((err: unknown) => {
              logger.warn(`Adopt UUID: failed to update page index for ${liveUuid} → ${sourceUuid}:`, err);
            });
          }
        }
      }
      // Rebuild search index in the background — avoid blocking the response on a 14K-page corpus
      const searchManager = this.engine.getManager('SearchManager');
      searchManager.rebuildIndex().catch((err: unknown) => {
        logger.warn('Required pages sync: background search index rebuild failed:', err);
      });

      logger.info(
        `Required pages sync: ${synced.length} synced, ${protected_.length} protected (user-modified) by ${currentUser.username}`
      );

      const parts: string[] = [];
      if (synced.length > 0) parts.push(`${synced.length} page${synced.length !== 1 ? 's' : ''} synced`);
      if (protected_.length > 0) parts.push(`${protected_.length} skipped (user-edited — use Push to Source or diff first)`);

      return res.json({
        success: true,
        message: parts.join('; ') || 'Nothing to sync',
        synced: synced.length,
        uuids: synced,
        protected: protected_
      });
    } catch (err: unknown) {
      logger.error('Error syncing required pages:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error syncing required pages'
      });
    }
  }

  /**
   * Resolve diff content for two sides.
   * source=required: compares required-pages/{uuid} vs data/pages/{uuid}
   * a+b: compares two live pages by UUID or slug
   */
  private async resolveDiffContent(
    req: Request
  ): Promise<{
    contentA: string;
    contentB: string;
    titleA: string;
    titleB: string;
    uuidA: string;
    uuidB: string;
  } | null> {
    const configManager = this.engine.getManager('ConfigurationManager');
    const pageManager = this.engine.getManager('PageManager');

    const requiredDirRaw: string = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.requiredpagesdir',
      './required-pages'
    );
    const requiredDirResolved = path.isAbsolute(requiredDirRaw)
      ? requiredDirRaw
      : path.join(process.cwd(), requiredDirRaw);
    const pagesDirResolved: string = configManager.getResolvedDataPath(
      'ngdpbase.page.provider.filesystem.storagedir',
      './data/pages'
    );

    const { uuid, source, a, b, liveUuid } = req.query as Record<string, string>;

    if (uuid && source === 'required') {
      // Compare required-pages source vs live page.
      // liveUuid param used for uuid-mismatch case (different UUID, same slug).
      const sourcePath = path.join(requiredDirResolved, `${uuid}.md`);
      const destUuid = liveUuid || uuid;
      const destPath = path.join(pagesDirResolved, `${destUuid}.md`);

      if (!(await fse.pathExists(sourcePath))) return null;

      const contentA: string = await fse.readFile(sourcePath, 'utf8');
      let contentB = '';
      if (await fse.pathExists(destPath)) {
        contentB = await fse.readFile(destPath, 'utf8');
      }

      let titleA = uuid;
      let titleB = destUuid;
      try {
        titleA = (matter(contentA).data.title as string) || uuid;
        titleB = contentB ? (matter(contentB).data.title as string) || destUuid : destUuid;
      } catch {
        // use defaults
      }

      const liveSuffix = liveUuid ? ` (live — UUID: ${liveUuid})` : ' (live)';
      return {
        contentA,
        contentB,
        titleA: `${titleA} (source)`,
        titleB: contentB ? `${titleB}${liveSuffix}` : `${titleB} (not yet installed)`,
        uuidA: uuid,
        uuidB: destUuid
      };
    }

    if (a && b) {
      // Compare two live pages by UUID or slug
      const pageA = await pageManager.getPage(a);
      const pageB = await pageManager.getPage(b);

      if (!pageA || !pageB) return null;

      return {
        contentA: pageA.content || '',
        contentB: pageB.content || '',
        titleA: pageA.metadata?.title || pageA.title || a,
        titleB: pageB.metadata?.title || pageB.title || b,
        uuidA: a,
        uuidB: b
      };
    }

    return null;
  }

  /**
   * Admin diff — full-page view comparing two pages or required-pages source vs live
   * GET /admin/diff?uuid={uuid}&source=required
   * GET /admin/diff?a={uuid}&b={uuid}
   */
  async adminDiff(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const resolved = await this.resolveDiffContent(req);
      if (!resolved) {
        return res.status(400).send('Could not resolve pages for comparison');
      }


      const diffString: string = createPatch(
        resolved.titleA,
        resolved.contentA,
        resolved.contentB,
        resolved.titleA,
        resolved.titleB
      );

      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-diff', {
        ...commonData,
        title: `Diff: ${resolved.titleA} vs ${resolved.titleB}`,
        titleA: resolved.titleA,
        titleB: resolved.titleB,
        diffString,
        uuidA: resolved.uuidA,
        uuidB: resolved.uuidB,
        sourceMode: req.query.source === 'required'
      });
    } catch (err: unknown) {
      logger.error('Error computing diff:', err);
      return res.status(500).send('Error computing diff');
    }
  }

  /**
   * Admin diff API — returns diff data as JSON for modal use
   * GET /api/admin/diff?uuid={uuid}&source=required
   * GET /api/admin/diff?a={uuid}&b={uuid}
   */
  async adminDiffApi(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const resolved = await this.resolveDiffContent(req);
      if (!resolved) {
        return res.status(400).json({ error: 'Could not resolve pages for comparison' });
      }


      const diffString: string = createPatch(
        resolved.titleA,
        resolved.contentA,
        resolved.contentB,
        resolved.titleA,
        resolved.titleB
      );

      return res.json({
        success: true,
        diffString,
        titleA: resolved.titleA,
        titleB: resolved.titleB,
        uuidA: resolved.uuidA,
        uuidB: resolved.uuidB
      });
    } catch (err: unknown) {
      logger.error('Error computing diff (API):', err);
      return res.status(500).json({ error: getErrorMessage(err) || 'Error computing diff' });
    }
  }

  /**
   * Admin import page - render import UI with converter info
   */
  async adminImport(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access the import tool'
        );
      }

      const importManager = this.engine.getManager('ImportManager');
      const converters = importManager.getConverterInfo();
      const commonData = await this.getCommonTemplateData(req);

      return res.render('admin-import', {
        ...commonData,
        title: 'Import Pages',
        converters,
        success: req.query.success || null,
        error: req.query.error || null,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading admin import:', err);
      return res.status(500).send('Error loading import page');
    }
  }

  /**
   * Admin attachments browser page
   */
  async adminAttachments(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      if (!wikiContext.hasRole('admin', 'editor')) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access the attachment browser'
        );
      }

      const attachmentManager = this.engine.getManager('AttachmentManager');
      const attachments = await attachmentManager.getAllAttachments();
      const commonData = await this.getCommonTemplateData(req);

      return res.render('admin-attachments', {
        ...commonData,
        title: 'Attachments',
        attachments
      });
    } catch (err: unknown) {
      logger.error('Error loading admin attachments:', err);
      return res.status(500).send('Error loading attachments page');
    }
  }

  /**
   * Admin attachments API - return JSON for client-side refresh
   */
  async adminAttachmentsApi(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      if (!wikiContext.hasRole('admin', 'editor')) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const attachmentManager = this.engine.getManager('AttachmentManager');
      const attachments = await attachmentManager.getAllAttachments();

      return res.json({ success: true, attachments });
    } catch (err: unknown) {
      logger.error('Error fetching attachments API:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
    }
  }

  /**
   * Non-admin attachment browser - accessible to editor/contributor roles
   */
  async browseAttachments(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      if (!wikiContext.hasRole('admin', 'editor', 'contributor')) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You must be logged in with editor or contributor role to browse attachments'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const pickerKw = await this.getPickerKeywordCatalogs();
      const pickerYears = await this.getPickerYears();

      return res.render('browse-attachments', {
        ...commonData,
        title: 'Browse Assets',
        assetPickerUserKeywords:   pickerKw.userKeywords,
        assetPickerSystemKeywords: pickerKw.systemKeywords,
        assetPickerCategories:     pickerKw.categories,
        assetPickerYears:          pickerYears
      });
    } catch (err: unknown) {
      logger.error('Error loading attachment browser:', err);
      return res.status(500).send('Error loading attachments page');
    }
  }

  /**
   * Project a page name / SearchResult into the AssetRecord-ish shape the
   * asset-picker consumes. Pure (no `this`); shared by the `types=page`
   * branch and the `#742` all-sources branch so both stay in lockstep.
   * Canonical `/view/` URL per the no-wiki convention.
   */
  private readonly pageToAssetRecord = (pageName: string, title?: string, excerpt?: string, kw?: string[], lastModified?: string, systemCategory?: string) => ({
    id: pageName,
    providerId: 'page',
    filename: pageName,
    name: title || pageName,
    description: excerpt || title || pageName,
    keywords: kw ?? [],
    encodingFormat: 'text/wiki',
    url: '/view/' + encodeURIComponent(pageName),
    mentions: [],
    metadata: {
      ...(lastModified ? { lastModified } : {}),
      ...(systemCategory ? { systemCategory } : {})
    },
    insertSnippet: '[' + pageName + ']'
  });

  /**
   * GET /api/assets/search
   *
   * Unified search across AttachmentManager and MediaManager with pagination.
   *
   * Query parameters:
   *   q        — free-text query (optional; empty returns all)
   *   types    — comma-separated: "attachment", "media", or both (default both)
   *   year     — four-digit year filter for media results (optional)
   *   pageSize — results per page (default 48, max 200)
   *   offset   — zero-based offset into result set (default 0)
   *   sort     — sort field: "date" (default) or "caption"
   *   order    — sort direction: "asc" (default) or "desc"
   *
   * Response: { success, results, total, hasMore }
   *
   * Requires editor, contributor, or admin role.
   */
  async assetSearch(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const typesParam = typeof req.query.types === 'string' ? req.query.types : '';
      const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 48, 200);
      const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
      // Sort/order parsing — applies to all branches per #700. We track the
      // tristate (undefined = caller didn't ask) because the pages branch has a
      // cheap "list all" path that we only want to keep for callers that don't
      // request a sort. The attachments/media branch below preserves its
      // existing sort='date' default by coalescing further down.
      const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : '';
      const sort: 'date' | 'caption' | undefined = sortRaw === 'caption' ? 'caption' : sortRaw === 'date' ? 'date' : undefined;
      const order: 'asc' | 'desc' = req.query.order === 'desc' ? 'desc' : 'asc';
      // #720: file-format facet (Files-only). Live filter — applied by
      // BaseMediaProvider / BasicAttachmentProvider. Hoisted so the
      // all-sources branch and the single-type asset branch share one parse.
      const mimeCategoryRaw = typeof req.query.mimeCategory === 'string' ? req.query.mimeCategory : '';
      const mimeCategory = (['image', 'video', 'audio', 'document', 'other'] as const).find(c => c === mimeCategoryRaw);
      // #745: media Year facet (Files-only). Live filter — BaseMediaProvider
      // filters by item.year. Hoisted (like mimeCategory) so the all-sources
      // branch and the single-type asset branch share one parse.
      const year = req.query.year ? parseInt(req.query.year as string, 10) || undefined : undefined;

      // #742: "All sources" (types absent or `all`) aggregates pages, users,
      // and the asset stores instead of 403'ing non-editors and returning
      // attachments/media only. Each source keeps its own access rule:
      //   pages       → always; SearchManager applies per-page ACL (anon-safe)
      //   users       → authenticated viewers only (PII; mirrors types=user)
      //   attach/media → editor asset surface only (unchanged gate)
      // Placed before the editor gate so readers get page hits — the core
      // reported gap. Single-type branches below are untouched.
      if (typesParam === '' || typesParam === 'all') {
        const fetchLimit = Math.max(200, offset + pageSize);
        const merged: Record<string, unknown>[] = [];
        let anyCapped = false;

        // Pages — SearchManager filters per-page ACL via wikiContext, so this
        // is anon-safe. Title-default recall per #739 (no category/keyword
        // filter inputs exist on the all-sources surface).
        const searchManager = this.engine.getManager('SearchManager') as {
          advancedSearchWithContext?: (ctx: unknown, opts: Record<string, unknown>) => Promise<Array<{
            name: string; title?: string; snippet?: string;
            metadata?: { systemCategory?: string; userKeywords?: string; lastModified?: string };
          }>>;
        };
        // #720/#745: a file-format or media-year facet is meaningless for
        // pages/users — when one is set, "All sources" narrows to files only.
        if (!mimeCategory && !year && searchManager?.advancedSearchWithContext) {
          const hits = await searchManager.advancedSearchWithContext(wikiContext, {
            query,
            categories: [],
            userKeywords: [],
            systemKeywords: [],
            searchIn: ['title'],
            maxResults: fetchLimit
          });
          if (hits.length >= fetchLimit) anyCapped = true;
          for (const h of hits) {
            const md = h.metadata ?? {};
            const lm = typeof md.lastModified === 'string' ? md.lastModified : undefined;
            const kw = typeof md.userKeywords === 'string'
              ? md.userKeywords.split(',').map(s => s.trim()).filter(Boolean)
              : [];
            merged.push(this.pageToAssetRecord(h.name, h.title, h.snippet, kw, lm, md.systemCategory));
          }
        }

        // Users — authenticated viewers only (profile info is PII; mirrors
        // the types=user auth gate). Anonymous viewers simply get no users.
        {
          const uname = wikiContext.userContext?.username;
          const isAuthenticated = Boolean(
            wikiContext.userContext?.authenticated
            && uname
            && uname !== 'anonymous'
            && uname !== 'asserted'
          );
          const userManager = this.engine.getManager('UserManager') as {
            searchUsers?: (q: string, opts?: { limit?: number; activeOnly?: boolean }) => Promise<Array<{
              username: string; displayName?: string; profilePage?: string; avatar?: string; createdAt?: string;
            }>>;
          };
          if (!mimeCategory && !year && isAuthenticated && userManager?.searchUsers) {
            const users = await userManager.searchUsers(query, { limit: fetchLimit, activeOnly: true });
            if (users.length >= fetchLimit) anyCapped = true;
            for (const u of users) {
              const profile = u.profilePage || u.displayName || u.username;
              merged.push({
                id: u.username,
                providerId: 'user',
                filename: u.username,
                name: u.displayName || u.username,
                description: u.displayName || u.username,
                keywords: [],
                encodingFormat: 'application/user',
                url: '/view/' + encodeURIComponent(profile),
                thumbnailUrl: u.avatar,
                mentions: [],
                metadata: { username: u.username },
                insertSnippet: '[' + profile + ']'
              });
            }
          }
        }

        // Attachments + media — editor asset surface only (same role gate the
        // single-type asset branch enforces). Skipped silently for readers.
        const assetService = this.engine.getManager('AssetService');
        if (assetService && wikiContext.hasRole('admin', 'editor', 'contributor')) {
          const userRoles = wikiContext.userContext?.roles ?? [];
          const acctName = wikiContext.userContext?.username ?? '';
          const assetPage = await assetService.search({
            query,
            types: undefined,
            mimeCategory,
            year,
            pageSize: fetchLimit,
            offset: 0,
            sort: sort ?? 'date',
            order,
            wikiContext,
            userRoles,
            username: acctName
          });
          const assetResults = assetPage?.results ?? [];
          if (assetResults.length >= fetchLimit) anyCapped = true;
          for (const r of assetResults) merged.push(r as unknown as Record<string, unknown>);
        }

        // De-dupe defensively by providerId+id (sources are disjoint
        // namespaces, but a provider could in principle repeat a row).
        const seen = new Set<string>();
        const deduped = merged.filter(r => {
          const key = String(r.providerId) + ' ' + String(r.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Handler-side sort only when the caller asked (consistent with the
        // per-type branches). Otherwise preserve source grouping (pages, then
        // users, then assets) — stable and predictable for the picker.
        if (sort) {
          const orderMul = order === 'desc' ? -1 : 1;
          const sortKey = sort === 'caption'
            ? (r: Record<string, unknown>) => (typeof r.name === 'string' ? r.name.toLowerCase() : '')
            : (r: Record<string, unknown>) => {
              const m = r.metadata as { lastModified?: unknown } | undefined;
              return typeof m?.lastModified === 'string' ? m.lastModified : '';
            };
          deduped.sort((a, b) => {
            const ka = sortKey(a);
            const kb = sortKey(b);
            if (ka < kb) return -1 * orderMul;
            if (ka > kb) return 1 * orderMul;
            return 0;
          });
        }

        const total = deduped.length;
        const results = deduped.slice(offset, offset + pageSize);
        return res.json({ success: true, results, total, hasMore: offset + pageSize < total, capped: anyCapped });
      }

      // Auth model (#696):
      //   types=page  → anon allowed; SearchManager filters per-page ACL via
      //                 wikiContext. Matches the previous /search behaviour.
      //   types=user  → handled inside the user branch (search-user permission).
      //   anything else (attachments, media) → editor surface, keep the
      //                 editor/contributor/admin gate.
      const needsEditorRole = typesParam !== 'page' && typesParam !== 'user';
      if (needsEditorRole && !wikiContext.hasRole('admin', 'editor', 'contributor')) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const assetService = this.engine.getManager('AssetService');

      // AssetService is only used by the fan-out (non-page, non-user) branches.
      if (needsEditorRole && !assetService) {
        return res.status(503).json({ success: false, error: 'AssetService unavailable' });
      }

      // Pages are a separate data source — handled directly via PageManager
      // or SearchManager.advancedSearchWithContext (slice 2 of #693, #695).
      // The substring-match path is preserved for the no-filter case so the
      // common "show all pages" usage stays cheap; any of {query, category,
      // keywords, systemKeywords} switches to the advanced-search path so
      // the URL surface matches what /search supports today.
      if (typesParam === 'page') {
        const pageManager = this.engine.getManager('PageManager');
        if (!pageManager) {
          return res.status(503).json({ success: false, error: 'PageManager unavailable' });
        }

        // Normalise array-vs-string for repeated query params (mirrors
        // WikiRoutes.searchPages' parsing).
        const rawCategories = req.query.category;
        const categories = (Array.isArray(rawCategories)
          ? rawCategories.filter((c): c is string => typeof c === 'string')
          : typeof rawCategories === 'string' ? [rawCategories] : []
        ).filter(c => c.trim() !== '');

        const rawKeywords = req.query.keywords;
        const userKeywords = (Array.isArray(rawKeywords)
          ? rawKeywords.filter((k): k is string => typeof k === 'string')
          : typeof rawKeywords === 'string' ? [rawKeywords] : []
        ).filter(k => k.trim() !== '');

        const rawSystemKeywords = req.query.systemKeywords;
        const systemKeywords = (Array.isArray(rawSystemKeywords)
          ? rawSystemKeywords.filter((k): k is string => typeof k === 'string')
          : typeof rawSystemKeywords === 'string' ? [rawSystemKeywords] : []
        ).filter(k => k.trim() !== '');

        const rawSearchIn = req.query.searchIn;
        let searchIn = (Array.isArray(rawSearchIn)
          ? rawSearchIn.filter((s): s is string => typeof s === 'string')
          : typeof rawSearchIn === 'string' ? [rawSearchIn] : []
        ).filter(s => s.trim() !== '');
        // #739: page search defaults to TITLE (short, high-signal — fixes the
        // #740 "Public Education matches Boise ID" over-broad full-text recall).
        // Full text is opt-in: the asset-picker "Full text" checkbox passes
        // searchIn=all; bookmarked ?searchIn=content|all still works.
        if (searchIn.length === 0) searchIn = ['title'];

        // #745: last-modified date filter for the picker's Pages source.
        // Mirrors SearchPlugin #643 exactly — `date` = whole-day match;
        // otherwise since (lower bound) / until (upper bound). Pages carry no
        // creation timestamp, so this is last-modified only. Forwarded as
        // SearchCriteria.dateRange, which LunrSearchProvider.advancedSearch
        // (and ES) honour as inclusive whole-day UTC bounds.
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        const rawDate  = typeof req.query.date  === 'string' ? req.query.date.trim()  : '';
        const rawSince = typeof req.query.since === 'string' ? req.query.since.trim() : '';
        const rawUntil = typeof req.query.until === 'string' ? req.query.until.trim() : '';
        const dateFrom = rawDate || rawSince;
        const dateTo   = rawDate || rawUntil;
        if ((dateFrom && !dateRe.test(dateFrom)) || (dateTo && !dateRe.test(dateTo))) {
          return res.status(400).json({
            success: false,
            error: 'Invalid date parameter: use YYYY-MM-DD (since / until / date)'
          });
        }

        // #731 Slice 3: always use the SearchManager/index path for pages.
        // Slice 1 made the no-text branch ACL-safe AND rich (title / excerpt /
        // system-category / keywords / lastModified) and it is O(n) in-memory
        // (no per-page I/O). The old cheap getAllPages() path is now strictly
        // worse — names-only (the #716 empty rows) AND it returned private
        // page names with no ACL filter. (#700's sort handling is preserved
        // below; it now applies to the index path for every sort value.)

        // Project pages into the asset-picker record shape via the shared
        // helper (#742 lifted this out so the all-sources branch reuses it).
        const toAssetRecord = this.pageToAssetRecord;

        let all: ReturnType<typeof toAssetRecord>[];
        let pagesCapped = false;
        {
          // #716/#731: the provider emits `snippet` (excerpt) and nests
          // userKeywords/systemCategory/lastModified under `metadata` — the
          // prior `excerpt`/`userKeywords` top-level read silently dropped
          // them, leaving page rows title-only. Type matches the real shape.
          const searchManager = this.engine.getManager('SearchManager') as {
            advancedSearchWithContext?: (ctx: unknown, opts: Record<string, unknown>) => Promise<Array<{
              name: string; title?: string; snippet?: string;
              metadata?: { systemCategory?: string; userKeywords?: string; lastModified?: string };
            }>>;
          };
          if (!searchManager?.advancedSearchWithContext) {
            return res.status(503).json({ success: false, error: 'SearchManager unavailable' });
          }
          // Oversample so offset/pageSize slicing has enough rows. maxResults
          // is interpreted by the provider as a hard cap, so it must cover the
          // whole window the caller might paginate to.
          const fetchLimit = Math.max(200, offset + pageSize);
          const hits = await searchManager.advancedSearchWithContext(wikiContext, {
            query,
            categories,
            userKeywords,
            systemKeywords,
            searchIn,
            // #745: only attach dateRange when a bound was given so the
            // common no-date path is byte-identical to before.
            ...(dateFrom || dateTo
              ? { dateRange: {
                ...(dateFrom ? { from: dateFrom } : {}),
                ...(dateTo ? { to: dateTo } : {})
              } }
              : {}),
            maxResults: fetchLimit
          });
          // #699: detect cap saturation. Same trade-off as the user branch — when
          // saturated we don't know the true match count, so conservatively flag capped.
          pagesCapped = hits.length >= fetchLimit;
          all = hits.map(h => {
            const md = h.metadata ?? {};
            const lm = typeof md.lastModified === 'string' ? md.lastModified : undefined;
            const kw = typeof md.userKeywords === 'string'
              ? md.userKeywords.split(',').map(s => s.trim()).filter(Boolean)
              : [];
            return toAssetRecord(h.name, h.title, h.snippet, kw, lm, md.systemCategory);
          });
        }

        // #700: handler-side sort within the result window. Only fires when the
        // caller explicitly asked for one — preserves the existing default
        // ordering (search-score-desc for the filter path, provider-iteration
        // order for the cheap path) for callers that don't pass `sort`.
        // For the search path this orders the first-N-by-score rather than the
        // globally newest/first — the issue accepts this trade-off; raising
        // maxResults globally would hurt the common (filtered, top-N) case.
        if (sort) {
          const orderMul = order === 'desc' ? -1 : 1;
          const pageSortKey = sort === 'caption'
            ? (r: typeof all[number]) => r.name.toLowerCase()
            : (r: typeof all[number]) => (typeof r.metadata.lastModified === 'string' ? r.metadata.lastModified : '');
          all.sort((a, b) => {
            const ka = pageSortKey(a);
            const kb = pageSortKey(b);
            if (ka < kb) return -1 * orderMul;
            if (ka > kb) return 1 * orderMul;
            return 0;
          });
        }

        const total = all.length;
        const results = all.slice(offset, offset + pageSize);
        return res.json({ success: true, results, total, hasMore: offset + pageSize < total, capped: pagesCapped });
      }

      // Users — slice 1 of #693. Permission-gated since profile info is PII.
      // Mirrors the pages branch above: oversample, slice locally, return
      // AssetRecord shape so the asset-picker can render with no special-case
      // changes beyond a new providerId branch in _apCard().
      if (typesParam === 'user') {
        const userManager = this.engine.getManager('UserManager') as {
          searchUsers?: (q: string, opts?: { limit?: number; activeOnly?: boolean }) => Promise<Array<{
            username: string;
            displayName?: string;
            email?: string;
            profilePage?: string;
            avatar?: string;
            createdAt?: string;
          }>>;
        };
        if (!userManager?.searchUsers) {
          return res.status(503).json({ success: false, error: 'UserManager unavailable' });
        }
        // Auth gate: any authenticated user can search; anonymous viewers
        // silently get empty results (operator decision on #694 — the picker
        // surface is intentionally more permissive than /api/users/search,
        // which keeps its `search-user` permission gate for the dedicated
        // user-management surface).
        const username = wikiContext.userContext?.username;
        const isAuthenticated = Boolean(
          wikiContext.userContext?.authenticated
          && username
          && username !== 'anonymous'
          && username !== 'asserted'
        );
        if (!isAuthenticated) {
          return res.json({ success: true, results: [], total: 0, hasMore: false, capped: false });
        }
        // UserManager.searchUsers caps at its own `limit` option; oversample
        // so the slice math below has enough rows to paginate through.
        const fetchLimit = Math.max(200, offset + pageSize);
        const fetched = await userManager.searchUsers(query, { limit: fetchLimit, activeOnly: true });
        // #699: surface a `capped` flag when the cap may be hiding more matches.
        // We can't tell from a saturated result alone whether the true match
        // count is exactly fetchLimit or larger; conservatively treat saturation
        // as capped and let the UI render "showing first N" when set.
        const capped = fetched.length >= fetchLimit;
        // #700: handler-side sort within the oversample window. Only fires when
        // the caller explicitly asked for one; otherwise preserve UserManager's
        // iteration order for back-compat with callers that don't pass `sort`.
        // For corpora larger than fetchLimit this orders the first-N-by-
        // iteration, not the globally newest/first — same trade-off as the
        // pages branch above.
        let sorted = fetched;
        if (sort) {
          const userSortKey = sort === 'caption'
            ? (u: typeof fetched[number]) => (u.displayName ?? u.username).toLowerCase()
            : (u: typeof fetched[number]) => u.createdAt ?? '';
          const orderMul = order === 'desc' ? -1 : 1;
          sorted = [...fetched].sort((a, b) => {
            const ka = userSortKey(a);
            const kb = userSortKey(b);
            if (ka < kb) return -1 * orderMul;
            if (ka > kb) return 1 * orderMul;
            return 0;
          });
        }
        const total = sorted.length;
        const slice = sorted.slice(offset, offset + pageSize);
        const results = slice.map(u => {
          const pageName = u.profilePage || u.displayName || u.username;
          return {
            id: u.username,
            providerId: 'user',
            filename: u.username,
            name: u.displayName || u.username,
            description: u.displayName || u.username,
            keywords: [],
            encodingFormat: 'application/user',
            url: '/view/' + encodeURIComponent(pageName),
            thumbnailUrl: u.avatar,
            mentions: [],
            metadata: { username: u.username },
            insertSnippet: '[' + pageName + ']'
          };
        });
        return res.json({ success: true, results, total, hasMore: offset + pageSize < total, capped });
      }

      const types = typesParam
        ? (typesParam.split(',').filter(t => t === 'attachment' || t === 'media'))
        : undefined;
      // #720/#745: mimeCategory + year parsed once at the top of the handler
      // (shared with the all-sources branch); reused here.

      const userRoles = wikiContext.userContext?.roles ?? [];
      const username = wikiContext.userContext?.username ?? '';

      const dateFrom = typeof req.query.dateFrom === 'string' && req.query.dateFrom ? req.query.dateFrom : undefined;
      const dateTo = typeof req.query.dateTo === 'string' && req.query.dateTo ? req.query.dateTo : undefined;
      const dateFieldRaw = req.query.dateField as string;
      const dateField = dateFieldRaw === 'exif_datetime' ? 'exif_datetime' as const : dateFieldRaw === 'mtime' ? 'mtime' as const : undefined;
      const includeHidden = req.query.includeHidden === 'true';
      const pathPrefix = typeof req.query.pathPrefix === 'string' && req.query.pathPrefix ? req.query.pathPrefix : undefined;
      const mime = typeof req.query.mime === 'string' && req.query.mime ? req.query.mime : undefined;
      const extension = typeof req.query.extension === 'string' && req.query.extension ? req.query.extension : undefined;

      const page = await assetService.search({
        query, types, year, pageSize, offset,
        sort: sort ?? 'date', order,
        mimeCategory, wikiContext, userRoles, username,
        dateFrom, dateTo, dateField, includeHidden, pathPrefix, mime, extension
      });

      return res.json({ success: true, ...page });
    } catch (err: unknown) {
      logger.error('[AssetService] Search error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * Non-admin attachment browser API - return JSON
   */
  async browseAttachmentsApi(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      if (!wikiContext.hasRole('admin', 'editor', 'contributor')) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const attachmentManager = this.engine.getManager('AttachmentManager');
      const attachments = await attachmentManager.getAllAttachments();

      return res.json({ success: true, attachments });
    } catch (err: unknown) {
      logger.error('Error fetching attachments API:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch attachments' });
    }
  }

  /**
   * Admin delete attachment from browser - admin only
   */
  async adminDeleteAttachmentFromBrowser(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!wikiContext.hasRole('admin')) {
        return res.status(403).json({ success: false, error: 'Admin role required to delete attachments' });
      }

      const { attachmentId } = req.params;
      const attachmentManager = this.engine.getManager('AttachmentManager');

      const deleted = await attachmentManager.deleteAttachment(attachmentId, currentUser ?? undefined);

      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      return res.json({ success: true, message: 'Attachment deleted successfully' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error deleting attachment from browser:', err);
      return res.status(500).json({ success: false, error: message });
    }
  }

  /**
   * Admin import preview - dry-run import and return JSON results
   */
  async adminImportPreview(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to import pages'
        });
      }

      const { sourceDir, format, limit, generateUUIDs } = req.body;

      if (!sourceDir) {
        return res.status(400).json({
          success: false,
          error: 'sourceDir is required'
        });
      }

      const importManager = this.engine.getManager('ImportManager');
      const result = await importManager.previewImport({
        sourceDir,
        format: format || 'auto',
        limit: limit ? Number(limit) : undefined,
        generateUUIDs: generateUUIDs !== false
      });

      return res.json({
        success: result.success,
        files: result.files,
        converted: result.converted,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors
      });
    } catch (err: unknown) {
      logger.error('Error previewing import:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error previewing import'
      });
    }
  }

  /**
   * Admin import execute - run actual import and return JSON results
   */
  async adminImportExecute(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to import pages'
        });
      }

      const { sourceDir, format, limit, generateUUIDs } = req.body;

      if (!sourceDir) {
        return res.status(400).json({
          success: false,
          error: 'sourceDir is required'
        });
      }

      const importManager = this.engine.getManager('ImportManager');
      const result = await importManager.importPages({
        sourceDir,
        format: format || 'auto',
        limit: limit ? Number(limit) : undefined,
        generateUUIDs: generateUUIDs !== false,
        dryRun: false
      });

      return res.json({
        success: result.success,
        converted: result.converted,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        durationMs: result.durationMs
      });
    } catch (err: unknown) {
      logger.error('Error executing import:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error executing import'
      });
    }
  }

  /**
   * Admin import execute with SSE streaming progress
   * Streams progress events as each file is imported
   */
  async adminImportExecuteStream(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({
          success: false,
          error: 'You do not have permission to import pages'
        });
        return;
      }

      const { sourceDir, format, limit, generateUUIDs } = req.body;

      if (!sourceDir) {
        res.status(400).json({
          success: false,
          error: 'sourceDir is required'
        });
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const importManager = this.engine.getManager('ImportManager');

      // Define progress callback
      const onProgress = (event: {
        type: 'start' | 'progress' | 'complete' | 'error';
        file?: string;
        index?: number;
        total?: number;
        status?: 'success' | 'skipped' | 'failed';
        error?: string;
        result?: unknown;
      }) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Execute import with progress callback
      const result = await importManager.importPagesWithProgress({
        sourceDir,
        format: format || 'auto',
        limit: limit ? Number(limit) : undefined,
        generateUUIDs: generateUUIDs !== false,
        dryRun: false,
        onProgress
      });

      // Send final complete event
      onProgress({
        type: 'complete',
        result: {
          success: result.success,
          converted: result.converted,
          skipped: result.skipped,
          failed: result.failed,
          durationMs: result.durationMs
        }
      });

      res.end();
      return;
    } catch (err: unknown) {
      logger.error('Error in streaming import:', err);
      // Try to send error event if connection still open
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: getErrorMessage(err) })}\n\n`);
        res.end();
      } catch {
        // Connection already closed
      }
    }
  }

  /**
   * Admin URL import preview - fetch URL, convert, return preview JSON
   */
  async adminImportUrlPreview(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to import pages'
        });
      }

      const { url, title } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'url is required'
        });
      }

      const importManager = this.engine.getManager('ImportManager');
      const result = await importManager.importFromUrl(url, {
        title: title || undefined,
        dryRun: true
      });

      return res.json({
        success: true,
        file: result,
        content: result.metadata?.['_previewContent'] as string || undefined
      });
    } catch (err: unknown) {
      logger.error('Error previewing URL import:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error previewing URL import'
      });
    }
  }

  /**
   * Admin URL import execute - fetch URL, convert, create page
   */
  async adminImportUrlExecute(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to import pages'
        });
      }

      const { url, title } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'url is required'
        });
      }

      const importManager = this.engine.getManager('ImportManager');
      const result = await importManager.importFromUrl(url, {
        title: title || undefined,
        dryRun: false
      });

      return res.json({
        success: !result.skippedReason,
        file: result,
        skipped: !!result.skippedReason
      });
    } catch (err: unknown) {
      logger.error('Error executing URL import:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err) || 'Error executing URL import'
      });
    }
  }

  /**
   * #728 S5a-ii: run the NCM image→attachment rule with real deps.
   * `dryRun` (preview) validates fetch/sniff/size/deny-list but never
   * persists — preview must be side-effect-free, like the import dry-run.
   */
  private async localizePageImages(
    ncmContent: string,
    pageName: string,
    userContext: UserContext | null | undefined,
    dryRun: boolean
  ): Promise<{ content: string; warnings: string[] }> {
    const cm = this.engine.getManager('ConfigurationManager');
    const maxBytes = (cm?.getProperty?.('ngdpbase.attachment.maxsize', 10485760) as number) || 10485760;
    const adDenyList = (cm?.getProperty?.('ngdpbase.markdown.ncm.image.ad-deny-list', []) as string[]) || [];
    const fetchTimeoutMs = (cm?.getProperty?.('ngdpbase.fetch-timeout-ms', 30000) as number) || 30000;
    const attachmentManager = this.engine.getManager('AttachmentManager');

    const deps: NcmImageDeps = {
      fetchBytes: async (url: string, timeoutMs: number): Promise<Buffer> => {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'ngdpbase/1.0 (NCM image)' },
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      },
      storeAttachment: async ({ bytes, mime, sourceUrl }): Promise<string> => {
        const ext = (mime.split('/')[1] || 'bin').toLowerCase();
        const rawBase = (sourceUrl.split('/').pop() || 'image').split(/[?#]/)[0]
          .replace(/[^A-Za-z0-9._-]/g, '_') || 'image';
        const originalName = /\.[A-Za-z0-9]+$/.test(rawBase) ? rawBase : `${rawBase}.${ext}`;
        if (dryRun) {
          // Preview: do not persist. Report it would be attached.
          return `/attachments/${encodeURIComponent(originalName)}`;
        }
        const meta = await attachmentManager.uploadAttachment(
          bytes,
          { originalName, mimeType: mime, size: bytes.length },
          { pageName, description: `NCM embedded image from ${sourceUrl}`, context: userContext ?? undefined }
        );
        return (meta.url as string) || `/attachments/${encodeURIComponent((meta.name as string) || originalName)}`;
      }
    };

    const r = await localizeNcmImages(ncmContent, { maxBytes, adDenyList, fetchTimeoutMs }, deps);
    return { content: r.content, warnings: r.warnings.map(w => `${w.kind}: ${w.detail}`) };
  }

  /**
   * GET /admin/convert — render the "Convert page to NCM" admin tool (#728 S5a)
   */
  async adminConvert(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!wikiContext.userContext || !(await wikiContext.hasPermission('admin-system'))) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to convert pages');
      }
      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-convert', {
        ...commonData,
        title: 'Convert page to NCM',
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading admin convert:', err);
      return res.status(500).send('Error loading convert tool');
    }
  }

  /**
   * Load a page and return the proposed NCM rewrite without saving (#728 S5a).
   * Mirrors the import dry-run/preview pattern; preview+confirm is mandatory
   * for this interactive single-page op (spec §3) — never a silent rewrite.
   */
  async adminConvertPreview(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!wikiContext.userContext || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ success: false, error: 'You do not have permission to convert pages' });
      }
      const pageName = (req.body as { page?: string }).page;
      if (!pageName) {
        return res.status(400).json({ success: false, error: 'page is required' });
      }
      const pageManager = this.engine.getManager<import('../managers/PageManager.js').default>('PageManager');
      const page = await pageManager?.getPage(pageName);
      if (!page) {
        return res.status(404).json({ success: false, error: `Page not found: ${pageName}` });
      }
      const original = matter.stringify(page.content, page.metadata as Record<string, unknown>);
      const ncm = normalizeExistingPageToNcm(original);
      // S5a-ii: dry-run image localization (preview must not persist).
      const img = await this.localizePageImages(ncm.content, pageName, wikiContext.userContext, true);
      return res.json({
        success: true,
        page: pageName,
        changed: img.content !== original,
        ncmVersion: ncm.ncmVersion,
        original,
        proposed: img.content,
        warnings: [...ncm.warnings.map(w => `${w.kind}: ${w.detail}`), ...img.warnings]
      });
    } catch (err: unknown) {
      logger.error('Error previewing page conversion:', err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) || 'Error previewing conversion' });
    }
  }

  /**
   * Apply the NCM conversion to a page, saving via PageManager so versioning
   * and ACL apply (#728 S5a).
   */
  async adminConvertExecute(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!wikiContext.userContext || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ success: false, error: 'You do not have permission to convert pages' });
      }
      const pageName = (req.body as { page?: string }).page;
      if (!pageName) {
        return res.status(400).json({ success: false, error: 'page is required' });
      }
      const pageManager = this.engine.getManager<import('../managers/PageManager.js').default>('PageManager');
      const page = await pageManager?.getPage(pageName);
      if (!page) {
        return res.status(404).json({ success: false, error: `Page not found: ${pageName}` });
      }
      const original = matter.stringify(page.content, page.metadata as Record<string, unknown>);
      const ncm = normalizeExistingPageToNcm(original);
      // S5a-ii: real image localization (persists attachments via AttachmentManager).
      const img = await this.localizePageImages(ncm.content, pageName, wikiContext.userContext, false);
      const warnings = [...ncm.warnings.map(w => `${w.kind}: ${w.detail}`), ...img.warnings];
      if (img.content === original) {
        return res.json({ success: true, page: pageName, changed: false, warnings });
      }
      const split = matter(img.content);
      await pageManager?.savePage(pageName, split.content, split.data as Record<string, unknown>);
      return res.json({
        success: true,
        page: pageName,
        changed: true,
        ncmVersion: ncm.ncmVersion,
        warnings
      });
    } catch (err: unknown) {
      logger.error('Error executing page conversion:', err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) || 'Error executing conversion' });
    }
  }

  /**
   * Admin logs page
   */
  async adminLogs(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to access system logs'
        );
      }

      const commonData = await this.getCommonTemplateData(req);


      // Read recent logs from configured directory
      const configManager = this.engine.getManager('ConfigurationManager');
      const logDir = configManager.getResolvedDataPath('ngdpbase.logging.dir', './data/logs');
      let logContent = '';
      let logFiles: Array<{ name: string; mtime: Date; size: number }> = [];
      let selectedFile = '';

      try {
        if (await fse.pathExists(logDir)) {
          const files = await fse.readdir(logDir);
          const logFileNames = files.filter((f: string) => f.endsWith('.log'));

          // Get file stats and sort by modification time (newest first)
          const fileStats = await Promise.all(
            logFileNames.map(async (name: string) => {
              const stats = await fse.stat(path.join(logDir, name));
              return { name, mtime: stats.mtime, size: stats.size };
            })
          );
          logFiles = fileStats.sort((a: { mtime: Date }, b: { mtime: Date }) => b.mtime.getTime() - a.mtime.getTime());

          // Get selected file from query param, or use most recent
          const requestedFile = req.query.file as string | undefined;
          if (requestedFile && logFileNames.includes(requestedFile)) {
            selectedFile = requestedFile;
          } else if (logFiles.length > 0) {
            selectedFile = logFiles[0].name;
          }

          if (selectedFile) {
            const logPath = path.join(logDir, selectedFile);
            const content = await fse.readFile(logPath, 'utf8');
            // Get last 100 lines
            const lines = content.split('\n');
            logContent = lines.slice(-100).join('\n');
          }
        }
      } catch (err: unknown) {
        logger.error('Error reading logs:', err);
        logContent = 'Error reading log files';
      }

      return res.render('admin-logs', {
        ...commonData,
        title: 'System Logs',
        logFiles,
        logContent,
        selectedFile,
        csrfToken: req.session.csrfToken
      });
    } catch (err: unknown) {
      logger.error('Error loading admin logs:', err);
      return res.status(500).send('Error loading system logs');
    }
  }

  /**
   * GET /admin/addons — Add-ons status page
   */
  async adminAddons(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to manage add-ons');
      }
      const addonsManager = this.engine.getManager('AddonsManager');
      const addons = addonsManager ? await addonsManager.getStatus() : [];
      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-addons', {
        ...commonData,
        title: 'Add-ons',
        addons,
        csrfToken: req.session.csrfToken,
        success: req.query.success as string | undefined,
        error: req.query.error as string | undefined
      });
    } catch (err: unknown) {
      logger.error('Error loading admin addons:', err);
      return res.status(500).send('Error loading add-ons');
    }
  }

  /**
   * POST /admin/addons/:name/toggle — Enable or disable an add-on
   */
  async adminAddonToggle(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const addonName = req.params.name;
      const { enabled } = req.body as { enabled: string };
      const willEnable = enabled === 'true';

      // #617: refuse to disable an addon that other enabled addons depend on.
      if (!willEnable) {
        const addonsManager = this.engine.getManager('AddonsManager');
        const check = addonsManager?.canDisable?.(addonName);
        if (check && !check.ok) {
          const blockerList = check.blockedBy.join(', ');
          return res.redirect(`/admin/addons?error=${encodeURIComponent(
            `Cannot disable "${addonName}" — required by enabled add-on(s): ${blockerList}. Disable those first.`
          )}`);
        }
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      await configManager.setProperty(`ngdpbase.addons.${addonName}.enabled`, willEnable);
      const state = willEnable ? 'enabled' : 'disabled';
      return res.redirect(`/admin/addons?success=${encodeURIComponent(`Add-on "${addonName}" ${state}. Restart required for changes to take effect.`)}`);
    } catch (err: unknown) {
      logger.error('Error toggling add-on:', err);
      return res.redirect(`/admin/addons?error=${encodeURIComponent('Failed to update add-on configuration')}`);
    }
  }

  /**
   * POST /admin/addons/:name/deploy-theme — #443: (re)deploy an add-on's
   * theme/ into themes/<name>/ (always overwrites). No restart required —
   * theme CSS is served as static files; a page reload picks it up.
   */
  async adminAddonDeployTheme(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to manage add-ons');
      }
      const addonName = req.params.name;
      const addonsManager = this.engine.getManager('AddonsManager');
      if (!addonsManager?.deployAddonTheme) {
        return res.redirect(`/admin/addons?error=${encodeURIComponent('AddonsManager unavailable')}`);
      }
      const result = await addonsManager.deployAddonTheme(addonName);
      if (result.ok) {
        return res.redirect(`/admin/addons?success=${encodeURIComponent(`Add-on "${addonName}": ${result.message}. Reload the page to see theme changes.`)}`);
      }
      return res.redirect(`/admin/addons?error=${encodeURIComponent(`Add-on "${addonName}": ${result.message}`)}`);
    } catch (err: unknown) {
      logger.error('Error deploying add-on theme:', err);
      return res.redirect(`/admin/addons?error=${encodeURIComponent('Failed to deploy add-on theme')}`);
    }
  }

  /**
   * Get raw page source (markdown content) for viewing/copying
   */
  async getPageSource(req: Request, res: Response) {
    try {
      const pageName = decodeURIComponent(req.params.page);
      const pageManager = this.engine.getManager('PageManager');

      const page = await pageManager.getPage(pageName);
      if (!page) {
        return res.status(404).send('Page not found');
      }

      // Return the raw markdown content
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(page.content || '');
    } catch (error: unknown) {
      logger.error('Error retrieving page source:', error);
      return res.status(500).send('Error retrieving page source');
    }
  }

  // ============================================================================
  // Admin Organization Management Route Handlers
  // ============================================================================

  /**
   * Admin Organizations Management Page
   */
  async adminOrganizations(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'Admin access required'
        );
      }

      const templateData = await this.getCommonTemplateData(req);

      // #624: list real Organization records via OrganizationManager (the
      // canonical store since #617). The route's `:identifier` param is the
      // org's `name` (URL-encoded). Lookup helpers iterate list() and match
      // by name — adequate at admin-page scale (handful of orgs per install)
      // and avoids dragging filename plumbing into the public URL surface.
      const organizationManager = this.engine.getManager('OrganizationManager');
      let organizations: unknown[] = [];
      try {
        organizations = await organizationManager.list();
      } catch (err: unknown) {
        logger.error('Error loading organizations:', getErrorMessage(err));
        organizations = [];
      }

      templateData.organizations = organizations;
      templateData.pageTitle = 'Organization Management';
      templateData.success = req.query.success;
      templateData.error = req.query.error;

      res.render('admin-organizations', templateData);
    } catch (error: unknown) {
      logger.error('Error loading admin organizations page:', error);
      await this.renderError(
        req,
        res,
        500,
        'Server Error',
        'Failed to load organizations management'
      );
    }
  }

  /**
   * Create New Organization
   */
  async adminCreateOrganization(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const userContext = wikiContext.userContext;
      if (
        !userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const organizationData = req.body as Record<string, unknown>;

      // #624: ensure the JSON-LD type fields are present even if the form
      // submitted only the user-editable fields.
      const nameForSlug = ((organizationData.name as string) || 'organization')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      const orgRecord: IOrganizationRecord = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        ...organizationData,
        '@id': (organizationData['@id'] as string) || (organizationData.url as string) || `urn:ngdpbase:org:${nameForSlug}`
      };

      const newOrganization = await organizationManager.create(orgRecord);

      if (req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, organization: newOrganization });
      } else {
        return res.redirect(
          '/admin/organizations?success=Organization created successfully'
        );
      }
    } catch (error: unknown) {
      logger.error('Error creating organization:', error);
      if (req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: getErrorMessage(error) });
      } else {
        return res.redirect(
          '/admin/organizations?error=' + encodeURIComponent(getErrorMessage(error))
        );
      }
    }
  }

  /**
   * Update Existing Organization
   */
  async adminUpdateOrganization(req: Request, res: Response) {
    try {
      const userContext = req.userContext;
      const userManager = this.engine.getManager('UserManager');
      if (
        !userContext?.isAuthenticated ||
        !(await userManager.hasPermission(userContext.username, 'admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const identifier = req.params.identifier;
      const patch = req.body as Record<string, unknown>;

      // #624: route :identifier is the org's `name` (URL-decoded by Express).
      // Look up the org to find its `@id`, then patch by @id. Mutation of
      // identity fields (`@context`, `@type`, `@id`) is rejected by the
      // provider's update() implementation.
      const existing = await this.findOrganizationByName(organizationManager, identifier);
      if (!existing) {
        if (req.headers.accept?.includes('application/json')) {
          return res.status(404).json({ error: `Organization "${identifier}" not found` });
        }
        return res.redirect('/admin/organizations?error=' + encodeURIComponent(`Organization "${identifier}" not found`));
      }

      const updatedOrganization = await organizationManager.update(existing['@id'], patch);

      if (req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, organization: updatedOrganization });
      } else {
        return res.redirect(
          '/admin/organizations?success=Organization updated successfully'
        );
      }
    } catch (error: unknown) {
      logger.error('Error updating organization:', error);
      if (req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: getErrorMessage(error) });
      } else {
        return res.redirect(
          '/admin/organizations?error=' + encodeURIComponent(getErrorMessage(error))
        );
      }
    }
  }

  /**
   * Delete Organization
   */
  async adminDeleteOrganization(req: Request, res: Response) {
    try {
      const userContext = req.userContext;
      const userManager = this.engine.getManager('UserManager');
      if (
        !userContext?.isAuthenticated ||
        !(await userManager.hasPermission(userContext.username, 'admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const identifier = req.params.identifier;

      const existing = await this.findOrganizationByName(organizationManager, identifier);
      if (!existing) {
        if (req.headers.accept?.includes('application/json')) {
          return res.status(404).json({ error: `Organization "${identifier}" not found` });
        }
        return res.redirect('/admin/organizations?error=' + encodeURIComponent(`Organization "${identifier}" not found`));
      }

      await organizationManager.delete(existing['@id']);

      if (req.headers.accept?.includes('application/json')) {
        return res.json({ success: true });
      } else {
        return res.redirect(
          '/admin/organizations?success=Organization deleted successfully'
        );
      }
    } catch (error: unknown) {
      logger.error('Error deleting organization:', error);
      if (req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: getErrorMessage(error) });
      } else {
        return res.redirect(
          '/admin/organizations?error=' + encodeURIComponent(getErrorMessage(error))
        );
      }
    }
  }

  /**
   * Get Single Organization (API endpoint)
   */
  async adminGetOrganization(req: Request, res: Response) {
    try {
      const userContext = req.userContext;
      const userManager = this.engine.getManager('UserManager');
      if (
        !userContext?.isAuthenticated ||
        !(await userManager.hasPermission(userContext.username, 'admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const identifier = req.params.identifier;
      const organization = await this.findOrganizationByName(organizationManager, identifier);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      return res.json(organization);
    } catch (error: unknown) {
      logger.error('Error getting organization:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }

  /**
   * #624 helper — find an Organization record by its `name` field (case-
   * insensitive). The admin UI uses `name` as the URL identifier. Returns
   * the org or null.
   */
  private async findOrganizationByName(
    organizationManager: { list(): Promise<Array<{ name?: string; '@id': string; [key: string]: unknown }>> },
    identifier: string
  ): Promise<{ '@id': string; [key: string]: unknown } | null> {
    const target = decodeURIComponent(identifier).toLowerCase();
    const all = await organizationManager.list();
    return all.find((o) => typeof o.name === 'string' && o.name.toLowerCase() === target) ?? null;
  }

  /**
   * Admin route to validate all files and check for naming convention compliance
   */
  async adminValidateFiles(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const userContext = await userManager.getCurrentUser(req);

      if (
        !userContext?.isAuthenticated ||
        !(await userManager.hasPermission(userContext.username, 'admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'Admin access required'
        );
      }

      const pageManager = this.engine.getManager('PageManager');
      const dryRun = req.query.dryRun === 'true';

      // Run validation
      const report = await pageManager.validateAndFixAllFiles({ dryRun });

      // Render validation report
      const templateData = await this.getCommonTemplateData(req);
      templateData.title = 'File Validation Report';
      templateData.report = report;
      templateData.dryRun = dryRun;

      res.render('admin-validation-report', templateData);
    } catch (err: unknown) {
      logger.error('Error validating files:', err);
      await this.renderError(req, res, 500, 'Validation Error', getErrorMessage(err));
    }
  }

  /**
   * Admin API route to fix all non-compliant files
   */
  async adminFixFiles(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const userContext = await userManager.getCurrentUser(req);

      if (
        !userContext?.isAuthenticated ||
        !(await userManager.hasPermission(userContext.username, 'admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const pageManager = this.engine.getManager('PageManager');

      // Run fixes (not dry run)
      const report = await pageManager.validateAndFixAllFiles({
        dryRun: false
      });

      return res.json({
        success: true,
        message: `Fixed ${report.fixedFiles} files out of ${report.invalidFiles} invalid files`,
        report
      });
    } catch (err: unknown) {
      logger.error('Error fixing files:', err);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err)
      });
    }
  }

  /**
   * Get Organization Schema.org JSON-LD (API endpoint)
   */
  async adminGetOrganizationSchema(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const identifier = req.params.identifier;
      const organization = await this.findOrganizationByName(organizationManager, identifier);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Generate Schema.org JSON-LD using SchemaGenerator
      const schema = SchemaGenerator.generateOrganizationSchema(organization as Record<string, unknown>, {
        baseUrl: `${req.protocol}://${req.get('host')}`
      });

      return res.json(schema);
    } catch (error: unknown) {
      logger.error('Error getting organization schema:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }

  /**
   * Get Schema.org Person schema for a user
   */
  async adminGetPersonSchema(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const schemaManager = this.engine.getManager('SchemaManager');
      const identifier = req.params.identifier;
      const person = await schemaManager.getPerson(identifier);

      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      // Generate Schema.org JSON-LD using SchemaGenerator
      const schema = SchemaGenerator.generatePersonSchema(person as Record<string, unknown>, {
        baseUrl: `${req.protocol}://${req.get('host')}`
      });

      return res.json(schema);
    } catch (error: unknown) {
      logger.error('Error getting person schema:', error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  }

  /**
   * Register all routes with the Express app
   * @param {Express} app - Express application instance
   */
  registerRoutes(app: Application) {
    // API routes first to prevent conflicts
    logger.debug('ROUTES DEBUG: Registering /api/preview route');
    app.post('/api/preview', (req: Request, res: Response) => this.previewPage(req, res));
    logger.debug('ROUTES DEBUG: Registering /api/test route');
    app.get('/api/test', (_req: Request, res: Response) => res.json({ message: 'API working!' }));

    // Slice 6c of #760 (#767) — SKOS vocabulary publishing.
    app.get('/api/catalog/vocabulary/', (req: Request, res: Response) =>
      void this.catalogVocabularyIndex(req, res)
    );
    app.get('/api/catalog/vocabulary/:schemeId', (req: Request, res: Response) =>
      void this.catalogVocabularyScheme(req, res)
    );
    logger.debug('ROUTES DEBUG: Registering /api/page-metadata/:page route');
    app.get('/api/page-metadata/:page', (req: Request, res: Response) =>
      this.getPageMetadata(req, res)
    );
    logger.debug('ROUTES DEBUG: Registering /api/page-source/:page route');
    app.get('/api/page-source/:page', (req: Request, res: Response) =>
      this.getPageSource(req, res)
    );
    logger.debug('ROUTES DEBUG: Registering /api/page-suggestions route');
    app.get('/api/page-suggestions', (req: Request, res: Response) =>
      this.getPageSuggestions(req, res)
    );

    // Unified asset search (attachments + media library)
    app.get('/api/assets/search', (req: Request, res: Response) => this.assetSearch(req, res));

    // Version management API routes (Phase 6)
    logger.debug('ROUTES DEBUG: Registering version management API routes');
    app.get('/api/page/:identifier/versions', (req: Request, res: Response) =>
      this.getPageVersions(req, res)
    );
    app.get('/api/page/:identifier/version/:version', (req: Request, res: Response) =>
      this.getPageVersion(req, res)
    );
    app.get('/api/page/:identifier/compare/:v1/:v2', (req: Request, res: Response) =>
      this.comparePageVersions(req, res)
    );
    app.post('/api/page/:identifier/restore/:version', (req: Request, res: Response) =>
      this.restorePageVersion(req, res)
    );

    // Public routes
    app.get('/', (req: Request, res: Response) => this.homePage(req, res));
    app.get('/view/:page', (req: Request, res: Response) => this.viewPage(req, res));
    app.post('/view/:page', (req: Request, res: Response) => this.createWikiPage(req, res));
    // Backward-compatible redirect: /wiki/:page → /view/:page
    app.get('/wiki/:page', (req: Request, res: Response) => {
      const target = '/view/' + req.params.page + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
      res.redirect(301, target);
    });
    app.get('/edit/:page', (req: Request, res: Response) => this.editPage(req, res));
    app.post('/save/:page', (req: Request, res: Response) => this.savePage(req, res));
    app.get('/create', (req: Request, res: Response) => this.createPage(req, res));
    app.post('/create', (req: Request, res: Response) => this.createPageFromTemplate(req, res));
    app.post('/delete/:page', (req: Request, res: Response) => this.deletePage(req, res));
    app.get('/search', (req: Request, res: Response) => this.searchPages(req, res));
    app.get('/kiosk', (req: Request, res: Response) => this.kiosk(req, res));
    app.get('/login', (req: Request, res: Response) => this.loginPage(req, res));
    app.get('/admin/login', (req: Request, res: Response) => this.adminLoginPage(req, res));
    app.post('/login', (req: Request, res: Response) => this.processLogin(req, res));
    app.post('/auth/magic-link', (req: Request, res: Response) => this.requestMagicLink(req, res));
    app.get('/auth/magic-link/verify', (req: Request, res: Response) => this.verifyMagicLink(req, res));
    app.post('/auth/oauth/google', (req: Request, res: Response) => void this.initiateGoogleOIDC(req, res));
    app.get('/auth/oauth/google/callback', (req: Request, res: Response) => void this.verifyGoogleOIDCCallback(req, res));
    app.get('/logout', (req: Request, res: Response) => this.processLogout(req, res));
    app.post('/logout', (req: Request, res: Response) => this.processLogout(req, res));
    app.get('/register', (req: Request, res: Response) => this.registerPage(req, res));
    app.post('/register', (req: Request, res: Response) => this.processRegister(req, res));
    // #658 iteration 2: GET /contact (kill switch / redirect / form / not-configured).
    // #658 iteration 3: POST /contact (mail send + rate limit + honeypot).
    app.get('/contact', (req: Request, res: Response) => this.contactPage(req, res));
    app.post('/contact', (req: Request, res: Response) => this.processContact(req, res));
    app.get('/profile', (req: Request, res: Response) => this.profilePage(req, res));
    app.post('/profile', (req: Request, res: Response) => this.updateProfile(req, res));
    // #640: My Contributions surfaces
    app.get('/my/pages', (req: Request, res: Response) => this.myPagesPage(req, res));
    app.get('/my/private', (req: Request, res: Response) => this.myPrivatePagesPage(req, res));
    app.get('/my/journal', (req: Request, res: Response) => this.myJournalPage(req, res));
    app.get('/my/links', (req: Request, res: Response) => this.myLinksPage(req, res));
    // #640 Phase 2
    app.get('/my/edits', (req: Request, res: Response) => this.myEditsPage(req, res));
    app.get('/my/shared', (req: Request, res: Response) => this.mySharedPage(req, res));
    app.post('/preferences', (req: Request, res: Response) => this.updatePreferences(req, res));
    app.post('/api/comments/:pageUuid', (req: Request, res: Response) => void this.addComment(req, res));
    app.delete('/api/comments/:pageUuid/:commentId', (req: Request, res: Response) => void this.deleteComment(req, res));
    // #590 partial-render: returns just the inner comment-list HTML so the
    // CommentsPlugin script can swap it in place after add/delete.
    app.get('/api/comments/:pageUuid/html', (req: Request, res: Response) => void this.getCommentListHtml(req, res));
    app.get('/api/footnotes/:pageUuid', (req: Request, res: Response) => void this.getFootnotes(req, res));
    app.post('/api/footnotes/:pageUuid', (req: Request, res: Response) => void this.addFootnote(req, res));
    app.put('/api/footnotes/:pageUuid/:footnoteId', (req: Request, res: Response) => void this.updateFootnote(req, res));
    app.delete('/api/footnotes/:pageUuid/:footnoteId', (req: Request, res: Response) => void this.deleteFootnote(req, res));
    // #590 partial-render: returns just the inner footnote-list HTML so the
    // FootnotesPlugin script can swap it in place after add/edit/delete.
    app.get('/api/footnotes/:pageUuid/html', (req: Request, res: Response) => void this.getFootnoteListHtml(req, res));
    app.post('/api/user/display-theme', (req: Request, res: Response) => this.updateDisplayTheme(req, res));
    app.post('/api/user/pinned-pages', (req: Request, res: Response) => void this.addPinnedPage(req, res));
    app.delete('/api/user/pinned-pages/:pageName', (req: Request, res: Response) => void this.removePinnedPage(req, res));
    app.put('/api/user/pinned-pages/order', (req: Request, res: Response) => void this.reorderPinnedPages(req, res));
    app.get('/api/users/search', (req: Request, res: Response) => void this.apiUsersSearch(req, res));
    app.get('/user-info', (req: Request, res: Response) => this.userInfo(req, res));
    app.get('/export', (req: Request, res: Response) => this.exportPage(req, res));
    app.post('/export/html/:page', (req: Request, res: Response) => this.exportPageHtml(req, res));
    app.post('/export/markdown/:page', (req: Request, res: Response) => this.exportPageMarkdown(req, res));
    app.get('/exports', (req: Request, res: Response) => this.listExports(req, res));
    app.get('/download/:filename', (req: Request, res: Response) => this.downloadExport(req, res));
    app.delete('/deleteExport/:filename', (req: Request, res: Response) => this.deleteExport(req, res));

    // Version management view routes (Phase 6)
    app.get('/history/:page', (req: Request, res: Response) => this.pageHistory(req, res));
    app.get('/diff/:page', (req: Request, res: Response) => this.pageDiff(req, res));

    // Admin routes
    app.get('/admin', (req: Request, res: Response) => this.adminDashboard(req, res));
    app.get('/admin/backup', (req: Request, res: Response) => void this.adminBackupPage(req, res));
    app.post('/admin/backup/create', (req: Request, res: Response) => this.adminBackup(req, res));
    app.post('/admin/backup/config', (req: Request, res: Response) => void this.adminBackupConfig(req, res));
    app.get('/admin/configuration', (req: Request, res: Response) =>
      this.adminConfiguration(req, res)
    );
    app.post('/admin/configuration', (req: Request, res: Response) =>
      this.adminUpdateConfiguration(req, res)
    );
    app.post('/admin/configuration/reset', (req: Request, res: Response) =>
      this.adminResetConfiguration(req, res)
    );
    app.get('/admin/interwiki', (req: Request, res: Response) => void this.adminInterwiki(req, res));
    app.post('/admin/interwiki/sites', (req: Request, res: Response) => void this.adminInterwikiSaveSite(req, res));
    app.post('/admin/interwiki/sites/:siteName/delete', (req: Request, res: Response) => void this.adminInterwikiDeleteSite(req, res));
    app.post('/admin/interwiki/options', (req: Request, res: Response) => void this.adminInterwikiSaveOptions(req, res));
    app.get('/admin/variables', (req: Request, res: Response) => this.adminVariables(req, res));
    app.post('/admin/variables/test', (req: Request, res: Response) =>
      this.adminTestVariables(req, res)
    );
    app.post('/admin/maintenance/toggle', (req: Request, res: Response) =>
      this.adminToggleMaintenance(req, res)
    );
    app.get('/admin/users', (req: Request, res: Response) => this.adminUsers(req, res));
    app.get('/admin/users/:username/edit', (req: Request, res: Response) => this.userEdit(req, res));
    app.post('/admin/users', (req: Request, res: Response) => this.adminCreateUser(req, res));
    app.put('/admin/users/:username', (req: Request, res: Response) =>
      this.adminUpdateUser(req, res)
    );
    app.delete('/admin/users/:username', (req: Request, res: Response) =>
      this.adminDeleteUser(req, res)
    );
    app.get('/admin/roles', (req: Request, res: Response) => this.adminRoles(req, res));
    app.post('/admin/roles', (req: Request, res: Response) => this.adminCreateRole(req, res));
    app.put('/admin/roles/:role', (req: Request, res: Response) => this.adminUpdateRole(req, res));
    app.delete('/admin/roles/:role', (req: Request, res: Response) =>
      this.adminDeleteRole(req, res)
    );
    app.get('/admin/settings', (req: Request, res: Response) => this.adminSettings(req, res));
    app.post('/admin/settings/theme', (req: Request, res: Response) => this.adminUpdateTheme(req, res));
    app.post('/admin/settings/general', (req: Request, res: Response) => this.adminUpdateGeneralSettings(req, res));
    app.get('/admin/logs', (req: Request, res: Response) => this.adminLogs(req, res));
    app.get('/admin/addons', (req: Request, res: Response) => void this.adminAddons(req, res));
    app.post('/admin/addons/:name/toggle', (req: Request, res: Response) => void this.adminAddonToggle(req, res));
    app.post('/admin/addons/:name/deploy-theme', (req: Request, res: Response) => void this.adminAddonDeployTheme(req, res));
    app.post('/admin/restart', (req: Request, res: Response) => this.adminRestart(req, res));
    app.post('/admin/reindex', (req: Request, res: Response) => this.adminReindex(req, res));
    app.get('/admin/events', (req: Request, res: Response) => this.adminEvents(req, res));
    app.get('/admin/required-pages', (req: Request, res: Response) =>
      this.adminRequiredPages(req, res)
    );
    app.post('/admin/required-pages/sync', (req: Request, res: Response) =>
      this.adminSyncRequiredPages(req, res)
    );
    app.get('/admin/diff', (req: Request, res: Response) => this.adminDiff(req, res));
    app.get('/api/admin/diff', (req: Request, res: Response) => this.adminDiffApi(req, res));
    app.get('/admin/attachments', (req: Request, res: Response) => this.adminAttachments(req, res));
    app.get('/admin/attachments/api', (req: Request, res: Response) => this.adminAttachmentsApi(req, res));
    app.delete('/admin/attachments/:attachmentId', (req: Request, res: Response) => this.adminDeleteAttachmentFromBrowser(req, res));
    app.get('/admin/import', (req: Request, res: Response) => this.adminImport(req, res));
    app.post('/admin/import/preview', (req: Request, res: Response) => this.adminImportPreview(req, res));
    app.post('/admin/import/execute', (req: Request, res: Response) => this.adminImportExecute(req, res));
    app.post('/admin/import/execute/stream', (req: Request, res: Response) => this.adminImportExecuteStream(req, res));
    app.post('/admin/import/url/preview', (req: Request, res: Response) => this.adminImportUrlPreview(req, res));
    app.post('/admin/import/url/execute', (req: Request, res: Response) => this.adminImportUrlExecute(req, res));
    app.get('/admin/convert', (req: Request, res: Response) => void this.adminConvert(req, res));
    app.post('/admin/convert/preview', (req: Request, res: Response) => void this.adminConvertPreview(req, res));
    app.post('/admin/convert/execute', (req: Request, res: Response) => void this.adminConvertExecute(req, res));

    // Image upload route with error handling
    app.post('/images/upload', (req: Request, res: Response) => {
      imageUpload.single('image')(req, res, (err: unknown) => {
        if (err) {
          // Multer error handling
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                success: false,
                error: 'File size exceeds 10MB limit'
              });
            }
            return res.status(400).json({
              success: false,
              error: getErrorMessage(err)
            });
          }
          // Other errors (e.g., file type validation)
          return res.status(400).json({
            success: false,
            error: getErrorMessage(err)
          });
        }
        // No error, proceed to handler
        return void this.uploadImage(req, res);
      });
    });

    // Non-admin attachment browser (editor/contributor access)
    // #696: /attachments/browse is now an alias for /search (asset-picker UI
    // is canonical there). 302 preserves the query string so any pre-swap
    // bookmark like /attachments/browse?mimeCategory=image still resolves.
    app.get('/attachments/browse', (req: Request, res: Response) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(302, '/search' + qs);
    });
    app.get('/attachments/browse/api', (req: Request, res: Response) => this.browseAttachmentsApi(req, res));

    // Attachment routes
    app.post('/attachments/upload', (req: Request, res: Response) => {
      attachmentUpload.single('file')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            res.status(400).json({ success: false, error: `Upload error: ${err.message}` }); return;
          }
          res.status(500).json({ success: false, error: 'Upload failed' }); return;
        }
        void this.uploadAttachment(req, res);
      });
    });
    app.post('/attachments/upload/:page', (req: Request, res: Response) => {
      attachmentUpload.single('file')(req, res, (err: unknown) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                success: false,
                error: 'File size exceeds limit'
              });
            }
            return res.status(400).json({
              success: false,
              error: getErrorMessage(err)
            });
          }
          return res.status(400).json({
            success: false,
            error: getErrorMessage(err)
          });
        }
        return void this.uploadAttachment(req, res);
      });
    });

    // Thumbnail must be registered before /:attachmentId to avoid wildcard match
    app.get('/attachments/thumb/:attachmentId', (req: Request, res: Response) =>
      void this.attachmentThumb(req, res)
    );

    app.get('/attachments/:attachmentId', (req: Request, res: Response) =>
      this.serveAttachment(req, res)
    );

    app.delete('/attachments/:attachmentId', (req: Request, res: Response) =>
      this.deleteAttachment(req, res)
    );

    // User-keyword management routes (accessible to editors)
    app.get('/user-keywords/create', (req: Request, res: Response) =>
      this.userKeywordCreate(req, res)
    );
    app.post('/user-keywords/create', (req: Request, res: Response) =>
      this.userKeywordCreateSubmit(req, res)
    );
    app.post('/user-keywords/create-page/:keywordId', (req: Request, res: Response) =>
      this.userKeywordCreatePage(req, res)
    );
    app.get('/api/user-keywords', (req: Request, res: Response) =>
      this.apiGetUserKeywords(req, res)
    );

    // Admin keyword management routes
    app.get('/admin/keywords', (req: Request, res: Response) =>
      this.adminKeywords(req, res)
    );
    app.post('/admin/keywords', (req: Request, res: Response) =>
      this.adminCreateKeyword(req, res)
    );
    app.get('/api/admin/keywords/:id/usage', (req: Request, res: Response) =>
      this.adminKeywordUsage(req, res)
    );
    app.put('/admin/keywords/:id', (req: Request, res: Response) =>
      this.adminUpdateKeyword(req, res)
    );
    app.delete('/admin/keywords/:id', (req: Request, res: Response) =>
      this.adminDeleteKeyword(req, res)
    );
    app.post('/admin/keywords/consolidate', (req: Request, res: Response) =>
      this.adminConsolidateKeywords(req, res)
    );

    // Notification management routes
    app.post('/admin/notifications/:id/dismiss', (req: Request, res: Response) =>
      this.adminDismissNotification(req, res)
    );
    app.post('/admin/notifications/clear-all', (req: Request, res: Response) =>
      this.adminClearAllNotifications(req, res)
    );
    app.get('/admin/notifications', (req: Request, res: Response) =>
      this.adminNotifications(req, res)
    );

    // FilterChain stats (#615) — admin-only visibility into filter execution
    // counts and per-filter timing.
    app.get('/api/admin/filter-chain/stats', (req: Request, res: Response) =>
      this.adminFilterChainStats(req, res)
    );

    // Cache management routes
    app.get('/api/admin/cache/stats', (req: Request, res: Response) =>
      this.adminCacheStats(req, res)
    );
    app.post('/api/admin/cache/clear', (req: Request, res: Response) =>
      this.adminClearCache(req, res)
    );
    app.post('/api/admin/cache/clear/page/:identifier', (req: Request, res: Response) =>
      void this.adminClearPageCache(req, res));
    app.post('/api/admin/cache/clear/:region', (req: Request, res: Response) =>
      this.adminClearCacheRegion(req, res)
    );

    // Admin Schema.org Organization Management Routes
    app.get('/admin/organizations', this.adminOrganizations.bind(this));
    app.post('/admin/organizations', this.adminCreateOrganization.bind(this));
    app.put(
      '/admin/organizations/:identifier',
      this.adminUpdateOrganization.bind(this)
    );
    app.delete(
      '/admin/organizations/:identifier',
      this.adminDeleteOrganization.bind(this)
    );
    app.get(
      '/admin/organizations/:identifier',
      this.adminGetOrganization.bind(this)
    );
    app.get(
      '/admin/organizations/:identifier/schema',
      this.adminGetOrganizationSchema.bind(this)
    );

    app.get('/api/session-count', (req: Request, res: Response) => {
      this.getActiveSesssionCount(req, res);
    });
    app.get('/api/session-users', (req: Request, res: Response) => {
      this.getActiveSessionUsers(req, res);
    });
    app.get('/api/check-updates', (req: Request, res: Response) =>
      void this.checkForUpdates(req, res)
    );
    // Schema.org routes
    app.get('/schema/person/:identifier', (req: Request, res: Response) =>
      this.adminGetPersonSchema(req, res)
    );
    app.get('/schema/organization/:identifier', (req: Request, res: Response) =>
      this.adminGetOrganizationSchema(req, res)
    );

    // Media routes (Phase 3 stub)
    app.get('/media', (req: Request, res: Response) => void this.mediaHome(req, res));
    app.get('/media/year/:year', (req: Request, res: Response) => void this.mediaByYear(req, res));
    app.get('/media/keyword/:keyword', (req: Request, res: Response) => void this.mediaByKeyword(req, res));
    app.get('/media/item/:id', (req: Request, res: Response) => void this.mediaItemDetail(req, res));
    app.get('/media/search', (req: Request, res: Response) => void this.mediaSearch(req, res));
    app.get('/media/api/item/:id', (req: Request, res: Response) => void this.mediaApiItem(req, res));
    app.get('/media/api/year/:year', (req: Request, res: Response) => void this.mediaApiYear(req, res));
    app.get('/media/file/:id', (req: Request, res: Response) => void this.mediaFile(req, res));
    app.get('/media/thumb/:id', (req: Request, res: Response) => void this.mediaThumb(req, res));
    app.get('/admin/media', (req: Request, res: Response) => void this.adminMedia(req, res));
    app.post('/admin/media/rescan', (req: Request, res: Response) => void this.adminMediaRescan(req, res));
    app.post('/admin/media/rebuild', (req: Request, res: Response) => void this.adminMediaRebuild(req, res));
    // Slice 5b of #760 (#763) — attachments.rebuild trigger.
    app.post('/admin/attachments/rebuild', (req: Request, res: Response) => void this.adminAttachmentsRebuild(req, res));

    // Background job API
    app.post('/api/admin/jobs/:jobId/enqueue', (req: Request, res: Response) => void this.apiJobEnqueue(req, res));
    app.get('/api/admin/jobs/active', (req: Request, res: Response) => void this.apiJobsActive(req, res));
    app.get('/api/admin/jobs/:runId/status', (req: Request, res: Response) => void this.apiJobStatus(req, res));

    this.registerAdminJobs();
  }

  /**
   * Dismiss a notification (admin only)
   */
  async adminDismissNotification(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const notificationId = req.params.id;
      const notificationManager = this.engine.getManager('NotificationManager');

      const success = await notificationManager.dismissNotification(
        notificationId,
        currentUser.username ?? ''
      );

      if (success) {
        return res.redirect('/admin?success=Notification dismissed successfully');
      } else {
        return res.redirect(
          '/admin?error=Notification not found or already dismissed'
        );
      }
    } catch (err: unknown) {
      logger.error('Error dismissing notification:', err);
      return res.redirect('/admin?error=Failed to dismiss notification');
    }
  }

  /**
   * Clear all notifications (admin only)
   */
  async adminClearAllNotifications(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const notificationManager = this.engine.getManager('NotificationManager');

      // Delete all active notifications from the system
      const clearedCount = await notificationManager.clearAllActive();

      return res.redirect(
        `/admin?success=Cleared ${clearedCount} notifications successfully`
      );
    } catch (err: unknown) {
      logger.error('Error clearing notifications:', err);
      return res.redirect('/admin?error=Failed to clear notifications');
    }
  }

  /**
   * Notification management page (admin only)
   */
  async adminNotifications(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to manage notifications'
        );
      }

      const commonData = await this.getCommonTemplateData(req);
      const notificationManager = this.engine.getManager('NotificationManager');

      // Get all notifications with expired ones for management
      const allNotifications = notificationManager.getAllNotifications(true);
      const activeNotifications =
        notificationManager.getAllNotifications(false);
      const expiredNotifications = allNotifications.filter(
        (n) => (n as { expiresAt?: Date }).expiresAt && (n as { expiresAt?: Date }).expiresAt! < new Date()
      );

      // Get notification statistics
      const stats = notificationManager.getStats();

      res.render('admin-notifications', {
        ...commonData,
        title: 'Notification Management',
        allNotifications: allNotifications,
        activeNotifications: activeNotifications,
        expiredNotifications: expiredNotifications,
        stats: stats,
        csrfToken: req.session.csrfToken,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null
      });
    } catch (err: unknown) {
      logger.error('Error loading notification management:', err);
      res.status(500).send('Error loading notification management');
    }
  }

  // ============================================================================
  // Admin Cache Route Handlers
  // ============================================================================

  /**
   * Admin FilterChain statistics API endpoint (#615).
   *
   * Surfaces per-instance FilterChain execution metrics: total runs,
   * per-filter execution counts and timings, plus the registered filter
   * roster (enabled flag, priority). Useful to confirm filters are
   * actually running and to spot a slow filter that's pulling render
   * time up.
   *
   * GET /api/admin/filter-chain/stats — admin-system permission required.
   */
  async adminFilterChainStats(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      type FilterLike = {
        filterId: string;
        isEnabled: () => boolean;
        priority?: number;
      };
      type FilterChainLike = {
        getFilters: (enabledOnly: boolean) => FilterLike[];
        getStats: () => Record<string, unknown>;
      };
      type MarkupParserLike = { getFilterChain?: () => FilterChainLike | null };

      const markupParser = this.engine.getManager('MarkupParser') as MarkupParserLike | null;
      const filterChain = markupParser?.getFilterChain?.();
      if (!filterChain) {
        return res.status(503).json({ error: 'FilterChain not available' });
      }

      const stats = filterChain.getStats() as {
        chain: Record<string, unknown>;
        filters: Record<string, { executionCount: number; totalTime: number; averageTime: number; errorCount: number; lastExecuted: Date | null }>;
        configuration: Record<string, unknown>;
      };

      // Merge runtime stats with filter metadata (priority, enabled).
      const allFilters = filterChain.getFilters(false); // includes disabled
      const filtersWithMetadata = allFilters.map(f => {
        const runtime = stats.filters[f.filterId] ?? {
          executionCount: 0,
          totalTime: 0,
          averageTime: 0,
          errorCount: 0,
          lastExecuted: null
        };
        return {
          filterId: f.filterId,
          enabled: f.isEnabled(),
          priority: f.priority ?? null,
          ...runtime
        };
      });

      return res.json({
        chain: stats.chain,
        configuration: stats.configuration,
        filters: filtersWithMetadata
      });
    } catch (err: unknown) {
      logger.error('Error getting FilterChain stats:', err);
      return res.status(500).json({ error: 'Failed to get FilterChain statistics' });
    }
  }

  /**
   * Admin cache statistics API endpoint
   */
  async adminCacheStats(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cacheManager = this.engine.getManager('CacheManager');
      if (!cacheManager || !cacheManager.isInitialized()) {
        return res.status(503).json({ error: 'CacheManager not available' });
      }

      const stats = await cacheManager.stats();
      return res.json(stats);
    } catch (err: unknown) {
      logger.error('Error getting cache stats:', err);
      return res.status(500).json({ error: 'Failed to get cache statistics' });
    }
  }

  /**
   * Admin clear all cache API endpoint
   */
  async adminClearCache(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cacheManager = this.engine.getManager('CacheManager');
      if (!cacheManager || !cacheManager.isInitialized()) {
        return res.status(503).json({ error: 'CacheManager not available' });
      }

      await cacheManager.clear();
      logger.debug(`Cache cleared by admin user: ${currentUser.username}`);

      return res.json({
        success: true,
        message: 'All caches cleared successfully',
        timestamp: new Date().toISOString(),
        user: currentUser.username
      });
    } catch (err: unknown) {
      logger.error('Error clearing cache:', err);
      return res.status(500).json({ error: 'Failed to clear cache' });
    }
  }

  /**
   * Admin clear single-page cache API endpoint
   * POST /api/admin/cache/clear/page/:identifier
   * Evicts one page (by UUID, slug, or title) from the provider content cache
   * and the rendered-pages CacheManager region without a full restart.
   */
  async adminClearPageCache(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const identifier = req.params.identifier;
      if (!identifier) return res.status(400).json({ error: 'identifier parameter required' });

      const pageManager = this.engine.getManager('PageManager');
      const provider = pageManager?.getCurrentPageProvider?.();
      const evicted = provider?.invalidatePageCache?.(identifier) ?? null;

      // Also evict from the rendered-pages CacheManager region if available
      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        const resolvedUUID = pageManager?.getPageUUID?.(identifier) ?? identifier;
        try { await cacheManager.clear(undefined, `rendered-pages:${resolvedUUID}:*`); } catch { /* non-fatal */ }
      }

      logger.info(`[AdminAPI] Page cache evicted for '${identifier}' by ${currentUser.username}`);
      return res.json({ success: true, evicted, identifier });
    } catch (err) {
      logger.error('Error clearing page cache:', err);
      return res.status(500).json({ error: 'Failed to clear page cache' });
    }
  }

  /**
   * Admin clear cache region API endpoint
   */
  async adminClearCacheRegion(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cacheManager = this.engine.getManager('CacheManager');
      if (!cacheManager || !cacheManager.isInitialized()) {
        return res.status(503).json({ error: 'CacheManager not available' });
      }

      const region = req.params.region;
      if (!region) {
        return res.status(400).json({ error: 'Region parameter required' });
      }

      await cacheManager.clear(region);
      logger.debug(
        `Cache region '${region}' cleared by admin user: ${currentUser.username}`
      );

      return res.json({
        success: true,
        message: `Cache region '${region}' cleared successfully`,
        region: region,
        timestamp: new Date().toISOString(),
        user: currentUser.username
      });
    } catch (err: unknown) {
      logger.error(`Error clearing cache region '${req.params.region}':`, err);
      return res.status(500).json({ error: 'Failed to clear cache region' });
    }
  }

  // ============================================================================
  // Admin Audit Route Handlers
  // ============================================================================

  /**
   * Admin audit logs page
   */
  async adminAuditLogs(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to view audit logs.'
        );
      }

      const aclManager = this.engine.getManager('ACLManager');
      const auditStats = aclManager.getAccessControlStats();

      const templateData = await this.getCommonTemplateData(req);
      return res.render('admin-audit', {
        ...templateData,
        auditStats,
        title: 'Audit Logs - Admin',
        currentUser
      });
    } catch (err: unknown) {
      logger.error('Error loading audit logs:', err);
      return res.status(500).send('Error loading audit logs');
    }
  }

  /**
   * API endpoint for audit logs data
   */
  async adminAuditLogsApi(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const aclManager = this.engine.getManager('ACLManager');

      // Parse query parameters
      const filters = {
        user: req.query.user || null,
        action: req.query.action || null,
        decision:
          req.query.decision !== undefined
            ? req.query.decision === 'true'
            : null,
        pageName: req.query.pageName || null
      };

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get filtered logs
      const allFilteredLogs = aclManager.getAccessLog(1000, filters); // Get more than needed for pagination
      const total = allFilteredLogs.length;
      const auditLogs = allFilteredLogs.slice(offset, offset + limit);

      return res.json({
        results: auditLogs,
        total: total,
        limit: limit,
        offset: offset
      });
    } catch (err: unknown) {
      logger.error('Error retrieving audit logs:', err);
      return res.status(500).json({ error: 'Error retrieving audit logs' });
    }
  }

  /**
   * API endpoint for individual audit log details
   */
  async adminAuditLogDetails(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const aclManager = this.engine.getManager('ACLManager');
      const logId = req.params.id;

      // Get all audit logs and find the specific one
      const allLogs = aclManager.getAccessLog(10000); // Get a large number to find the specific log
      const logDetails = allLogs.find((log) => (log as { timestamp?: string }).timestamp === logId);

      if (!logDetails) {
        return res.status(404).json({ error: 'Audit log not found' });
      }

      return res.json(logDetails);
    } catch (err: unknown) {
      logger.error('Error retrieving audit log details:', err);
      return res.status(500).json({ error: 'Error retrieving audit log details' });
    }
  }

  /**
   * Export audit logs
   */
  async adminAuditExport(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const aclManager = this.engine.getManager('ACLManager');

      // Parse query parameters
      const filters = {
        user: req.query.user || null,
        action: req.query.action || null,
        decision:
          req.query.decision !== undefined
            ? req.query.decision === 'true'
            : null,
        pageName: req.query.pageName || null
      };

      const format = req.query.format || 'json';

      // Get filtered logs for export
      const exportData = aclManager.getAccessLog(10000, filters); // Get all matching logs

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="audit-logs.json"'
        );
        return res.send(JSON.stringify(exportData, null, 2));
      } else if (format === 'csv') {
        // Convert to CSV format
        const csvHeaders = [
          'timestamp',
          'user',
          'pageName',
          'action',
          'decision',
          'reason',
          'ip',
          'userAgent'
        ];
        const csvRows = exportData.map((logEntry) => {
          const log = logEntry as { timestamp?: string; user?: string; pageName?: string; action?: string; decision?: string; reason?: string; context?: { ip?: string; userAgent?: string } };
          return [
            log.timestamp,
            log.user,
            log.pageName,
            log.action,
            log.decision,
            log.reason,
            log.context?.ip || '',
            log.context?.userAgent || ''
          ];
        });

        const csvContent = [csvHeaders, ...csvRows]
          .map((row: (string | undefined)[]) => row.map((field: string | undefined) => `"${field}"`).join(','))
          .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="audit-logs.csv"'
        );
        return res.send(csvContent);
      } else {
        return res.status(400).send('Invalid format. Supported formats: json, csv');
      }
    } catch (err: unknown) {
      logger.error('Error exporting audit logs:', err);
      return res.status(500).send('Error exporting audit logs');
    }
  }

  /**
   * Get page metadata in a user-friendly format
   */
  async getPageMetadata(req: Request, res: Response) {
    logger.debug('🔍 getPageMetadata called for page:', req.params.page);
    try {
      const pageName = decodeURIComponent(req.params.page);
      const pageManager = this.engine.getManager('PageManager');

      const page = await pageManager.getPage(pageName);
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }

      // Extract metadata from the page (getPage returns 'metadata', not 'frontMatter')
      const metadata = page.metadata || {};
      const content = page.content || '';

      // Calculate content statistics
      const wordCount = content
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((word: string) => word.length > 0).length;
      const characterCount = content.length;
      const lineCount = content.split('\n').length;

      // Get file stats if available

      let fileStats = null;

      try {
        const filePath = page.filePath;
        const stats = await fse.stat(filePath);
        fileStats = {
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime
        };
      } catch {
        // File stats not available
      }

      // Get filesystem filename from page.filePath (path is already imported at top of file)
      const filesystemName = page.filePath ? path.basename(page.filePath) : null;

      // Count links and attachment references in raw markdown content
      const internalLinkCount = (content.match(/\[\[([^\]]+)\]\]|\[([^|]+)\|([^\]]+)\]/g) || []).length;
      const externalLinkCount = (content.match(/https?:\/\/[^\s)>\]"]+/g) || []).length;
      const attachmentRefCount = (content.match(/!\[\[|\[{[Ii]mage|\[{[Aa]ttachment/g) || []).length;

      // Get version information if versioning is enabled
      let versionInfo = null;
      let topContributors: { author: string; editCount: number }[] = [];
      let avgDaysBetweenEdits: number | null = null;
      try {
        const provider = pageManager.provider;
        if (provider && typeof provider.getVersionHistory === 'function') {
          const versions = await provider.getVersionHistory(pageName);
          if (versions && versions.length > 0) {
            const currentVersion = versions[0]; // Most recent version is first
            versionInfo = {
              currentVersion: currentVersion.version,
              totalVersions: versions.length,
              lastAuthor: currentVersion.author,
              lastModified: currentVersion.timestamp,
              changeType: currentVersion.changeType,
              comment: currentVersion.comment
            };

            // Aggregate contributors
            const contributorMap: Record<string, number> = {};
            for (const v of versions) {
              if (v.author) {
                contributorMap[v.author] = (contributorMap[v.author] || 0) + 1;
              }
            }
            topContributors = Object.entries(contributorMap)
              .map(([author, editCount]) => ({ author, editCount }))
              .sort((a, b) => b.editCount - a.editCount);

            // Average days between edits
            if (versions.length >= 2) {
              const newest = new Date(versions[0].timestamp).getTime();
              const oldest = new Date(versions[versions.length - 1].timestamp).getTime();
              const daysDiff = (newest - oldest) / (1000 * 60 * 60 * 24);
              avgDaysBetweenEdits = Math.round((daysDiff / (versions.length - 1)) * 10) / 10;
            }
          }
        }
      } catch (error: unknown) {
        // Versioning not available or failed - continue without it
        logger.debug('Version info not available:', getErrorMessage(error));
      }

      // Format the metadata for user-friendly display
      const formattedMetadata = {
        // Basic page info
        title: metadata.title || pageName,
        slug: metadata.slug || pageName,
        uuid: metadata.uuid || page.uuid,
        filesystemName: filesystemName,

        // Categorization and tags
        category: metadata['system-category'] || metadata.category || 'general',
        keywords: Array.isArray(metadata['user-keywords'])
          ? metadata['user-keywords']
          : typeof metadata.keywords === 'string' && metadata.keywords
            ? (metadata.keywords).split(',').map((k: string) => k.trim())
            : [],
        tags: metadata.tags || [],

        // Timestamps
        created: fileStats?.created || null,
        lastModified: versionInfo?.lastModified || metadata.lastModified || fileStats?.modified || null,
        lastAccessed: fileStats?.accessed || null,

        // Content statistics
        stats: {
          wordCount: wordCount,
          characterCount: characterCount,
          lineCount: lineCount,
          fileSize: fileStats?.size || null,
          internalLinks: internalLinkCount,
          externalLinks: externalLinkCount,
          attachmentRefs: attachmentRefCount
        },

        // Contributor statistics
        contributors: topContributors,
        avgDaysBetweenEdits: avgDaysBetweenEdits,

        // Additional metadata - author is the immutable original creator (from frontmatter);
        // editor is the last person to modify (from version history).
        author: metadata.author || null,
        editor: versionInfo?.lastAuthor || null,
        description: metadata.description || null,
        version: versionInfo ? `v${versionInfo.currentVersion} of ${versionInfo.totalVersions}` : metadata.version || null,
        versionInfo: versionInfo, // Include full version info for advanced use
        status: metadata.status || 'published',

        // Schema.org data if present
        schemaType: metadata.schemaType || null,
        schemaData: metadata.schemaData || null,

        // Custom metadata
        custom: {} as Record<string, unknown>
      };

      // Add any custom metadata fields not already handled
      for (const [key, value] of Object.entries(metadata)) {
        if (
          ![
            'title',
            'slug',
            'uuid',
            'system-category',
            'system-location',
            'category',
            'user-keywords',
            'keywords',
            'tags',
            'lastModified',
            'author',
            'page-creator',
            'description',
            'version',
            'status',
            'schemaType',
            'schemaData'
          ].includes(key)
        ) {
          formattedMetadata.custom[key] = value;
        }
      }

      return res.json(formattedMetadata);
    } catch (error: unknown) {
      logger.error('Error retrieving page metadata:', error);
      return res
        .status(500)
        .json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  /**
   * API endpoint for page name autocomplete suggestions
   * GET /api/page-suggestions?q=partial
   *
   * Used for:
   * - Autocomplete when typing [page name] in editor
   * - Autocomplete in search dialogs
   *
   * Related: GitHub Issue #90 - TypeDown for Internal Page Links
   */
  async getPageSuggestions(req: Request, res: Response) {
    try {
      const query = (req.query.q as string) || '';
      const limit = parseInt(req.query.limit as string) || 10;

      if (!query || query.length < 2) {
        return res.json({ suggestions: [] });
      }

      const searchManager = this.engine.getManager('SearchManager');
      const pageManager = this.engine.getManager('PageManager');

      if (!searchManager || !pageManager) {
        return res.status(500).json({ error: 'Search not available' });
      }

      // Get all page names (getAllPages returns an array of page name strings)
      const allPageNames = await pageManager.getAllPages();

      // Filter page names that match the query (case-insensitive)
      const queryLower = query.toLowerCase();
      const matchingNames = allPageNames
        .filter((pageName: string) => {
          if (!pageName || typeof pageName !== 'string') return false;
          return pageName.toLowerCase().includes(queryLower);
        })
        // Sort: exact matches first, then prefix matches, then alphabetical
        .sort((a: string, b: string) => {
          const aLower = a.toLowerCase();
          const bLower = b.toLowerCase();

          // Exact match
          if (aLower === queryLower) return -1;
          if (bLower === queryLower) return 1;

          // Prefix match
          const aPrefix = aLower.startsWith(queryLower);
          const bPrefix = bLower.startsWith(queryLower);
          if (aPrefix && !bPrefix) return -1;
          if (!aPrefix && bPrefix) return 1;

          // Alphabetical
          return aLower.localeCompare(bLower);
        })
        .slice(0, limit);

      // Load metadata for matching pages (no content needed)
      const matchingPages = await Promise.all(
        matchingNames.map(async (pageName: string) => {
          try {
            const metadata = await pageManager.getPageMetadata(pageName);
            return {
              name: pageName,
              slug: metadata?.slug || pageName,
              title: metadata?.title || pageName,
              category: metadata?.['system-category'] || metadata?.category || 'general'
            };
          } catch {
            // If page load fails, return basic info
            return {
              name: pageName,
              slug: pageName,
              title: pageName,
              category: 'general'
            };
          }
        })
      );

      return res.json({
        query,
        suggestions: matchingPages,
        count: matchingPages.length
      });
    } catch (error: unknown) {
      logger.error('Error getting page suggestions:', error);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  // ============================================================================
  // Version Management API Handlers (Phase 6)
  // ============================================================================

  /**
   * GET /api/page/:identifier/versions
   * Get version history for a page
   */
  async getPageVersions(req: Request, res: Response) {
    try {
      const { identifier } = req.params;
      const pageManager = this.engine.getManager('PageManager');

      if (!pageManager) {
        return res.status(500).json({ error: 'PageManager not available' });
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.getVersionHistory !== 'function') {
        return res.status(501).json({
          error: 'Versioning not supported',
          message: 'Current page provider does not support version history'
        });
      }

      // Get version history
      const versions = await provider.getVersionHistory(identifier);

      return res.json({
        success: true,
        identifier: identifier,
        versionCount: versions.length,
        versions: versions
      });

    } catch (error: unknown) {
      logger.error(`Error getting page versions: ${getErrorMessage(error)}`);

      if (getErrorMessage(error).includes('not found')) {
        return res.status(404).json({
          error: 'Page not found',
          message: getErrorMessage(error)
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        details: getErrorMessage(error)
      });
    }
  }

  /**
   * GET /api/page/:identifier/version/:version
   * Get specific version content
   */
  async getPageVersion(req: Request, res: Response) {
    try {
      const { identifier, version } = req.params;
      const versionNum = parseInt(version);

      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({
          error: 'Invalid version number',
          message: 'Version must be a positive integer'
        });
      }

      const pageManager = this.engine.getManager('PageManager');

      if (!pageManager) {
        return res.status(500).json({ error: 'PageManager not available' });
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.getPageVersion !== 'function') {
        return res.status(501).json({
          error: 'Versioning not supported',
          message: 'Current page provider does not support version history'
        });
      }

      // Get version content
      const versionData = await provider.getPageVersion(identifier, versionNum);

      return res.json({
        success: true,
        identifier: identifier,
        version: versionNum,
        content: versionData.content,
        metadata: versionData.metadata
      });

    } catch (error: unknown) {
      logger.error(`Error getting page version: ${getErrorMessage(error)}`);

      if (getErrorMessage(error).includes('not found')) {
        return res.status(404).json({
          error: 'Page or version not found',
          message: getErrorMessage(error)
        });
      }

      if (getErrorMessage(error).includes('does not exist')) {
        return res.status(404).json({
          error: 'Version not found',
          message: getErrorMessage(error)
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        details: getErrorMessage(error)
      });
    }
  }

  /**
   * GET /api/page/:identifier/compare/:v1/:v2
   * Compare two versions of a page
   */
  async comparePageVersions(req: Request, res: Response) {
    try {
      const { identifier, v1, v2 } = req.params;
      const version1 = parseInt(v1);
      const version2 = parseInt(v2);

      if (isNaN(version1) || isNaN(version2) || version1 < 1 || version2 < 1) {
        return res.status(400).json({
          error: 'Invalid version numbers',
          message: 'Versions must be positive integers'
        });
      }

      const pageManager = this.engine.getManager('PageManager');

      if (!pageManager) {
        return res.status(500).json({ error: 'PageManager not available' });
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.compareVersions !== 'function') {
        return res.status(501).json({
          error: 'Versioning not supported',
          message: 'Current page provider does not support version comparison'
        });
      }

      // Compare versions
      const comparison = await provider.compareVersions(identifier, version1, version2);

      return res.json({
        success: true,
        identifier: identifier,
        comparison: comparison
      });

    } catch (error: unknown) {
      logger.error(`Error comparing page versions: ${getErrorMessage(error)}`);

      if (getErrorMessage(error).includes('not found')) {
        return res.status(404).json({
          error: 'Page or version not found',
          message: getErrorMessage(error)
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        details: getErrorMessage(error)
      });
    }
  }

  /**
   * POST /api/page/:identifier/restore/:version
   * Restore page to a specific version
   */
  async restorePageVersion(req: Request, res: Response) {
    try {
      const { identifier, version } = req.params;
      const versionNum = parseInt(version);

      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({
          error: 'Invalid version number',
          message: 'Version must be a positive integer'
        });
      }

      // Check authentication
      if (!req.userContext || !req.userContext.isAuthenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be logged in to restore versions'
        });
      }

      const pageManager = this.engine.getManager('PageManager');

      if (!pageManager) {
        return res.status(500).json({ error: 'PageManager not available' });
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.restoreVersion !== 'function') {
        return res.status(501).json({
          error: 'Versioning not supported',
          message: 'Current page provider does not support version restoration'
        });
      }

      // Get restore options from request body
      const { comment } = req.body || {};

      // Restore version
      const newVersion = await provider.restoreVersion(identifier, versionNum, {
        author: req.userContext.username || 'unknown',
        comment: comment || `Restored from v${versionNum}`
      });

      logger.info(`[WikiRoutes] User ${req.userContext.username} restored page ${identifier} to v${versionNum}, created v${newVersion}`);

      return res.json({
        success: true,
        identifier: identifier,
        restoredFromVersion: versionNum,
        newVersion: newVersion,
        message: `Successfully restored to version ${versionNum}, created version ${newVersion}`
      });

    } catch (error: unknown) {
      logger.error(`Error restoring page version: ${getErrorMessage(error)}`);

      if (getErrorMessage(error).includes('not found')) {
        return res.status(404).json({
          error: 'Page or version not found',
          message: getErrorMessage(error)
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        details: getErrorMessage(error)
      });
    }
  }

  /**
   * GET /history/:page
   * Show page history view
   */
  async pageHistory(req: Request, res: Response) {
    try {
      const pageName = decodeURIComponent(req.params.page);
      logger.info(`[pageHistory] Request for page: "${pageName}"`);

      const pageManager = this.engine.getManager('PageManager');

      // Create WikiContext for this request
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.INFO,
        pageName: pageName,
        response: res
      });

      if (!pageManager) {
        return this.renderError(req, res, 500, 'Server Error', 'PageManager not available');
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.getVersionHistory !== 'function') {
        return this.renderError(req, res, 501, 'Not Implemented', 'Page versioning is not enabled. Please configure VersioningFileProvider.');
      }

      // Check if page exists
      if (!pageManager.pageExists(pageName)) {
        return this.renderError(req, res, 404, 'Not Found', `Page "${pageName}" not found`);
      }

      // Check private page access for history
      const canAccessPrivateHistory = await this.checkPrivatePageAccess(wikiContext, pageName);
      if (!canAccessPrivateHistory) {
        return this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to view this page history.');
      }

      // Get page metadata (only need uuid and title)
      const pageMetadata = await pageManager.getPageMetadata(pageName);
      logger.info(`[pageHistory] Page info - UUID: ${pageMetadata?.uuid}, Title: ${pageMetadata?.title}`);

      // Get version history (BasePageProvider stubs throw; catch and render 501)
      logger.info(`[pageHistory] Fetching version history for: "${pageName}"`);
      let versions: IVersionEntry[];
      try {
        versions = await provider.getVersionHistory(pageName);
      } catch {
        return this.renderError(req, res, 501, 'Not Implemented', 'Page versioning is not enabled. Please configure VersioningFileProvider.');
      }
      logger.info(`[pageHistory] Found ${versions.length} versions`);

      // Get common template data (includes theme paths, user, pages, etc.)
      const templateData = await this.getCommonTemplateData(req);

      res.render('page-history', {
        ...templateData,
        pageName: pageName,
        pageUuid: pageMetadata?.uuid,
        versions: versions,
        versionCount: versions.length
      });

    } catch (error: unknown) {
      logger.error(`Error rendering page history: ${getErrorMessage(error)}`);
      const wikiContext = this.createWikiContext(req, { response: res });
      const templateData = this.getTemplateDataFromContext(wikiContext);
      res.status(500).render('error', {
        ...templateData,
        message: 'Error loading page history',
        error: getErrorMessage(error)
      });
    }
  }

  /**
   * GET /diff/:page?v1=X&v2=Y
   * Show version comparison view
   */
  async pageDiff(req: Request, res: Response) {
    try {
      const pageName = decodeURIComponent(req.params.page);
      const v1 = parseInt(req.query.v1 as string);
      const v2 = parseInt(req.query.v2 as string);

      // Create WikiContext for this request
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.DIFF,
        pageName: pageName,
        response: res
      });

      if (isNaN(v1) || isNaN(v2) || v1 < 1 || v2 < 1) {
        const templateData = this.getTemplateDataFromContext(wikiContext);
        return res.status(400).render('error', {
          ...templateData,
          message: 'Invalid version numbers. Please provide valid v1 and v2 parameters.'
        });
      }

      const pageManager = this.engine.getManager('PageManager');

      if (!pageManager) {
        const templateData = this.getTemplateDataFromContext(wikiContext);
        return res.status(500).render('error', {
          ...templateData,
          message: 'PageManager not available'
        });
      }

      const provider = pageManager.provider;

      // Check if provider supports versioning
      if (!provider || typeof provider.compareVersions !== 'function') {
        const templateData = this.getTemplateDataFromContext(wikiContext);
        return res.status(501).render('error', {
          ...templateData,
          message: 'Page versioning is not enabled. Please configure VersioningFileProvider.'
        });
      }

      // Check if page exists
      if (!pageManager.pageExists(pageName)) {
        const templateData = this.getTemplateDataFromContext(wikiContext);
        return res.status(404).render('error', {
          ...templateData,
          message: `Page "${pageName}" not found`
        });
      }

      // Get page metadata (only need uuid)
      const pageMetadata = await pageManager.getPageMetadata(pageName);

      // Compare versions
      const comparison = (await provider.compareVersions(pageName, v1, v2)) ?? {};

      // Get common template data (includes theme paths, user, pages, etc.)
      const templateData = await this.getCommonTemplateData(req);

      // Get left menu content
      const leftMenu = await this.getLeftMenu(wikiContext.userContext);

      res.render('page-diff', {
        ...templateData,
        leftMenu,
        pageUuid: pageMetadata?.uuid,
        version1: comparison.version1,
        version2: comparison.version2,
        diff: comparison.diff,
        stats: comparison.stats
      });

    } catch (error: unknown) {
      logger.error(`Error rendering page diff: ${getErrorMessage(error)}`);
      const wikiContext = this.createWikiContext(req, { response: res });
      const templateData = this.getTemplateDataFromContext(wikiContext);
      res.status(500).render('error', {
        ...templateData,
        message: 'Error comparing versions',
        error: getErrorMessage(error)
      });
    }
  }

  /**
   * Display user-keyword creation form
   * Accessible to users with edit permission
   */
  async userKeywordCreate(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Check if user can edit (editor role or above)
      if (!currentUser || !(await wikiContext.hasPermission('page-edit'))) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You need editor permissions to create user-keywords'
        );
      }

      const commonData = await this.getCommonTemplateData(req);

      res.render('user-keyword-create', {
        ...commonData,
        title: 'Create User Keyword',
        csrfToken: req.session.csrfToken,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null
      });
    } catch (err: unknown) {
      logger.error('Error loading user-keyword create form:', err);
      res.status(500).send('Error loading form');
    }
  }

  /**
   * Handle user-keyword creation form submission
   * Creates a new user-keyword in the custom config
   */
  async userKeywordCreateSubmit(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Check if user can edit
      if (!currentUser || !(await wikiContext.hasPermission('page-edit'))) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const { label, description } = req.body as { label?: string; description?: string };

      // Validate input
      if (!label || !label.trim()) {
        return res.redirect('/user-keywords/create?error=' + encodeURIComponent('Label is required'));
      }
      if (!description || !description.trim()) {
        return res.redirect(
          '/user-keywords/create?error=' + encodeURIComponent('Description is required')
        );
      }

      const trimmedLabel = label.trim();
      const trimmedDescription = description.trim();

      // Normalize the internal name (lowercase, alphanumeric with hyphens)
      const internalName = trimmedLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (!internalName) {
        return res.redirect(
          '/user-keywords/create?error=' + encodeURIComponent('Invalid label format')
        );
      }

      // Get config manager
      const configManager = this.engine.getManager('ConfigurationManager');
      if (!configManager) {
        return res.redirect(
          '/user-keywords/create?error=' + encodeURIComponent('Configuration manager not available')
        );
      }

      // Get existing user-keywords
      const existingKeywords = (configManager.getProperty('ngdpbase.user-keywords') || {}) as Record<
        string,
        Record<string, unknown>
      >;

      // Check if keyword already exists
      if (existingKeywords[internalName]) {
        return res.redirect(
          '/user-keywords/create?error=' +
            encodeURIComponent(`User-keyword "${trimmedLabel}" already exists`)
        );
      }

      // Add new keyword with default values
      const updatedKeywords = {
        ...existingKeywords,
        [internalName]: {
          label: trimmedLabel,
          description: trimmedDescription,
          category: 'general',
          enabled: true,
          restrictEditing: false
        }
      };

      await configManager.setProperty('ngdpbase.user-keywords', updatedKeywords);

      logger.info(`[WikiRoutes] User ${currentUser.username} created user-keyword: ${internalName}`);

      // Create a wiki page for the keyword (#240)
      const pageManager = this.engine.getManager('PageManager');
      if (pageManager) {
        const pageName = trimmedLabel;
        const pageExists = pageManager.pageExists(pageName);

        if (!pageExists) {
          const pageContent = `# ${trimmedLabel}

${trimmedDescription}

## Overview

*Add more details about "${trimmedLabel}" here.*

## Related Pages

*List pages related to this topic.*
`;
          const pageMetadata = {
            'system-category': 'general',
            'user-keywords': [internalName],
            author: currentUser.username
          };

          await pageManager.savePage(pageName, pageContent, pageMetadata);
          logger.info(`[WikiRoutes] Created definition page for user-keyword: ${pageName}`);
        }
      }

      // Redirect to edit the new keyword's page so user can add more content
      return res.redirect(
        '/edit/' +
          encodeURIComponent(trimmedLabel) +
          '?success=' +
          encodeURIComponent(`User-keyword "${trimmedLabel}" created. Add more details below.`)
      );
    } catch (err: unknown) {
      logger.error('Error creating user-keyword:', err);
      return res.redirect(
        '/user-keywords/create?error=' + encodeURIComponent('Failed to create user-keyword')
      );
    }
  }

  /**
   * Create a wiki page for an existing user-keyword that doesn't have one
   */
  async userKeywordCreatePage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      // Check if user can edit
      if (!currentUser || !(await wikiContext.hasPermission('page-edit'))) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const keywordId = req.params.keywordId;

      // Get config manager and find the keyword
      const configManager = this.engine.getManager('ConfigurationManager');
      const userKeywordsConfig = (configManager?.getProperty('ngdpbase.user-keywords') || {}) as Record<
        string,
        Record<string, unknown>
      >;

      const keywordConfig = userKeywordsConfig[keywordId];
      if (!keywordConfig) {
        return res.redirect(
          '/view/User%20Keywords?error=' + encodeURIComponent('User-keyword not found')
        );
      }

      const label = (keywordConfig.label as string) || keywordId;
      const description = (keywordConfig.description as string) || '';

      // Check if page already exists
      const pageManager = this.engine.getManager('PageManager');
      if (pageManager.pageExists(label)) {
        return res.redirect('/view/' + encodeURIComponent(label));
      }

      // Create the page
      const pageContent = `# ${label}

${description}

## Overview

*Add more details about "${label}" here.*

## Related Pages

*List pages related to this topic.*
`;
      const pageMetadata = {
        'system-category': 'general',
        'user-keywords': [keywordId],
        author: currentUser.username
      };

      await pageManager.savePage(label, pageContent, pageMetadata);
      logger.info(`[WikiRoutes] User ${currentUser.username} created page for keyword: ${label}`);

      // Redirect to edit so user can add more content
      return res.redirect(
        '/edit/' +
          encodeURIComponent(label) +
          '?success=' +
          encodeURIComponent(`Page created for "${label}". Add more details below.`)
      );
    } catch (err: unknown) {
      logger.error('Error creating user-keyword page:', err);
      return res.redirect(
        '/view/User%20Keywords?error=' + encodeURIComponent('Failed to create page')
      );
    }
  }

  /**
   * API endpoint to get all user-keywords with page status
   */
  apiGetUserKeywords(_req: Request, res: Response): void {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      const pageManager = this.engine.getManager('PageManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      const keywords = Object.entries(userKeywordsConfig).map(([key, config]) => {
        const label = (config.label as string) || key;
        const hasPage = pageManager ? pageManager.pageExists(label) : false;

        return {
          id: key,
          hasPage,
          pageUrl: hasPage ? `/view/${encodeURIComponent(label)}` : null,
          createPageUrl: !hasPage ? `/user-keywords/create-page/${encodeURIComponent(key)}` : null,
          ...config
        };
      });

      const missingPages = keywords.filter(k => !k.hasPage).length;

      res.json({
        success: true,
        keywords,
        stats: {
          total: keywords.length,
          withPages: keywords.length - missingPages,
          missingPages
        }
      });
    } catch (err: unknown) {
      logger.error('Error getting user-keywords:', err);
      res.status(500).json({ success: false, error: 'Failed to get user-keywords' });
    }
  }

  /**
   * Admin page for managing user-keywords
   */
  async adminKeywords(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).send('Access denied');
        return;
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const pageManager = this.engine.getManager('PageManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      // Get all pages to find keyword usage (metadata only - no content needed)
      const allPages = pageManager ? await pageManager.getAllPages() : [];
      const keywordUsage: Record<string, string[]> = {};

      for (const pageName of allPages) {
        const metadata = await pageManager.getPageMetadata(pageName);
        const pageKeywords = (metadata?.['user-keywords'] as string[]) || [];
        for (const kw of pageKeywords) {
          if (!keywordUsage[kw]) {
            keywordUsage[kw] = [];
          }
          keywordUsage[kw].push(pageName);
        }
      }

      // Build keywords array with stats, sorted alphabetically by label to match the form dropdowns
      const keywords = Object.entries(userKeywordsConfig).map(([key, config]) => {
        const label = (config.label as string) || key;
        const hasPage = pageManager ? pageManager.pageExists(label) : false;
        const usageCount = keywordUsage[key]?.length || 0;

        return {
          id: key,
          label,
          description: (config.description as string) || '',
          category: (config.category as string) || '',
          enabled: config.enabled !== false,
          restrictEditing: config.restrictEditing === true,
          hasPage,
          usageCount,
          pageUrl: hasPage ? `/view/${encodeURIComponent(label)}` : null
        };
      }).sort((a, b) => a.label.localeCompare(b.label));

      // Calculate stats
      const totalKeywords = keywords.length;
      const enabledKeywords = keywords.filter(k => k.enabled).length;
      const keywordsWithPages = keywords.filter(k => k.hasPage).length;
      const keywordsInUse = keywords.filter(k => k.usageCount > 0).length;

      const successMessage = req.query.success as string | undefined;
      const errorMessage = req.query.error as string | undefined;

      res.render('admin-keywords', {
        title: 'Keyword Management',
        currentUser,
        keywords,
        stats: {
          total: totalKeywords,
          enabled: enabledKeywords,
          withPages: keywordsWithPages,
          inUse: keywordsInUse
        },
        successMessage,
        errorMessage,
        csrfToken: req.session?.csrfToken || ''
      });
    } catch (err: unknown) {
      logger.error('Error loading admin keywords page:', err);
      res.status(500).send('Failed to load keywords page');
    }
  }

  /**
   * Create a new user-keyword
   */
  async adminCreateKeyword(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const { id, label, description, category, enabled, restrictEditing } = req.body;

      if (!id || !label) {
        res.status(400).json({ error: 'Keyword ID and label are required' });
        return;
      }

      // Validate ID format (lowercase, numbers, hyphens only)
      if (!/^[a-z0-9-]+$/.test(id)) {
        res.status(400).json({ error: 'Keyword ID must contain only lowercase letters, numbers, and hyphens' });
        return;
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      // Check if keyword ID already exists
      if (userKeywordsConfig[id]) {
        res.status(400).json({ error: 'A keyword with this ID already exists' });
        return;
      }

      // Create the new keyword
      userKeywordsConfig[id] = {
        label,
        description: description || '',
        category: category || '',
        enabled: enabled !== false,
        restrictEditing: restrictEditing === true
      };

      await configManager.setProperty('ngdpbase.user-keywords', userKeywordsConfig);

      res.json({
        success: true,
        message: 'Keyword created successfully',
        keyword: { id, ...userKeywordsConfig[id] }
      });
    } catch (err: unknown) {
      logger.error('Error creating keyword:', err);
      res.status(500).json({ error: 'Failed to create keyword' });
    }
  }

  /**
   * API endpoint to get pages using a specific keyword
   */
  async adminKeywordUsage(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const keywordId = req.params.id;
      const pageManager = this.engine.getManager('PageManager');
      const allPages = pageManager ? await pageManager.getAllPages() : [];
      const pagesUsingKeyword: string[] = [];

      // Only need metadata, not content
      for (const pageName of allPages) {
        const metadata = await pageManager.getPageMetadata(pageName);
        const pageKeywords = (metadata?.['user-keywords'] as string[]) || [];
        if (pageKeywords.includes(keywordId)) {
          pagesUsingKeyword.push(pageName);
        }
      }

      res.json({
        success: true,
        keywordId,
        pages: pagesUsingKeyword,
        count: pagesUsingKeyword.length
      });
    } catch (err: unknown) {
      logger.error('Error getting keyword usage:', err);
      res.status(500).json({ error: 'Failed to get keyword usage' });
    }
  }

  /**
   * Update a user-keyword
   */
  async adminUpdateKeyword(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const keywordId = req.params.id;
      const { label, description, category, enabled, restrictEditing } = req.body;

      const configManager = this.engine.getManager('ConfigurationManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      if (!userKeywordsConfig[keywordId]) {
        res.status(404).json({ error: 'Keyword not found' });
        return;
      }

      // Update the keyword
      userKeywordsConfig[keywordId] = {
        ...userKeywordsConfig[keywordId],
        label: label || userKeywordsConfig[keywordId].label,
        description: description !== undefined ? description : userKeywordsConfig[keywordId].description,
        category: category !== undefined ? category : userKeywordsConfig[keywordId].category,
        enabled: enabled !== undefined ? enabled : userKeywordsConfig[keywordId].enabled,
        restrictEditing: restrictEditing !== undefined ? restrictEditing : userKeywordsConfig[keywordId].restrictEditing
      };

      await configManager.setProperty('ngdpbase.user-keywords', userKeywordsConfig);

      res.json({
        success: true,
        message: 'Keyword updated successfully',
        keyword: { id: keywordId, ...userKeywordsConfig[keywordId] }
      });
    } catch (err: unknown) {
      logger.error('Error updating keyword:', err);
      res.status(500).json({ error: 'Failed to update keyword' });
    }
  }

  /**
   * Delete a user-keyword
   */
  async adminDeleteKeyword(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const keywordId = req.params.id;
      const { reassignTo, removeFromPages } = req.body;

      const configManager = this.engine.getManager('ConfigurationManager');
      const pageManager = this.engine.getManager('PageManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      if (!userKeywordsConfig[keywordId]) {
        res.status(404).json({ error: 'Keyword not found' });
        return;
      }

      // Get pages using this keyword
      const allPages = pageManager ? await pageManager.getAllPages() : [];
      let pagesUpdated = 0;

      for (const pageName of allPages) {
        const page = await pageManager.getPage(pageName);
        const pageKeywords = (page?.metadata?.['user-keywords'] as string[]) || [];

        if (pageKeywords.includes(keywordId)) {
          let newKeywords: string[];

          if (removeFromPages) {
            // Remove the keyword from pages
            newKeywords = pageKeywords.filter(k => k !== keywordId);
          } else if (reassignTo && userKeywordsConfig[reassignTo]) {
            // Replace with reassign target (avoid duplicates)
            newKeywords = pageKeywords
              .map(k => (k === keywordId ? reassignTo : k))
              .filter((k, i, arr) => arr.indexOf(k) === i);
          } else {
            // Default: remove from pages
            newKeywords = pageKeywords.filter(k => k !== keywordId);
          }

          if (page) {
            await pageManager.savePage(pageName, page.content, {
              ...page.metadata,
              'user-keywords': newKeywords
            });
          }
          pagesUpdated++;
        }
      }

      // Delete the keyword from config
      delete userKeywordsConfig[keywordId];
      await configManager.setProperty('ngdpbase.user-keywords', userKeywordsConfig);

      res.json({
        success: true,
        message: `Keyword deleted successfully. ${pagesUpdated} page(s) updated.`,
        pagesUpdated
      });
    } catch (err: unknown) {
      logger.error('Error deleting keyword:', err);
      res.status(500).json({ error: 'Failed to delete keyword' });
    }
  }

  /**
   * Consolidate (merge) two keywords
   */
  async adminConsolidateKeywords(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (
        !currentUser ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const { sourceId, targetId, deleteSource } = req.body;

      if (!sourceId || !targetId) {
        res.status(400).json({ error: 'Source and target keyword IDs are required' });
        return;
      }

      if (sourceId === targetId) {
        res.status(400).json({ error: 'Source and target must be different keywords' });
        return;
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const pageManager = this.engine.getManager('PageManager');
      const userKeywordsConfig = configManager?.getProperty('ngdpbase.user-keywords', {}) as Record<
        string,
        Record<string, unknown>
      >;

      if (!userKeywordsConfig[sourceId]) {
        res.status(404).json({ error: 'Source keyword not found' });
        return;
      }

      if (!userKeywordsConfig[targetId]) {
        res.status(404).json({ error: 'Target keyword not found' });
        return;
      }

      // Update all pages: replace source with target
      const allPages = pageManager ? await pageManager.getAllPages() : [];
      let pagesUpdated = 0;

      for (const pageName of allPages) {
        const page = await pageManager.getPage(pageName);
        const pageKeywords = (page?.metadata?.['user-keywords'] as string[]) || [];

        if (pageKeywords.includes(sourceId)) {
          // Replace source with target, avoiding duplicates
          const newKeywords = pageKeywords
            .map(k => (k === sourceId ? targetId : k))
            .filter((k, i, arr) => arr.indexOf(k) === i);

          if (page) {
            await pageManager.savePage(pageName, page.content, {
              ...page.metadata,
              'user-keywords': newKeywords
            });
          }
          pagesUpdated++;
        }
      }

      // Optionally delete the source keyword
      if (deleteSource) {
        delete userKeywordsConfig[sourceId];
        await configManager.setProperty('ngdpbase.user-keywords', userKeywordsConfig);
      }

      res.json({
        success: true,
        message: `Keywords consolidated successfully. ${pagesUpdated} page(s) updated.${deleteSource ? ' Source keyword deleted.' : ''}`,
        pagesUpdated,
        sourceDeleted: !!deleteSource
      });
    } catch (err: unknown) {
      logger.error('Error consolidating keywords:', err);
      res.status(500).json({ error: 'Failed to consolidate keywords' });
    }
  }

  // ---------------------------------------------------------------------------
  // Media routes (Phase 3 stub — MediaManager not yet doing real scanning)
  // ---------------------------------------------------------------------------

  /**
   * Sort an array of media items by date or caption.
   *
   * Reads `?sort` (date|caption) and `?order` (asc|desc) from req.query.
   * Default: sort=date, order=asc (oldest first).
   * Caption resolves as: metadata.caption → metadata.imageDescription → filename.
   * Date resolves as: metadata.dateTimeOriginal → metadata.createDate → year → 0.
   */
  private applyMediaSort(
    req: Request,
    items: Record<string, unknown>[]
  ): { sort: string; order: string; items: Record<string, unknown>[] } {
    const sort = typeof req.query.sort === 'string' && req.query.sort === 'caption' ? 'caption' : 'date';
    const order = typeof req.query.order === 'string' && req.query.order === 'desc' ? 'desc' : 'asc';
    const asc = order === 'asc';

    const sorted = [...items].sort((a, b) => {
      let cmp = 0;
      if (sort === 'caption') {
        const getMeta = (item: Record<string, unknown>) => item['metadata'] as Record<string, unknown> | undefined;
        const getCaption = (item: Record<string, unknown>) => {
          const m = getMeta(item);
          const val = m?.['caption'] ?? m?.['imageDescription'] ?? item['filename'] ?? '';
          return (typeof val === 'string' ? val : '').toLowerCase();
        };
        cmp = getCaption(a).localeCompare(getCaption(b));
      } else {
        const getDate = (item: Record<string, unknown>): number => {
          const m = item['metadata'] as Record<string, unknown> | undefined;
          const raw = m?.['dateTimeOriginal'] ?? m?.['createDate'];
          if (typeof raw === 'string' && raw) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) return d.getTime();
          }
          return ((item['year'] as number) ?? 0) * 10000;
        };
        cmp = getDate(a) - getDate(b);
      }
      return asc ? cmp : -cmp;
    });

    return { sort, order, items: sorted };
  }

  /**
   * GET /media
   * Media home page — groups items by year.
   * Stub: returns a "not yet available" page when MediaManager is not registered.
   */
  async mediaHome(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const years = (await mediaManager.getYears(wikiContext));
      const commonData = await this.getCommonTemplateData(req);
      return res.render('media-home', {
        ...commonData,
        wikiContext,
        years,
        title: 'Media Browser'
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering media home:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/year/:year
   * Items for a given year.
   * Stub: returns empty list.
   */
  async mediaByYear(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const year = parseInt(req.params.year, 10);
      if (isNaN(year)) {
        return res.status(400).send('Invalid year');
      }
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const raw = await mediaManager.listByYear(year, wikiContext);
      const { sort, order, items } = this.applyMediaSort(req, raw as unknown as Record<string, unknown>[]);
      const commonData = await this.getCommonTemplateData(req);
      return res.render('media-year', {
        ...commonData,
        wikiContext,
        year,
        items,
        sort,
        order,
        title: `Media — ${year}`
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering media year:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/keyword/:keyword
   * Album view — all media items whose EXIF/XMP keywords include the given keyword.
   */
  async mediaByKeyword(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const keyword = decodeURIComponent(req.params.keyword);
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const raw = await mediaManager.listByKeyword(keyword, wikiContext);
      const { sort, order, items } = this.applyMediaSort(req, raw as unknown as Record<string, unknown>[]);
      const commonData = await this.getCommonTemplateData(req);
      return res.render('media-keyword', {
        ...commonData,
        wikiContext,
        keyword,
        items,
        sort,
        order,
        title: `Media — ${keyword}`
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering media keyword album:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/item/:id
   * Item detail page.
   * Stub: returns 404 when item is not found.
   */
  async mediaItemDetail(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const item = await mediaManager.getItem(req.params.id, wikiContext);
      if (!item) {
        return res.status(404).send('Media item not found');
      }

      // Prev/next navigation — keyword-scoped when arriving from a keyword album,
      // otherwise year-scoped.
      const albumKeyword = typeof req.query.keyword === 'string' ? req.query.keyword : null;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'date';
      const order = typeof req.query.order === 'string' ? req.query.order : 'asc';
      const sortParam = (sort !== 'date' || order !== 'asc') ? `sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}` : '';
      let prevItem: { id: string; filename: string } | null = null;
      let nextItem: { id: string; filename: string } | null = null;
      if (albumKeyword) {
        const raw = await mediaManager.listByKeyword(albumKeyword, wikiContext);
        const { items: siblings } = this.applyMediaSort(req, raw as unknown as Record<string, unknown>[]);
        const idx = siblings.findIndex((s: Record<string, unknown>) => s['id'] === item.id);
        if (idx > 0) prevItem = siblings[idx - 1] as { id: string; filename: string };
        if (idx >= 0 && idx < siblings.length - 1) nextItem = siblings[idx + 1] as { id: string; filename: string };
      } else if (item.year) {
        const raw = await mediaManager.listByYear(item.year, wikiContext);
        const { items: siblings } = this.applyMediaSort(req, raw as unknown as Record<string, unknown>[]);
        const idx = siblings.findIndex((s: Record<string, unknown>) => s['id'] === item.id);
        if (idx > 0) prevItem = siblings[idx - 1] as { id: string; filename: string };
        if (idx >= 0 && idx < siblings.length - 1) nextItem = siblings[idx + 1] as { id: string; filename: string };
      }

      // Check which keywords have existing wiki pages for red-link support
      const keywordPageExists: Record<string, boolean> = {};
      const rawKeywords = item.metadata?.keywords;
      if (rawKeywords) {
        const kw = (Array.isArray(rawKeywords) ? rawKeywords : [rawKeywords])
          .map((k: unknown) => (typeof k === 'string' ? k : String(k)))
          .filter(Boolean);
        const pageManager = this.engine.getManager('PageManager');
        if (pageManager) {
          for (const k of kw) {
            keywordPageExists[k] = pageManager.pageExists(k);
          }
        }
      }

      const commonData = await this.getCommonTemplateData(req);
      return res.render('media-item', {
        ...commonData,
        wikiContext,
        item,
        prevItem,
        nextItem,
        albumKeyword,
        sortParam,
        keywordPageExists,
        title: `Media — ${item.filename}`
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering media item:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/search
   * Search results.
   * Stub: returns empty results.
   */
  async mediaSearch(req: Request, res: Response) {
    const assetService = this.engine.getManager('AssetService');
    if (!assetService) {
      return res.status(503).send('Asset service not enabled');
    }
    try {
      const query = (req.query.q as string) || '';
      const sort = typeof req.query.sort === 'string' && req.query.sort === 'caption' ? 'caption' : 'date';
      const order = typeof req.query.order === 'string' && req.query.order === 'desc' ? 'desc' : ('asc' as 'asc' | 'desc');
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const page = await assetService.search({ query, types: ['media'], sort, order, pageSize: 9999, wikiContext });
      const commonData = await this.getCommonTemplateData(req);
      return res.render('media-search', {
        ...commonData,
        wikiContext,
        query,
        items: page.results,
        sort,
        order,
        title: 'Media Search'
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering media search:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/api/item/:id
   * JSON metadata for a single item.
   */
  async mediaApiItem(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).json({ error: 'Media manager not enabled' });
    }
    try {
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const item = await mediaManager.getItem(req.params.id, wikiContext);
      if (!item) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.json(item);
    } catch (err: unknown) {
      logger.error('[media] Error fetching media item API:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /media/api/year/:year
   * JSON item list for a year.
   */
  async mediaApiYear(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).json({ error: 'Media manager not enabled' });
    }
    try {
      const year = parseInt(req.params.year, 10);
      if (isNaN(year)) {
        return res.status(400).json({ error: 'Invalid year' });
      }
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const items = await mediaManager.listByYear(year, wikiContext);
      return res.json({ year, items });
    } catch (err: unknown) {
      logger.error('[media] Error fetching media year API:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /media/file/:id
   * Stream the raw media file (video, image, etc.) with HTTP Range support.
   * Range requests are required for browser <video> seeking.
   * HEIC/RAW files are transcoded on-the-fly for browsers that can't decode them (#514).
   */
  async mediaFile(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const wikiContext = this.createWikiContext(req, { context: WikiContext.CONTEXT.VIEW });
      const item = await mediaManager.getItem(req.params.id, wikiContext);
      if (!item) {
        return res.status(404).send('Media item not found');
      }

      // Slice 6b of #760 (#766) — content-negotiation. When `Accept:
      // application/ld+json`, return the ImageObject/VideoObject/AudioObject
      // CreativeWork (Slice 3 / #758) as JSON instead of streaming the file.
      // ACL gate already fired via getItem() with WikiContext.
      if (wantsJsonLd(req)) {
        const cw = await mediaManager.get(req.params.id);
        if (!cw) {
          return res.status(404).send('Media item not found');
        }
        res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
        return res.send(JSON.stringify(cw));
      }

      const filePath: string = item.filePath;
      const rawMime: string = (item.mimeType) || 'application/octet-stream';
      // #719: relabel video/quicktime (.mov) → video/mp4 so Chrome plays it
      // inline. Same rationale as serveAttachment — the bitstream of most
      // consumer .mov is H.264/AAC, which Chrome can decode; it just won't
      // try when the MIME says video/quicktime. Genuinely incompatible
      // files will show a player error rather than auto-download.
      const mimeType: string = (rawMime === 'video/quicktime' || /\.mov$/i.test(filePath))
        ? 'video/mp4'
        : rawMime;

      // On-the-fly transcode for HEIC/RAW formats that browsers can't decode natively
      const TRANSCODE_MIMES = new Set([
        'image/heic', 'image/heif', 'image/x-raw', 'image/x-olympus-orf',
        'image/x-canon-cr2', 'image/x-nikon-nef', 'image/x-sony-arw', 'image/dng'
      ]);
      if (TRANSCODE_MIMES.has(mimeType)) {
        const accept = req.headers.accept ?? '';
        if (!accept.includes('image/heic') && !accept.includes('image/heif')) {
          const format: 'webp' | 'jpeg' = accept.includes('image/webp') ? 'webp' : 'jpeg';
          const outMime = format === 'webp' ? 'image/webp' : 'image/jpeg';
          const buffer = await mediaManager.getTranscodedBuffer(req.params.id, format);
          if (buffer) {
            res.writeHead(200, {
              'Content-Type': outMime,
              'Content-Length': buffer.length,
              'Cache-Control': 'public, max-age=3600'
            });
            return res.end(buffer);
          }
          // Transcode failed — fall through to serve raw file
        }
      }

      let stat: { size: number };
      try {
        stat = fs.statSync(filePath);
      } catch {
        return res.status(404).send('Media file not found on disk');
      }

      const fileSize = stat.size;
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        // Parse "bytes=start-end"
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Content-Disposition': 'inline'
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline',
        'Content-Length': fileSize,
        'Content-Type': mimeType
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    } catch (err: unknown) {
      logger.error('[media] Error serving media file:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /media/thumb/:id
   * Lazy-generated thumbnail.
   * Stub: returns 404 (no thumbnails generated yet).
   * Query param: size (e.g. "300x300")
   */
  async mediaThumb(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).send('Media manager not enabled');
    }
    try {
      const size = (req.query.size as string) || '300x300';
      const buffer = await mediaManager.getThumbnailBuffer(req.params.id, size);
      if (!buffer) {
        return res.status(404).send('Thumbnail not available');
      }
      res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (err: unknown) {
      logger.error('[media] Error serving thumbnail:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /admin/media
   * Admin scan status and index statistics.
   */
  async adminMedia(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).send('Access denied');
      }
      const mediaManager = this.engine.getManager('MediaManager');
      const years = mediaManager ? ((await mediaManager.getYears())) : [];
      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-media', {
        ...commonData,
        mediaEnabled: !!mediaManager,
        years,
        title: 'Admin — Media'
      });
    } catch (err: unknown) {
      logger.error('[media] Error rendering admin media page:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * POST /admin/media/rescan
   * Enqueues the media.rescan background job and returns immediately.
   */
  async adminMediaRescan(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const mediaManager = this.engine.getManager('MediaManager');
      if (!mediaManager) {
        return res.status(503).json({ error: 'Media manager not enabled' });
      }
      const jobManager = this.engine.getManager('BackgroundJobManager');
      const runId = await jobManager.enqueue('media.rescan');
      return res.status(202).json({ runId });
    } catch (err: unknown) {
      logger.error('[media] Error enqueueing rescan job:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Slice 6c of #760 (#767) — SKOS vocabulary endpoints. Public (no auth);
   * vocabularies are public structured-data by definition.
   *
   * GET /api/catalog/vocabulary/
   * Returns an index of registered CatalogProviders: { id, displayName, count }.
   */
  async catalogVocabularyIndex(_req: Request, res: Response) {
    try {
      const catalogManager = this.engine.getManager('CatalogManager');
      if (!catalogManager) {
        return res.status(503).json({ error: 'Catalog manager not enabled' });
      }
      const providers = catalogManager.getProviderInfo();
      const out = await Promise.all(providers.map(async (p: { id: string; displayName: string }) => {
        const data = await catalogManager.getProviderTerms(p.id);
        return { id: p.id, displayName: p.displayName, count: data ? data.terms.length : 0 };
      }));
      res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
      return res.send(JSON.stringify(out));
    } catch (err: unknown) {
      logger.error('[catalog] Error building vocabulary index:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/catalog/vocabulary/:schemeId
   * Returns one provider's terms as a SKOS ConceptScheme JSON-LD document.
   * 404 when the schemeId doesn't match a registered provider.
   */
  async catalogVocabularyScheme(req: Request, res: Response) {
    try {
      const catalogManager = this.engine.getManager('CatalogManager');
      if (!catalogManager) {
        return res.status(503).json({ error: 'Catalog manager not enabled' });
      }
      const schemeId = req.params.schemeId;
      const data = await catalogManager.getProviderTerms(schemeId);
      if (!data) {
        return res.status(404).json({ error: `No vocabulary scheme: ${schemeId}` });
      }
      const configManager = this.engine.getManager('ConfigurationManager');
      const baseUrl = configManager?.getProperty('ngdpbase.base-url', '');
      const scheme = buildConceptSchemeJsonLd(schemeId, data.displayName, data.terms, {
        baseUrl: baseUrl || undefined
      });
      res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
      return res.send(JSON.stringify(scheme));
    } catch (err: unknown) {
      logger.error('[catalog] Error building vocabulary scheme:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /admin/media/rebuild
   * Enqueues the media.rebuild background job and returns immediately.
   */
  async adminMediaRebuild(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const mediaManager = this.engine.getManager('MediaManager');
      if (!mediaManager) {
        return res.status(503).json({ error: 'Media manager not enabled' });
      }
      const jobManager = this.engine.getManager('BackgroundJobManager');
      const runId = await jobManager.enqueue('media.rebuild');
      return res.status(202).json({ runId });
    } catch (err: unknown) {
      logger.error('[media] Error enqueueing rebuild job:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /admin/attachments/rebuild
   * Enqueues the attachments.rebuild background job (Slice 5b of #760 / #763).
   * Backfills embedded doc metadata across every stored attachment.
   */
  async adminAttachmentsRebuild(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const attachmentManager = this.engine.getManager('AttachmentManager');
      if (!attachmentManager) {
        return res.status(503).json({ error: 'Attachment manager not enabled' });
      }
      const jobManager = this.engine.getManager('BackgroundJobManager');
      const runId = await jobManager.enqueue('attachments.rebuild');
      return res.status(202).json({ runId });
    } catch (err: unknown) {
      logger.error('[attachments] Error enqueueing rebuild job:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /api/admin/jobs/:jobId/enqueue
   * Enqueue a registered background job. Returns { runId }.
   */
  async apiJobEnqueue(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const { jobId } = req.params;
      const jobManager = this.engine.getManager('BackgroundJobManager');
      const runId = await jobManager.enqueue(jobId);
      return res.status(202).json({ runId });
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      logger.error('[jobs] Error enqueueing job:', err);
      const status = msg.includes('unknown job') ? 404 : 500;
      return res.status(status).json({ error: msg });
    }
  }

  /**
   * GET /api/admin/jobs/:runId/status
   * Returns the current state of a job run.
   */
  async apiJobStatus(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const { runId } = req.params;
      const jobManager = this.engine.getManager('BackgroundJobManager');
      const run = jobManager.getStatus(runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      return res.json(run);
    } catch (err: unknown) {
      logger.error('[jobs] Error getting job status:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/admin/jobs/active
   * Returns all currently pending or running jobs.
   */
  async apiJobsActive(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const jobManager = this.engine.getManager('BackgroundJobManager');
      return res.json(jobManager.getActiveJobs());
    } catch (err: unknown) {
      logger.error('[jobs] Error getting active jobs:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Register built-in admin background jobs with the BackgroundJobManager.
   * Called once from registerRoutes().
   */
  private registerAdminJobs(): void {
    const jobManager = this.engine.getManager('BackgroundJobManager');
    if (!jobManager) {
      logger.warn('[jobs] BackgroundJobManager not available — skipping job registration');
      return;
    }

    jobManager.registerJob({
      id: 'pages.reindex',
      displayName: 'Reindex Pages',
      run: async (_reportProgress: ReportProgress) => {
        const pageManager = this.engine.getManager('PageManager');
        const searchManager = this.engine.getManager('SearchManager');
        const renderingManager = this.engine.getManager('RenderingManager');
        const cacheManager = this.engine.getManager('CacheManager');

        await pageManager.refreshPageList();
        const pageCount = (await pageManager.getAllPages()).length;
        await searchManager.rebuildIndex();
        const searchStats = await searchManager.getStatistics();
        await renderingManager.rebuildLinkGraph();
        await cacheManager.clear(undefined, 'rendered-pages:*');

        const docs = searchStats.totalDocuments || 0;
        return { success: true, summary: `${pageCount} pages, ${docs} search documents` };
      }
    });

    // #724: "Rebuild Pages" — the disk-reconciling counterpart of
    // pages.reindex (same relationship as media.rebuild vs media.rescan).
    // reindex rebuilds the Lunr structure from the persisted document map
    // (fast, but a deleted page's stale entry — a "ghost" — survives it).
    // rebuild clears the map + persisted documents.json and re-scans every
    // page from disk, so ghosts are dropped by construction.
    jobManager.registerJob({
      id: 'pages.rebuild',
      displayName: 'Rebuild Pages',
      run: async (reportProgress: ReportProgress) => {
        const pageManager = this.engine.getManager('PageManager');
        const searchManager = this.engine.getManager('SearchManager');
        const renderingManager = this.engine.getManager('RenderingManager');
        const cacheManager = this.engine.getManager('CacheManager');

        reportProgress('Refreshing page list…');
        await pageManager.refreshPageList();
        reportProgress('Rebuilding search index from disk (clears stale entries)…');
        await searchManager.rebuildFromDisk();
        const pageCount = (await pageManager.getAllPages()).length;
        const searchStats = await searchManager.getStatistics();
        await renderingManager.rebuildLinkGraph();
        await cacheManager.clear(undefined, 'rendered-pages:*');

        const docs = searchStats.totalDocuments || 0;
        return { success: true, summary: `Rebuilt from disk — ${pageCount} pages, ${docs} search documents (stale entries dropped)` };
      }
    });

    jobManager.registerJob({
      id: 'media.rescan',
      displayName: 'Reindex Media',
      run: async (reportProgress: ReportProgress) => {
        const mediaManager = this.engine.getManager('MediaManager');
        if (!mediaManager) return { success: false, error: 'Media manager not enabled' };
        const result = await mediaManager.scanFolders(true, (processed: number, total: number) => {
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
          reportProgress(`Scanning… ${processed.toLocaleString()}/${total.toLocaleString()} files (${pct}%)`);
        });
        const r = result as { scanned?: number; added?: number; updated?: number; errors?: number };
        return {
          success: true,
          summary: `Scanned ${r.scanned ?? 0}, added ${r.added ?? 0}, updated ${r.updated ?? 0}, errors ${r.errors ?? 0}`
        };
      }
    });

    jobManager.registerJob({
      id: 'media.rebuild',
      displayName: 'Rebuild Media Index',
      run: async (reportProgress: ReportProgress) => {
        const mediaManager = this.engine.getManager('MediaManager');
        if (!mediaManager) return { success: false, error: 'Media manager not enabled' };
        const result = await mediaManager.rebuildIndex((processed: number, total: number) => {
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
          reportProgress(`Rebuilding… ${processed.toLocaleString()}/${total.toLocaleString()} files (${pct}%)`);
        });
        const r = result as { scanned?: number; added?: number; updated?: number; errors?: number };
        return {
          success: true,
          summary: `Rebuilt — scanned ${r.scanned ?? 0}, added ${r.added ?? 0}, updated ${r.updated ?? 0}, errors ${r.errors ?? 0}`
        };
      }
    });

    // Slice 5b of #760 (#763) — attachments.rebuild backfills the seven
    // Slice-5 doc-metadata fields on pre-v3.27.0 attachment records.
    jobManager.registerJob({
      id: 'attachments.rebuild',
      displayName: 'Rebuild Attachment Metadata',
      run: async (reportProgress: ReportProgress) => {
        const attachmentManager = this.engine.getManager('AttachmentManager');
        if (!attachmentManager) return { success: false, error: 'Attachment manager not enabled' };
        const result = await attachmentManager.backfillDocMetadata((processed: number, total: number) => {
          const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
          reportProgress(`Re-extracting… ${processed.toLocaleString()}/${total.toLocaleString()} attachments (${pct}%)`);
        });
        const r = result as { scanned?: number; updated?: number; skipped?: number; errors?: number };
        return {
          success: true,
          summary: `Rebuilt — scanned ${r.scanned ?? 0}, updated ${r.updated ?? 0}, skipped ${r.skipped ?? 0}, errors ${r.errors ?? 0}`
        };
      }
    });

    logger.info('[jobs] Admin jobs registered: pages.reindex, pages.rebuild, media.rescan, media.rebuild, attachments.rebuild');
  }
}


export default WikiRoutes;
