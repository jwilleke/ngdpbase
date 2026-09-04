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
import { guardedFetch } from '../http/guardedFetch.js';
import { AuditQueryForbiddenError } from '../managers/AuditManager.js';
import { ANONYMOUS_SUBJECT, type PermissionSubject } from '../managers/UserManager.js';
import { jobContextFromRequest } from '../context/JobContext.js';
import { resolveEgressPolicy } from '../http/egressPolicy.js';
import type { NcmImageDeps } from '../converters/ncm/index.js';
import { createPatch } from 'diff';
import { exec } from 'child_process';
import { Request, Response, Application } from 'express';
import SchemaGenerator from '../utils/SchemaGenerator.js';
import { pageSourceHash, evaluateSeededAddonPage } from '../utils/addonPageSync.js';
import logger from '../utils/logger.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import { extractSection, spliceSection } from '../utils/SectionUtils.js';
import { shuffleArray } from '../utils/pluginFormatters.js';
import { normalizePinnedItems, deriveCanonicalUrl } from '../utils/pinnedItems.js';
import type { PinnedItem } from '../types/User.js';
import { SimpleRateLimiter } from '../utils/SimpleRateLimiter.js';
import type ShareManager from '../managers/ShareManager.js';
import type { ShareScope } from '../types/Share.js';
import { ContactSubmissionLog, type SubmissionEntry, type MailResult } from '../utils/ContactSubmissionLog.js';
import { pipeline } from 'stream';
import { resolveRange } from '../utils/httpRange.js';
import { safeRegistrationMessage } from '../utils/userCreateError.js';
import {
  DEVICE_STATE_COOKIE,
  deviceStateCookieOptions,
  newDeviceState,
  evaluateDeviceBinding
} from '../utils/magicLinkDeviceState.js';
import {
  buildPageViewAuditEvent,
  recordAuditEvent,
  type AuditEventSink,
  type AuditViaToken,
  getAuditDropStats
} from '../utils/auditEvents.js';
import { stringifyJsonLdForScript, wantsJsonLd } from '../utils/buildPageJsonLd.js';
import { articleToPageJsonLd } from '../utils/articleToPageJsonLd.js';
import { buildSocialMeta } from '../utils/buildSocialMeta.js';
import { versionTokenOf, isStaleSave } from '../utils/pageVersionToken.js';
import { rewriteLinkTargets } from '../utils/renameLinkRewrite.js';
import { isDefinitelyUnplayable } from '../utils/videoPlayability.js';
import { buildKeywordPool } from '../utils/buildKeywordPool.js';
import {
  buildSitemapXml,
  buildSitemapIndexXml,
  selectPublicSitemapEntries,
  isRestrictedByMetadata,
  paginate,
  type SitemapIndexEntry,
  type RestrictableMetadata
} from '../utils/buildSitemap.js';
import { getSuggestedKeywordSets, type RecentPageKeywords, type KeywordSetSuggestion } from '../utils/suggestedKeywords.js';
import { normalizeKeywordValue, groupKeywordVariants, dedupeKeywords, type KeywordFormStat } from '../utils/keywordNormalizer.js';
import type { Article } from '../types/Schema.js';
import { buildConceptSchemeJsonLd } from '../utils/buildConceptSchemeJsonLd.js';
import { renderFootnoteListHtml } from '../plugins/FootnotesPlugin.js';
import { renderCommentListHtml } from '../plugins/CommentsPlugin.js';
import WikiContext from '../context/WikiContext.js';
import { PageContentValidationError, type PageSaveOptions } from '../managers/PageManager.js';
import { auditEventTypes } from '../utils/auditVocabulary.js';
import { ThemeManager, getThemeManager } from '../managers/ThemeManager.js';
import { registerDawarichCompatRoutes } from './DawarichCompatRoutes.js';
import type { ReportProgress } from '../managers/BackgroundJobManager.js';
import type { WikiPage, PageFrontmatter } from '../types/Page.js';
import type AddonsManager from '../managers/AddonsManager.js';
import type AssetManager from '../managers/AssetManager.js';
import type AssetService from '../managers/AssetService.js';
import type AttachmentManager from '../managers/AttachmentManager.js';
import { AUDIT_WRITE_FAILED } from '../managers/AttachmentManager.js';
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
import { safeRedirect } from '../utils/safeRedirect.js';
import { generateCsrfToken } from '../middleware/csrf.js';
import { LoginThrottle } from '../utils/LoginThrottle.js';
import { resolveMaintenanceState, MAINTENANCE_ENABLED_KEY } from '../utils/maintenanceState.js';
import { resolvePosture, POSTURE_KEY } from '../utils/securityPosture.js';

/**
 * Ceiling on how many referring pages one rename may rewrite (#1094).
 *
 * Not a config key on purpose: this is a safety bound on a background pass,
 * not a preference. A number an operator can raise is a number that will be
 * raised the first time a rewrite is skipped, which is exactly when the bound
 * is doing its job. Anything beyond the cap is logged by count.
 */
/**
 * Frontmatter fields that `generateValidMetadata` seeds with defaults (#1106).
 *
 * Its docstring says "for a new page", but the save path calls it for updates
 * too. The #803 carry-forward cannot rescue these: it fills only keys that are
 * ABSENT, and a seeded key is always present. So on an update they must yield
 * to what is already on disk unless the caller explicitly supplied one.
 *
 * This is the general form of the fix #1017 applied to `system-keywords` alone
 * after it silently destroyed capture marks on first edit (#1008).
 */
const DEFAULT_SEEDED_FIELDS = ['system-category', 'system-keywords', 'user-keywords', 'slug'] as const;

const MAX_REWRITE_REFERRERS = 200;

/**
 * Wall-clock budget for the whole rewrite pass, in milliseconds.
 *
 * Checked between pages rather than interrupting one, so a single slow save
 * can overrun it slightly. The point is to bound a pathological fan-out, not
 * to be exact.
 */
const REWRITE_BUDGET_MS = 20_000;

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
  // #1204: the actor is recorded at the manager door. Optional until #1179
  // makes the context positional and mandatory.
  createUser(data: unknown, actor?: { username?: string; ipAddress?: string }): Promise<unknown>;
  updateUser(username: string, data: unknown, actor?: { username?: string; ipAddress?: string }): Promise<unknown>;
  deleteUser(username: string, actor?: { username?: string; ipAddress?: string }): Promise<unknown>;
  /**
   * #1164: takes the CONTEXT, never a username string.
   *
   * This interface previously declared `hasPermission(username: string | undefined, …)`,
   * so route code could not pass a context even if it wanted to — the contract
   * offered only the form that drops the agent-token ceiling. Twelve call sites
   * used it, five of them the sole `admin-system` gate on an admin write.
   *
   * Narrowing it here makes the bypass a COMPILE ERROR in route code rather
   * than something a reviewer has to notice. `UserManager` still accepts a
   * string for genuine "does user X hold Y" lookups (AuditManager, ACLManager);
   * routes are authorising a request and must forward what the request carries.
   */
  hasPermission(subject: PermissionSubject, permission: string): Promise<boolean>;
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
  setProperty(key: string, value: unknown, actor?: string): Promise<void> | void;
  getCustomProperty(key: string): unknown;
  getCustomProperties(): unknown;
  getDefaultProperties(): unknown;
  getAllProperties(): unknown;
  /** #1089: keys the environment owns, key -> variable name. */
  getEnvControlledKeys?(): Record<string, string>;
  /** #1089: effective value plus where it came from, for the admin screen. */
  describeProperty?(key: string): { envControlled: boolean; envVar: string | null; effective: unknown; source: string };
  getResolvedDataPath(key: string, defaultValue?: string): string;
  getInstanceDataFolder?(): string;
  resetToDefaults(actor?: { username?: string; ipAddress?: string }): Promise<void> | void;
  getFencedCodeTags?(): Set<string>;
  getBaseURL?(): string;
}

/**
 * Soft-delete surface a page provider may expose (#947). All optional — a
 * provider without these simply has no trash, and the routes answer 501.
 */
interface IDeletedPageEntry {
  uuid: string;
  title: string;
  slug?: string;
  currentVersion: number;
  deletedAt: string;
  deletedBy: string;
}

type RestoreResult =
  | { ok: true; title: string }
  | { ok: false; reason: 'not-found' | 'title-conflict' | 'slug-conflict' | 'file-missing' | 'error'; detail?: string };

interface IVersioningProvider {
  getDeletedPages?(): IDeletedPageEntry[];
  restoreDeletedPage?(uuid: string): Promise<RestoreResult>;
  purgeDeletedPage?(uuid: string): Promise<boolean>;
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
  // #1121: the options argument is NOT `unknown` on purpose. This local
  // interface is a claim about code this file does not own, and a claim loose
  // enough to accept anything would have let the audit enrichment below be
  // silently wrong — the same shape of defect the audit work kept finding.
  savePageWithContext(
    wikiContext: unknown,
    metadata?: Partial<PageFrontmatter>,
    options?: PageSaveOptions
  ): Promise<void>;

  /** #1105: former title -> current title, consulted only after live resolution fails. */
  resolveFormerTitle?(formerTitle: string): Promise<string | null>;
  deletePage(name: string, options?: unknown): Promise<boolean>;
  deletePageWithContext(wikiContext: unknown): Promise<boolean>;
  getCurrentPageProvider(): IVersioningProvider | null;
  getPageUUID?(identifier: string): string | null;
  /** Direct provider reference — prefer getCurrentPageProvider() for new code */
  provider?: IVersioningProvider | null;
  refreshPageList(): Promise<void>;
  /**
   * Evict one page from the provider content cache, the rendered-pages region
   * and the rendering handler cache. Needed by any path that writes page files
   * without going through savePage (#1040).
   */
  invalidatePageCache(identifier: string): void;
  validateAndFixAllFiles(options?: unknown): Promise<IValidationReport>;
}

interface IACLManager {
  checkPagePermissionWithContext(wikiContext: WikiContext, action: string): Promise<boolean>;
  /** #714 Slice F: rich-return form — `{ allowed, reason }`. Lets callers
   *  specialise 403 messages on `reason` (e.g. `author_lock_deny`). */
  evaluatePagePermission(wikiContext: WikiContext, action: string): Promise<{ allowed: boolean; reason: string }>;
  removeACLMarkup(content: string): string;
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
  getManager(name: 'ShareManager'): ShareManager | undefined;
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

/**
 * Module-scope rate limiter for anonymous /share/:token/* access (#853,
 * decision 5) keyed `token:ip`. Generous budget — one album view fans out
 * into one request per thumbnail, so a big album must fit in the window.
 * Exported so tests can call `.reset()` between cases.
 */
export const shareRateLimiter = new SimpleRateLimiter({ max: 600, windowMs: 10 * 60 * 1000 });

/**
 * Rate limiter for token-authenticated page mutations (#946 slice 2), keyed by
 * token id so one runaway agent cannot starve another.
 *
 * Deferred in slice 1 on the grounds that ingest is an idempotent upsert — a
 * repeated create/edit converges. Delete and rename are neither idempotent nor
 * self-correcting, and a token runs unattended for up to 24 hours, so a loop
 * has real consequences.
 *
 * #947 softened the worst case considerably: a delete is now recoverable for
 * the retention window rather than destroying version history outright. That
 * lowers the severity but does not remove the need — a delete loop still churns
 * every page it touches into the trash, and rename has no such safety net at
 * all.
 *
 * 60/minute is far above any legitimate agent editing rate and far below what
 * a runaway loop would produce.
 */
export const agentMutationRateLimiter = new SimpleRateLimiter({ max: 60, windowMs: 60 * 1000 });

/**
 * Per-IP limiter for the two account-signup surfaces (#1026, closes #1020):
 * `POST /register` and `POST /auth/magic-link`.
 *
 * Both were previously unlimited from a single source. The magic-link path had
 * only a 1-per-email-per-60s throttle inside the provider, which a caller
 * sidesteps entirely by varying the address — and since each request sends
 * mail, that made an open instance a mail-sending primitive aimed at arbitrary
 * third parties. With a typical relay free tier around 100 sends/day, one
 * script also exhausts the quota and links stop arriving for real users.
 *
 * Deliberately shares the `ngdpbase.mail.rate-limit.*` config the contact form
 * uses — `app-default-config.json` already names re-enabled `/register` as an
 * intended consumer of those flags. Exported so tests can call `.reset()`.
 */
export const signupRateLimiter = new SimpleRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

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

/**
 * Sweep anonymous sessions from a session-file-store directory (#777).
 *
 * "Anonymous" = the session JSON file has neither a top-level
 * `isAuthenticated: true` nor a nested `user.isAuthenticated === true`.
 * (express-session entries written by ngdpbase use the top-level form;
 * the nested-user form is what the issue body describes for stores that
 * structure session data differently.)
 *
 * Always deletes `*.json.NNN` atomic-write orphans regardless of contents.
 * Never deletes a session whose id matches `excludeSessionId` (so the
 * admin clicking the button can't accidentally log themselves out).
 *
 * Returns counts for the caller to surface and log.
 *
 * Extracted as a free function so it's unit-testable against a real temp
 * directory without spinning up the full WikiRoutes handler.
 */
export async function sweepAnonymousSessions(
  sessionDir: string,
  excludeSessionId: string | null
): Promise<{ removed: number; kept: number; orphansRemoved: number }> {
  let removed = 0;
  let kept = 0;
  let orphansRemoved = 0;
  if (!await fse.pathExists(sessionDir)) {
    return { removed, kept, orphansRemoved };
  }
  const entries = await fse.readdir(sessionDir);
  for (const name of entries) {
    const full = path.join(sessionDir, name);
    // Atomic-write orphans: *.json.NNN — always delete
    if (/\.json\.\d+$/.test(name)) {
      try { await fse.unlink(full); orphansRemoved++; } catch { /* skip */ }
      continue;
    }
    if (!name.endsWith('.json')) continue;
    const sid = name.slice(0, -'.json'.length);
    let raw: unknown;
    try {
      raw = await fse.readJson(full);
    } catch {
      // Unreadable / malformed — leave it alone. Cleanup of bad files is
      // out of scope for this action; operator can ssh in to investigate.
      kept++;
      continue;
    }
    const s = (raw ?? {}) as Record<string, unknown>;
    const topLevelAuth = s.isAuthenticated === true;
    const nestedUser = (s.user ?? {}) as Record<string, unknown>;
    const nestedAuth = nestedUser.isAuthenticated === true;
    const isAuthenticated = topLevelAuth || nestedAuth;
    if (isAuthenticated) { kept++; continue; }
    if (excludeSessionId && sid === excludeSessionId) { kept++; continue; }
    try { await fse.unlink(full); removed++; } catch { /* skip */ }
  }
  return { removed, kept, orphansRemoved };
}

/**
 * Build a SessionSummary from a raw session-store entry (#776). The shape
 * depends on what was stored at session-create time; legacy entries may have
 * only cookie+csrfToken (anonymous CSRF-only session), while authenticated
 * entries add username/isAuthenticated and may carry an `ip` field.
 */
function summarizeSession(id: string, raw: unknown, callerSessionId: string | null = null): Record<string, unknown> {
  const s = (raw ?? {}) as Record<string, unknown>;
  const cookie = (s.cookie ?? {}) as Record<string, unknown>;
  const expRaw = cookie.expires;
  const expiresIso = typeof expRaw === 'string'
    ? expRaw
    : (expRaw instanceof Date ? expRaw.toISOString() : null);
  const lastAccessMs = typeof s.__lastAccess === 'number' ? s.__lastAccess : null;
  const username = typeof s.username === 'string' && s.username ? s.username : null;
  const isAuth = s.isAuthenticated === true;
  const ip = typeof s.ip === 'string' ? s.ip : undefined;
  const expired = expiresIso ? Date.parse(expiresIso) < Date.now() : false;
  const summary: Record<string, unknown> = {
    id,
    username,
    lastAccess: lastAccessMs ? new Date(lastAccessMs).toISOString() : null,
    expires: expiresIso,
    isAuthenticated: isAuth,
    expired,
    // #787: caller-side marker so the revoke button can warn before
    // killing the admin's own session. Computed server-side so the
    // session ID itself doesn't have to leak into the template.
    isSelf: !!callerSessionId && id === callerSessionId
  };
  if (ip) summary.ip = ip;
  return summary;
}

/**
 * Sort key (epoch milliseconds) for ordering media items by capture date.
 *
 * Prefers the EXIF/QuickTime capture date (`metadata.dateTimeOriginal`). When
 * that is absent or unparseable, falls back to the file modification time
 * (`mtime`, already epoch-ms) — the same #606 convention `toAssetRecord` uses —
 * so undated items sort coherently among dated ones. Last resort is Jan 1 of
 * the indexed `year` (in epoch-ms) so the value stays on the same scale; only
 * items with no date, no mtime, and no year collapse to 0.
 *
 * Previously the undated fallback returned `year * 10000` — a value ~5 orders
 * of magnitude smaller than a real epoch-ms timestamp, which slammed every
 * undated item to the extreme end of the list regardless of its year (#807).
 */
export function mediaSortDateKey(item: Record<string, unknown>): number {
  const m = item['metadata'] as Record<string, unknown> | undefined;
  const raw = m?.['dateTimeOriginal'];
  if (typeof raw === 'string' && raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  if (typeof item['mtime'] === 'number') return item['mtime'];
  const year = item['year'];
  return typeof year === 'number' ? Date.UTC(year, 0, 1) : 0;
}

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

  // #714 Slice C/E: deleted the legacy `private checkPrivatePageAccess`
  // helper that previously sat here. Its 5 callers (viewPage, editPage,
  // deletePage, pageHistory, serveAttachment) have all migrated to
  // either `aclManager.checkPagePermissionWithContext` (same-page checks,
  // which already covers private via Tier 0 / #711) or
  // `wikiContext.canAccess('view', linkedPageName)` (cross-page checks,
  // via Slice B's `canUserAccessPage`).
  //
  // The behavior shift: the legacy helper returned ALLOW on any
  // "can't determine" path (no PageManager, no UUID, no pageIndex,
  // entry missing). The new cross-page path is conservative-on-security
  // and returns DENY. Some private attachments whose owning-page name
  // was unresolvable will now 403 where they previously served. This
  // was the EPIC's explicit "Behavior decision point"; operator
  // authorized the shift.

  /**
   * Create a WikiContext for the given request and page
   * This should be the single source of truth for all context information
   * @param {object} req - Express request object
   * @param {object} options - Additional context options (pageName, content, context type)
   * @returns {WikiContext} WikiContext instance
   */
  /**
   * Resolve a site-chrome page (LeftMenu, Footer) — #952.
   *
   * Chrome used to be resolved by **slug convention**: a page named
   * `left-menu-content` silently beat the core `LeftMenu`. That is a trap —
   * an operator edits `LeftMenu`, the save succeeds, and nothing changes,
   * with no feedback anywhere.
   *
   * Resolution order:
   *   1. The configured page, when `configKey` is set to a non-empty slug.
   *      Authoritative: if that page is missing, we do NOT silently fall back
   *      to the legacy chain, because doing so would reintroduce the same
   *      invisible-substitution problem the config exists to remove.
   *   2. Otherwise the legacy chain, logged at info so the shadowing is
   *      discoverable in logs during migration.
   *
   * The config key defaults to **empty**, not to the core page name. Defaulting
   * it to `leftmenu` would change behaviour on upgrade for any instance relying
   * on the convention — geohazardwatch's navigation would silently revert to
   * core's. Empty preserves today's behaviour exactly and makes explicit
   * configuration opt-in.
   *
   * @param configKey   e.g. `ngdpbase.chrome.left-menu-page`
   * @param legacySlugs override-first chain, e.g. ['left-menu-content', 'LeftMenu']
   * @param label       human label for log messages
   */
  private async resolveChromePage(
    configKey: string,
    legacySlugs: string[],
    label: string
  ): Promise<WikiPage | null> {
    const pageManager = this.engine.getManager<import('../managers/PageManager.js').default>('PageManager');
    if (!pageManager) return null;

    const configManager = this.engine.getManager<{ getProperty(k: string, d: string): string }>('ConfigurationManager');
    const raw = configManager?.getProperty(configKey, '');
    const configured = typeof raw === 'string' ? raw.trim() : '';

    if (configured) {
      const page = await pageManager.getPage(configured);
      if (!page) {
        // ERROR, not warn: this is the operator's OWN configuration naming a
        // page that does not exist — unambiguous misconfiguration, nobody
        // else's fault, and site-wide in effect (no nav or no footer on every
        // page). Same reasoning as #672, which refuses to boot when operator
        // config names a nonexistent addon. We stop short of failing boot
        // because chrome degrades rather than breaking, but it must not be
        // filed alongside routine warnings.
        //
        // Deliberately does NOT fall through to the legacy chain: silently
        // substituting a page the operator did not choose is the exact problem
        // this config removes (#952).
        logger.error(
          `[${label}] ${configKey} is set to '${configured}' but no such page exists — ` +
          `${label} will be empty on every page. Fix the setting or create the page.`
        );
      }
      return page ?? null;
    }

    // Legacy slug-convention chain (deprecated).
    for (const slug of legacySlugs) {
      const page = await pageManager.getPage(slug);
      if (!page) continue;
      if (slug !== legacySlugs[legacySlugs.length - 1]) {
        logger.info(
          `[${label}] Using '${slug}' via the legacy slug convention, shadowing ` +
          `'${legacySlugs[legacySlugs.length - 1]}'. Set ${configKey} to make this explicit (#952).`
        );
      }
      return page;
    }

    // Nothing found via the legacy chain either. Warn rather than error: on a
    // fresh instance this simply means the page has not been created yet,
    // which is not a misconfiguration.
    logger.warn(
      `[${label}] No ${label} page found (tried ${legacySlugs.map(s => `'${s}'`).join(', ')}) — ` +
      `${label} will be empty. Create one, or set ${configKey}.`
    );
    return null;
  }

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
    // #950: ACLManager is no longer needed here — site chrome is not
    // permission-checked. Nothing else in this method consults it.
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

    // Drives the header's Register / Request access button. Reads the password
    // mechanism specifically (#1026), not the master policy: on an instance
    // where magic link is the only signup path, a Register button pointing at
    // /register would land the visitor on a 404.
    const allowRegistration = this.isPasswordRegistrationEnabled();

    // #1026: signup is still open when the password form is off but magic-link
    // auto-provision is on. Without this the header falls through to "Request
    // access" and the seeded page tells the visitor registration is closed —
    // exactly wrong on an instance where anyone can sign up with an email.
    const magicLinkSignup = this.isMagicLinkSignupEnabled();

    // #1029: whether to offer the admin dashboard in the user dropdown. The
    // header used to test `roles.includes('admin')` — a hardcoded role name —
    // so a role holding `admin-read` could open /admin by typing the URL but
    // was never shown the link. Ask the same question the route asks.
    const canViewAdmin = userContext?.isAuthenticated
      ? (await userManager.hasPermission(userContext, 'admin-read'))
        || (await userManager.hasPermission(userContext, 'admin-system'))
      : false;

    // #1034: admin templates need to know what the caller may actually DO, not
    // just whether they may look. Without it every admin view rendered all 23
    // of its POST forms unconditionally, so a read-only account was offered
    // every destructive control on the site and found out one at a time — in
    // three different visual styles — that none of them worked.
    //
    // Resolved once per render rather than per control; the set is small and
    // hasPermission() is a policy evaluation, not a field read.
    const adminPermissions = ['admin-system', 'admin-roles', 'user-read', 'user-edit', 'user-create'] as const;
    const grantedPermissions: Record<string, boolean> = {};
    if (userContext?.isAuthenticated) {
      for (const permission of adminPermissions) {
        grantedPermissions[permission] = await userManager.hasPermission(
          userContext,
          permission
        );
      }
    }
    grantedPermissions['admin-read'] = canViewAdmin;

    /** Does the caller hold `permission`? */
    const can = (permission: string): boolean => grantedPermissions[permission] === true;

    /**
     * Attributes that disable a control the caller may not use, naming the
     * permission it needs. Interpolate UNESCAPED into a tag: `<%- ... %>`.
     *
     * Presentation only — the server still refuses the request. A disabled
     * button is a courtesy, never a control.
     */
    const lockedUnless = (permission: string): string =>
      can(permission)
        ? ''
        : ` disabled aria-disabled="true" title="Requires the '${permission}' permission —`
          + ' this account has read-only access"';
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

    // #842: header Share entries + admin dashboard card render only when
    // ShareManager is enabled. Duck-typed — test fixtures stub getManager
    // with catch-all objects that lack isEnabled.
    const shareManagerForChrome = this.engine.getManager('ShareManager');
    const shareEnabled = typeof shareManagerForChrome?.isEnabled === 'function'
      ? shareManagerForChrome.isEnabled()
      : false;

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
      magicLinkSignup: boolean;
      canViewAdmin: boolean;
      can: (permission: string) => boolean;
      lockedUnless: (permission: string) => string;
      registrationRedirectPage: string;
      contactAvailable: boolean;
      contactFooterEnabled: boolean;
      shareEnabled: boolean;
      csrfToken: string;
      currentUrl: string;
      leftMenu?: string;
      footer?: string;
      systemCategoryDefs?: Record<string, unknown>;
      knowledgeRoleDefs?: Record<string, unknown>;
      assetPickerSources?: Array<{ id: string; label: string }>;
    } = {
      // Supplied here rather than per-route so every surface embedding
      // `_asset-picker` gets the same source list — the standalone /search page
      // and the editor's Browse Assets modal alike.
      assetPickerSources: this.getPickerAssetSources(),
      currentUser: userContext,
      user: userContext,       // alias
      userContext: userContext, // used by page-history.ejs and other templates
      shareEnabled,
      csrfToken: req.session?.csrfToken || '', // #663: token for header meta + form _csrf inputs
      currentUrl: req.originalUrl || req.url || '', // #785: lets header.ejs offer "Add to My Links" for any route, not just wiki pages
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
      faviconPath: (configManager?.getCustomProperty('ngdpbase.favicon-path')) || themePaths.faviconPath,
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
      magicLinkSignup,
      canViewAdmin,
      can,
      lockedUnless,
      registrationRedirectPage,
      contactAvailable,
      contactFooterEnabled
    };

    // Load LeftMenu — #952: resolved via explicit config, with the legacy
    // slug-convention chain as a deprecated fallback.
    try {
      const leftMenuPage = await this.resolveChromePage(
        'ngdpbase.chrome.left-menu-page',
        ['left-menu-content', 'LeftMenu'],
        'LeftMenu'
      );
      // #952: resolveChromePage owns the diagnostics — a second message here
      // told the operator to create a "LeftMenu" page even when the config
      // pointed at a different page entirely, which was actively misleading.
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
      // #950: chrome renders unconditionally — the ACL check is gone.
      //
      // A fragment is never a destination, so denying it protected nothing:
      // every page it links to still enforces its own ACL, and a link the user
      // cannot follow yields a comprehensible 403. What the check actually did
      // was delete the sidebar from EVERY page of the site, silently, for
      // whoever it denied.
      //
      // The frontmatter is not ignored quietly — warnOnChromeRestriction
      // reports any audience/access/private on a chrome page, so an operator
      // who restricted one learns it is no longer honoured rather than
      // discovering it when the nav mysteriously reappears.
      this.warnOnChromeRestriction('LeftMenu', leftMenuPage?.metadata);

      if (leftMenuCtx !== null && leftMenuContent !== null) {
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

    // Load Footer — #952: resolved via explicit config, with the legacy
    // slug-convention chain as a deprecated fallback.
    try {
      const footerPage = await this.resolveChromePage(
        'ngdpbase.chrome.footer-page',
        ['footer-content', 'Footer'],
        'Footer'
      );
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
      // #950: see the LeftMenu note above — chrome renders unconditionally.
      this.warnOnChromeRestriction('Footer', footerPage?.metadata);

      if (footerCtx !== null && footerContent !== null) {
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

    // #706: knowledge-role catalog — drives the (Source) / (Citation) /
    // (Concept) badges via the same page-badge mechanism as system-category.
    // Pages without `knowledge-role` set render no badge.
    templateData.knowledgeRoleDefs = (configManager?.getProperty('ngdpbase.knowledge-role', {}) as Record<string, unknown>) ?? {};

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
   * Active session details — one summary entry per session in the store.
   * #776: surfaces what's in ${FAST_STORAGE}/sessions/ so operators don't
   * have to ls+jq the store dir to understand session state (anonymous vs
   * authenticated, oldest active session, what's expired but not swept,
   * etc.). Admin-only — exposes session metadata that an unauthed caller
   * has no business seeing.
   *
   * Returns: { total: number, sessions: SessionSummary[] }
   * where SessionSummary is { id, username|null, lastAccess|null, expires|null,
   * isAuthenticated, expired, ip? }.
   */
  async getActiveSessionDetails(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      // #1034: was hasRole('admin') — a role NAME check, invisible to the
      // permission model. It refused admin-read holders with a raw JSON error
      // printed into the dashboard card, and would equally refuse a custom
      // role granted every admin permission.
      //
      // `user-read` rather than `admin-read`, deliberately: this lists
      // usernames, IP addresses and last-access times for everyone signed in,
      // the same privacy reason /admin/users is withheld from the read-only
      // demo role (#1029). Same permission, same answer, no drift.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('user-read'))
      ) {
        res.status(403).json({
          error: 'This account cannot view active sessions',
          reason: "Read-only access — requires the 'user-read' permission, because session records include usernames and IP addresses"
        });
        return;
      }
      const store = req.sessionStore as unknown as {
        list?: (cb: (err: unknown, files?: string[]) => void) => void;
        get?: (sid: string, cb: (err: unknown, session?: unknown) => void) => void;
        all?: (cb: (err: unknown, sessions?: unknown) => void) => void;
      } | undefined;
      if (!store) {
        res.status(503).json({ error: 'Session store not available' });
        return;
      }

      const callerSessionId = typeof req.sessionID === 'string' ? req.sessionID : null;

      // session-file-store exposes list+get (the path used in production). Some
      // other stores implement all(). Fall back to all() if list isn't there.
      let summaries: Array<Record<string, unknown>>;
      if (typeof store.list === 'function' && typeof store.get === 'function') {
        const files: string[] = await new Promise((resolve, reject) => {
          store.list!((err, fs) => err ? reject(err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'session store error')) : resolve(fs ?? []));
        });
        // Strip the .json suffix to get the session id. session-file-store's
        // list already filters by the configured filePattern, so atomic-write
        // .json.NNN orphans don't appear here.
        const ids = files.map(f => f.replace(/\.json$/, ''));
        const sessions = await Promise.all(
          ids.map(id => new Promise<{ id: string; data: unknown }>((resolve) => {
            store.get!(id, (err, data) => resolve({ id, data: err ? null : data }));
          }))
        );
        summaries = sessions
          .filter(s => s.data !== null)
          .map(s => summarizeSession(s.id, s.data, callerSessionId));
      } else if (typeof store.all === 'function') {
        const sessions: unknown = await new Promise((resolve, reject) => {
          store.all!((err, ss) => err ? reject(err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'session store error')) : resolve(ss));
        });
        const entries: Array<[string, unknown]> = Array.isArray(sessions)
          ? sessions.map((s, i) => [String(i), s])
          : sessions
            ? Object.entries(sessions as Record<string, unknown>)
            : [];
        summaries = entries.map(([id, data]) => summarizeSession(id, data, callerSessionId));
      } else {
        res.status(503).json({ error: 'Session store has no list/get or all methods' });
        return;
      }

      res.json({ total: summaries.length, sessions: summaries });
    } catch (err) {
      logger.error('Failed to obtain session details:', err);
      res.status(500).json({ error: 'Failed to obtain session details' });
    }
  }

  /**
   * #777 — admin action: delete all anonymous (non-authenticated) sessions.
   * Preserves authenticated sessions and the caller's own session. Also
   * cleans up `*.json.NNN` atomic-write orphan files.
   *
   * Admin-only, CSRF-protected. Records an AuditManager event so the action
   * is traceable.
   */
  async clearAnonymousSessions(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      // #1034: was hasRole('admin'). For a MUTATION that is worse than a UX
      // bug — the read-only guarantee rested on role naming rather than on
      // permissions, so a custom role called 'admin' could destroy sessions
      // while one holding admin-system could not.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({
          error: 'This account cannot modify sessions',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
        return;
      }
      const configManager = this.engine.getManager('ConfigurationManager');
      const sessionDir = configManager.getResolvedDataPath('ngdpbase.session.storagedir', './data/sessions');
      const excludeSid = typeof req.sessionID === 'string' ? req.sessionID : null;
      const result = await sweepAnonymousSessions(sessionDir, excludeSid);

      // #1205: through recordAuditEvent — the enabled switch, the on-failure rule and the
      // outcome are the same door every emitter uses. on-failure: continue — the
      // sessions are already cleared and a slow sink must not fail the action.
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.SESSION_CLEAR_ANONYMOUS,
        user: wikiContext.userContext.username ?? 'unknown',
        sessionId: excludeSid ?? undefined,
        ipAddress: req.ip,
        action: 'clear-anonymous-sessions',
        result: 'success',
        severity: 'medium',
        metadata: result
      }, (auditErr) => logger.warn('Audit log failed for clear-anonymous-sessions:', auditErr));
      logger.info(`[AUDIT] admin ${wikiContext.userContext.username ?? 'unknown'} cleared anonymous sessions: ${result.removed} removed, ${result.kept} kept, ${result.orphansRemoved} orphans`);

      res.json({ ok: true, ...result });
    } catch (err) {
      logger.error('Failed to clear anonymous sessions:', err);
      res.status(500).json({ error: 'Failed to clear anonymous sessions' });
    }
  }

  /**
   * #787 — admin action: revoke a single session by id.
   *
   * Admin-only, CSRF-protected. By default refuses to revoke the caller's
   * own session (returns 409 so the UI can prompt). Pass `?confirm-self=1`
   * to override — the admin really means to log themselves out.
   *
   * Records an AuditManager event with the target session's username + ip
   * so the trail is meaningful even after the session is gone.
   */
  async clearOneSession(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      // #1034: was hasRole('admin'). For a MUTATION that is worse than a UX
      // bug — the read-only guarantee rested on role naming rather than on
      // permissions, so a custom role called 'admin' could destroy sessions
      // while one holding admin-system could not.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        res.status(403).json({
          error: 'This account cannot modify sessions',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
        return;
      }
      const targetId = decodeURIComponent(req.params.id ?? '');
      if (!targetId) {
        res.status(400).json({ error: 'session id required' });
        return;
      }
      const confirmSelf = req.query['confirm-self'] === '1';
      const callerId = typeof req.sessionID === 'string' ? req.sessionID : null;
      if (callerId && targetId === callerId && !confirmSelf) {
        res.status(409).json({
          error: 'Refusing to revoke your own session without confirm-self=1',
          isSelf: true
        });
        return;
      }
      const store = req.sessionStore as unknown as {
        get?: (sid: string, cb: (err: unknown, session?: unknown) => void) => void;
        destroy?: (sid: string, cb: (err: unknown) => void) => void;
      } | undefined;
      if (!store || typeof store.destroy !== 'function') {
        res.status(503).json({ error: 'Session store does not support destroy' });
        return;
      }

      // Load first so the audit trail can record what we're killing
      // (after destroy, the session JSON is gone). Tolerate get-not-supported
      // stores by skipping the metadata lookup.
      let targetMeta: { username?: string | null; ip?: string } = {};
      if (typeof store.get === 'function') {
        const raw: unknown = await new Promise((resolve) => {
          store.get!(targetId, (err, data) => resolve(err ? null : data));
        });
        if (raw === null || raw === undefined) {
          res.status(404).json({ error: 'session not found' });
          return;
        }
        const s = raw as Record<string, unknown>;
        targetMeta = {
          username: typeof s.username === 'string' && s.username ? s.username : null,
          ip: typeof s.ip === 'string' ? s.ip : undefined
        };
      }

      await new Promise<void>((resolve, reject) => {
        store.destroy!(targetId, (err) => err
          ? reject(err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'session destroy failed'))
          : resolve());
      });

      // #1205: through recordAuditEvent (see clear-anonymous above).
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.SESSION_REVOKE,
        user: wikiContext.userContext.username ?? 'unknown',
        sessionId: callerId ?? undefined,
        ipAddress: req.ip,
        action: 'revoke-session',
        result: 'success',
        severity: 'medium',
        metadata: {
          targetId,
          targetUsername: targetMeta.username ?? null,
          targetIp: targetMeta.ip ?? null,
          selfRevoke: !!(callerId && targetId === callerId)
        }
      }, (auditErr) => logger.warn('Audit log failed for revoke-session:', auditErr));
      logger.info(`[AUDIT] admin ${wikiContext.userContext.username ?? 'unknown'} revoked session ${targetId} (user=${targetMeta.username ?? 'anon'}, ip=${targetMeta.ip ?? 'unknown'})`);

      res.json({
        ok: true,
        revokedId: targetId,
        revokedUsername: targetMeta.username ?? null,
        revokedIp: targetMeta.ip ?? null,
        selfRevoke: !!(callerId && targetId === callerId)
      });
    } catch (err) {
      logger.error('Failed to revoke session:', err);
      res.status(500).json({ error: 'Failed to revoke session' });
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
   *
   * #1140 — gated on the same permission pair as the admin dashboard, because
   * the dashboard's update card is the only caller. Anonymously it let a
   * stranger make this instance call out to GitHub, and told them the
   * configured repository and the running version while doing it.
   */
  async checkForUpdates(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await this.hasAdminViewAccess(wikiContext))
      ) {
        res.status(403).json({
          error: 'This account cannot check for updates',
          reason: "Requires the 'admin-read' or 'admin-system' permission — the check reveals the configured repository and the running version, and makes the instance call out to GitHub"
        });
        return;
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const currentVersion = configManager.getProperty('ngdpbase.version', '0.0.0');
      const githubRepo = configManager.getProperty('ngdpbase.github.repo', 'jwilleke/ngdpbase');
      // Same key and same fallback as the other two outbound call sites.
      const fetchTimeoutMs =
        (configManager.getProperty('ngdpbase.fetch-timeout-ms', 30000) as number) || 30000;

      // One complete URL string, deliberately. Passing an { origin, path } pair
      // to a client that re-parses the path is CVE-2022-35949, and `githubRepo`
      // is interpolated into the path here.
      const apiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
      let latestVersion: string | null = null;
      let releaseUrl: string | null = null;

      // #1139: through the egress boundary like the other two outbound call
      // sites, not around it. This was the one bare `fetch` left in `src/`, and
      // it is the shape the boundary exists for even though the host is fixed:
      // `githubRepo` is operator-configurable and interpolated into the URL, so
      // "it only ever calls GitHub" is a property of the configuration rather
      // than of this code. guardedFetch judges the address actually resolved,
      // on every redirect hop.
      try {
        // Inside the try deliberately. The route is registered as
        // `void this.checkForUpdates(...)`, so anything that rejects here
        // becomes an unhandled rejection rather than a response — and this
        // check has always been best-effort, so a configuration problem in the
        // egress lists must degrade to "no update information" exactly as an
        // unreachable GitHub does.
        const egress = resolveEgressPolicy((key, fallback) => configManager.getProperty(key, fallback));
        const resp = await guardedFetch(apiUrl, {
          policy: egress.policy,
          headers: { 'User-Agent': 'ngdpbase-update-check', 'Accept': 'application/vnd.github+json' },
          timeoutMs: fetchTimeoutMs
        });
        if (resp.status >= 200 && resp.status < 300) {
          const data = JSON.parse(resp.body.toString('utf8')) as { tag_name?: string; html_url?: string };
          latestVersion = (data.tag_name ?? '').replace(/^v/, '');
          releaseUrl = data.html_url ?? null;
        }
      } catch {
        // GitHub unreachable, or the egress policy denied it — return current
        // version only. Unchanged behaviour: this check has always been
        // best-effort and must never fail the admin screen it feeds.
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
  /**
   * #798 — Build the HTML string for the view's `extraPageMetaBar` slot
   * (consumed in `views/header.ejs`, #796) based on the page's metadata.
   * Today emits journal-specific content for `system-category: journal`
   * (journal-date pill + mood badge). When more addons claim the slot,
   * this helper grows a small switch on system-category rather than
   * spreading conditionals across viewPage.
   *
   * The slot lands inside the navigation-title `<h5>` next to the existing
   * `(Private)` and `(Category)` badges, so addon badges appear in the
   * same visual group as the core badges.
   *
   * Note: this is per-page-VIEW affordance injection. The journal-flavored
   * view at `/journal/<slug>` (rendered by `addons/journal/views/journal-entry.ejs`)
   * keeps its sidebar widgets / tag chips / edit-delete affordances; this
   * helper only adds the meta-bar pills for operators reaching a journal
   * entry through generic `/view/<slug>`.
   *
   * @param metadata - The page's frontmatter (may be undefined-ish).
   * @returns Pre-rendered HTML string for the slot, or '' when no addon claims it.
   */
  static buildViewExtraPageMetaBar(metadata: Record<string, unknown> | undefined | null): string {
    const systemCategory = ((metadata?.['system-category'] as string | undefined) ?? '').toLowerCase();
    if (systemCategory !== 'journal') return '';

    // Shared HTML-attribute escape — same shape as #797's helper, defended
    // against attribute-context breakout via hostile frontmatter.
    const escAttr = (s: string): string => s.replace(/[&<>"']/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
    );
    // HTML-body escape (text-context): journal-date is rendered as text content
    // (not just an attribute), so escape <, >, & here too.
    const escText = (s: string): string => s.replace(/[&<>]/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]
    );

    const parts: string[] = [];

    const rawDate = (metadata?.['journal-date'] as string | undefined) ?? '';
    if (rawDate) {
      parts.push(
        `<span class="badge bg-info text-dark ms-1" style="font-size:0.6em;vertical-align:middle;" title="Journal entry date (${escAttr(String(rawDate))})">${escText(String(rawDate))}</span>`
      );
    }

    const rawMood = (metadata?.['mood'] as string | undefined) ?? '';
    if (rawMood) {
      parts.push(
        `<span class="badge bg-secondary ms-1" style="font-size:0.6em;vertical-align:middle;" title="Mood: ${escAttr(String(rawMood))}">${escText(String(rawMood))}</span>`
      );
    }

    return parts.join('');
  }

  /**
   * #797 — Build the HTML string for the editor's `extraFrontmatterFields`
   * slot (consumed in `views/_basicEditor.ejs`, #794) based on the page's
   * metadata. Today only emits content for `system-category: journal`
   * (renders a journal-date input). Designed as a pure static method so
   * the addon-detection logic is trivially unit-testable and centralized
   * — when more addons claim slots, this helper grows a small switch on
   * system-category rather than spreading conditionals across editPage.
   *
   * The journal-date input value persists through unified /save (#803).
   *
   * @param metadata - The page's frontmatter (may be undefined-ish for new pages).
   * @returns Pre-rendered HTML string for the slot, or '' when no addon claims it.
   */
  static buildEditorExtraFrontmatterFields(metadata: Record<string, unknown> | undefined | null): string {
    const systemCategory = ((metadata?.['system-category'] as string | undefined) ?? '').toLowerCase();
    if (systemCategory !== 'journal') return '';

    // HTML-attribute-escape the existing journal-date so a hostile
    // frontmatter value can't break out of the value="..." attribute.
    const rawDate = (metadata?.['journal-date'] as string | undefined) ?? '';
    const escDate = String(rawDate).replace(/[&<>"']/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
    );

    return `
                <div class="row mb-3">
                    <div class="col-md-4">
                        <label for="journal-date" style="font-weight:bold;">Journal Date:</label>
                        <input type="date" id="journal-date" name="journal-date" class="form-control" value="${escDate}">
                    </div>
                </div>`;
  }

  buildNewPageMetadata(
    title: string,
    options: Record<string, unknown> = {},
    existingMetadata?: Record<string, unknown> | null
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
      return this.preserveSeededFields(
        validationManager.generateValidMetadata(title, cleanOptions),
        cleanOptions,
        existingMetadata
      );
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

    return this.preserveSeededFields({
      title: title.trim(),
      'system-category': cleanOptions['system-category'] || defaultCategory,
      'user-keywords': cleanOptions['user-keywords'] || [],
      uuid: cleanOptions.uuid || '',
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      lastModified: new Date().toISOString(),
      ...cleanOptions
    }, cleanOptions, existingMetadata);
  }

  /**
   * Restore seeded fields from the page's existing frontmatter (#1106).
   *
   * Applies only to `DEFAULT_SEEDED_FIELDS`, and only where the caller did not
   * explicitly supply the field. General preservation of every other key stays
   * with the #803 carry-forward — two mechanisms doing the same job would drift.
   *
   * An existing empty array is preserved as empty. That is a state a user chose,
   * not a reason to restore defaults (the rule #1017 established).
   *
   * @param generated - Metadata just built, with defaults already seeded
   * @param supplied - Caller-supplied options, after undefined/null filtering
   * @param existingMetadata - The page's current on-disk frontmatter, if it exists
   * @returns The metadata, with seeded fields yielded back to disk where applicable
   */
  private preserveSeededFields(
    generated: Record<string, unknown>,
    supplied: Record<string, unknown>,
    existingMetadata?: Record<string, unknown> | null
  ): Record<string, unknown> {
    if (!existingMetadata) return generated;
    for (const field of DEFAULT_SEEDED_FIELDS) {
      if (field in supplied) continue;
      if (!(field in existingMetadata)) continue;
      generated[field] = existingMetadata[field];
    }
    return generated;
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
   * #897: index-observed user keywords for the editor typeahead suggestion
   * pool (merged client-side with the vocabulary catalog). ACL note: this is
   * the same union-of-terms surface the asset-picker filter already exposes
   * to all users — term strings only, no page associations.
   */
  /**
   * #883: recency-weighted keyword-set suggestions from the author's own recent
   * pages, for one-click apply in the editor. Reads the N most-recent pages by
   * this creator and offers each one's keyword set (minus what's already
   * selected). Best-effort — returns [] on any failure or missing manager.
   */
  private async getSuggestedKeywordSetsForUser(
    username: string | undefined,
    currentKeywords: string[],
    excludeTitle?: string
  ): Promise<KeywordSetSuggestion[]> {
    if (!username) return [];
    const pm = this.engine.getManager('PageManager') as {
      getPagesByCreator?: (u: string, o?: { limit?: number; sortBy?: string }) => Promise<Array<{ title: string; lastModified: string }>>;
      getPageMetadata?: (id: string) => Promise<Record<string, unknown> | null>;
    } | undefined;
    if (!pm?.getPagesByCreator || !pm?.getPageMetadata) return [];
    try {
      const recent = await pm.getPagesByCreator(username, { limit: 20, sortBy: 'lastModified-desc' });
      const pages: RecentPageKeywords[] = [];
      for (const entry of recent) {
        if (excludeTitle && entry.title === excludeTitle) continue;
        const meta = await pm.getPageMetadata(entry.title);
        const raw = meta?.['user-keywords'];
        const kws = Array.isArray(raw)
          ? raw.filter((k): k is string => typeof k === 'string' && k.length > 0 && k !== 'private')
          : [];
        if (kws.length) {
          pages.push({ title: entry.title, keywords: kws, modifiedAt: Date.parse(entry.lastModified) || 0 });
        }
        if (pages.length >= 15) break; // enough signal; keep the render cheap
      }
      return getSuggestedKeywordSets(pages, currentKeywords, { maxSets: 5 });
    } catch (err) {
      logger.warn('[WikiRoutes] getSuggestedKeywordSetsForUser failed:', err);
      return [];
    }
  }

  private async getObservedUserKeywords(): Promise<string[]> {
    const sm = this.engine.getManager('SearchManager') as {
      getAllUserKeywords?: () => Promise<string[]>;
    } | undefined;
    if (!sm?.getAllUserKeywords) return [];
    try {
      const kws = await sm.getAllUserKeywords();
      return Array.isArray(kws) ? kws : [];
    } catch {
      return [];
    }
  }

  /**
   * #893: editorial lifecycle options for the editor's Status select, sourced
   * from the config-driven catalog via ValidationManager (order ascending).
   * `defaultStatus` is the state an absent frontmatter field means.
   */
  private getStatusOptions(): { statuses: string[]; defaultStatus: string } {
    const vm = this.engine.getManager('ValidationManager') as {
      getValidStatuses?: () => string[];
      getDefaultStatus?: () => string;
    } | undefined;
    const statuses = vm?.getValidStatuses ? vm.getValidStatuses() : ['draft', 'review', 'published'];
    const defaultStatus = vm?.getDefaultStatus ? vm.getDefaultStatus() : 'published';
    return { statuses, defaultStatus };
  }

  /**
   * #745: available media years for the asset-picker Year filter. Sourced
   * from MediaManager.getYears() (the same list /media/ uses); gracefully
   * empty if MediaManager / the provider is unavailable. Years are public
   * (per MediaManager.getYears — no wikiContext filtering needed).
   */
  /**
   * Search-capable asset providers, for the picker's source dropdown.
   *
   * The dropdown used to hardcode `attachment` and `media`, so a provider
   * registered by an addon — the sist2 external index — was unreachable from
   * the UI no matter what it contained. Anything with the `search` capability
   * now appears automatically, labelled with its own `displayName`.
   *
   * Returns the provider's real id as the value, so `types=<id>` needs no
   * translation table. The legacy `attachment` / `media` values are still
   * accepted as aliases — see `normalizeAssetSource`.
   *
   * @returns Provider id + label pairs, empty when AssetManager is unavailable
   */
  private getPickerAssetSources(): Array<{ id: string; label: string }> {
    const am = this.engine.getManager('AssetManager') as {
      getProviders?: () => Array<{ id: string; displayName?: string; capabilities?: string[] }>;
    } | undefined;
    if (!am?.getProviders) return [];
    try {
      return am.getProviders()
        .filter(p => Array.isArray(p.capabilities) && p.capabilities.includes('search'))
        .map(p => ({ id: p.id, label: p.displayName || p.id }));
    } catch {
      return [];
    }
  }

  /**
   * Map a submitted `types` value onto a provider id.
   *
   * `attachment` and `media` predate the registry-driven dropdown and are still
   * used by bookmarks, the legacy `tab=` query param, and saved picker state,
   * so they keep resolving to the providers they always meant.
   *
   * @param {string} value - Raw `types` value from the query string
   * @returns {string} Provider id, or the input unchanged when it is not an alias
   */
  static normalizeAssetSource(value: string): string {
    if (value === 'attachment') return 'local';
    if (value === 'media') return 'media-library';
    return value;
  }

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
      // #894 (Slice 2 of #869): the user-keywords vocabulary lives behind
      // CatalogManager's provider registry. Resolve through it first; the
      // config-direct read below survives only as a fallback for engines
      // without CatalogManager (e.g. minimal test setups).
      const catalogTerms = await this.getUserKeywordCatalogTerms();
      if (catalogTerms && catalogTerms.length > 0) {
        return catalogTerms
          .map(t => t.label)
          .sort((a, b) => a.localeCompare(b));
      }

      const configManager = this.engine.getManager('ConfigurationManager');

      // Fallback: read user keywords straight from configuration
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
   * #896 (Slice 4 of #869): the user-keywords provider — read/write interface
   * for the vocabulary catalog (seed + instance store). Null when
   * CatalogManager is unavailable.
   */
  private getUserKeywordsProvider(): {
    getCatalogObject: () => Promise<Record<string, Record<string, unknown>>>;
    saveCatalogObject: (catalog: Record<string, Record<string, unknown>>) => Promise<void>;
  } | null {
    const catalogManager = this.engine.getManager('CatalogManager') as {
      getUserKeywordsProvider?: () => unknown;
    } | undefined;
    const provider = catalogManager?.getUserKeywordsProvider?.();
    return provider ? provider as ReturnType<WikiRoutes['getUserKeywordsProvider']> : null;
  }

  /**
   * #918: map of canonical keyword value → registry display title, from the
   * user-keywords catalog. Used to snap keywords to the vocabulary's display
   * form on media write-back. Best-effort — empty map when the catalog is
   * unavailable (dedup still runs, just without title-snapping).
   */
  private async getUserKeywordCanonicalMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const config = (await this.getUserKeywordsProvider()?.getCatalogObject()) || {};
      for (const [key, entry] of Object.entries(config)) {
        const title = (typeof entry?.label === 'string' && entry.label) ? entry.label : key;
        const value = normalizeKeywordValue(title);
        if (value && !map.has(value)) map.set(value, title);
      }
    } catch (err) {
      logger.warn('[WikiRoutes] getUserKeywordCanonicalMap failed:', err);
    }
    return map;
  }

  /**
   * #894 (Slice 2 of #869): fetch the user-keywords vocabulary from
   * CatalogManager's provider registry. Returns null when CatalogManager (or
   * the provider) is unavailable so callers can fall back to config-direct.
   */
  private async getUserKeywordCatalogTerms(): Promise<Array<{ term: string; label: string; description?: string }> | null> {
    const catalogManager = this.engine.getManager('CatalogManager') as {
      getProviderTerms?: (schemeId: string) => Promise<{ displayName: string; terms: Array<{ term: string; label: string; description?: string; enabled?: boolean }> } | null>;
    } | undefined;
    if (!catalogManager?.getProviderTerms) return null;
    try {
      const result = await catalogManager.getProviderTerms('user-keywords');
      return result?.terms ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get user keywords with their descriptions for display in dropdowns
   * @returns Array of {id, label, description} objects sorted alphabetically
   */
  async getUserKeywordsWithDescriptions(): Promise<Array<{ id: string; label: string; description: string }>> {
    try {
      // #894: provider registry first (same source as getUserKeywords)
      const catalogTerms = await this.getUserKeywordCatalogTerms();
      if (catalogTerms && catalogTerms.length > 0) {
        const keywords = catalogTerms.map(t => ({
          id: t.term,
          label: t.label,
          description: t.description || ''
        }));
        const sorted = keywords.sort((a, b) => a.label.localeCompare(b.label));
        const labelCounts = new Map<string, number>();
        for (const kw of sorted) {
          labelCounts.set(kw.label, (labelCounts.get(kw.label) || 0) + 1);
        }
        return sorted.map(kw =>
          labelCounts.get(kw.label)! > 1 ? { ...kw, label: `${kw.label} (${kw.id})` } : kw
        );
      }

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
  /**
   * GET /sitemap.xml and /sitemap-<n>.xml (#885).
   *
   * 404s unless `ngdpbase.seo.enabled` — a private or intranet install must not
   * advertise its page list, and a 404 (rather than an empty 200) says nothing
   * about whether the feature exists.
   *
   * ## How "public" is decided, and what it does not cover
   *
   * Page selection reads the in-memory page index only — see
   * `selectPublicSitemapEntries`, which excludes private pages and anything
   * carrying `audienceRoles`. Running the full ACL evaluator per page is not an
   * option at this size: jimstest indexes ~17,900 pages, and the evaluator does
   * a manager lookup, a metadata read and an info-level log per call.
   *
   * That covers ACL tiers 0 and 1. Tier 2 — global policy — is settled once,
   * below, because it is a property of the instance rather than of a page.
   * Two guards make that sound rather than convenient:
   *
   *   1. Every policy resource pattern must be `*`. The schema permits a
   *      page-scoped pattern, and one would make a single probe unrepresentative
   *      — so an instance carrying one gets an empty sitemap and a warning,
   *      never a guessed answer.
   *   2. Anonymous `page-read` must actually be allowed, checked through the
   *      real PolicyEvaluator rather than assumed from the shipped defaults.
   *
   * Both failures produce an empty (valid) sitemap. Under-listing costs a
   * missed crawl; over-listing leaks the slug and existence of a page nobody
   * was meant to find.
   */
  async sitemap(req: Request, res: Response): Promise<void | Response> {
    try {
      const configManager = this.engine.getManager('ConfigurationManager');
      if (configManager?.getProperty?.('ngdpbase.seo.enabled', false) !== true) {
        return res.status(404).send('Not found');
      }

      const baseUrl = configManager.getBaseURL?.() ?? '';
      const pageManager = this.engine.getManager('PageManager');
      const provider = pageManager?.getCurrentPageProvider?.() ?? pageManager?.provider;
      const indexPages = (provider?.pageIndex as {
        pages?: Record<string, SitemapIndexEntry>;
      } | null)?.pages;

      let entries: ReturnType<typeof selectPublicSitemapEntries> = [];
      if (indexPages && this._anonymousReadIsGloballyAllowed(configManager)) {
        const candidates = selectPublicSitemapEntries(Object.values(indexPages), baseUrl);

        // Second pass against each page's REAL frontmatter. The index carries a
        // denormalised `audienceRoles`, but it is written on save, so a page not
        // re-saved since #754 shows nothing there while its frontmatter still
        // restricts it. Trusting the index alone leaked 345 audience-restricted
        // journal entries into a generated sitemap during development — the
        // field's own docs say "the page-frontmatter is the source of truth".
        //
        // Affordable: reading frontmatter for every page in the corpus measures
        // ~240ms, against ~0.5s for the whole request. Cheap enough not to trade
        // correctness for it.
        const verified: typeof candidates = [];
        for (const entry of candidates) {
          const slug = decodeURIComponent(entry.loc.slice(entry.loc.lastIndexOf('/view/') + 6));
          let meta: RestrictableMetadata | null = null;
          try {
            meta = await pageManager?.getPageMetadata?.(slug) ?? null;
          } catch {
            meta = null;
          }

          // FAIL CLOSED. A page whose metadata cannot be read — lookup threw,
          // or the slug did not resolve — has not been shown to be public, and
          // "we could not tell" must never become "list it". This is not
          // theoretical: the verification pass only protects pages whose
          // lookup succeeds, so treating a miss as public would leave a hole
          // exactly where the index pre-filter is already blind.
          if (!meta || isRestrictedByMetadata(meta)) continue;
          verified.push(entry);
        }
        entries = verified;
      }

      res.setHeader('Content-Type', 'application/xml; charset=utf-8');

      const pages = paginate(entries);
      const requested = req.params.page;

      // Single file: serve the urlset directly rather than an index pointing at
      // one child, which is legal but makes crawlers fetch twice for nothing.
      if (pages.length === 1) {
        if (requested !== undefined) return res.status(404).send('Not found');
        return res.send(buildSitemapXml(pages[0]));
      }

      if (requested === undefined) {
        const base = baseUrl.replace(/\/+$/, '');
        const locs = pages.map((_, i) => `${base}/sitemap-${i + 1}.xml`);
        return res.send(buildSitemapIndexXml(locs, new Date().toISOString()));
      }

      const n = Number.parseInt(requested, 10);
      if (!Number.isInteger(n) || n < 1 || n > pages.length) {
        return res.status(404).send('Not found');
      }
      return res.send(buildSitemapXml(pages[n - 1]));
    } catch (err) {
      logger.error('[sitemap] generation failed:', err);
      return res.status(500).send('Sitemap unavailable');
    }
  }

  /**
   * Whether an anonymous visitor may read pages at all, per global policy
   * (#885). Conservative: anything unexpected answers false.
   *
   * Read directly from configuration rather than by probing the evaluator with
   * a synthetic page: a probe needs a representative page, and "representative"
   * is exactly what a page-scoped policy would break — the condition this is
   * checking for.
   */
  private _anonymousReadIsGloballyAllowed(configManager: {
    getProperty?: (key: string, def?: unknown) => unknown;
  }): boolean {
    const policies = configManager?.getProperty?.('ngdpbase.access.policies', []) as Array<{
      effect?: string;
      subjects?: Array<{ type?: string; value?: string }>;
      resources?: Array<{ type?: string; pattern?: string }>;
      actions?: string[];
    }> | undefined;

    if (!Array.isArray(policies) || policies.length === 0) return false;

    // Guard 1 — a page-scoped pattern makes an instance-wide answer unsound.
    const pageScoped = policies.some((p) =>
      (p.resources ?? []).some((r) => r.type === 'page' && r.pattern !== '*')
    );
    if (pageScoped) {
      logger.warn(
        '[sitemap] a page-scoped access policy is configured, so page visibility '
        + 'cannot be decided instance-wide from the page index. Serving an empty '
        + 'sitemap rather than guessing. (#885)'
      );
      return false;
    }

    // Guard 2 — an explicit deny anywhere wins; ngdpbase policy default is deny.
    const anonSubject = (s: { type?: string; value?: string }) =>
      s?.type === 'role' && ['anonymous', 'all', 'asserted'].includes(String(s.value).toLowerCase());
    const readers = policies.filter((p) =>
      (p.actions ?? []).includes('page-read') && (p.subjects ?? []).some(anonSubject)
    );
    if (readers.some((p) => p.effect === 'deny')) return false;
    return readers.some((p) => p.effect === 'allow');
  }

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
        // #1105: the four-step live ladder missed, so this may be a page's former
        // title — a bookmark or an external link that predates a rename. Those
        // are not ours to rewrite the way inbound page links are, so resolution
        // is the only repair available.
        //
        // 301, not 302: a rename is permanent, and this exists for links followed
        // months or years later, where moving search ranking to the new title is
        // the point. Accepted cost: browsers cache a 301 hard, so if a former
        // title is ever reused by a NEW page, a client holding the cached
        // redirect never asks us again and lands on the wrong page. The server
        // side stays correct — live resolution runs first, and the index refuses
        // an ambiguous title — but we cannot reach a cached client.
        //
        // `from` drives the "renamed" notice on the target page. It is rendered
        // only after the target confirms the value is one of its own former
        // titles, never echoed from the query string.
        const renamedTo = await pageManager.resolveFormerTitle?.(pageName);
        if (renamedTo) {
          logger.info(`[VIEW] former title '${pageName}' -> '${renamedTo}' (301)`);
          return res.redirect(
            301,
            `/view/${encodeURIComponent(renamedTo)}?from=${encodeURIComponent(pageName)}`
          );
        }

        return await this.renderError(
          req,
          res,
          404,
          'Not Found',
          `The page '${pageName}' does not exist.`
        );
      }

      // Load page metadata before ACL checks so Tier 0 / Tier 1.5 have full
      // context. Shared with the export routes (#1060) so the two paths to a
      // page's content cannot present the evaluator with different facts.
      const metadata = await this.loadPageMetadataForAcl(pageName);
      (wikiContext as { pageMetadata: unknown }).pageMetadata = metadata;

      // Update WikiContext with page content for ACL checking
      (wikiContext as { content: string | null }).content = markdown;

      // #714 Slice C: removed the redundant `this.checkPrivatePageAccess`
      // call that previously sat here. Tier 0 inside
      // `checkPagePermissionWithContext` (below) already delegates to
      // `PageManager.checkPrivatePageAccess` (per #711), so the legacy
      // route-layer helper was running the same logic twice.
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

      // #1129: access accounting, recorded at the moment access was GRANTED —
      // an assessor asks who saw the page, not who requested it. Gated inside
      // the helper; a no-op on the default (wiki) posture.
      this.auditPageView(req, pageName, (metadata as { uuid?: string } | null)?.uuid);

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
          ...((metadata['system-keywords']) ?? []),
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
      // #791 — resolve the schema-types map once per render so the JSON-LD
      // @type can be overridden per system-category (e.g. `documentation` →
      // `TechArticle`). Resolved here rather than inside articleToPageJsonLd
      // so the mapper stays a pure function. Empty / missing map → mapper
      // falls through to article['@type'] (always 'Article' today).
      const _configForSchema = this.engine.getManager('ConfigurationManager');
      const schemaTypeMap = (_configForSchema?.getProperty?.('ngdpbase.schema-types', {}) ?? {}) as Record<string, string>;
      // Fallback path: if PageManager is unavailable (or hasn't loaded the
      // CatalogSource surface for any reason), still emit a JSON-LD block by
      // calling the wrapped mapper directly. Same code path either way after
      // #773's buildPageJsonLd compose refactor.
      const pageJsonLd = article
        ? articleToPageJsonLd(article, schemaTypeMap)
        : articleToPageJsonLd({ '@id': '/view/' + pageName, '@type': 'Article', identifier: pageName, name: pageName, url: '/view/' + pageName }, schemaTypeMap);
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

      // #798 — addon-claimed extension slot HTML for the view's
      // `extraPageMetaBar` slot (defined in `views/header.ejs`, #796).
      // For `system-category: journal` pages, inject a journal-date pill
      // (and mood badge if set) alongside the (Private)/(Category) badges
      // in the navigation-title h5. The journal-entry.ejs view at
      // /journal/<slug> retains its journal-flavored layout for operators
      // in journal mode; this slot adds the same affordances inline when
      // a journal entry is reached via /view/<slug> (wiki links, search).
      const extraPageMetaBar = WikiRoutes.buildViewExtraPageMetaBar(
        metadata
      );

      // #886 — OpenGraph / Twitter tags, gated on ngdpbase.seo.enabled and
      // OFF by default: a private or intranet install should expose nothing
      // extra, and these tags only earn their keep where anonymous visitors
      // are welcome.
      //
      // Skipped for private pages. Not a security control — an unauthenticated
      // crawler gets a 403 from the ACL long before it reads any tag — but a
      // private page cannot unfurl anywhere, so emitting a card for one is
      // dead markup that invites the reader to think it can be shared.
      const _seoEnabled = this.engine.getManager('ConfigurationManager')
        ?.getProperty?.('ngdpbase.seo.enabled', false) === true;
      const _pageIsPrivate = await this._isPagePrivate(pageName);
      const socialMeta = (_seoEnabled && !_pageIsPrivate)
        ? buildSocialMeta({
          pageName,
          metadata,
          contentHtml: html,
          baseUrl: this.engine.getManager('ConfigurationManager')?.getBaseURL?.() ?? '',
          applicationName: templateData.applicationName ?? ''
        })
        : [];

      // #1105: the "arrived via a former title" notice. The value rendered is the
      // one stored in the page's own frontmatter, never the query string —
      // `from` is attacker-controlled, and echoing it would put arbitrary text on
      // the page. Validating against the page's own formerTitles is also the only
      // OFF switch: the 301 is cached client-side, so clients keep sending
      // `?from=` whatever we do, and removing the frontmatter entry is the sole
      // way to stop the notice appearing.
      const _renamedFromParam = typeof req.query.from === 'string' ? req.query.from.trim() : '';
      const _pageFormerTitles: string[] = Array.isArray((metadata as Record<string, unknown> | null)?.formerTitles)
        ? ((metadata as Record<string, unknown>).formerTitles as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      const renamedFrom = _renamedFromParam
        ? _pageFormerTitles.find((t) => t.toLowerCase() === _renamedFromParam.toLowerCase()) ?? null
        : null;

      res.render(template, {
        socialMeta,
        ...templateData,
        renamedFrom,
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
        // #714 Slice C: was `!canAccessPrivate ? false : await this._isPagePrivate(...)`.
        // The `canAccessPrivate` variable was removed when the redundant
        // `this.checkPrivatePageAccess` call was deleted. We only reach
        // this render path when `canView` is true (the full ACL evaluator
        // above allowed access) — which for private pages already requires
        // the caller to be admin or page-creator. So the gate is implicit
        // here; show the private badge unconditionally when the page IS
        // marked private.
        //
        // #886: resolved once above as `_pageIsPrivate` and reused — the
        // social-meta gate needs the same answer, and calling the helper twice
        // per render would double a page-index lookup for no benefit.
        pageIsPrivate: _pageIsPrivate,
        versionInfo,
        lastModified: metadata?.lastModified,
        referringPages: [], // TODO: Implement backlink detection
        warningMessage,
        extraPageMetaBar
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
        currentUser,
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
      const rawKeywords = await this.getUserKeywordsWithDescriptions();
      const userKeywords = Array.isArray(rawKeywords) ? rawKeywords : [];

      const configManager = this.engine.getManager('ConfigurationManager');

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
        // #1053: the suggestion pool is built here, not in the template, so
        // the page editors and the media editor cannot drift apart again.
        keywordPool: buildKeywordPool(userKeywords, await this.getObservedUserKeywords()),
        userKeywordSuggestions: await this.getObservedUserKeywords(),
        // #883: recency-weighted keyword sets from this author's recent pages.
        keywordSetSuggestions: await this.getSuggestedKeywordSetsForUser(
          (commonData as { user?: { username?: string } }).user?.username,
          [], // brand-new page — nothing selected yet
          pageName
        ),
        defaultCategory: defaultCategory,
        statusOptions: this.getStatusOptions(),
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
      // #1037: content validation now happens in PageManager, so it reaches
      // this path too — POST /create is the header's "Create New Page" and
      // previously saved without any check. A rule violation is the author's
      // problem to fix, not a server fault, so answer 400 with the specific
      // violations rather than a blank 500.
      if (err instanceof PageContentValidationError) {
        logger.info(`🛑 createPageFromTemplate blocked: ${err.validationErrors.length} error(s)`);
        return res.status(400).json({
          ok: false,
          error: 'Validation failed',
          validationErrors: err.validationErrors
        });
      }
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

      // #714 Slice C: removed the redundant `this.checkPrivatePageAccess`
      // call that previously sat here. Tier 0 inside the
      // `checkPagePermissionWithContext('edit')` call below already covers
      // private-page access (it delegates to
      // `PageManager.checkPrivatePageAccess` per #711) — duplicating it
      // here was a leftover from before #711 unified Tier 0.

      // Check if this is a required page that needs admin access
      if (await this.isRequiredPage(pageName)) {
        if (
          !currentUser ||
          !(await userManager.hasPermission(
            currentUser,
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

          // #714 Slice F: use the rich-return `evaluatePagePermission`
          // when available so we can specialise the 403 message on
          // `reason === 'author_lock_deny'`. Restores the specific
          // "This page is author-locked..." message that Slice A
          // temporarily lost when Tier 0.5 moved the check into ACLManager.
          //
          // Defensive fallback: many existing test fixtures mock only
          // `checkPagePermissionWithContext` (the legacy boolean form).
          // Fall back to it when the rich form isn't on the mocked
          // ACLManager — same allow/deny outcome, generic message.
          //
          // #714 Slice E: the previous route-layer author-lock branch
          // that sat below this block is now deleted — the same check
          // lives at ACL Tier 0.5 (added in Slice A) and the rich-return
          // reason restores its specific 403 message at the route layer.
          let decision: { allowed: boolean; reason: string };
          if (typeof aclManager.evaluatePagePermission === 'function') {
            decision = await aclManager.evaluatePagePermission(wikiContext, 'edit');
          } else {
            const allowed = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');
            decision = { allowed, reason: allowed ? 'legacy_allow' : 'legacy_deny' };
          }

          if (!decision.allowed) {
            const message = decision.reason === 'author_lock_deny'
              ? 'This page is author-locked. Only the page author and administrators can edit it.'
              : 'You do not have permission to edit this page';
            return await this.renderError(
              req,
              res,
              403,
              'Access Denied',
              message
            );
          }
        } else {
          // For new pages, check general page creation permission
          if (
            !currentUser ||
            !(await userManager.hasPermission(
              currentUser,
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
      const rawKeywords = await this.getUserKeywordsWithDescriptions();
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

      // #797 — addon-claimed extension slot HTML for the editor's
      // `extraFrontmatterFields` slot (defined in `_basicEditor.ejs`, #794).
      // For journal-categorised pages, inject a journal-date input that
      // round-trips through unified /save (#803 preservation). Mood + tags
      // pickers can layer on in a follow-up slice.
      const extraFrontmatterFields = WikiRoutes.buildEditorExtraFrontmatterFields(
        pageData.metadata
      );

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
        // #1053: see the create-page route — one shared pool builder.
        keywordPool: buildKeywordPool(userKeywords, await this.getObservedUserKeywords()),
        userKeywordSuggestions: await this.getObservedUserKeywords(),
        // #883: recency-weighted keyword sets from this author's recent pages,
        // excluding keywords already on this page and this page itself.
        keywordSetSuggestions: await this.getSuggestedKeywordSetsForUser(
          (commonData as { user?: { username?: string } }).user?.username,
          Array.isArray(selectedUserKeywords) ? selectedUserKeywords : [],
          pageName
        ),
        availableRoles: availableRoles,
        pageData: pageData,
        defaultCategory: defaultCategory,
        statusOptions: this.getStatusOptions(),
        pageAttachments: pageAttachments,
        csrfToken: req.session.csrfToken,
        isRequiredPage: pageIsRequired,
        sectionIndex: sectionIndex,
        extraFrontmatterFields: extraFrontmatterFields
      });
    } catch (err: unknown) {
      logger.error('Error loading edit page:', err);
      res.status(500).send('Error loading edit page');
    }
  }


  /**
   * Fields to re-post from a save that hit an edit conflict (#1061).
   *
   * Everything the user submitted travels to the conflict page and back, so a
   * resubmit carries the same title, categories, keywords and frontmatter it
   * had the first time. Preserving only the content would silently strip a
   * metadata change the user made in the same edit.
   *
   * Two fields are dropped because the conflict page reissues them from current
   * state: `_csrf` (the session's token) and `baseLastModified` (the whole
   * point — resubmitting the stale one would conflict again forever). `content`
   * is dropped because it is rendered as the editable textarea instead.
   */
  static buildConflictResubmitFields(
    body: Record<string, unknown> | undefined
  ): Array<{ name: string; value: string | string[] }> {
    const skip = new Set(['_csrf', 'baseLastModified', 'content']);
    // Only these render as a hidden input. Anything else — an object, a
    // function, a nested body — would stringify to '[object Object]' and post
    // that garbage back, so it is dropped instead.
    const renderable = (v: unknown): v is string | number | boolean =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

    const out: Array<{ name: string; value: string | string[] }> = [];
    for (const [name, value] of Object.entries(body ?? {})) {
      if (skip.has(name)) continue;
      if (Array.isArray(value)) {
        // Repeated field (checkbox groups, multi-selects). Keep every value —
        // collapsing to the first would drop all but one selected keyword.
        const values = (value as unknown[]).filter(renderable).map((v) => String(v));
        if (values.length > 0) out.push({ name, value: values });
      } else if (renderable(value)) {
        out.push({ name, value: String(value) });
      }
    }
    return out;
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
        // #897: the open typeahead posts ONE comma-separated string; legacy
        // checkbox forms post an array. Normalize both to a trimmed,
        // deduplicated string array (#545/#862 shape guards). An empty
        // submission clears the keywords.
        const rawList = Array.isArray(submittedUserKeywords)
          ? submittedUserKeywords
          : submittedUserKeywords
            ? String(submittedUserKeywords).split(',')
            : [];
        const seen = new Set<string>();
        userKeywordsArray = rawList
          .map((kw: unknown) => String(kw).trim())
          .filter((kw: string) => {
            if (!kw) return false;
            const lower = kw.toLowerCase();
            if (seen.has(lower)) return false;
            seen.add(lower);
            return true;
          });
      }

      // Extract audience from POST body (checkbox array)
      const submittedAudience = req.body['audience'];
      const audienceArray: string[] = Array.isArray(submittedAudience)
        ? submittedAudience.filter(Boolean)
        : submittedAudience
          ? [String(submittedAudience)]
          : [];

      // Resolve author-lock: admins and the page author may set or clear it
      // #1198: authority from policy, not a role name — admin-system is what the
      // admin role holds, and a delegated token without it does not.
      const isAdmin = await wikiContext.hasPermission('admin-system');
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

      // #1017: system-keywords is the automation/provenance bucket (#893) — no
      // editor posts it, so an edit must PRESERVE what is on disk. Without this,
      // generateValidMetadata seeds the catalog default (`general`) and the #803
      // carry-forward below cannot restore the real value, because it only fills
      // keys that are ABSENT from metadata and this one is already present. That
      // silently destroyed the capture mark on first edit (#1008) and would do
      // the same to any other machine tag, e.g. the #507 auto-tags.
      //
      // An existing empty array is preserved as empty — that is a real state, not
      // a reason to re-seed defaults. Only a genuinely new page (or an existing
      // one with no such field at all) falls through to the catalog default.
      // Scalar coercion mirrors the view path's JSPWiki-import guard at line 2310.
      // Typed as string[] on PageFrontmatter, but frontmatter comes off disk — read
      // it as unknown so the scalar branch below is a real runtime guard rather
      // than dead code the compiler narrows away.
      const existingSystemKeywords: unknown = existingPage?.metadata?.['system-keywords'];
      const preservedSystemKeywords: string[] | undefined = Array.isArray(existingSystemKeywords)
        ? existingSystemKeywords.map(String)
        : typeof existingSystemKeywords === 'string' && existingSystemKeywords.trim()
          ? existingSystemKeywords.split(/[\s,]+/).filter(Boolean)
          : undefined;

      // #893: editorial lifecycle status — single-valued enum, form-posted from
      // the editor's Status select. When the form posts `status-present=1` we
      // honour the select; otherwise preserve the existing value. The catalog's
      // default state (config `ngdpbase.status` default:true entry) maps to
      // ABSENCE — it is never written to frontmatter.
      const _vmStatus = this.engine.getManager('ValidationManager') as { getDefaultStatus?: () => string } | undefined;
      const defaultStatus = _vmStatus?.getDefaultStatus ? _vmStatus.getDefaultStatus() : 'published';
      const existingStatus = typeof existingPage?.metadata?.status === 'string' ? existingPage.metadata.status : undefined;
      const submittedStatus: string | undefined = req.body['status-present'] === '1'
        ? (typeof req.body.status === 'string' && req.body.status !== '' ? req.body.status : undefined)
        : existingStatus;
      const statusValue = submittedStatus?.toLowerCase() === defaultStatus ? undefined : submittedStatus;

      // Prepare metadata ONCE, preserving UUID if editing
      // Use matchedCategory (properly capitalized) instead of submitted systemCategory
      const metadata = this.buildNewPageMetadata(title || pageName, {
        'system-category': matchedCategory,
        'user-keywords': userKeywordsArray,
        ...(preservedSystemKeywords ? { 'system-keywords': preservedSystemKeywords } : {}),
        ...(audienceArray.length ? { audience: audienceArray } : {}),
        ...(authorLock ? { 'author-lock': true } : {}),
        ...(privateFlag ? { private: true } : {}),
        ...(statusValue ? { status: statusValue } : {}),
        author: pageAuthor,
        uuid: existingPage?.metadata?.uuid || undefined
      }, existingPage?.metadata);

      // #803 — preserve addon-claimed unknown frontmatter fields (EPIC #790).
      // Step 1: carry forward existing on-disk frontmatter fields the form
      // didn't post (so editing a page through a generic editor that doesn't
      // know about an addon field — e.g. `mood` on a journal entry — doesn't
      // drop the field). Step 2: layer non-managed, non-form-internal fields
      // from the submit body on top so an addon editor's `extraFrontmatterFields`
      // slot inputs (e.g. mood + journal-date in `_basicEditor.ejs`) actually
      // persist. Empty-string values preserve existing (clear-via-blank is a
      // known minor UX gap; a follow-up can add explicit deletion).
      const _803_managedFields = new Set<string>([
        'title', 'slug', 'uuid', 'lastModified', 'created',
        'system-category', 'system-keywords', 'user-keywords',
        'audience', 'author-lock', 'private', 'author', 'content', 'status'
      ]);
      const _803_formInternal = new Set<string>([
        '_csrf', 'section', 'private-present', 'author-lock-present',
        'categories', 'userKeywords', 'status-present'
      ]);
      const _803_existingMeta = (existingPage?.metadata ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(_803_existingMeta)) {
        if (!(k in metadata)) (metadata)[k] = v;
      }
      for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
        if (_803_managedFields.has(k) || _803_formInternal.has(k)) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        (metadata)[k] = v;
      }
      // #893: 'published' is represented by ABSENCE of `status` — the step-1
      // carry-forward above would otherwise resurrect a stale draft/review value
      // from disk after the user set the page back to published.
      if (!statusValue) delete (metadata).status;

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
            currentUser,
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
              currentUser,
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

      // #1061: refuse a save built on a version someone else has already
      // replaced. Deliberately the LAST check before the write — the page can
      // move while the earlier validation runs, and a stale-check that ran
      // before validation would be answering about a version that has since
      // changed again.
      //
      // The editor's work is not discarded. `edit-conflict` re-posts every
      // field of this submission with the content editable, so the user can
      // merge and save again. Blocking their save to protect someone else's,
      // while dropping theirs, would only move the data loss to a different
      // person.
      const submittedBase = typeof req.body?.baseLastModified === 'string'
        ? req.body.baseLastModified
        : null;
      if (existingPage && isStaleSave(submittedBase, versionTokenOf(existingPage.metadata))) {
        logger.warn(
          `⚠️  savePage(${pageName}) blocked: stale base version ` +
          `(submitted ${submittedBase}, current ${versionTokenOf(existingPage.metadata)})`
        );
        return res.status(409).render('edit-conflict', {
          ...(await this.getCommonTemplateData(req)),
          title: `Edit conflict — ${pageName}`,
          pageName,
          submittedContent: content ?? '',
          currentBaseToken: versionTokenOf(existingPage.metadata) ?? '',
          conflictAuthor: existingPage.metadata?.author ?? null,
          conflictLastModified: versionTokenOf(existingPage.metadata),
          resubmitFields: WikiRoutes.buildConflictResubmitFields(req.body),
          csrfToken: req.session.csrfToken
        });
      }

      // Save the page using WikiContext (author is automatically extracted from context)
      // #1121: PageManager emits the page.* audit event. The route only adds
      // the client IP, which is the one thing it knows and the manager cannot.
      await pageManager.savePageWithContext(wikiContext, metadata, {
        audit: { ipAddress: req.ip }
      });

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
        // #1082: remember the old title so existing [Old Title] links keep
        // resolving instead of turning into red links.
        // #1094: rewrite `[Old Title]` in the pages that referred to it, so the
        // content becomes correct rather than depending on the map above.
        // Not awaited — see rewriteInboundLinksAfterRename.
        void this.rewriteInboundLinksAfterRename(req, oldReferringPages, pageName, finalTitle);
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
   * #689 — admin-only raw page editor (GET). Renders the entire on-disk
   * page file (frontmatter YAML + body markdown) in a single textarea so an
   * admin can repair pages whose frontmatter is corrupted in ways the
   * normal /edit/:page form cannot reach. Bypasses ValidationManager on
   * save (handled by the POST counterpart + PageManager.saveRawPageWithAdminOverride).
   */
  async adminEditRaw(req: Request, res: Response): Promise<void> {
    try {
      const wikiContext = this.createWikiContext(req);
      // #1034: was hasRole('admin') — a role NAME check. Messages name the
      // PERMISSION that was actually tested; roles are bundles and the same
      // permission can arrive through any number of them.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          "Read-only access — editing raw page content requires the 'admin-system' permission"
        );
        return;
      }
      const pageName = decodeURIComponent(req.params.page);
      const pageManager = this.engine.getManager('PageManager') as {
        getRawPageContent?: (id: string) => Promise<{ filePath: string; content: string } | null>;
      } | null;
      const raw = pageManager?.getRawPageContent ? await pageManager.getRawPageContent(pageName) : null;
      if (!raw) {
        await this.renderError(req, res, 404, 'Page Not Found', `No page named '${pageName}' on this instance.`);
        return;
      }
      const templateData = await this.getCommonTemplateData(req);
      res.render('admin-edit-raw', {
        ...templateData,
        pageName,
        filePath: raw.filePath,
        rawContent: raw.content,
        errorMessage: null,
        csrfToken: req.session?.csrfToken ?? ''
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('adminEditRaw failed:', err);
      await this.renderError(req, res, 500, 'Error', `Failed to load raw editor: ${errorMessage}`);
    }
  }

  /**
   * #689 — admin-only raw page editor (POST). Persists the textarea bytes
   * via PageManager.saveRawPageWithAdminOverride (which skips validation
   * and conflict-check but preserves versioning, indexing, and cache
   * invalidation). The admin's identity is NOT written to the `editor`
   * field — captured in the audit log instead.
   */
  async adminSaveRaw(req: Request, res: Response): Promise<void> {
    const wikiContext = this.createWikiContext(req);
    const pageName = decodeURIComponent(req.params.page);
    const rawContent = typeof req.body?.rawContent === 'string' ? req.body.rawContent : '';
    try {
      // #1034: was hasRole('admin') — a role NAME check. Messages name the
      // PERMISSION that was actually tested; roles are bundles and the same
      // permission can arrive through any number of them.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          "Read-only access — editing raw page content requires the 'admin-system' permission"
        );
        return;
      }
      const pageManager = this.engine.getManager('PageManager') as {
        saveRawPageWithAdminOverride?: (name: string, raw: string) => Promise<void>;
        getRawPageContent?: (id: string) => Promise<{ filePath: string; content: string } | null>;
      } | null;
      if (!pageManager?.saveRawPageWithAdminOverride) {
        await this.renderError(req, res, 500, 'Unavailable', 'PageManager does not support raw save on this deployment.');
        return;
      }
      await pageManager.saveRawPageWithAdminOverride(pageName, rawContent);

      // Audit log — best-effort; don't fail the save if audit is down.
      // #1205: through recordAuditEvent (see clear-anonymous above).
      const rawAfter = pageManager.getRawPageContent ? await pageManager.getRawPageContent(pageName) : null;
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.PAGE_RAW_EDIT,
        user: wikiContext.userContext.username ?? 'unknown',
        ipAddress: req.ip,
        action: 'admin-raw-edit',
        result: 'success',
        severity: 'medium',
        metadata: {
          pageName,
          filePath: rawAfter?.filePath ?? null,
          bytes: rawContent.length,
          adminOverride: true
        }
      }, (auditErr) => logger.warn('Audit log failed for admin-raw-edit:', auditErr));
      logger.info(`[AUDIT] admin ${wikiContext.userContext.username ?? 'unknown'} performed raw edit on '${pageName}' (${rawContent.length} bytes)`);

      res.redirect(`/view/${encodeURIComponent(pageName)}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`adminSaveRaw('${pageName}') failed: ${errorMessage}`);
      const pageManager = this.engine.getManager('PageManager') as {
        getRawPageContent?: (id: string) => Promise<{ filePath: string; content: string } | null>;
      } | null;
      const raw = pageManager?.getRawPageContent ? await pageManager.getRawPageContent(pageName) : null;
      const templateData = await this.getCommonTemplateData(req);
      res.status(400).render('admin-edit-raw', {
        ...templateData,
        pageName,
        filePath: raw?.filePath ?? '(unknown)',
        rawContent,
        errorMessage,
        csrfToken: req.session?.csrfToken ?? ''
      });
    }
  }

  /**
   * Delete a page
   */
  /**
   * Whether agent tokens are usable on this instance (#981).
   *
   * Must be the SAME condition `AuthManager` uses to register the
   * `agent-token` provider, because a token that cannot authenticate must not
   * be issuable. `AgentTokenManager` is registered unconditionally in
   * `WikiEngine`, so checking only for the manager — which is what the mint
   * route used to do — reports "available" on every instance, including the
   * ones where the provider was never registered.
   *
   * The result on a default (disabled) instance was a token that mints with a
   * 201, is stored, is shown once with "copy this now", and can never be used.
   * Worse, using it failed as `Forbidden — invalid CSRF token`, because the
   * bearer middleware never set `req.bearerAuth` and the request fell through
   * to the CSRF guard — pointing the operator at entirely the wrong subsystem.
   */
  private agentTokensEnabled(): boolean {
    return Boolean(
      this.engine.getManager('AgentTokenManager') &&
      this.engine.getManager<{ getProperty(k: string, d: unknown): unknown }>('ConfigurationManager')
        ?.getProperty('ngdpbase.auth.agent-token.enabled', false)
    );
  }

  /**
   * Resolve an addon page's identity from its source (#964).
   *
   * An addon page's identity is its **frontmatter uuid**, never its filename.
   * Addon sources ship under descriptive, human-reviewable names
   * (`geohazardwatch-hans.md`) — and per `docs/planning/addons.md` §10 that is
   * the *correct* convention, because a PR diff and `git log --follow` on a
   * slug filename are reviewable where a uuid filename is opaque. Only
   * `required-pages/` is uuid-named, and there the filename genuinely is the
   * identity.
   *
   * Deriving the uuid from an addon filename produced a fake identity like
   * `"geohazardwatch-hans"`, compared it against `data/pages/geohazardwatch-hans.md`
   * — a path that never exists — so every such page showed as `new` forever and
   * a sync wrote a duplicate under the wrong filename.
   *
   * Note this is invisible on any instance whose addons all happen to use uuid
   * filenames, which is why it went unnoticed: the four bundled addons do.
   *
   * @param sourceContent - Raw addon page file contents
   * @returns The frontmatter uuid, or '' when absent or unparseable
   */
  static addonSourceUuid(sourceContent: string): string {
    try {
      const uuid = matter(sourceContent).data?.uuid;
      return typeof uuid === 'string' ? uuid.trim() : '';
    } catch {
      return '';
    }
  }

  /**
   * Warn when a chrome page carries access control that is no longer honoured (#950).
   *
   * `LeftMenu` and `Footer` used to run the full ACL evaluator, and a denial
   * replaced the fragment with an empty string — so an affected user lost the
   * sidebar or footer on EVERY page of the site, with nothing logged above
   * `info` and nothing pointing at permissions as the cause.
   *
   * That gating is removed. A fragment is never a destination: denying it
   * protected nothing, because the pages it links to still enforce their own
   * ACLs, and a link the user cannot follow returns a comprehensible 403.
   *
   * The failure mode of removing it is the mirror image — frontmatter that
   * silently stops working — so a restriction on a chrome page is reported
   * rather than dropped in silence. `private: true` is called out by name
   * because it is a hard constraint everywhere else in the evaluator, and an
   * operator who set it has the strongest expectation of enforcement.
   *
   * @param label - Chrome slot being rendered
   * @param metadata - The chrome page's frontmatter, if a page was resolved
   */
  private warnOnChromeRestriction(
    label: 'LeftMenu' | 'Footer',
    metadata: unknown
  ): void {
    const meta = metadata as {
      audience?: unknown; access?: unknown; private?: unknown;
    } | null | undefined;
    if (!meta) return;

    const restrictions: string[] = [];
    if (Array.isArray(meta.audience) && meta.audience.length > 0) restrictions.push('audience');
    if (meta.access && typeof meta.access === 'object') restrictions.push('access');
    if (meta.private === true) restrictions.push('private:true');
    if (restrictions.length === 0) return;

    logger.warn(
      `[TEMPLATE] ${label} declares ${restrictions.join(', ')}, which is NOT enforced — site ` +
      'chrome renders for everyone (#950). A fragment is not a destination, so gating it only ' +
      'removed navigation site-wide without protecting the pages it links to; those still ' +
      'enforce their own ACLs. Move the restriction to the linked pages, or keep sensitive ' +
      `content out of ${label}.`
    );
  }

  /**
   * Guard shared by the #946 slice-2 mutation endpoints.
   *
   * Applies the token rate limit before anything else, then resolves the page
   * and checks the caller's permission for `action`. Returns null once a
   * response has been sent.
   */
  private async prepareApiPageMutation(
    req: Request,
    res: Response,
    action: 'delete' | 'rename'
  ): Promise<{ pageData: WikiPage; wikiContext: WikiContext; pageName: string } | null> {
    const identifier = req.params.identifier;

    if (!req.userContext?.isAuthenticated) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }

    // Rate limit token-authenticated mutations only. A human clicking Delete is
    // bounded by being a human; an unattended token is not.
    const viaToken = (req.userContext as { viaToken?: { id?: string } }).viaToken;
    if (viaToken?.id) {
      const verdict = agentMutationRateLimiter.consume(viaToken.id);
      if (!verdict.allowed) {
        res.set('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many page mutations for this token. Retry in ${Math.ceil(verdict.retryAfterMs / 1000)}s.`
        });
        return null;
      }
    }

    const pageManager = this.engine.getManager('PageManager');
    const pageData = await pageManager?.getPage(identifier);
    if (!pageData) {
      res.status(404).json({ error: 'Page not found', identifier });
      return null;
    }

    // Resolve to the canonical title: the identifier may be a uuid or slug, and
    // every downstream index is keyed by title.
    const pageName = (pageData.metadata?.title) || identifier;

    const wikiContext = this.createWikiContext(req, {
      context: WikiContext.CONTEXT.NONE,
      pageName,
      response: res
    });
    (wikiContext as { pageMetadata: unknown }).pageMetadata = pageData.metadata ?? null;
    (wikiContext as { content: string | null }).content = pageData.content;

    // Required pages stay admin-only, matching the form route.
    if (await this.isRequiredPage(pageName)) {
      const userManager = this.engine.getManager('UserManager');
      const isAdmin = await userManager?.hasPermission(req.userContext, 'admin-system');
      if (!isAdmin) {
        res.status(403).json({ error: 'Access denied', message: 'Only administrators can modify this page' });
        return null;
      }
      return { pageData, wikiContext, pageName };
    }

    const allowed = await this.engine
      .getManager('ACLManager')
      ?.checkPagePermissionWithContext(wikiContext, action);
    if (!allowed) {
      res.status(403).json({ error: 'Access denied', message: `You do not have permission to ${action} this page` });
      return null;
    }

    return { pageData, wikiContext, pageName };
  }

  /**
   * DELETE /api/page/:identifier — delete a page (#946 slice 2).
   *
   * The JSON counterpart to `POST /delete/:page`. Slice 1 shipped tokens that
   * could carry `page-delete`, but nothing behind it: deletion existed only as
   * a session/form-shaped route returning HTML or a redirect. Letting agents
   * drive that would have worked mechanically — bearer requests are CSRF-exempt
   * — but it is an accidental API with no stable contract.
   *
   * Since #947 a delete is recoverable for the retention window, so this is no
   * longer the irreversible operation the original slice-2 analysis assumed.
   */
  async apiDeletePage(req: Request, res: Response) {
    const _metricsStart = Date.now();
    try {
      const prepared = await this.prepareApiPageMutation(req, res, 'delete');
      if (!prepared) return;
      const { pageData, wikiContext, pageName } = prepared;

      const uuid = (pageData.metadata as { uuid?: string } | undefined)?.uuid ?? pageName;
      const referringPages = this.engine.getManager('RenderingManager')?.getReferringPages(pageName) ?? [];

      try {
        await this.auditPageDelete(req, wikiContext, pageName, uuid);
      } catch (auditErr) {
        // #1121: page-delete is critical. Destroying a page with no record of
        // what was destroyed is the one outcome an audit log exists to prevent.
        logger.error(`[pages] Refusing to delete '${pageName}': its audit record could not be written`, auditErr);
        return res.status(503).json({ error: 'Page not deleted — the audit record could not be written', pageName });
      }

      const deleted = await this.engine.getManager('PageManager')?.deletePageWithContext(wikiContext);
      if (!deleted) {
        return res.status(500).json({ error: 'Delete failed', pageName });
      }

      await this.reconcileIndexesAfterDelete(pageName, uuid, referringPages);
      this.engine.getManager('MetricsManager')?.recordPageDelete?.(Date.now() - _metricsStart);

      logger.info(`[WikiRoutes] API delete of '${pageName}' (${uuid}) by ${req.userContext!.username}`);
      return res.json({ success: true, pageName, uuid, recoverable: true });
    } catch (error: unknown) {
      logger.error(`API delete failed: ${getErrorMessage(error)}`);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  /**
   * POST /api/page/:identifier/rename — rename a page (#946 slice 2).
   *
   * Body: `{ "newTitle": "..." }`
   *
   * There was no rename route at all before this — renaming was a side effect
   * of saving with a changed `metadata.title`, reachable only through the edit
   * form. This exposes it directly and reuses that same save path, so rename
   * semantics stay identical however they are invoked.
   *
   * Unlike delete, a rename has no safety net: #947 does not cover it, and the
   * old title is simply gone. Hence the conflict check below.
   */
  async apiRenamePage(req: Request, res: Response) {
    try {
      const prepared = await this.prepareApiPageMutation(req, res, 'rename');
      if (!prepared) return;
      const { pageData, wikiContext, pageName } = prepared;

      const newTitle = typeof req.body?.newTitle === 'string' ? req.body.newTitle.trim() : '';
      if (!newTitle) {
        return res.status(400).json({ error: 'newTitle is required' });
      }
      if (newTitle === pageName) {
        return res.status(400).json({ error: 'newTitle is the same as the current title' });
      }

      const pageManager = this.engine.getManager('PageManager');

      // Refuse rather than overwrite. Saving onto an existing title would merge
      // two pages into one and lose the target's content silently.
      const existing = await pageManager?.getPage(newTitle);
      if (existing) {
        return res.status(409).json({
          error: 'Title already in use',
          message: `A page titled '${newTitle}' already exists`
        });
      }

      const oldReferringPages = this.engine.getManager('RenderingManager')?.getReferringPages(pageName) ?? [];
      const metadata = { ...(pageData.metadata ?? {}), title: newTitle };

      (wikiContext as { content: string | null }).content = pageData.content;
      // #1121: the rename audit event comes from PageManager, which derives
      // `rename` from the title change — the same derivation for both rename
      // paths, rather than each route classifying its own write.
      await pageManager.savePageWithContext(wikiContext, metadata, {
        audit: { ipAddress: req.ip }
      });

      // Same index reconciliation the form save performs on a rename.
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');
      renderingManager?.removePageFromLinkGraph(pageName);
      renderingManager?.addPageToCache(newTitle);
      // #1082: same former-title record the form save makes, so a rename
      // behaves identically however it was invoked.
      // #1094: same content rewrite the form-save rename performs, so a rename
      // behaves identically however it was invoked.
      void this.rewriteInboundLinksAfterRename(req, oldReferringPages, pageName, newTitle);
      renderingManager?.updatePageInLinkGraph(newTitle, pageData.content);
      await searchManager?.removePageFromIndex(pageName);
      await searchManager?.updatePageInIndex(newTitle, {
        name: newTitle,
        content: pageData.content,
        metadata
      });

      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        // The uuid is stable across a rename, so one clear covers both titles.
        const uuid = pageManager?.getPageUUID?.(newTitle) ?? newTitle;
        await cacheManager.clear(undefined, `rendered-pages:${uuid}:*`);
        for (const refPage of oldReferringPages) {
          const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
          await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
        }
      }

      logger.info(`[WikiRoutes] API rename '${pageName}' → '${newTitle}' by ${req.userContext!.username}`);
      return res.json({ success: true, from: pageName, to: newTitle });
    } catch (error: unknown) {
      logger.error(`API rename failed: ${getErrorMessage(error)}`);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  /**
   * Rewrite `[Old Title]` links in the pages that referred to a renamed page (#1094).
   *
   * #1082 kept those links working with an in-memory former-title map. The map
   * has no durable backing, so a restart forgets every rename and the links go
   * red again — it works right up until it silently stops. Rewriting the
   * content makes the referring pages correct instead of correct-looking.
   *
   * The map is deliberately still in place. It covers what this cannot: links
   * whose text only fuzzy-matches the old title, and anything this pass skips.
   * Removing it is gated on #1095, which needs a former-title lookup for
   * `/view/<Old Title>` that no amount of content rewriting can supply.
   *
   * ## Rules, and why each one is here
   *
   * __Never throws.__ The rename has already committed by the time this runs.
   * An exception escaping here would report "rename failed" for a rename that
   * succeeded, inviting a retry that renames the page a second time.
   *
   * __Not awaited by the rename.__ The budget below is measured in seconds;
   * blocking the response on it would make renaming a well-linked page feel
   * broken. Callers `void` it, as they already do for the audit write.
   *
   * __Bounded, and says what it dropped.__ At most {@link MAX_REWRITE_REFERRERS}
   * pages and {@link REWRITE_BUDGET_MS} of wall clock. A silent truncation
   * would read as "all done" when it was not.
   *
   * __Candidates are sorted.__ A crash part-way through then leaves a
   * reproducible prefix rather than an arbitrary subset.
   *
   * __One retry on a lost race, then skip.__ Each rewrite re-reads immediately
   * before saving and compares version tokens — the same guard a human editor
   * gets (#1061). It deliberately writes __no conflict sibling__: the loser
   * would be machine-derived text carrying no human information, and spraying
   * conflict copies across a library after one rename would destroy trust in
   * the feature far faster than a skipped link.
   *
   * @param req - The request that performed the rename; supplies the identity
   *   the rewrites are attributed to. There is no system principal to use
   *   instead (#631), and attributing them to the person who caused them is
   *   the honest answer anyway.
   * @param referrers - Pages that linked to the old title, captured before the
   *   link graph was reconciled.
   */
  private async rewriteInboundLinksAfterRename(
    req: Request,
    referrers: readonly string[],
    oldTitle: string,
    newTitle: string
  ): Promise<void> {
    try {
      const candidates = Array.from(new Set(referrers)).filter(Boolean).sort();
      if (candidates.length === 0) return;

      const deadline = Date.now() + REWRITE_BUDGET_MS;
      const budgeted = candidates.slice(0, MAX_REWRITE_REFERRERS);
      const overCap = candidates.length - budgeted.length;

      const rewrittenPages: string[] = [];
      const noMatch: string[] = [];
      const conflicted: string[] = [];
      const failed: string[] = [];
      let outOfTime = 0;

      for (const refPage of budgeted) {
        if (Date.now() > deadline) {
          outOfTime++;
          continue;
        }
        try {
          const outcome = await this.rewriteOneReferrer(req, refPage, oldTitle, newTitle);
          if (outcome === 'rewritten') rewrittenPages.push(refPage);
          else if (outcome === 'conflict') conflicted.push(refPage);
          else if (outcome === 'no-match') noMatch.push(refPage);
        } catch (err: unknown) {
          // One bad page must not stop the pass; the others are still fixable.
          failed.push(refPage);
          logger.warn(
            `[WikiRoutes] Link rewrite failed for '${refPage}' after rename ` +
            `'${oldTitle}' → '${newTitle}': ${getErrorMessage(err)}`
          );
        }
      }

      logger.info(
        `[WikiRoutes] Link rewrite after rename '${oldTitle}' → '${newTitle}': ` +
        `${rewrittenPages.length} rewritten, ${noMatch.length} unchanged, ` +
        `${conflicted.length} skipped on conflict, ${failed.length} failed` +
        (overCap > 0 ? `, ${overCap} beyond the ${MAX_REWRITE_REFERRERS}-page cap` : '') +
        (outOfTime > 0 ? `, ${outOfTime} past the ${REWRITE_BUDGET_MS}ms budget` : '')
      );

      // Named, not just counted. A page listed here still points at the old
      // title in its source and is only resolving through the #1082 map — the
      // operator needs to be able to go and look at it.
      if (noMatch.length > 0) {
        logger.info(
          `[WikiRoutes] Referrers with no literal '${oldTitle}' link to rewrite ` +
          `(fuzzy variant, markdown-syntax link, or a stale graph edge): ${noMatch.join(', ')}`
        );
      }
      if (conflicted.length > 0) {
        logger.warn(
          '[WikiRoutes] Referrers skipped — edited concurrently, no conflict copy ' +
          `written: ${conflicted.join(', ')}`
        );
      }
    } catch (err: unknown) {
      // Belt and braces. The rename is already committed and this is the last
      // thing anyone should be told about it.
      logger.error(
        '[WikiRoutes] Link rewrite pass aborted after rename ' +
        `'${oldTitle}' → '${newTitle}': ${getErrorMessage(err)}`
      );
    }
  }

  /**
   * Rewrite one referring page. Returns what happened rather than throwing for
   * the expected outcomes, so the caller can report them together.
   *
   * Reads, rewrites, then re-reads and compares version tokens before writing.
   * A page that moved under us is retried once from its new content — the
   * rewrite is idempotent, so redoing it against a fresh copy is safe — and
   * skipped if it moves again.
   */
  private async rewriteOneReferrer(
    req: Request,
    refPage: string,
    oldTitle: string,
    newTitle: string
  ): Promise<'rewritten' | 'no-match' | 'conflict' | 'missing'> {
    const pageManager = this.engine.getManager('PageManager');
    if (!pageManager) return 'missing';

    for (let attempt = 0; attempt < 2; attempt++) {
      const page = await pageManager.getPage(refPage);
      if (!page) return 'missing';

      const baseToken = versionTokenOf(page.metadata);
      const result = rewriteLinkTargets(page.content ?? '', oldTitle, newTitle);
      if (result.rewritten === 0) return 'no-match';

      // Re-read as late as possible. This is the same window the editor's
      // stale-base check lives in (#1061) — narrow, not closed.
      const fresh = await pageManager.getPage(refPage);
      if (!fresh) return 'missing';
      if (isStaleSave(baseToken, versionTokenOf(fresh.metadata))) continue;

      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName: refPage,
        content: result.content
      });
      (wikiContext as { content: string | null }).content = result.content;

      // Title is untouched: this page was not renamed, its links were.
      // #1121: `link-rewrite` is the one op PageManager cannot infer — from
      // inside the manager this is an ordinary edit — so the route declares it.
      await pageManager.savePageWithContext(wikiContext, { ...page.metadata }, {
        audit: {
          op: 'link-rewrite',
          ipAddress: req.ip,
          rewriteOf: { from: oldTitle, to: newTitle }
        }
      });

      const uuid = (page.metadata as { uuid?: string } | undefined)?.uuid;

      await this.reconcileIndexesAfterRewrite(refPage, result.content, page.metadata, uuid);
      return 'rewritten';
    }

    return 'conflict';
  }

  /**
   * Bring the derived indexes back in line after a link rewrite.
   *
   * The same reconciliation an ordinary edit performs — the page's content
   * changed, so the link graph, the search index and the rendered cache are all
   * stale. Best-effort throughout: the write has landed, and a failure to
   * reindex must not be reported as a failed rewrite.
   */
  private async reconcileIndexesAfterRewrite(
    pageName: string,
    content: string,
    metadata: unknown,
    uuid: string | undefined
  ): Promise<void> {
    try {
      this.engine.getManager('RenderingManager')?.updatePageInLinkGraph(pageName, content);
      await this.engine.getManager('SearchManager')?.updatePageInIndex(pageName, {
        name: pageName,
        content,
        metadata: metadata as Record<string, unknown>
      });
      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        await cacheManager.clear(undefined, `rendered-pages:${uuid ?? pageName}:*`);
      }
    } catch (err: unknown) {
      logger.warn(
        `[WikiRoutes] Reindex after link rewrite of '${pageName}' failed: ${getErrorMessage(err)}`
      );
    }
  }

  /**
   * Drop a deleted page from every derived index and cache (#946 slice 2).
   *
   * Extracted from {@link deletePage} so the JSON API delete performs exactly
   * the same reconciliation. Two copies of this would drift, and the symptom of
   * drift is a deleted page that still appears in search — silent and slow to
   * notice.
   *
   * @param pageName - Title the page was deleted under
   * @param uuid - Page uuid, captured before deletion emptied the cache
   * @param referringPages - Pages that linked to it, captured before the link graph entry went
   */
  private async reconcileIndexesAfterDelete(
    pageName: string,
    uuid: string,
    referringPages: string[]
  ): Promise<void> {
    logger.debug('🔄 Updating indexes after deletion...');
    const pageManager = this.engine.getManager('PageManager');
    this.engine.getManager('RenderingManager')?.removePageFromLinkGraph(pageName);
    await this.engine.getManager('SearchManager')?.removePageFromIndex(pageName);

    // Clear rendered cache for deleted page and any pages that linked to it
    const cacheManager = this.engine.getManager('CacheManager');
    if (cacheManager?.isInitialized?.()) {
      await cacheManager.clear(undefined, `rendered-pages:${uuid}:*`);
      for (const refPage of referringPages) {
        const refUUID = pageManager?.getPageUUID?.(refPage) ?? refPage;
        await cacheManager.clear(undefined, `rendered-pages:${refUUID}:*`);
      }
    }
  }

  /**
   * Record a delete in the audit trail BEFORE it executes (#946 slice 2).
   *
   * Deliberately pre-execution: the audit entry has to survive the thing it
   * describes. It captures the page name, uuid and — when the caller is an
   * agent — the token id, so a destructive token can be traced to the token
   * rather than only to the user who minted it.
   *
   * Best-effort: a failing audit backend must not block the delete.
   */
  /** The AuditManager, or null when it is disabled or absent. */
  private auditSink(): AuditEventSink | null {
    return this.engine.getManager('AuditManager') as AuditEventSink | null;
  }

  /** Agent-token identity on this request, when it authenticated with one (#946). */
  private static viaTokenOf(req: Request): AuditViaToken | null {
    return (req.userContext as { viaToken?: AuditViaToken } | undefined)?.viaToken ?? null;
  }

  /**
   * Record a page view — when the deployment asks for it (#1129).
   *
   * `page-read` ships `enabled: false` in `ngdpbase.audit.events` (#1203) and
   * `recordAuditEvent` honours the switch, so this emits unconditionally. Off,
   * a general-purpose deployment does not drown its audit log in reads; on, a
   * records-style deployment gets access accounting — who looked at what —
   * which is the single most important audit question for that posture.
   * Fire-and-forget: a read already happened and a slow audit backend must not
   * delay the render.
   *
   * Emitted from the route because the route is the door for an HTTP view:
   * PageManager.getPage cannot tell a user viewing a page from the dozens of
   * internal reads (ACL checks, conflict checks, indexing) that call it.
   */
  private auditPageView(req: Request, pageName: string, uuid: string | null | undefined): void {
    const event = buildPageViewAuditEvent({
      username: req.userContext?.username,
      ipAddress: req.ip,
      pageName,
      uuid,
      viaToken: WikiRoutes.viaTokenOf(req)
    });
    void recordAuditEvent(this.auditSink(), event, (err) =>
      logger.warn(`Audit log failed for page-read of '${pageName}':`, err)
    );
  }

  /**
   * #1183 — the attachment audit helpers moved to `AttachmentManager`.
   *
   * They lived here, so only the two routes that remembered to call them
   * produced a record: the NCM-localization upload, the bulk-import upload,
   * the thumbnail upload and the media-browser delete were all silent, the
   * last of those an on-failure: refuse destruction.
   *
   * `docs/audit-posture.md` already states the rule — an action is emitted
   * "through `recordAuditEvent` (or the manager door that calls it)". Every
   * caller passes through the manager; not all of them pass through here.
   */

  /**
   * Record a magic-link redemption in the audit log (#1022).
   *
   * The observability half of the issue, and the half that ships regardless of
   * whether enforcement is switched on. Before this, the only trace of a
   * redemption was `👤 User logged in via magic link: <username>` in the app
   * log — no IP, no User-Agent, so a login from an unexpected place was
   * indistinguishable from a normal one after the fact.
   *
   * Goes through `AuditManager.logAuthentication`, which already carries
   * `ipAddress` and `userAgent`, so this is queryable and retained rather than
   * buried in a log line.
   *
   * A refused redemption is graded `high` — that is an attempted sign-in from
   * a browser that did not request the link. An allowed mismatch is `medium`:
   * suspicious enough to find later, but it is also exactly what the ordinary
   * cross-device flow looks like, so it is not a failure.
   *
   * Best-effort: never throws. A logging failure must not cost a valid login.
   */
  /**
   * Record a sign-in outcome in the audit trail (#1115).
   *
   * Goes through AuditManager.logAuthentication, which names the event from the
   * result — authentication-success / .failed / .logout — so the three
   * outcomes are three filterable types rather than one type plus a field.
   *
   * Best-effort: never throws. A logging failure must not cost a valid login,
   * and must not turn a rejected password into a 500 either.
   */
  private async auditAuthentication(
    req: Request,
    username: string | undefined,
    result: 'success' | 'failure' | 'logout',
    reason: string
  ): Promise<void> {
    try {
      const auditManager = this.engine.getManager('AuditManager') as {
        logAuthentication?: (
          context: Record<string, unknown>,
          result: string,
          reason: string
        ) => Promise<string>;
      } | null;
      if (!auditManager?.logAuthentication) return;

      await auditManager.logAuthentication(
        {
          username: username ?? 'unknown',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          loginMethod: 'password'
        },
        result,
        reason
      );
    } catch (auditErr) {
      logger.warn('Audit log failed for sign-in:', auditErr);
    }
  }

  private async auditMagicLinkRedemption(
    req: Request,
    username: string | undefined,
    outcome: string,
    allowed: boolean
  ): Promise<void> {
    try {
      const auditManager = this.engine.getManager('AuditManager') as {
        logAuthentication?: (
          context: Record<string, unknown>,
          result: string,
          reason: string
        ) => Promise<string>;
      } | null;
      if (!auditManager?.logAuthentication) return;

      await auditManager.logAuthentication(
        {
          username: username ?? 'unknown',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          loginMethod: 'magic-link'
        },
        allowed ? 'success' : 'failure',
        `device-binding:${outcome}`
      );
    } catch (auditErr) {
      logger.warn('Audit log failed for magic-link redemption:', auditErr);
    }
  }

  /**
   * Record a page delete, durably, before the page is removed (#1121).
   *
   * Both callers already audit ahead of the delete — #946 established that,
   * because writing afterwards loses the page name and uuid on any path where
   * the delete succeeded and the process died first.
   *
   * What changed: this used to call `logAuditEvent` directly and swallow any
   * failure, so it never saw the rule, never reached the drop counter, and a
   * failed write let the delete proceed unrecorded. It now goes through
   * `recordAuditEvent`, which flushes a critical event and REJECTS on failure —
   * and the rejection propagates, so the caller can abandon the delete.
   *
   * `result: 'attempted'` is kept deliberately. The record is written before
   * the delete, so claiming success would overstate what is known at the point
   * it is written.
   *
   * @throws when the record cannot be written. The caller must not delete.
   */
  private async auditPageDelete(
    req: Request,
    wikiContext: { userContext?: { username?: string } | null },
    pageName: string,
    uuid: string
  ): Promise<void> {
    const viaToken = WikiRoutes.viaTokenOf(req);

    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.PAGE_DELETE,
      user: wikiContext.userContext?.username ?? 'unknown',
      ipAddress: req.ip,
      action: 'page-delete',
      result: 'success',
      severity: viaToken ? 'high' : 'medium',
      metadata: {
        pageName,
        uuid,
        outcome: 'attempted',
        viaTokenId: viaToken?.id ?? null,
        viaTokenName: viaToken?.name ?? null
      }
    });
  }

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
      const userManager = this.engine.getManager('UserManager');
      const aclManager = this.engine.getManager('ACLManager');

      // Check if page exists
      const pageData = await pageManager.getPage(pageName);
      if (!pageData) {
        logger.debug(`❌ Page not found: ${pageName}`);
        return res.status(404).send('Page not found');
      }

      // #714 Slice C: removed the redundant `this.checkPrivatePageAccess`
      // call that previously sat here. The
      // `checkPagePermissionWithContext('delete')` call below already
      // covers private-page access via Tier 0 (delegates to
      // `PageManager.checkPrivatePageAccess` per #711).

      // Check if this is a required page that needs admin access
      if (await this.isRequiredPage(pageName)) {
        if (
          !currentUser ||
          !(await userManager.hasPermission(
            currentUser,
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

      // Audit BEFORE the delete executes (#946 slice 2). Writing it afterwards
      // would lose the page name and uuid on any path where the delete
      // succeeded but the process died before the audit landed — exactly the
      // case an investigator needs.
      try {
        await this.auditPageDelete(req, wikiContext, pageName, _deleteUUID);
      } catch (auditErr) {
        logger.error(`[pages] Refusing to delete '${pageName}': its audit record could not be written`, auditErr);
        return res.status(503).json({ error: 'Page not deleted — the audit record could not be written', pageName });
      }

      // Delete the page using WikiContext (includes audit logging with user info)
      const deleteResult = await pageManager.deletePageWithContext(wikiContext);
      logger.debug(`🗑️ Delete result: ${deleteResult}`);

      if (deleteResult) {
        await this.reconcileIndexesAfterDelete(pageName, _deleteUUID, _deleteRefPages);

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
      // #1059: search-page gates the search surface. Anonymous holds it in
      // the default catalogue (granted alongside this enforcement, operator
      // approved), so out of the box every visitor can still search; the gate
      // exists so revoking search-page from a role actually revokes search.
      const gateContext = this.createWikiContext(req);
      if (!(await gateContext.hasPermission('search-page'))) {
        return res.status(403).render('error', {
          code: 403,
          message: 'You do not have permission to search',
          currentUser: req.userContext
        });
      }

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
   * GET /api/keywords/related?keyword=<kw> (#882) — user keywords that
   * co-occur with the given keyword, ranked by shared-page count.
   * ACL-safe by construction: pages come from advancedSearchWithContext,
   * so private pages the caller can't see never contribute counts.
   */
  async relatedKeywords(req: Request, res: Response) {
    try {
      const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
      if (!keyword) {
        return res.status(400).json({ success: false, error: 'keyword is required' });
      }
      const wikiContext = this.createWikiContext(req);
      const searchManager = this.engine.getManager('SearchManager') as {
        advancedSearchWithContext?: (ctx: unknown, opts: Record<string, unknown>) => Promise<Array<{
          metadata?: { userKeywords?: string };
        }>>;
      } | null;
      if (!searchManager?.advancedSearchWithContext) {
        return res.status(503).json({ success: false, error: 'SearchManager unavailable' });
      }
      const hits = await searchManager.advancedSearchWithContext(wikiContext, {
        query: '',
        userKeywords: [keyword],
        searchIn: ['title'],
        maxResults: 500
      });
      const seed = keyword.toLowerCase();
      const counts = new Map<string, number>();
      for (const hit of hits) {
        const kwStr = hit.metadata?.userKeywords;
        if (typeof kwStr !== 'string') continue;
        for (const k of kwStr.split(',').map(s => s.trim()).filter(Boolean)) {
          if (k.toLowerCase() === seed) continue;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
      const related = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([kw, count]) => ({ keyword: kw, count }));
      return res.json({ success: true, keyword, pages: hits.length, related });
    } catch (err: unknown) {
      logger.error('Error computing related keywords:', err);
      return res.status(500).json({ success: false, error: 'Error computing related keywords' });
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

      // #870: uploading "to a page" previously only stored the file — linkage
      // is content-scan driven (#403), so without a content reference the
      // attachment never appeared anywhere on the page and users read the
      // upload as failed. When a page context is present (and the client
      // didn't opt out), append an [{ATTACH src='…'}] directive through the
      // save pipeline so the attachment is actually on the page.
      let attachedToPage = false;
      let attachNote: string | undefined;
      const wantsAttach = pageName && req.body.attachToPage !== 'false';
      if (wantsAttach) {
        attachNote = await this.appendAttachDirective(req, res, pageName, req.file.originalname);
        attachedToPage = attachNote === undefined;
      }

      // #1080/#1183: the record is written by AttachmentManager after the
      // bytes are stored — at the door, so the NCM-localization, bulk-import
      // and thumbnail paths are covered too. They were silent while it
      // emitted here.

      return res.json({
        success: true,
        attachment: attachment,
        attachmentId: attachment.identifier,
        url: attachment.url,
        attachedToPage,
        ...(attachNote ? { attachNote } : {}),
        message: attachedToPage
          ? 'File uploaded and attached to page'
          : 'File uploaded successfully'
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
   * Append an [{ATTACH src='<filename>'}] directive to a page through the
   * save pipeline (#870). Returns undefined on success, or a short
   * human-readable reason when the append was skipped (upload itself is
   * never rolled back — the file is stored either way).
   */
  private async appendAttachDirective(
    req: Request,
    res: Response,
    pageName: string,
    filename: string
  ): Promise<string | undefined> {
    try {
      if (filename.includes("'")) {
        return 'filename contains a quote character — add the attachment link to the page manually';
      }
      const pageManager = this.engine.getManager('PageManager');
      const page = await pageManager.getPage(pageName);
      if (!page) {
        return `page "${pageName}" not found — attachment stored but not linked`;
      }
      const permContext = this.createWikiContext(req, { pageName });
      if (!(await permContext.hasPermission('page-edit'))) {
        return 'no page-edit permission — attachment stored but not linked';
      }
      if (page.content.includes(`src='${filename}'`)) {
        return undefined; // already referenced — nothing to append, still "attached"
      }

      const newContent = `${page.content.replace(/\s*$/, '')}\n\n[{ATTACH src='${filename}'}]\n`;
      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName,
        content: newContent,
        response: res
      });
      const metadata = { ...(page.metadata as Record<string, unknown>) };
      metadata.editor = permContext.userContext?.username || 'unknown';
      await pageManager.savePageWithContext(wikiContext, metadata);

      await this.syncAfterProgrammaticSave(pageName, newContent, metadata);
      return undefined;
    } catch (err) {
      logger.error(`Error attaching upload to page "${pageName}":`, err);
      return 'attach-to-page failed — attachment stored but not linked';
    }
  }

  /**
   * Post-save sync for programmatic page saves outside the unified /save
   * handler — same block it runs (#405/#438/#245): attachment mentions,
   * pageAssets, render cache, link graph, search index, rendered-page cache.
   */
  private async syncAfterProgrammaticSave(
    pageName: string,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const pageManager = this.engine.getManager('PageManager');
    const attachmentManager = this.engine.getManager('AttachmentManager');
    if (attachmentManager?.syncPageMentions) attachmentManager.syncPageMentions(pageName, content).catch(() => {});
    const assetManager = this.engine.getManager('AssetManager');
    if (assetManager?.syncPageAssets) assetManager.syncPageAssets(pageName, content).catch(() => {});
    const renderingManager = this.engine.getManager('RenderingManager');
    const searchManager = this.engine.getManager('SearchManager');
    renderingManager.addPageToCache(pageName);
    renderingManager.updatePageInLinkGraph(pageName, content);
    await searchManager.updatePageInIndex(pageName, {
      name: pageName,
      content,
      metadata
    });
    const cacheManager = this.engine.getManager('CacheManager');
    if (cacheManager?.isInitialized?.()) {
      const uuid = pageManager?.getPageUUID?.(pageName) ?? pageName;
      await cacheManager.clear(undefined, `rendered-pages:${uuid}:*`);
    }
  }

  // ---------------------------------------------------------------------
  // #881 — browser bookmarklet capture (URL + title + selection → page)
  // ---------------------------------------------------------------------

  /**
   * Capture is an optional feature, disabled by default (operator decision,
   * #881): routes 404 unless ngdpbase.capture.enabled is set true in the
   * instance config.
   */
  private isCaptureEnabled(): boolean {
    const configManager = this.engine.getManager('ConfigurationManager');
    return configManager?.getProperty('ngdpbase.capture.enabled', false) === true;
  }

  /**
   * System-keywords the capture flow stamps on pages it creates (#881/#893).
   * Read from config rather than hardcoded so an instance that renamed its
   * capture keyword still gets a working /my/captures view (#1004) — the write
   * side and the read side must consult the same key or they drift.
   */
  private getCaptureKeywords(): string[] {
    const configManager = this.engine.getManager('ConfigurationManager');
    const configured = configManager?.getProperty('ngdpbase.capture.keywords', ['capture']) as string[] | undefined;
    return Array.isArray(configured) && configured.length > 0 ? configured : ['capture'];
  }

  /** Resolve the capture target page name from config pattern ({date}/{username} tokens). */
  private resolveCaptureDefaultPage(username: string): string {
    const configManager = this.engine.getManager('ConfigurationManager');
    const pattern = (configManager?.getProperty('ngdpbase.capture.default-page', 'Captures — {username} — {date}'))
      || 'Captures — {username} — {date}';
    const date = new Date().toISOString().slice(0, 10);
    return pattern.replace('{date}', date).replace('{username}', username);
  }

  /** GET /capture — popup form pre-filled from bookmarklet query params. */
  async captureForm(req: Request, res: Response) {
    try {
      if (!this.isCaptureEnabled()) return res.status(404).send('Not found');
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl || '/capture')}`);
      }
      const url = typeof req.query.url === 'string' ? req.query.url.slice(0, 2048) : '';
      const title = typeof req.query.title === 'string' ? req.query.title.slice(0, 300) : '';
      const text = typeof req.query.text === 'string' ? req.query.text.slice(0, 8000) : '';
      return res.render('capture', {
        pageName: this.resolveCaptureDefaultPage(currentUser.username || 'anonymous'),
        url,
        pageTitle: title,
        text,
        csrfToken: req.session?.csrfToken || '',
        success: false,
        viewUrl: '',
        error: ''
      });
    } catch (err: unknown) {
      logger.error('Error rendering capture form:', err);
      return res.status(500).send('Error rendering capture form');
    }
  }

  /** POST /capture — append the capture block to the target page via the save pipeline. */
  async captureSubmit(req: Request, res: Response) {
    try {
      if (!this.isCaptureEnabled()) return res.status(404).send('Not found');
      const wikiContext0 = this.createWikiContext(req);
      const currentUser = wikiContext0.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).send('Authentication required');
      }
      const pageName = (typeof req.body.pageName === 'string' ? req.body.pageName : '').trim().slice(0, 255);
      const url = (typeof req.body.url === 'string' ? req.body.url : '').trim().slice(0, 2048);
      const title = (typeof req.body.title === 'string' ? req.body.title : '').trim().slice(0, 300);
      const text: string = (typeof req.body.text === 'string' ? req.body.text : '').replace(/\r\n/g, '\n').trim().slice(0, 8000);

      const renderErr = (error: string, status = 400) => res.status(status).render('capture', {
        pageName: pageName || this.resolveCaptureDefaultPage(currentUser.username || 'anonymous'),
        url, pageTitle: title, text,
        csrfToken: req.session?.csrfToken || '',
        success: false, viewUrl: '', error
      });

      if (!pageName) return renderErr('Page name is required');
      if (url) {
        try {
          const parsed = new URL(url);
          if (!parsed.protocol.startsWith('http')) return renderErr('Only http(s) URLs can be captured');
        } catch {
          return renderErr('Invalid URL');
        }
      }
      if (!url && !text) return renderErr('Nothing to capture — no URL and no selection');

      // Build the NCM entry (#1018): the source becomes an `##` heading, the
      // selection follows as plain prose, then the capture date.
      //
      //   ## [Title|https://…|target='_blank']
      //
      //   selection text
      //
      //   *(captured 2026-08-04)*
      //
      // The `----` separator is emitted BEFORE each entry except the first on
      // the page (see newContent below), so entries are divided without the
      // page ending on a dangling rule.
      const date = new Date().toISOString().slice(0, 10);
      const lines: string[] = [];
      if (url) {
        // Pipes/brackets would break the NCM link segment — flatten them in the label.
        const label = (title || url).replace(/[|[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        lines.push(`## [${label}|${url}|target='_blank']`, '');
      } else if (title) {
        lines.push(`## ${title}`, '');
      }
      if (text) {
        // #1018: no `> ` prefix — the selection reads as the page's own prose.
        lines.push(...text.split('\n'), '');
      }
      lines.push(`*(captured ${date})*`);
      const entry = lines.join('\n');

      const pageManager = this.engine.getManager('PageManager');
      const existing = await pageManager.getPage(pageName);
      const permission = existing ? 'page-edit' : 'page-create';
      if (!(await wikiContext0.hasPermission(permission))) {
        return renderErr(`You do not have permission to ${existing ? 'edit' : 'create'} this page`, 403);
      }

      // #1018: separator BEFORE each entry except the first on the page. The
      // blank lines around `----` are load-bearing, not cosmetic — in Markdown
      // a line of dashes directly beneath text turns that text into a setext
      // heading, so without the gap the previous entry's `*(captured …)*` would
      // render as an H2 instead of a rule being drawn.
      const newContent = existing
        ? `${existing.content.replace(/\s*$/, '')}\n\n----\n\n${entry}\n`
        : `${entry}\n`;
      // Pages the capture flow CREATES are keyword-tagged (default: capture)
      // and private by default (operator decision: captures are personal
      // clippings — quoted excerpts don't belong on public pages unless the
      // user targets one deliberately). Pages captures are merely appended
      // to keep their own keywords and privacy untouched.
      // #893 (Slice 1 of #869): capture is machine provenance, so the flow now
      // writes system-keywords (the automation bucket), not user-keywords.
      const configManager = this.engine.getManager('ConfigurationManager');
      const captureKeywords = this.getCaptureKeywords();
      const capturePrivate = configManager?.getProperty('ngdpbase.capture.private', true) !== false;
      const metadata = existing
        ? { ...(existing.metadata as Record<string, unknown>), editor: currentUser.username }
        : this.buildNewPageMetadata(pageName, {
          author: currentUser.username,
          'system-keywords': captureKeywords,
          ...(capturePrivate ? { private: true } : {})
        });
      if (!existing) metadata.editor = currentUser.username;

      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName,
        content: newContent,
        response: res
      });
      await pageManager.savePageWithContext(wikiContext, metadata);
      await this.syncAfterProgrammaticSave(pageName, newContent, metadata);

      return res.render('capture', {
        pageName, url, pageTitle: title, text: '',
        csrfToken: req.session?.csrfToken || '',
        success: true,
        viewUrl: `/view/${encodeURIComponent(pageName)}`,
        error: ''
      });
    } catch (err: unknown) {
      logger.error('Error capturing to page:', err);
      return res.status(500).send('Error capturing to page');
    }
  }

  /** GET /capture/install — drag-to-toolbar bookmarklet installer. */
  async captureInstall(req: Request, res: Response) {
    try {
      if (!this.isCaptureEnabled()) return res.status(404).send('Not found');
      const configManager = this.engine.getManager('ConfigurationManager');
      // The bookmarklet must target a host the *installing browser* can reach.
      // application.base-url is the wrong source here: on jimstest it is the
      // Cloudflare Tunnel hostname whose edge only exposes /share/* (#860) —
      // a bookmarklet built from it 404s at the edge. The request host is by
      // definition reachable from the browser that is installing it.
      const baseUrl = `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
      const applicationName = (configManager?.getProperty('ngdpbase.application-name', 'ngdpbase')) || 'ngdpbase';
      // #1077: preserve hyperlinks inside the highlighted text. The old
      // String(getSelection()) flattened anchors to their label. Now the
      // selection is cloned into an offscreen div, each `a[href]` is rewritten
      // as an NCM link `[label|url|target='_blank']` — the same shape
      // captureSubmit emits for the source heading (labels lose |/[]/
      // whitespace runs, that flow's exact flattening) — and the text is read
      // back via innerText — attached to the DOM, because innerText derives
      // line breaks from layout while textContent would collapse every
      // paragraph into one line. Partially-selected anchors clone with their
      // href intact; non-http(s) schemes are left as bare label text.
      const bookmarklet =
        'javascript:(function(){var s=\'\',sel=window.getSelection&&window.getSelection();' +
        'if(sel&&sel.rangeCount&&!sel.isCollapsed){' +
        'var d=document.createElement(\'div\'),i;d.style.position=\'fixed\';d.style.left=\'-9999px\';' +
        'for(i=0;i<sel.rangeCount;i++)d.appendChild(sel.getRangeAt(i).cloneContents());' +
        'var as=d.querySelectorAll(\'a[href]\'),j,a,t,h;' +
        'for(j=0;j<as.length;j++){a=as[j];h=a.href;' +
        't=(a.textContent||\'\').replace(/[|[\\]]/g,\' \').replace(/\\s+/g,\' \').replace(/^\\s+|\\s+$/g,\'\');' +
        'if(t&&/^https?:/.test(h))a.textContent=\'[\'+t+\'|\'+h+\'|target=\\\'_blank\\\']\';}' +
        'document.body.appendChild(d);s=d.innerText||d.textContent||\'\';document.body.removeChild(d);' +
        '}else if(sel){s=String(sel);}' +
        'var q=\'url=\'+encodeURIComponent(location.href)+\'&title=\'+encodeURIComponent(document.title)+' +
        '\'&text=\'+encodeURIComponent(s.slice(0,4000));' +
        `window.open('${baseUrl}/capture?'+q,'ngdpcapture','width=560,height=680');})();`;
      return res.render('capture-install', { bookmarklet, baseUrl, applicationName });
    } catch (err: unknown) {
      logger.error('Error rendering bookmarklet install page:', err);
      return res.status(500).send('Error rendering bookmarklet install page');
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

      // #1059: asset-read gates attachment bytes. Anonymous holds it in the
      // default catalogue, so out of the box nothing changes — the gate exists
      // so revoking asset-read from a role actually revokes something.
      const wikiContext = this.createWikiContext(req);
      if (!(await wikiContext.hasPermission('asset-read'))) {
        return res.status(403).render('error', {
          code: 403,
          message: 'You do not have permission to access attachments',
          currentUser: req.userContext
        });
      }

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
        // #714 Slice C: was `this.checkPrivatePageAccess(wikiContext, linkedPageName)`.
        // Migrated to the unified cross-page facade `wikiContext.canAccess('view', linkedPageName)`
        // (Slice B added the override parameter); under the hood this
        // routes through `ACLManager.canUserAccessPage`, which loads the
        // owning page's metadata and runs the full evaluator.
        //
        // Important: the WikiContext is constructed WITHOUT pageName so
        // that the canAccess call follows the cross-page path
        // (`canUserAccessPage`) rather than the same-page fast path
        // (`checkPagePermissionWithContext`). The route doesn't need a
        // "current page" — it's serving an attachment, not rendering
        // a page.
        //
        // **Behavior shift** (per #714 issue body's "Behavior decision
        // point" — explicit operator decision was to proceed):
        // when `linkedPageName` is empty or the owning page's metadata
        // can't be loaded, the new code returns deny; the legacy helper
        // returned allow (`if (!pageMetadata?.uuid) return true`). Some
        // private attachments whose owning-page name was unresolvable
        // will now 403 where they previously served. This is the
        // conservative-on-security default the EPIC adopts.
        if (!(await wikiContext.canAccess('view', linkedPageName))) {
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

      // #1059: same asset-read gate as serveAttachment — a thumbnail is the
      // attachment's bytes at a smaller size, not a separate surface.
      const wikiContext = this.createWikiContext(req);
      if (!(await wikiContext.hasPermission('asset-read'))) {
        return res.status(403).send('Forbidden');
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

      // #1183: the filename/size pre-read moved into AttachmentManager, so
      // every caller's record names what was lost, not only this route's.

      // #1121: asset-delete is CRITICAL, so the record is written and
      // flushed BEFORE the file is destroyed. Auditing afterwards means a
      // failed audit leaves data destroyed with no trace of what was lost,
      // which is the one outcome an audit log exists to prevent.
      //
      // The inverse risk — a record for a delete that then fails — is real but
      // strictly better: it is a discrepancy someone can investigate, against
      // destruction nobody can reconstruct. The unexpected case is logged
      // below rather than left to be inferred.
      // #1183: the record is written by AttachmentManager — the door every
      // caller passes through. It lived here, so four other write paths
      // produced no record at all, including a media-browser delete of the
      // same on-failure: refuse rule. The ordering guarantee is unchanged: the manager
      // records BEFORE the provider destroys anything and rethrows on failure,
      // so a delete whose record cannot be written still does not happen.
      let deleted: boolean;
      try {
        deleted = await attachmentManager.deleteAttachment(attachmentId, currentUser, wikiContext);
      } catch (delErr) {
        // Only an unwritable RECORD becomes a 503 with that message; anything
        // else is a delete failure and belongs to the outer catch, which says
        // so honestly rather than blaming the audit subsystem.
        if ((delErr as { code?: string })?.code !== AUDIT_WRITE_FAILED) throw delErr;
        logger.error(`[attachments] Refusing to delete ${attachmentId}: its audit record could not be written`, delErr);
        return res.status(503).json({
          success: false,
          error: 'Attachment not deleted — the audit record could not be written'
        });
      }

      if (!deleted) {
        // The audit says it was deleted and it was not. Say so loudly rather
        // than leaving the log quietly overstating what happened.
        logger.error(
          `[attachments] Audit recorded a delete of ${attachmentId} that did not occur — ` +
          'the attachment was not found. The audit log overstates this event.'
        );
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
  /**
   * Load a page's metadata in the shape the ACL evaluator expects (#1060).
   *
   * Tier 0 (private) and Tier 1 (audience/access) read frontmatter, so the
   * metadata must be attached to the WikiContext BEFORE any permission check —
   * evaluating with no metadata asks the evaluator a different question than
   * the one the caller meant.
   *
   * Keyword fields are coerced to arrays because JSPWiki imports may store
   * them as space-separated scalars (`user-keywords: foo bar baz`).
   */
  private async loadPageMetadataForAcl(pageName: string): Promise<PageFrontmatter | null> {
    const pageManager = this.engine.getManager('PageManager');
    const metadata = await pageManager.getPageMetadata(pageName);
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
    return metadata ?? null;
  }

  /**
   * May this caller read this page? (#1060)
   *
   * The single read gate, shared by the view route and the export routes.
   * Export existed as a second path to page content that evaluated no ACL at
   * all, so a private page was extractable by anyone who could name it. The
   * fix is not a second check that happens to agree — it is the same check.
   *
   * Returns the metadata alongside the decision so callers do not re-read it.
   */
  private async checkPageReadAccess(
    req: Request,
    pageName: string
  ): Promise<{ allowed: boolean; metadata: PageFrontmatter | null }> {
    const wikiContext = this.createWikiContext(req, {
      context: WikiContext.CONTEXT.VIEW,
      pageName
    });
    const metadata = await this.loadPageMetadataForAcl(pageName);
    (wikiContext as { pageMetadata: unknown }).pageMetadata = metadata;

    const aclManager = this.engine.getManager('ACLManager');
    const allowed = await aclManager.checkPagePermissionWithContext(wikiContext, 'view');
    return { allowed, metadata };
  }

  async exportPage(req: Request, res: Response) {
    try {
      const commonData = await this.getCommonTemplateData(req);
      const pageManager = this.engine.getManager('PageManager');
      // The picker is open, like the pages it lists. `denyExport` is what
      // stops an unreadable page being extracted from here (#1060).
      //
      // NOTE: this list is not ACL-filtered, so it can name pages the caller
      // cannot read. Selecting one yields 404, so no content leaks — but the
      // titles do. `getAllPages()` is unfiltered at every one of its call
      // sites; tracked separately rather than fixed here with a per-request
      // ACL evaluation of ~18k pages.
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
  /**
   * Deny an export unless the caller may read the page (#1060). Returns a sent
   * response when denied, or null to proceed.
   *
   * ONE check, deliberately: `checkPageReadAccess`, the SAME gate the view
   * route uses. Export was a second path to page content that evaluated no ACL
   * at all, so a private page was extractable by anyone who could name it.
   *
   * A `page-export` check on top was written first and removed. For a page the
   * caller can already read, exporting hands back words they are looking at on
   * screen; requiring a second permission to receive them as a file is friction
   * wearing a security label. The read/export split would matter against a bulk
   * surface — `ExportManager.exportPagesToHtml` and `exportToMarkdown` both
   * take arrays — but no route reaches either, so today every export is one
   * page the caller has already been granted. Gate the bulk route when one is
   * built, on the act that is actually different.
   *
   * 404 rather than 403, matching how a caller who cannot see a page should
   * experience it: a 403 confirms the page exists, which for a private page is
   * itself the disclosure.
   */
  private async denyExport(req: Request, res: Response, pageName: string): Promise<Response | null> {
    const { allowed } = await this.checkPageReadAccess(req, pageName);
    if (!allowed) {
      logger.warn(`[export] Denied — no read access to '${pageName}'`);
      return res.status(404).send('Page not found');
    }
    return null;
  }

  async exportPageHtml(req: Request, res: Response) {
    try {
      const { page: pageName } = req.params;
      const denied = await this.denyExport(req, res, pageName);
      if (denied) return denied;
      const exportManager = this.engine.getManager('ExportManager');

      const html = await exportManager.exportPageToHtml(pageName);
      const filePath = await exportManager.saveExport(html, pageName, 'html');

      // #1204: page-export is bulk extraction, gated on read until a bulk
      // surface exists. Recorded here because ExportManager cannot tell an
      // HTTP download from an internal render — the same reason page-read is
      // recorded at the route.
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.PAGE_EXPORT,
        user: req.userContext?.username ?? 'anonymous',
        ipAddress: req.ip,
        action: 'page-export',
        result: 'success',
        severity: WikiRoutes.viaTokenOf(req) ? 'medium' : 'low',
        resource: pageName,
        resourceType: 'page',
        metadata: { pageName, format: 'html', ...(WikiRoutes.viaTokenOf(req) ? { viaToken: WikiRoutes.viaTokenOf(req) } : {}) }
      }, (err) => logger.warn(`Audit log failed for page-export of '${pageName}':`, err));

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
      const denied = await this.denyExport(req, res, pageName);
      if (denied) return denied;
      const exportManager = this.engine.getManager('ExportManager');

      const markdown = await exportManager.exportToMarkdown(pageName);
      const filePath = await exportManager.saveExport(markdown, pageName, 'md');

      // #1204: page-export is bulk extraction, gated on read until a bulk
      // surface exists. Recorded here because ExportManager cannot tell an
      // HTTP download from an internal render — the same reason page-read is
      // recorded at the route.
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.PAGE_EXPORT,
        user: req.userContext?.username ?? 'anonymous',
        ipAddress: req.ip,
        action: 'page-export',
        result: 'success',
        severity: WikiRoutes.viaTokenOf(req) ? 'medium' : 'low',
        resource: pageName,
        resourceType: 'page',
        metadata: { pageName, format: 'md', ...(WikiRoutes.viaTokenOf(req) ? { viaToken: WikiRoutes.viaTokenOf(req) } : {}) }
      }, (err) => logger.warn(`Audit log failed for page-export of '${pageName}':`, err));

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
      // #1060: this lists the export directory, which holds files saved by
      // every user who has ever exported anything — content the caller may
      // have no right to read. Admin-only until exports are either per-caller
      // or not persisted at all.
      const wikiContext = this.createWikiContext(req);
      if (!(await wikiContext.hasPermission('admin-system'))) {
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          'You do not have permission to view saved exports.'
        );
      }
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
        return res.redirect(safeRedirect(req.query.redirect)); // #1041
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
  /**
   * Give the caller a brand-new session ID before marking it authenticated (#1043).
   *
   * Without this, whatever session ID the browser arrived with stays valid once
   * the user signs in — so anyone who could plant a session cookie beforehand
   * (shared machine, sibling subdomain, an XSS anywhere on the origin) ends up
   * holding an authenticated session. Classic fixation.
   *
   * `regenerate()` destroys the old session object, which takes the CSRF token
   * with it. The token is re-minted here rather than left to the middleware:
   * the middleware only fills a missing token on the NEXT request, which would
   * leave a window where a form rendered against the old token fails to submit.
   *
   * Resolves either way — a store that cannot regenerate is logged and the login
   * continues, because failing the sign-in outright would turn a hardening
   * measure into an outage.
   */
  /**
   * Shared login throttle (#1044). One instance per process, reconfigured from
   * config on each use so an operator's change takes effect without a restart.
   */
  private static loginThrottle: LoginThrottle | null = null;

  /**
   * Current throttle options, or null when the operator has disabled it.
   */
  private throttleOptions(): { maxAttempts: number; windowMs: number; baseLockMs: number; maxLockMs: number } | null {
    const cfg = this.engine.getManager('ConfigurationManager');
    if (!cfg || cfg.getProperty('ngdpbase.auth.throttle.enabled', true) === false) return null;
    const minutes = (key: string, fallback: number): number =>
      Number(cfg.getProperty(key, fallback)) * 60_000;
    return {
      maxAttempts: Number(cfg.getProperty('ngdpbase.auth.throttle.max-attempts', 10)),
      windowMs: minutes('ngdpbase.auth.throttle.window-minutes', 15),
      baseLockMs: minutes('ngdpbase.auth.throttle.lock-minutes', 1),
      maxLockMs: minutes('ngdpbase.auth.throttle.max-lock-minutes', 15)
    };
  }

  /** The throttle, configured, or null when disabled. */
  private getLoginThrottle(): LoginThrottle | null {
    const opts = this.throttleOptions();
    if (!opts) return null;
    if (!WikiRoutes.loginThrottle) {
      WikiRoutes.loginThrottle = new LoginThrottle(opts);
    } else {
      WikiRoutes.loginThrottle.configure(opts);
    }
    return WikiRoutes.loginThrottle;
  }

  /**
   * Keys a login attempt is counted under (#1044).
   *
   * BOTH, deliberately. Username-only lets a botnet spread guesses across
   * addresses; IP-only lets one client work through a user list from a single
   * address. Either key locking is enough to refuse the attempt.
   *
   * The username is lower-cased so `Admin` and `admin` share a bucket.
   */
  private throttleKeys(req: Request, username: unknown): string[] {
    const keys: string[] = [];
    if (typeof username === 'string' && username.trim() !== '') {
      keys.push(`user:${username.trim().toLowerCase()}`);
    }

    // The IP key is SKIPPED when the request looks proxied but `trust proxy`
    // is off. In that state every client shares one req.ip — the ingress or
    // tunnel — so an IP bucket does not identify an attacker, it identifies
    // the whole instance. Ten failures from anyone would then lock out every
    // user at once, turning this control into the denial-of-service it exists
    // to avoid. `ngdpbase.server.trust-proxy` defaults to false and the demo
    // and geohazardwatch both sit behind ingress, so this is the shipped
    // configuration, not a corner case.
    //
    // With trust proxy configured, req.ip is the real client and the key is
    // both meaningful and wanted. The username key applies either way.
    const forwarded = req.get?.('x-forwarded-for');
    const trustsProxy = req.app?.get?.('trust proxy');
    const ipIsShared = Boolean(forwarded) && !trustsProxy;

    if (!ipIsShared) {
      const ip = req.ip ?? (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress;
      if (ip) keys.push(`ip:${ip}`);
    }
    return keys;
  }

  /**
   * Record a lockout to the audit trail (#1044).
   *
   * Slowing an attacker is only half the value — a distributed attempt should
   * be VISIBLE, not merely delayed. Best-effort: an audit failure must never
   * stop a login response going out.
   */
  private async auditLoginLockout(
    req: Request,
    username: unknown,
    detail: string,
    minutes: number
  ): Promise<void> {
    try {
      const audit = this.engine.getManager('AuditManager') as {
        logSecurityEvent?: (
          ctx: Record<string, unknown>,
          type: string,
          severity: 'low' | 'medium' | 'high' | 'critical',
          description: string
        ) => Promise<string>;
      } | null;
      await audit?.logSecurityEvent?.(
        {
          ipAddress: req.ip,
          userAgent: req.get?.('user-agent'),
          attemptedUsername: typeof username === 'string' ? username : undefined
        },
        'login_throttled',
        'medium',
        `Login throttled (${detail}) — ${minutes} minute(s) remaining`
      );
    } catch (err: unknown) {
      logger.warn('[login-throttle] audit write failed (#1044):', err);
    }
  }

  private regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve) => {
      if (typeof req.session?.regenerate !== 'function') {
        resolve();
        return;
      }
      req.session.regenerate((err) => {
        if (err) {
          logger.error('Error regenerating session on login (#1043):', err);
        } else {
          req.session.csrfToken = generateCsrfToken();
        }
        resolve();
      });
    });
  }

  async processLogin(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      // #1041: constrain once, here — both the failure redirect below and the
      // success redirect at the end embed this value.
      const redirect = safeRedirect((req.body as Record<string, unknown>).redirect);
      const userManager = this.engine.getManager('UserManager');
      const configManager = this.engine.getManager('ConfigurationManager');
      const debugLogin = configManager.getProperty(
        'ngdpbase.logging.debug.login',
        false
      );

      this.engine.getManager('MetricsManager')?.recordLoginAttempt?.();

      if (debugLogin) logger.debug('DEBUG: Login attempt for:', username);

      // #1044: refuse before the password is ever checked, so a locked key
      // costs an attacker a redirect rather than a hash comparison.
      const throttle = this.getLoginThrottle();
      const keys = this.throttleKeys(req, username);
      if (throttle) {
        const blocked = keys
          .map((k) => throttle.check(k))
          .find((state) => state.blocked);
        if (blocked) {
          const minutes = Math.max(1, Math.ceil(blocked.retryAfterMs / 60_000));
          logger.warn(`🔒 Login refused for "${username}" from ${req.ip ?? 'unknown'} — throttled, ${minutes}m remaining (#1044)`);
          await this.auditLoginLockout(req, username, 'attempt while locked out', minutes);
          return res.redirect(
            `/login?error=${encodeURIComponent(`Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`)}&redirect=` +
              encodeURIComponent(redirect)
          );
        }
      }

      const authManager = this.engine.getManager('AuthManager');
      const result = authManager
        ? await authManager.authenticate('password', { username, password })
        : { success: await userManager.authenticateUser(username, password).then(Boolean), username };

      if (!result.success) {
        if (debugLogin)
          logger.debug('DEBUG: Authentication failed for:', username);

        // #1044: count the failure against every key, and audit only the
        // attempt that actually caused a lock — an ordinary wrong password is
        // noise, a lockout is a signal.
        if (throttle) {
          for (const key of keys) {
            const state = throttle.recordFailure(key);
            if (state.justLocked) {
              const minutes = Math.max(1, Math.ceil(state.retryAfterMs / 60_000));
              logger.warn(`🔒 Login locked out ${key} for ${minutes}m after repeated failures (#1044)`);
              await this.auditLoginLockout(req, username, `locked ${key}`, minutes);
            }
          }
        }

        // #1115: record the failed attempt itself, not only the lockout it may
        // eventually cause.
        //
        // This deliberately revisits #1044, whose comment above calls an
        // ordinary wrong password noise. That was the right call for the
        // WARNING log, which a human reads; it is the wrong one for the audit
        // trail, which is queried. Failed sign-in attempts are named explicitly
        // by the frameworks docs/planning/Security-auditing.md scores against —
        // HIPAA 164.312(b), SOC 2 CC7 — and "several failures then a success"
        // is a pattern that only exists if the failures were recorded.
        await this.auditAuthentication(req, username, 'failure', 'invalid username or password');

        return res.redirect(
          '/login?error=Invalid username or password&redirect=' +
            encodeURIComponent(redirect)
        );
      }

      // #1044: a success clears the record, so a fat-fingered password costs
      // a legitimate user nothing.
      if (throttle) keys.forEach((k) => throttle.recordSuccess(k));

      // #1115: the success half. A trail with only failures cannot answer
      // "did the attacker eventually get in", which is the question that
      // matters after a run of them.
      await this.auditAuthentication(req, result.username || username, 'success', 'password');

      // #1043: new session ID before the identity lands on it.
      await this.regenerateSession(req);

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
      // #1026 (closes #1020): per-IP budget. The provider's own throttle is
      // per-email, which a caller varying the address bypasses entirely — and
      // every request here sends mail to an address the caller chose.
      if (!this.enforceSignupRateLimit(req, res, 'requestMagicLink')) return;

      const { email, redirect = '/' } = req.body;
      const authManager = this.engine.getManager('AuthManager');

      if (authManager?.isEnabled('magic-link')) {
        // #1022: remember which browser asked. The value goes into an
        // HTTP-only cookie AND alongside the token, so redemption can say
        // whether the same browser came back. Set unconditionally — the
        // observability half carries no UX cost; only enforcement is gated.
        const deviceState = newDeviceState();
        const configManager = this.engine.getManager('ConfigurationManager');
        // Cookie lifetime tracks the token's, so it never outlives what it
        // describes. Reads the same key the provider builds its TTL from
        // (`ttl-minutes`, not a separate ms setting) — a second spelling here
        // would silently diverge the moment an operator changed one of them.
        const ttlMinutes = Number(
          configManager?.getProperty('ngdpbase.auth.magic-link.ttl-minutes', 15)
        ) || 15;
        const ttlMs = ttlMinutes * 60_000;
        const cookieSecure = Boolean(
          configManager?.getProperty('ngdpbase.session.secure', false)
        );
        res.cookie(
          DEVICE_STATE_COOKIE,
          deviceState,
          deviceStateCookieOptions(ttlMs, cookieSecure)
        );

        // #642 Iteration 3: provider derives baseUrl from
        // ConfigurationManager.getBaseURL() at runtime. The provider is
        // only registered when base-url is explicitly configured.
        await authManager.initiate('magic-link', { email, redirect, deviceState });
      }

      // Always redirect with success — never reveal whether email exists
      res.redirect('/login?magic=sent' + (redirect !== '/' ? '&redirect=' + encodeURIComponent(redirect) : ''));
    } catch (err: unknown) {
      logger.error('Error requesting magic link:', err);
      res.redirect('/login?error=Request+failed');
    }
  }

  /**
   * Show the magic-link sign-in confirmation — GET /auth/magic-link/verify
   *
   * #1019: this GET is DELIBERATELY side-effect free. Enterprise mail security
   * (Defender Safe Links, Proofpoint, …) pre-fetches every URL in an incoming
   * message to scan it, so anything consumed here is consumed before the human
   * ever clicks. The token is validated for display only; consumption and the
   * session both happen on the POST below, behind a per-session CSRF token that
   * a scanner following the link has no way to produce.
   *
   * `authManager.authenticate()` is safe to call here because
   * `MagicLinkAuthProvider.verify()` does not consume — it explicitly leaves
   * that to `consumeToken()`. Validating now means a dead token shows the
   * "expired" message immediately rather than after the user clicks a button.
   */
  async verifyMagicLink(req: Request, res: Response) {
    try {
      const token = req.query.token as string;
      const authManager = this.engine.getManager('AuthManager');

      if (!token || !authManager) {
        return res.redirect('/login?error=Invalid+link');
      }

      const result = await authManager.authenticate('magic-link', { token });
      if (!result.success) {
        return res.redirect('/login?error=Link+expired+or+already+used');
      }

      const commonData = await this.getCommonTemplateData(req);
      return res.render('magic-link-confirm', {
        ...commonData,
        token,
        username: result.username,
        error: ''
      });
    } catch (err: unknown) {
      logger.error('Error rendering magic link confirmation:', err);
      return res.redirect('/login?error=Verification+failed');
    }
  }

  /**
   * Complete a magic link sign-in — POST /auth/magic-link/verify
   *
   * #1019: the only place the token is consumed and a session created. Reached
   * from the interstitial rendered by the GET above; the app-wide CSRF
   * middleware has already rejected any POST without this session's token.
   */
  async completeMagicLink(req: Request, res: Response) {
    try {
      const token = req.body?.token as string;
      const authManager = this.engine.getManager('AuthManager');

      if (!token || !authManager) {
        return res.redirect('/login?error=Invalid+link');
      }

      // Read the redirect before consuming — consumeToken() deletes the entry.
      const redirect = authManager.getFlowRedirect('magic-link', token);

      // #1022: same read-before-consume constraint. Evaluated after the token
      // is known valid but before the session exists, so a refusal costs
      // nothing to unwind.
      const storedDeviceState = authManager.getDeviceState('magic-link', token);

      // #1026: for a link issued to an address with no account, create it now.
      // Deliberately on the POST, not the GET above — a mail scanner following
      // the link must not be able to bring an account into existence, for the
      // same reason it must not consume the token (#1019).
      // #1049: undefined means the provider has nothing to provision, which is
      // not a sign-in failure. Only an explicit false — the provider tried to
      // create the account and could not — is fatal. That distinction used to
      // rest on the method being absent; it is now a documented return value.
      const provisioned = await authManager.provisionIfNew('magic-link', token);
      if (provisioned === false) {
        return res.redirect('/login?error=Link+expired+or+already+used');
      }

      const result = await authManager.authenticate('magic-link', { token });
      if (!result.success) {
        return res.redirect('/login?error=Link+expired+or+already+used');
      }

      // #1021: consumption is the gate, not a cleanup step that happens to run
      // after. The `await` above is a real suspension point, so two POSTs with
      // the same token — a double-clicked confirmation button, a client retry,
      // a prefetch racing the real submit — can both clear authenticate()
      // before either consumes. #1019's CSRF-protected POST does not close
      // that: both come from the same session with the same valid token.
      //
      // consumeToken() returns true only for the caller whose Map delete found
      // the entry, and that delete is synchronous, so exactly one request can
      // ever proceed past here. The loser is told the link is used, which is
      // the truth from its point of view.
      if (!authManager.consumeToken('magic-link', token)) {
        logger.warn('🔁 Magic-link token already consumed by a concurrent request — refusing duplicate session');
        return res.redirect('/login?error=Link+expired+or+already+used');
      }

      // #1022: is the browser redeeming the link the one that asked for it?
      //
      // A magic link is bearer-only, so a forwarded mail or a link pasted into
      // a chat is an account takeover with no second factor. Recording the
      // answer — with IP and User-Agent — makes that visible after the fact.
      //
      // Enforcement is opt-in and defaults OFF, because "request on a laptop,
      // open the mail on a phone" is the common real flow and breaking it
      // silently would be worse than the risk. With the flag off a mismatch is
      // recorded and the user proceeds.
      const configManager = this.engine.getManager('ConfigurationManager');
      const enforceBinding = Boolean(
        configManager?.getProperty('ngdpbase.auth.magic-link.bind-to-requesting-device', false)
      );
      const binding = evaluateDeviceBinding({
        stored: storedDeviceState,
        presented: (req.cookies as Record<string, string> | undefined)?.[DEVICE_STATE_COOKIE],
        enforce: enforceBinding
      });

      // The cookie has served its purpose either way; leaving it set would let
      // a later link inherit a stale value.
      res.clearCookie(DEVICE_STATE_COOKIE, { path: '/' });

      await this.auditMagicLinkRedemption(req, result.username, binding.outcome, binding.allowed);

      if (!binding.allowed) {
        logger.warn(
          `🚫 Magic-link redemption refused for '${result.username}': device binding ${binding.outcome}`
        );
        return res.redirect('/login?error=This+link+must+be+opened+on+the+device+that+requested+it');
      }

      await this.regenerateSession(req); // #1043

      req.session.username = result.username;
      req.session.isAuthenticated = true;

      logger.info(`👤 User logged in via magic link: ${result.username}`);

      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after magic link login:', err);
          return res.redirect('/login?error=Session+save+failed');
        }
        res.redirect(safeRedirect(redirect)); // #1041
      });
    } catch (err: unknown) {
      logger.error('Error completing magic link login:', err);
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
      const authUrl = authManager.startFlow('google-oidc', { redirect });
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
      const redirect = authManager.getFlowRedirect('google-oidc', state);

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

      // #1021: same single-use gate as the magic-link path. A state nonce is
      // good for exactly one sign-in, and the `await` above is a real
      // suspension point, so a replayed callback — the user refreshing the
      // redirect, or a retry — could otherwise establish a second session.
      if (!authManager.consumeToken('google-oidc', state)) {
        logger.warn('🔁 OIDC state already consumed by a concurrent request — refusing duplicate session');
        return res.redirect('/login?error=Sign-in+link+already+used');
      }

      await this.regenerateSession(req); // #1043

      req.session.username = result.username;
      req.session.isAuthenticated = true;

      logger.info(`👤 User logged in via Google: ${result.username}`);

      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after Google login:', err);
          return res.redirect('/login?error=Session+save+failed');
        }
        res.redirect(safeRedirect(redirect)); // #1041
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
          : (await userManager.hasPermission(ANONYMOUS_SUBJECT, 'page-read'))
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
   * Whether the password `/register` form is available (#1026).
   *
   * Two layers, mirroring the model `GoogleOIDCProvider` already uses:
   * `ngdpbase.application.registration` is the master policy — when it is
   * false, no path may create an account. Below it,
   * `ngdpbase.application.registration.password` turns off *this mechanism*
   * only, so an instance can allow signup while making magic link the sole
   * way in. Defaults to true, so existing deploys are unchanged.
   */
  /**
   * Per-IP rate limit for the account-signup surfaces (#1026, closes #1020).
   *
   * Shares the `ngdpbase.mail.rate-limit.*` config with the contact form, so an
   * operator tunes one budget for every unauthenticated mail-sending form.
   *
   * @returns true when the request may proceed; when false, a 429 has already
   *          been sent and the caller must return immediately
   */
  private enforceSignupRateLimit(req: Request, res: Response, what: string): boolean {
    const configManager = this.engine.getManager('ConfigurationManager');

    const enabled = (configManager?.getProperty(
      'ngdpbase.mail.rate-limit.enabled',
      true
    ) as boolean | undefined) ?? true;
    if (!enabled) return true;

    const max = (configManager?.getProperty(
      'ngdpbase.mail.rate-limit.max-submissions',
      5
    ) as number | undefined) ?? 5;
    const windowMin = (configManager?.getProperty(
      'ngdpbase.mail.rate-limit.window-minutes',
      15
    ) as number | undefined) ?? 15;

    signupRateLimiter.configure({ max, windowMs: windowMin * 60 * 1000 });

    const limitKey = req.ip || 'unknown';
    const rl = signupRateLimiter.consume(limitKey);
    if (rl.allowed) return true;

    logger.warn(`[${what}] rate limited ip=${limitKey}`);
    res.set('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)));
    res.status(429).send('Too many requests. Please try again later.');
    return false;
  }

  /**
   * Whether a visitor with no account can obtain one via a magic link (#1026).
   *
   * All three must hold: the master registration policy, the magic-link
   * provider being enabled, and its auto-provision toggle. Used by the header
   * so an instance with the password form off still advertises that signup is
   * available rather than sending visitors to a "registration is closed" page.
   */
  private isMagicLinkSignupEnabled(): boolean {
    const configManager = this.engine.getManager('ConfigurationManager');

    const allowReg = (configManager?.getProperty(
      'ngdpbase.application.registration',
      true
    ) as boolean | undefined) ?? true;
    if (!allowReg) return false;

    const magicLinkEnabled = (configManager?.getProperty(
      'ngdpbase.auth.magic-link.enabled',
      false
    ) as boolean | undefined) ?? false;
    if (!magicLinkEnabled) return false;

    return (configManager?.getProperty(
      'ngdpbase.auth.magic-link.auto-provision',
      false
    ) as boolean | undefined) ?? false;
  }

  /**
   * May this caller VIEW an administration screen? (#1029)
   *
   * `admin-system` grants viewing and mutating together, so before this there
   * was no way to offer a read-only dashboard — which is what a public demo
   * needs, and what #969's trash view could not otherwise be shown on.
   *
   * The read/write split falls almost exactly on HTTP method: 36 GET-only
   * admin handlers against 50 mutating ones, with no handler serving both.
   * Only the GET handlers call this. Every mutating route still requires
   * `admin-system` and is untouched, so the read-only guarantee is the absence
   * of a permission rather than a new check anyone has to remember.
   *
   * Two GET handlers deliberately do NOT use this:
   *   - `adminRevealSecret` — unmasking a secret is privileged regardless of
   *     which verb carries it; it keeps requiring `admin-system`.
   *   - `adminUsers` — gated on `user-read`, so a role can be given the
   *     dashboard without the list of every visitor's email address.
   */
  private async hasAdminViewAccess(wikiContext: {
    hasPermission: (permission: string) => Promise<boolean>;
  }): Promise<boolean> {
    return (await wikiContext.hasPermission('admin-read'))
      || (await wikiContext.hasPermission('admin-system'));
  }

  private isPasswordRegistrationEnabled(): boolean {
    const configManager = this.engine.getManager('ConfigurationManager');
    const allowReg = (configManager?.getProperty(
      'ngdpbase.application.registration',
      true
    ) as boolean | undefined) ?? true;
    if (!allowReg) return false;

    return (configManager?.getProperty(
      'ngdpbase.application.registration.password',
      true
    ) as boolean | undefined) ?? true;
  }

  /**
   * Registration page
   *
   * Returns 404 when self-registration is disabled
   * (`ngdpbase.application.registration: false`) or when the password
   * mechanism specifically is off (`…registration.password: false`, #1026).
   * Operators who lock down registration repurpose the header button to a
   * "Request access" wiki page — see `getCommonTemplateData()` and
   * `views/header.ejs`.
   */
  async registerPage(req: Request, res: Response) {
    try {
      if (!this.isPasswordRegistrationEnabled()) {
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
   * (`ngdpbase.application.registration: false`) or when the password
   * mechanism is off (`…registration.password: false`, #1026). Defence in
   * depth — the GET route also 404s, but rejecting the POST keeps the flags
   * honest if the route is somehow reachable (test harness, future refactor).
   */
  async processRegister(req: Request, res: Response) {
    try {
      if (!this.isPasswordRegistrationEnabled()) {
        res.status(404).send('Not found');
        return;
      }

      // #1026: 404 first, then rate limit — an instance with the form off
      // should look identical whether or not the caller is being throttled.
      if (!this.enforceSignupRateLimit(req, res, 'processRegister')) return;

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
      }, { username, ipAddress: req.ip }); // #1204: self-registration; the new account is the actor

      logger.debug(`👤 User registered: ${username}`);
      res.redirect('/login?success=Registration successful');
    } catch (err: unknown) {
      // #1086: the full error goes to the log; the visitor gets a message from
      // a closed set. This used to forward `getErrorMessage(err)` verbatim,
      // which is how `createUser`'s "Existing users: …" reached an
      // unauthenticated caller — and would have carried whatever any other
      // layer threw next.
      logger.error('Error processing registration:', err);
      res.redirect('/register?error=' + encodeURIComponent(safeRegistrationMessage(err)));
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
        ? await this.getMyContributionsCounts(currentUser.username, freshUser)
        : { pages: undefined, private: undefined, journal: undefined, links: undefined };

      // #534: addon-contributed profile sections.
      // Cast through unknown — local IUserManager (WikiRoutes.ts:108) declares
      // getUser as returning UserContext, but at runtime UserManager actually
      // returns Omit<User, 'password'> which is what AddonsManager expects.
      const addonsManager = this.engine.getManager('AddonsManager');
      const addonProfileSections = (
        addonsManager
        && freshUser
        && typeof (addonsManager as { getProfileSections?: unknown }).getProfileSections === 'function'
      )
        ? await (addonsManager as { getProfileSections: (u: unknown) => Promise<unknown[]> }).getProfileSections(freshUser)
        : [];

      // #842: "Share Links" profile section for users who may create shares.
      let myShares: { active: number; total: number } | null = null;
      try {
        const shareManager = this.engine.getManager('ShareManager');
        if (shareManager?.isEnabled() && (await this.canManageShares(wikiContext))) {
          const own = shareManager.list(currentUser.username ?? '');
          const now = Date.now();
          myShares = {
            total: own.length,
            active: own.filter(r => !r.revokedAt && !(r.expiresAt && now > Date.parse(r.expiresAt))).length
          };
        }
      } catch {
        // non-fatal — section just won't show
      }

      // #946: only render the Agent Tokens card when the feature is enabled.
      // The card is entirely client-driven against /api/tokens, so no token
      // data is passed into the template — the secret must never reach a
      // rendered page, only the one-time mint response.
      const agentTokensEnabled = Boolean(
        this.engine.getManager('AgentTokenManager') &&
        this.engine.getManager<{ getProperty(k: string, d: unknown): unknown }>('ConfigurationManager')
          ?.getProperty('ngdpbase.auth.agent-token.enabled', false)
      );

      res.render('profile', {
        ...commonData,
        title: 'Profile',
        agentTokensEnabled, // #946
        user: freshUser || currentUser, // Use fresh user data if available
        permissions: userPermissions,
        availableTimezones: availableTimezones,
        availableDateFormats: availableDateFormats,
        contributions, // #640
        addonProfileSections, // #534
        myShares, // #842
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
    captures: number | undefined;
  }> {
    const counts: {
      pages: number | undefined;
      private: number | undefined;
      journal: number | undefined;
      links: number | undefined;
      edits: number | undefined;
      shared: number | undefined;
      captures: number | undefined;
    } = { pages: undefined, private: undefined, journal: undefined, links: undefined, edits: undefined, shared: undefined, captures: undefined };

    try {
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesByCreator?: (u: string, o?: { onlyPrivate?: boolean; systemKeywords?: string[] }) => Promise<unknown[]>;
        getPagesByEditor?: (u: string) => Promise<unknown[]>;
        getPagesSharedWith?: (principals: string[]) => Promise<unknown[]>;
      };
      if (pageManager?.getPagesByCreator) {
        const all = await pageManager.getPagesByCreator(username);
        const privateOnly = await pageManager.getPagesByCreator(username, { onlyPrivate: true });
        counts.pages = all.length;
        counts.private = privateOnly.length;
        // #1004: only counted when capture is enabled — the card row is hidden
        // otherwise, and an unused count is a wasted index scan on every profile view.
        if (this.isCaptureEnabled()) {
          const captures = await pageManager.getPagesByCreator(username, { systemKeywords: this.getCaptureKeywords() });
          counts.captures = captures.length;
        }
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

  /**
   * GET /my/captures — pages the bookmarklet capture flow created for the
   * current user (#1004). 404s when capture is disabled, matching the /capture
   * routes: a "My Captures" page on an instance with no capture feature is a
   * dead end, not a discovery.
   *
   * NOT restricted to private pages even though captures default to private —
   * `ngdpbase.capture.private` can be false, and a capture the user later made
   * public is still a capture.
   */
  async myCapturesPage(req: Request, res: Response) {
    if (!this.isCaptureEnabled()) return res.status(404).send('Not found');
    return this.renderMyContributionsList(req, res, {
      title: 'My Captures',
      icon: 'fa-bookmark',
      onlyPrivate: false,
      systemKeywords: this.getCaptureKeywords(),
      emptyMessage: 'You haven\'t captured anything yet. Install the capture bookmarklet from /capture/install to clip pages from your browser.'
    });
  }

  private async renderMyContributionsList(
    req: Request,
    res: Response,
    spec: { title: string; icon: string; onlyPrivate: boolean; emptyMessage: string; systemKeywords?: string[] }
  ) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated || !currentUser.username) {
        return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
      }
      const pageManager = this.engine.getManager('PageManager') as unknown as {
        getPagesByCreator?: (u: string, o?: { onlyPrivate?: boolean; systemKeywords?: string[] }) => Promise<Array<{
          title: string; uuid: string; lastModified: string; isPrivate?: boolean; editor?: string
        }>>;
      };
      const items = pageManager?.getPagesByCreator
        ? await pageManager.getPagesByCreator(currentUser.username, {
          onlyPrivate: spec.onlyPrivate,
          ...(spec.systemKeywords ? { systemKeywords: spec.systemKeywords } : {})
        })
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
      // #805 — JournalDataManager.listByAuthor became async in #800 when the
      // sidecar was retired (it now reads through SearchManager + PageManager).
      // The inline type below mirrors the real signature so missing-await bugs
      // surface at compile time.
      interface JournalIndexEntryShape {
        uuid: string;
        slug: string;
        title: string;
        author: string;
        journalDate: string;
        mood?: string;
        tags: string[];
        isPrivate: boolean;
        lastModified: string;
      }
      const journalManager = this.engine.getManager('JournalDataManager') as {
        listByAuthor?: (u: string, o?: { limit?: number; offset?: number }) => Promise<JournalIndexEntryShape[]>;
      };
      const addonsManager = this.engine.getManager('AddonsManager');
      const journalEnabled = addonsManager?.isEnabled?.('journal') ?? false;
      const entries: JournalIndexEntryShape[] = journalManager?.listByAuthor
        ? await journalManager.listByAuthor(currentUser.username, { limit: 1000, offset: 0 })
        : [];
      // Adapt journal entries to the my-list shape so we can reuse the view.
      const items = entries.map(e => ({
        title: e.title,
        uuid: e.slug,
        lastModified: e.journalDate
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
      // #785: normalise legacy {pageName, title} entries to the unified shape
      // so /my/links works for users whose data was written before the migration.
      const items = normalizePinnedItems(freshUser?.preferences?.['nav.pinnedPages']).map(p => ({
        title: p.title,
        url: p.url,
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

      // #1029: a shared account whose credentials are published must not let
      // its holder edit its identity — doing so hands the account away.
      // Changing the password locks out every other visitor and makes the
      // published credential wrong; changing the *email* is worse, because
      // magic-link login resolves an account by email address, so repointing
      // it at a private inbox grants permanent exclusive access. Everything
      // else (preferences, avatar, pinned links) stays editable. An admin can
      // still change all of it via /admin/users/<name>/edit (`user-edit`).
      //
      // Compared against the stored values rather than merely "was submitted":
      // the profile form posts displayName and email prefilled on every save,
      // so presence alone would block unrelated edits.
      const account = await userManager.getUser(currentUser.username ?? '');
      if (account?.profileLocked) {
        const attempted: string[] = [];
        if (newPassword) attempted.push('password');
        if (email && email !== account.email) attempted.push('email address');
        if (displayName && displayName !== account.displayName) attempted.push('display name');

        if (attempted.length > 0) {
          logger.warn(
            `[profile] Refused a change to ${attempted.join(', ')} on locked shared account "${account.username}"`
          );
          return res.redirect(
            '/profile?error=' + encodeURIComponent(
              `This is a shared account — its ${attempted.join(', ')} can only be changed by an administrator`
            )
          );
        }
      }

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

      await userManager.updateUser(currentUser.username ?? '', updates, { username: currentUser.username, ipAddress: req.ip });

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

      // Re-read fresh preferences from disk rather than spreading the
      // session-cached `currentUser.preferences`. The session snapshot can
      // miss keys written since login (by another tab, the standalone
      // /journal/settings page, an admin tool, etc.), and the subsequent
      // updateUser({ preferences }) call REPLACES the whole bag — any key
      // not in our spread base is wiped. Re-reading per-request avoids
      // that wholesale clobber. (Surfaced by #534 code review.)
      const freshUserForPrefs = currentUser.username
        ? await userManager.getUser(currentUser.username)
        : null;
      const currentPreferences = (freshUserForPrefs?.preferences ?? currentUser.preferences ?? {}) as Record<string, unknown>;
      logger.debug(
        'DEBUG: updatePreferences - current preferences:',
        currentPreferences
      );

      // Extract preference values from form and merge with existing
      const preferences: Record<string, string | boolean | undefined> = { ...(currentPreferences as Record<string, string | boolean | undefined>) };

      // Helper: resolve dotted field names defensively.
      //
      // Today's `express.urlencoded({ extended: true })` (app.ts:182) keeps
      // dotted form-field names FLAT — `<input name="editor.plain.smartpairs">`
      // arrives as `body['editor.plain.smartpairs']` directly, NOT as
      // `body.editor.plain.smartpairs`. qs's `allowDots` defaults to false
      // and body-parser doesn't override that.
      //
      // This helper hits the flat path on the first line; the nested walk is
      // defensive against a future body-parser config change (someone enables
      // `allowDots: true` for a different addon's needs) silently breaking
      // every preference field. Either body shape resolves correctly.
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

      // #534: fan out the same body to every addon that registered a
      // saveProfileSection() handler. Wrapped in its OWN try/catch so a
      // failure here does NOT fall through to the outer catch and mislead
      // the user with "Failed to save preferences" — core prefs already
      // persisted at the updateUser call above. (Surfaced by #534 code review.)
      // Body is shallow-cloned to defend against an addon mutating req.body
      // and affecting peer addons or post-route middleware.
      try {
        const addonsManager = this.engine.getManager('AddonsManager');
        if (
          addonsManager
          && currentUser.username
          && typeof (addonsManager as { saveProfileSections?: unknown }).saveProfileSections === 'function'
        ) {
          const bodyClone = { ...(req.body as Record<string, unknown>) };
          await (addonsManager as { saveProfileSections: (u: string, b: Record<string, unknown>) => Promise<void> })
            .saveProfileSections(currentUser.username, bodyClone);
        }
      } catch (addonErr) {
        logger.warn('[/preferences] addon saveProfileSections threw — core preferences saved successfully, fan-out failed', addonErr);
      }

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

  /**
   * POST /api/user/pinned-pages — add an item to My Links.
   *
   * Accepts either form:
   *   - Legacy wiki-page pin: `{pageName: "Foo", title?: "Foo"}` → URL derived.
   *   - URL-based pin (#785):  `{url: "/my/journal", title: "My Journal", pageName?}` →
   *     pageName is optional metadata; URL is the canonical dedup key.
   *
   * Existing entries are normalised at read time so the merge is safe even
   * when prior data is in the legacy shape.
   */
  async addPinnedPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const rawPageName = typeof req.body?.pageName === 'string' ? req.body.pageName.trim() : '';
      const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      const rawTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const canonicalUrl = deriveCanonicalUrl({ url: rawUrl, pageName: rawPageName });
      if (!canonicalUrl) return res.status(400).json({ error: 'url or pageName required' });
      const title = rawTitle || rawPageName || canonicalUrl;
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const pinned: PinnedItem[] = normalizePinnedItems(prefs['nav.pinnedPages']);
      if (pinned.length >= 20) return res.status(400).json({ error: 'Maximum 20 pinned items reached' });
      if (!pinned.find(p => p.url === canonicalUrl)) {
        const entry: PinnedItem = {
          url: canonicalUrl,
          title,
          ...(rawPageName ? { pageName: rawPageName } : {}),
          pinnedAt: new Date().toISOString()
        };
        pinned.push(entry);
      }
      prefs['nav.pinnedPages'] = pinned;
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true, pinnedPages: pinned });
    } catch (err) {
      logger.error('Error adding pinned page:', err);
      return res.status(500).json({ error: 'Failed to add pinned page' });
    }
  }

  /**
   * DELETE /api/user/pinned-pages/:pageName — remove an item from My Links.
   *
   * For back-compat the path segment is named `:pageName`, but it accepts any
   * URL-decoded identifier: either a legacy pageName OR a URL-encoded canonical
   * URL. Match is by URL after normalisation (legacy entries have url derived).
   */
  async removePinnedPage(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const ident = decodeURIComponent(req.params.pageName ?? '');
      if (!ident) return res.status(400).json({ error: 'identifier required' });
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const normalized: PinnedItem[] = normalizePinnedItems(prefs['nav.pinnedPages']);
      // ident may be a URL (e.g. "/my/journal") or a legacy pageName ("Foo").
      // Compute the canonical URL we'd derive for "Foo" so legacy clients
      // sending pageName still find their entry.
      const identAsPageNameUrl = ident.startsWith('/') ? null : `/view/${encodeURIComponent(ident)}`;
      const pinned = normalized.filter(p =>
        p.url !== ident && p.url !== identAsPageNameUrl && p.pageName !== ident
      );
      prefs['nav.pinnedPages'] = pinned;
      await userManager.updateUser(currentUser.username ?? '', { preferences: prefs });
      return res.json({ ok: true, pinnedPages: pinned });
    } catch (err) {
      logger.error('Error removing pinned page:', err);
      return res.status(500).json({ error: 'Failed to remove pinned page' });
    }
  }

  /**
   * PUT /api/user/pinned-pages/order — reorder My Links.
   *
   * Accepts `order: string[]` where each entry is a URL (preferred) or a
   * legacy pageName. Matching falls back through both fields so old clients
   * sending pageNames keep working.
   */
  async reorderPinnedPages(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser?.isAuthenticated) return res.status(401).json({ error: 'Not authenticated' });
      const order: string[] = Array.isArray(req.body?.order)
        ? req.body.order.filter((s: unknown): s is string => typeof s === 'string')
        : [];
      const userManager = this.engine.getManager('UserManager');
      const prefs: Record<string, unknown> = { ...(currentUser.preferences as Record<string, unknown> ?? {}) };
      const pinned: PinnedItem[] = normalizePinnedItems(prefs['nav.pinnedPages']);
      const reordered = order
        .map(ident => pinned.find(p => p.url === ident || p.pageName === ident))
        .filter((p): p is PinnedItem => p !== undefined);
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

  /**
   * #819 — POST /api/page/ingest
   *
   * Authenticated JSON endpoint that accepts raw Markdown, normalizes it to
   * NCM, and **upserts** a page authored by the caller. Built for AI agents
   * presenting an Authentik bearer token (#818), but works with any
   * authenticated context (e.g. a logged-in session).
   *
   * Body: `{ pageName, markdown, category?, keywords? }`. Upsert key is
   * `pageName` — re-sending an edited doc updates the page in place.
   * Permission: `page-create` (new) / `page-edit` (existing).
   *
   * Goes through the live server (not the out-of-process MCP write path) so the
   * page is immediately viewable AND searchable via an in-band index update.
   */
  /**
   * GET /api/tokens — list live agent tokens (#946).
   *
   * Returns the caller's own tokens. An admin may pass `?all=true` to see every
   * user's, for incident response. Hashes are never returned.
   */
  async listAgentTokens(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const user = wikiContext.userContext;
      if (!user?.isAuthenticated || !user.username) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const manager = this.agentTokensEnabled()
        ? this.engine.getManager('AgentTokenManager') as import('../managers/AgentTokenManager.js').default | null
        : null;
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Agent tokens are not enabled' });
      }

      const allParam = (req.query as Record<string, unknown>).all;
      const wantsAll = typeof allParam === 'string' && allParam === 'true';
      if (wantsAll) {
        if (!(await wikiContext.hasPermission('admin-system'))) {
          return res.status(403).json({ success: false, error: 'admin-system permission required to list all tokens' });
        }
        return res.json({ success: true, tokens: manager.listAll() });
      }
      return res.json({ success: true, tokens: manager.listForOwner(user.username) });
    } catch (err) {
      logger.error('[api/tokens] list failed:', err);
      return res.status(500).json({ success: false, error: 'Could not list tokens' });
    }
  }

  /**
   * POST /api/tokens — mint a token for the caller (#946).
   *
   * Always minted for the *caller*: an admin cannot mint on someone else's
   * behalf, so a token always traces to a person who chose to delegate.
   * The cleartext is returned here and never again.
   */
  async mintAgentToken(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const user = wikiContext.userContext;
      if (!user?.isAuthenticated || !user.username) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const manager = this.agentTokensEnabled()
        ? this.engine.getManager('AgentTokenManager') as import('../managers/AgentTokenManager.js').default | null
        : null;
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Agent tokens are not enabled' });
      }

      const body = req.body as { name?: unknown; scopes?: unknown; ttlHours?: unknown };
      const name = typeof body.name === 'string' ? body.name : '';
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.filter((s): s is string => typeof s === 'string')
        : ['page-ingest'];
      const ttlHours = body.ttlHours === undefined ? undefined : Number(body.ttlHours);

      const result = await manager.mint(user.username, name, scopes, ttlHours);

      // Audit before the cleartext leaves the process, so the record exists
      // even if the response never reaches the caller.
      logger.info(
        `[api/tokens] Minted token ${result.record.id} for ${user.username} ` +
        `(name="${result.record.name}", scopes=[${result.record.scopes.join(',')}], expires=${result.record.expiresAt})`
      );

      return res.status(201).json({
        success: true,
        token: result.token,
        warning: 'This token is shown once and cannot be retrieved again.',
        record: result.record
      });
    } catch (err) {
      // mint() throws caller-safe validation messages (bad scope, over limit,
      // TTL too long) — surface them as 400 rather than a generic 500.
      const message = err instanceof Error ? err.message : 'Could not mint token';
      logger.warn(`[api/tokens] mint rejected: ${message}`);
      return res.status(400).json({ success: false, error: message });
    }
  }

  /**
   * DELETE /api/tokens/:id — revoke a token (#946).
   *
   * The owner may revoke their own; an admin may revoke anyone's. Effective
   * immediately — verification reads the store per request.
   */
  async revokeAgentToken(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const user = wikiContext.userContext;
      if (!user?.isAuthenticated || !user.username) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      const manager = this.agentTokensEnabled()
        ? this.engine.getManager('AgentTokenManager') as import('../managers/AgentTokenManager.js').default | null
        : null;
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Agent tokens are not enabled' });
      }

      const id = req.params.id;
      const record = manager.getById(id);
      if (!record) {
        return res.status(404).json({ success: false, error: 'Token not found' });
      }

      const isOwner = record.owner === user.username;
      if (!isOwner && !(await wikiContext.hasPermission('admin-system'))) {
        // Same response as a missing token — do not confirm the existence of
        // another user's token to a caller who may not see it.
        return res.status(404).json({ success: false, error: 'Token not found' });
      }

      const revoked = await manager.revoke(id, user.username);
      if (!revoked) {
        return res.status(409).json({ success: false, error: 'Token is already revoked' });
      }
      logger.info(`[api/tokens] Token ${id} (owner=${record.owner}) revoked by ${user.username}`);
      return res.json({ success: true, id });
    } catch (err) {
      logger.error('[api/tokens] revoke failed:', err);
      return res.status(500).json({ success: false, error: 'Could not revoke token' });
    }
  }

  async ingestPageMarkdown(req: Request, res: Response) {
    try {
      const baseContext = this.createWikiContext(req);
      const currentUser = baseContext.userContext;
      if (!currentUser || !currentUser.isAuthenticated) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const body = req.body as {
        pageName?: unknown; markdown?: unknown; category?: unknown; keywords?: unknown;
      };
      const pageName = typeof body.pageName === 'string' ? body.pageName.trim() : '';
      const markdown = typeof body.markdown === 'string' ? body.markdown : '';
      if (!pageName) {
        return res.status(400).json({ success: false, error: 'pageName is required' });
      }
      if (!markdown.trim()) {
        return res.status(400).json({ success: false, error: 'markdown is required' });
      }

      // Same name validation as createPageFromTemplate — protect URL routing / YAML.
      const invalidChars = /[/\\#?%"<>|*]/;
      if (invalidChars.test(pageName)) {
        return res.status(400).json({
          success: false,
          error: 'pageName contains invalid characters: / \\ # ? % " < > | *'
        });
      }

      // Optional category — validate against the enabled system categories.
      let category: string | undefined;
      if (body.category !== undefined && body.category !== null && body.category !== '') {
        if (typeof body.category !== 'string') {
          return res.status(400).json({ success: false, error: 'category must be a string' });
        }
        const catStr = body.category;
        const valid = this.getSystemCategories();
        const matched = valid.find(c => c.toLowerCase() === catStr.trim().toLowerCase());
        if (!matched) {
          return res.status(400).json({
            success: false,
            error: `Invalid category "${catStr}". Valid categories: ${valid.join(', ')}`
          });
        }
        category = matched;
      }

      // Optional keywords — array of strings, max 5.
      let keywords: string[] | undefined;
      if (body.keywords !== undefined && body.keywords !== null) {
        if (!Array.isArray(body.keywords) || body.keywords.some(k => typeof k !== 'string')) {
          return res.status(400).json({ success: false, error: 'keywords must be an array of strings' });
        }
        keywords = (body.keywords as string[]).map(k => k.trim()).filter(Boolean);
        if (keywords.length > 5) {
          return res.status(400).json({ success: false, error: 'Maximum 5 keywords allowed' });
        }
      }

      const pageManager = this.engine.getManager('PageManager');
      const existing = await pageManager.getPage(pageName);
      const action = existing ? 'updated' : 'created';

      // Permission: create vs edit, mirroring createPageFromTemplate / savePage.
      const permission = existing ? 'page-edit' : 'page-create';
      if (!(await baseContext.hasPermission(permission))) {
        return res.status(403).json({
          success: false,
          error: `You do not have permission to ${existing ? 'edit' : 'create'} pages`
        });
      }

      // Build frontmatter: preserve existing on update, generate on create.
      let metadata: Record<string, unknown>;
      if (existing) {
        metadata = { ...(existing.metadata as Record<string, unknown>) };
        if (category) metadata['system-category'] = category;
        if (keywords) metadata['user-keywords'] = keywords;
      } else {
        metadata = this.buildNewPageMetadata(pageName, {
          'system-category': category || undefined,
          'user-keywords': keywords || [],
          author: currentUser.username
        });
      }
      metadata.editor = currentUser.username;

      // Normalize Markdown → NCM (links + table up-convert + ncmVersion stamp),
      // mirroring the MCP create path. savePageWithContext then sets `author`
      // from the WikiContext user (immutable across edits — decision A).
      const ncm = normalizeExistingPageToNcm(matter.stringify(markdown, metadata));
      const ncmDoc = matter(ncm.content);
      const ncmWarnings = ncm.warnings.map(w => `${w.kind}: ${w.detail}`);

      // Save-time validation (#596), the same gate the editor's savePage
      // applies. This endpoint had none: its only check was `isAuthenticated`,
      // so any account — including a magic-link visitor on a public demo —
      // could POST page content the editor would have refused.
      //
      // Validates ncmDoc.content, the POST-normalisation text that actually
      // gets written. The `markdown` as received is the wrong thing to check:
      // normalizeExistingPageToNcm rewrites links and up-converts tables, so
      // validating the input would approve something other than what lands on
      // disk.
      const validationManager = this.engine.getManager('ValidationManager');
      if (validationManager?.collectContentErrors) {
        const validationErrors = await validationManager.collectContentErrors(ncmDoc.content, {
          pageName,
          userName: currentUser.username
        });
        if (validationErrors.length > 0) {
          logger.info(
            `🛑 ingest(${pageName}) blocked: ${validationErrors.length} validation error(s)`
          );
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            validationErrors,
            ncmWarnings
          });
        }
      }

      // #1081: refuse an ingest built on a version someone else has already
      // replaced. Deliberately the LAST check before the write, matching the
      // form save path — the page can move while validation runs.
      //
      // Optional: a caller that sends no `baseLastModified` keeps the previous
      // last-writer-wins behaviour, so existing ingest scripts are unaffected.
      // The 409 carries the current token and content so an agent can merge
      // and retry rather than retry blindly, which is the overwrite this
      // exists to prevent.
      const ingestBase = typeof (req.body as { baseLastModified?: unknown }).baseLastModified === 'string'
        ? (req.body as { baseLastModified: string }).baseLastModified
        : null;
      if (existing && isStaleSave(ingestBase, versionTokenOf(existing.metadata))) {
        logger.warn(
          `⚠️  ingest(${pageName}) blocked: stale base version `
          + `(submitted ${ingestBase}, current ${versionTokenOf(existing.metadata)})`
        );
        return res.status(409).json({
          success: false,
          error: 'conflict',
          message: `Page "${pageName}" changed after you read it. Nothing was written.`,
          currentLastModified: versionTokenOf(existing.metadata),
          currentContent: existing.content
        });
      }

      // #1126: the ingest path adopts the #1125 footnote transfer — after the
      // stale check (a refused save must not have written sidecar records),
      // before the write. Definitions land in the footnote list; the body
      // keeps its refs.
      const fn = await this.transferPageFootnotes(
        ncm.content,
        ncmDoc.data.uuid as string | undefined,
        currentUser.username ?? 'unknown',
        false
      );
      const finalDoc = fn.warnings.length > 0 ? matter(fn.content) : ncmDoc;
      ncmWarnings.push(...fn.warnings);

      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.EDIT,
        pageName,
        content: finalDoc.content,
        response: res
      });
      await pageManager.savePageWithContext(wikiContext, finalDoc.data);

      // Incremental, in-band index update (mirrors createPageFromTemplate).
      const saved = await pageManager.getPage(pageName);
      if (!saved) {
        logger.error(`Ingest: page "${pageName}" not retrievable immediately after save`);
        return res.status(500).json({ success: false, error: 'Page saved but could not be reloaded' });
      }
      const renderingManager = this.engine.getManager('RenderingManager');
      const searchManager = this.engine.getManager('SearchManager');
      renderingManager.addPageToCache(pageName);
      renderingManager.updatePageInLinkGraph(pageName, saved.content);
      await searchManager.updatePageInIndex(pageName, {
        name: pageName,
        content: saved.content,
        metadata: saved.metadata
      });

      const cacheManager = this.engine.getManager('CacheManager');
      if (cacheManager?.isInitialized?.()) {
        const _uuid = pageManager?.getPageUUID?.(pageName) ?? pageName;
        await cacheManager.clear(undefined, `rendered-pages:${_uuid}:*`);
      }

      const savedMeta = saved.metadata as Record<string, unknown>;
      const baseUrl = this.engine.getManager('ConfigurationManager')
        ?.getProperty('ngdpbase.application.base-url', '') || '';
      const viewPath = `/view/${encodeURIComponent(pageName)}`;
      return res.status(existing ? 200 : 201).json({
        success: true,
        action,
        title: savedMeta.title ?? pageName,
        uuid: savedMeta.uuid ?? null,
        slug: savedMeta.slug ?? null,
        category: savedMeta['system-category'] ?? null,
        keywords: savedMeta['user-keywords'] ?? [],
        author: savedMeta.author ?? null,
        url: baseUrl ? `${baseUrl.replace(/\/$/, '')}${viewPath}` : viewPath,
        ncmVersion: ncm.ncmVersion,
        ncmWarnings
      });
    } catch (err: unknown) {
      logger.error('Error ingesting page markdown:', err);
      return res.status(500).json({ success: false, error: 'Failed to ingest page' });
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

      const isAdmin = await wikiContext.hasPermission('admin-system');
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
      const html = await renderCommentListHtml(
        comments,
        u?.isAuthenticated === true,
        u?.username ?? '',
        (u?.roles ?? []).includes('admin'),
        pageUuid,
        this.engine
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

      const isAdmin = await wikiContext.hasPermission('admin-system');
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

      // #842 — Share Manager summary card (shown under the Add-ons row).
      let shareSummary: { active: number; total: number } | null = null;
      try {
        const shareManager = this.engine.getManager('ShareManager');
        if (shareManager?.isEnabled()) {
          const all = shareManager.list();
          const now = Date.now();
          shareSummary = {
            total: all.length,
            active: all.filter(r => !r.revokedAt && !(r.expiresAt && now > Date.parse(r.expiresAt))).length
          };
        }
      } catch {
        // non-fatal — card just won't show
      }

      // #946 — Agent API Tokens oversight card. Admins may list and revoke any
      // user's tokens (incident response, offboarding) but never mint on
      // someone's behalf, so this is read + revoke only. Summary is computed
      // server-side; the token rows are fetched client-side from
      // /api/tokens?all=true so no token data is embedded in the page.
      let agentTokenSummary: { live: number; owners: number } | null = null;
      try {
        const atm = this.engine.getManager('AgentTokenManager') as
          import('../managers/AgentTokenManager.js').default | null;
        const enabled = this.engine.getManager<{ getProperty(k: string, d: unknown): unknown }>('ConfigurationManager')
          ?.getProperty('ngdpbase.auth.agent-token.enabled', false);
        if (atm && enabled) {
          const live = atm.listAll();
          agentTokenSummary = {
            live: live.length,
            owners: new Set(live.map(t => t.owner)).size
          };
        }
      } catch {
        // non-fatal — card just won't show
      }

      // #780 — registered CatalogSources at runtime (Thread #1, CatalogManager unification).
      // Pure read of in-memory Map; cheap to do per dashboard render.
      let catalogSources: Array<{ sourceId: string; types: readonly string[]; currentSchemaVersion: number; onDiskSchemaVersion?: number; isStale?: boolean }> = [];
      try {
        const catalogManager = this.engine.getManager('CatalogManager') as {
          getSourceInfo?: () => Array<{ sourceId: string; types: readonly string[]; currentSchemaVersion: number }>;
          checkSchemaVersions?: () => Array<{ sourceId: string; currentSchemaVersion: number; onDiskSchemaVersion: number; isStale: boolean }>;
        } | null;
        if (catalogManager?.getSourceInfo) {
          const sources = catalogManager.getSourceInfo();
          const versionReport = catalogManager.checkSchemaVersions?.() ?? [];
          const versionByID = new Map(versionReport.map(v => [v.sourceId, v]));
          catalogSources = sources.map(s => ({
            ...s,
            onDiskSchemaVersion: versionByID.get(s.sourceId)?.onDiskSchemaVersion,
            isStale: versionByID.get(s.sourceId)?.isStale ?? false
          }));
        }
      } catch (catalogErr) {
        logger.warn('[adminDashboard] CatalogManager not available for source listing:', catalogErr);
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
        // #1147: read through the shared resolver, so the dashboard's toggle
        // state matches what the gate and ACLManager are actually enforcing.
        maintenanceMode: resolveMaintenanceState(
          (key, fallback) =>
            this.engine.getManager('ConfigurationManager')?.getProperty?.(key, fallback)
        ).enabled,
        csrfToken: req.session.csrfToken,
        successMessage: req.query.success || null,
        errorMessage: req.query.error || null,
        addonsSummary,
        addonCards,
        shareSummary,
        agentTokenSummary, // #946
        catalogSources,
        // #1109: audit writes are fire-and-forget by design — a failed log must
        // not fail the write it describes, so the log goes incomplete rather
        // than the request breaking. That trade is only defensible if the loss
        // is visible, and the dashboard is where an operator actually lands.
        auditDrops: getAuditDropStats(),
        // #1118: a DIFFERENT failure — not "some events were lost" but "no
        // events are being recorded at all, and the instance did not say so".
        auditPosture: (this.engine.getManager('AuditManager') as {
          getAuditPosture?: () => { provider: string; configured: string; degraded: boolean; reason: string | null };
        } | null)?.getAuditPosture?.() ?? null,

        // #1155: every OTHER manager that is configured, wanted and not
        // working. Thirteen could reach that state and only auditing said so,
        // so a bad backup directory meant backups silently never ran while
        // this page looked entirely healthy. Excludes `disabled`, which is a
        // deliberate choice rather than a fault.
        degradedManagers: (this.engine as unknown as {
          getDegradedManagers?: () => Array<{ manager: string; state: string; reason?: string; configKey?: string }>;
        }).getDegradedManagers?.() ?? []
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

      // #1147: the toggle used to mutate `engine.config.features.maintenance`,
      // an in-memory object nothing persisted — so a restart during
      // maintenance brought the instance back live with nobody told, which is
      // most likely exactly when an operator is mid-migration. It now writes
      // the documented key through ConfigurationManager, which saves to
      // app-custom-config.json, and reads through the same resolver as the
      // gate and ACLManager.
      const configManager = this.engine.getManager('ConfigurationManager');
      const current = resolveMaintenanceState(
        (key, fallback) => configManager?.getProperty?.(key, fallback)
      );
      const enabled = !current.enabled;
      await configManager.setProperty(MAINTENANCE_ENABLED_KEY, enabled, currentUser.username);

      // Shape kept for the notification payload below, which takes the
      // maintenance settings as an object.
      const maintenance = { ...current, enabled };

      // Log the maintenance mode change
      logger.info(
        `Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'} by ${currentUser.username}`,
        {
          action: 'maintenance_mode_toggle',
          newState: enabled,
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
          enabled,
          currentUser.username ?? '',
          maintenance
        );

        logger.info('Maintenance notification created for mode change', {
          action: 'maintenance_notification_created',
          mode: enabled ? 'enabled' : 'disabled',
          triggeredBy: currentUser.username,
          timestamp: new Date().toISOString()
        });
      } catch (notificationError: unknown) {
        logger.error('Failed to create maintenance notification', {
          action: 'maintenance_notification_failed',
          error: getErrorMessage(notificationError),
          mode: enabled ? 'enabled' : 'disabled',
          triggeredBy: currentUser.username,
          timestamp: new Date().toISOString()
        });
      }

      // Create detailed success message
      const action = enabled ? 'ENABLED' : 'DISABLED';
      const message =
        `Maintenance mode has been ${action.toLowerCase()}. ` +
        (enabled
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
      }, { username: currentUser?.username, ipAddress: req.ip });

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

      const success = await userManager.updateUser(username, updates, { username: currentUser?.username, ipAddress: req.ip });

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
      const success = await userManager.deleteUser(username, { username: currentUser?.username, ipAddress: req.ip });

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

      // #1029: viewing the role catalogue is separated from editing it.
      // adminCreateRole / adminUpdateRole / adminDeleteRole all still require
      // `admin-roles`, so a read-only admin can see how permissions are
      // composed — which is the most interesting screen to demonstrate — with
      // no path to granting itself anything.
      if (
        !currentUser ||
        !(await this.hasAdminViewAccess(wikiContext) || await wikiContext.hasPermission('admin-roles'))
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
      if (!currentUser || !(await this.hasAdminViewAccess(wikiContext))) {
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
      const backupPath = await backupManager.createBackup({}, { username: currentUser.username, ipAddress: req.ip });
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
        !(await this.hasAdminViewAccess(wikiContext))
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

      // Secret values are STRIPPED here, not hidden in the view. Nothing on the
      // deny-list is ever serialised into the page, so "view source" reveals
      // nothing and a read-only admin never receives the value at all. An admin
      // who needs one fetches that single key from adminRevealSecret below.
      const secretKeys = this.getSecretConfigKeys();
      const strip = (props: unknown): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries((props ?? {}) as Record<string, unknown>)) {
          out[k] = secretKeys.has(k) ? null : v;
        }
        return out;
      };

      const defaultProperties = strip(configManager.getDefaultProperties());
      const customProperties = strip(configManager.getCustomProperties());
      const merged = (configManager.getAllProperties() ?? {}) as Record<string, unknown>;
      const mergedProperties = strip(merged);

      // "Is this configured?" is the question an operator actually has, and it
      // must be answerable WITHOUT revealing anything — otherwise checking
      // whether SMTP is set up means unmasking a live credential. Borrowed from
      // yourphr's Secret.IsSet().
      const secretIsSet: Record<string, boolean> = {};
      for (const k of secretKeys) {
        const v = merged[k];
        // Deliberately no String(v): an object would stringify to
        // "[object Object]" and read as "configured" on the strength of a
        // placeholder. Only a genuine scalar value counts as set.
        secretIsSet[k] = v !== undefined && v !== null && v !== '';
      }

      // #1089: which keys the environment owns, and what is actually in force
      // for each. The screen previously rendered `mergedConfig` — the raw JSON —
      // while getProperty returned the environment value, so the READ side was
      // wrong before anyone edited anything.
      const envControlledKeys = configManager.getEnvControlledKeys?.() ?? {};
      const envControlled: Record<string, { envVar: string; source: string; effective: unknown }> = {};
      for (const [key, envVar] of Object.entries(envControlledKeys)) {
        const described = configManager.describeProperty?.(key);
        envControlled[key] = {
          envVar,
          source: described?.source ?? 'config',
          // Never leak a secret's value into the page — the same deny-list that
          // strips them above applies here.
          effective: secretKeys.has(key) ? null : described?.effective ?? null
        };
      }

      const commonData = await this.getCommonTemplateData(req);

      const templateData = {
        ...commonData,
        title: 'Configuration Management',
        message: req.query.success,
        error: req.query.error,
        defaultProperties,
        customProperties,
        mergedProperties,
        envControlled,
        secretKeys: Array.from(secretKeys),
        secretIsSet,
        // NOT hasAdminViewAccess: revealing a secret is a privileged action,
        // not part of viewing the screen. A read-only admin (#1029) sees every
        // value masked with no reveal control, and adminRevealSecret refuses
        // them server-side even if they forge the request.
        canRevealSecrets: await wikiContext.hasPermission('admin-system'),

        // #1162 moved the Security Posture here from the dashboard, where an
        // operator deciding what to change is already looking.
        //
        // Gated SEPARATELY from the page (D18). This screen admits admin-read,
        // and the posture must not: it is a map of the instance's defences —
        // egress ranges, throttle thresholds, whether sanitisation is on — and
        // demo-admin holds admin-read precisely so a public demo can expose
        // every admin screen to visitors.
        securityPosture: (await wikiContext.hasPermission('admin-system'))
          ? resolvePosture((key, fallback) => configManager?.getProperty?.(key, fallback))
          : null,
        csrfToken: req.session.csrfToken
      };

      res.render('admin-configuration', templateData);
    } catch (err: unknown) {
      logger.error('Error loading admin configuration:', err);
      res.status(500).send('Error loading configuration management');
    }
  }

  /**
   * Add or remove a security-posture ingredient (#1159).
   *
   * D4: the set is not fixed — an operator decides what is security-relevant
   * for their deployment. Until now the only way to do it was hand-editing
   * app-custom-config.json.
   *
   * Written through setProperty(), so the change is audited like any other
   * (#1150) rather than needing its own trail.
   */
  async adminPostureIngredient(req: Request, res: Response) {
    const back = (params: string) => res.redirect(`/admin/configuration?${params}#security-posture`);
    try {
      const wikiContext = this.createWikiContext(req);

      // #1159: admin-system, matching the section itself (D18). Not the page's
      // gate, which admits admin-read.
      if (
        !wikiContext.userContext?.isAuthenticated ||
        !(await wikiContext.hasPermission('admin-system'))
      ) {
        return res.status(403).send('Access denied');
      }

      const body = req.body as { key?: string; group?: string; action?: string };
      const key = typeof body.key === 'string' ? body.key.trim() : '';
      const action = body.action === 'remove' ? 'remove' : 'add';
      if (key === '') {
        return back('error=' + encodeURIComponent('No configuration key was given.'));
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const posture = { ...(configManager?.getProperty?.(POSTURE_KEY, {}) as Record<string, unknown>) };

      if (action === 'remove') {
        // An explicit null, not a delete: the shipped posture lives in
        // app-default-config.json and a merge cannot express a deletion any
        // other way. Removing changes NO value — the key keeps what it is set
        // to and the code keeps reading it (D4).
        posture[key] = null;
        await configManager.setProperty(POSTURE_KEY, posture, wikiContext.userContext?.username);
        return back('success=' + encodeURIComponent(
          `"${key}" removed from the posture view. Its value is unchanged — nothing was turned off.`
        ));
      }

      // Refusing rather than masking: resolvePosture() masks a secret
      // defensively, but OFFERING to add one invites the mistake.
      if (this.getSecretConfigKeys().has(key)) {
        return back('error=' + encodeURIComponent(
          `"${key}" holds a secret and cannot be added to the posture — its value would never be shown anyway.`
        ));
      }

      const group = typeof body.group === 'string' && body.group.trim() !== ''
        ? body.group.trim()
        : 'Other';
      posture[key] = { group, restart: false };
      await configManager.setProperty(POSTURE_KEY, posture, wikiContext.userContext?.username);

      // A WARNING, not a refusal. A typo should be visible at once, but an
      // addon may legitimately contribute a key this instance does not ship.
      const unknown = configManager?.getProperty?.(key, undefined) === undefined;
      return back('success=' + encodeURIComponent(
        `"${key}" added to the posture view under ${group}.` +
        (unknown ? ' NOTE: nothing on this instance currently defines that key — check the spelling.' : '')
      ));
    } catch (err: unknown) {
      logger.error('Error updating the security posture', { error: getErrorMessage(err) });
      return back('error=' + encodeURIComponent('Failed to update the security posture.'));
    }
  }

  /**
   * Config keys whose values must never be rendered on the configuration screen.
   *
   * A deny-list rather than a pattern match, deliberately: `*password*` would
   * also catch `application.registration.password` and `auth.password.enabled`,
   * both booleans. Masking those teaches an operator to click "reveal" without
   * thinking, which is the failure this is meant to prevent.
   */
  private getSecretConfigKeys(): Set<string> {
    const configManager = this.engine.getManager('ConfigurationManager');
    const keys = configManager?.getProperty('ngdpbase.config.secret-keys', []);
    if (!Array.isArray(keys)) return new Set();

    // Trimmed and de-duplicated, but NOT lowercased: ngdpbase config keys are
    // case-sensitive and include camelCase (`ngdpbase.dawarichCompat.apiKey`),
    // so normalising case here would silently stop matching them.
    return new Set(
      keys
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k !== '')
    );
  }

  /**
   * Reveal one secret config value — GET /api/admin/config/secret/:key
   *
   * Deliberately one key per request, fetched on demand. The alternative —
   * shipping every value and hiding it behind `type="password"` — puts the
   * secret in the HTML, where view-source defeats it entirely.
   *
   * Requires `admin-system`, so a read-only admin (`admin-read`) can see the
   * configuration screen with secrets masked but has no way to unmask one.
   * Every reveal is logged with the requesting user.
   */
  async adminRevealSecret(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        res.status(403).json({ success: false, error: 'Permission denied' });
        return;
      }

      const key = req.params.key;
      if (!this.getSecretConfigKeys().has(key)) {
        // Only keys on the deny-list are readable here. Without this the route
        // would be a general config-read API that bypasses the screen entirely.
        res.status(404).json({ success: false, error: 'Not a masked configuration key' });
        return;
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      const value: unknown = configManager?.getProperty(key, '');

      logger.info(`🔓 [adminRevealSecret] ${currentUser.username} revealed config key: ${key}`);
      // #1215: a masked value was shown to a person. The key is recorded, the
      // value never is. Recorded here because there is no manager door for a
      // read of one configuration value.
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.SECRET_REVEAL,
        user: currentUser.username ?? 'unknown',
        ipAddress: req.ip,
        action: 'secret-reveal',
        result: 'success',
        severity: 'high',
        resource: key,
        resourceType: 'config-key',
        metadata: { key }
      }, (err) => logger.warn(`Audit log failed for secret-reveal of '${key}':`, err));

      // A secret is a scalar in every real case; JSON for anything else beats
      // "[object Object]", which would look like a value and is not one.
      const rendered =
        value === null || value === undefined ? ''
          : typeof value === 'string' ? value
            : typeof value === 'number' || typeof value === 'boolean' ? String(value)
              : JSON.stringify(value) ?? '';

      res.json({ success: true, key, value: rendered });
    } catch (err: unknown) {
      logger.error('Error revealing configuration secret:', err);
      res.status(500).json({ success: false, error: 'Failed to read configuration value' });
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
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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

      // #1089: a key the environment owns is never writable here. Refused
      // UNCONDITIONALLY — not "when the variable happens to be set" — because a
      // conditional would make this screen the source of truth whenever the
      // variable is absent, which is the ambiguity the declared map removes.
      // The disabled input handles the honest case; this is the backstop for a
      // forged or scripted request.
      const envOwned = configManager.getEnvControlledKeys?.() ?? {};
      if (envOwned[property]) {
        const envVar = envOwned[property];
        const detail =
          property === 'ngdpbase.application.base-url'
            ? `Set ${envVar} in .env (root or <FAST_STORAGE>/.env), or set this key in app-custom-config.json, then restart.`
            : `Set ${envVar} in .env (root or <FAST_STORAGE>/.env) and restart.`;
        return res.status(409).json({
          error: `'${property}' is controlled by the environment variable ${envVar}`,
          reason: detail
        });
      }

      // Attempt JSON parse so array/object values entered in the UI (e.g. ["/a","/b"]) are
      // stored as native JSON types rather than raw strings.
      let parsedValue: unknown = value;
      if (typeof value === 'string') {
        try { parsedValue = JSON.parse(value); } catch { /* keep as string */ }
      }
      await configManager.setProperty(property, parsedValue, this.createWikiContext(req).userContext?.username);

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
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
      }

      const configManager = this.engine.getManager('ConfigurationManager');
      await configManager.resetToDefaults({ username: wikiContext.userContext?.username, ipAddress: req.ip });
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
      // #1052: same defect as /admin/keywords, on a second route. This builds
      // its payload from scratch, so admin-variables.ejs — which calls
      // `lockedUnless` — threw on the test-variables POST. Found by the
      // invariant test added for #1052 rather than by another bug report.
      const templateData = {
        ...(await this.getCommonTemplateData(req)),
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
        !(await this.hasAdminViewAccess(wikiContext))
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
      const runId = await jobManager.enqueue('pages.reindex', jobContextFromRequest(req.userContext));
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
      if (!currentUser || !(await this.hasAdminViewAccess(wikiContext))) {
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
        !(await this.hasAdminViewAccess(wikiContext))
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
            const sourcePath = path.join(pagesDir, file);
            const sourceContent: string = await fse.readFile(sourcePath, 'utf8');

            // #964: an addon page's identity is its FRONTMATTER uuid, never its
            // filename. Addon sources ship under descriptive, human-reviewable
            // names (`geohazardwatch-hans.md`) — unlike `required-pages/`, where
            // the filename genuinely is the uuid. Deriving the uuid from the
            // filename produced a fake identity like "geohazardwatch-hans" and
            // then compared against `data/pages/geohazardwatch-hans.md`, a path
            // that never exists, so every addon page showed as `new` forever and
            // syncing wrote a duplicate under the wrong filename.
            let uuid = WikiRoutes.addonSourceUuid(sourceContent);
            let title = file;
            let slug = '';
            let lastModified = '';
            try {
              const { data } = matter(sourceContent);
              title = (data.title as string) || file;
              slug = (data.slug as string) || '';
              lastModified = (data.lastModified as string) || '';
            } catch { /* use defaults */ }
            uuid = uuid || '';

            if (!uuid) {
              // Mandatory and addon-owned (#951). Without it there is nothing to
              // compare against, so skip rather than invent an identity.
              logger.warn(`[admin/required-pages] Skipping ${addonName}/pages/${file} — no frontmatter uuid (#964)`);
              continue;
            }
            if (!lastModified) {
              try {
                const stat = await fse.stat(sourcePath);
                lastModified = stat.mtime.toISOString();
              } catch { /* leave empty */ }
            }

            // The instance store is uuid-named, so the destination is
            // `<uuid>.md` — not the addon's source filename.
            const destPath = path.join(pagesDirResolved, `${uuid}.md`);
            let status: 'new' | 'modified' | 'current';
            let userModified = false;

            if (!(await fse.pathExists(destPath))) {
              status = 'new';
            } else {
              const destContent: string = await fse.readFile(destPath, 'utf8');
              const destParsed = matter(destContent) as { data: Record<string, unknown>; content: string };
              const srcParsed = matter(sourceContent) as { data: Record<string, unknown>; content: string };
              // #931: identical evaluator + body-only hash the boot pass uses, so
              // the sync-UI status and the on-boot reseed can never disagree.
              // `locally-modified` (hash differs from the seed stamp) OR an explicit
              // `user-modified` flag both mark the page as edit-protected here.
              const seedStatus = evaluateSeededAddonPage({
                sourceContent: srcParsed.content,
                liveContent: destParsed.content,
                storedHash: typeof destParsed.data['addon-source-hash'] === 'string'
                  ? (destParsed.data['addon-source-hash'])
                  : undefined
              });
              userModified = destParsed.data['user-modified'] === true || seedStatus === 'locally-modified';
              status = seedStatus === 'current' ? 'current' : 'modified';
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

      // #930: addon pages whose source the addon no longer ships ("source
      // removed"). Leave-and-flag — surfaced for the operator, never auto-deleted.
      let orphanedAddonPages: Array<{ addonName: string; uuid: string; slug: string; title: string; userModified: boolean }> = [];
      if (addonsManager) {
        try {
          orphanedAddonPages = await addonsManager.findOrphanedAddonPages();
        } catch (orphanErr) {
          logger.warn(`[adminRequiredPages] orphan detection failed: ${String(orphanErr)}`);
        }
      }

      const commonData = await this.getCommonTemplateData(req);
      return res.render('admin-required-pages', {
        ...commonData,
        title: 'Required Pages Sync',
        comparison,
        counts,
        addonComparison,
        addonCounts,
        orphanedAddonPages,
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
        removeOrphans?: string[];
      };
      const uuids = Array.isArray(body.uuids) ? body.uuids : [];
      const forceSync = body.force === true;
      const reconcileItems = Array.isArray(body.reconcile) ? body.reconcile : [];
      const adoptItems = Array.isArray(body.adoptUuid) ? body.adoptUuid : [];
      const pushToSourceUuids = Array.isArray(body.pushToSource) ? body.pushToSource : [];
      const removeOrphanUuids = Array.isArray(body.removeOrphans) ? body.removeOrphans : [];

      if (uuids.length === 0 && reconcileItems.length === 0 && adoptItems.length === 0 && pushToSourceUuids.length === 0 && removeOrphanUuids.length === 0) {
        return res.status(400).json({ success: false, error: 'No pages selected' });
      }

      await fse.ensureDir(pagesDirResolved);

      // Build a combined UUID → source-file-path map covering both required-pages/ and
      // enabled addon pages/ directories. Required-pages takes precedence on collision.
      const sourceFileMap = new Map<string, string>();
      // #931: which UUIDs are addon-sourced (→ addon name), so the sync stamps
      // `addon` + `addon-source-hash` on write and uses hash-based edit
      // protection — keeping the UI apply consistent with the boot reseed.
      const addonSourceUuids = new Map<string, string>();
      const addonsManagerPost = this.engine.getManager('AddonsManager');
      if (addonsManagerPost) {
        for (const { name: addonName, pagesDir } of addonsManagerPost.getEnabledAddonPagesDirectories()) {
          if (await fse.pathExists(pagesDir)) {
            for (const f of (await fse.readdir(pagesDir))) {
              if (!f.endsWith('.md')) continue;
              // #964: key on the frontmatter uuid, not the source filename.
              const full = path.join(pagesDir, f);
              const u = WikiRoutes.addonSourceUuid(await fse.readFile(full, 'utf8'));
              if (!u) {
                logger.warn(`[admin/required-pages] Skipping ${addonName}/pages/${f} — no frontmatter uuid (#964)`);
                continue;
              }
              sourceFileMap.set(u, full);
              addonSourceUuids.set(u, addonName);
            }
          }
        }
      }
      // Required-pages overrides addon pages on UUID collision (and reclaims the
      // identity — such a UUID is treated as a required page, not an addon one).
      for (const f of (await fse.readdir(requiredDirResolved))) {
        if (f.endsWith('.md')) {
          const u = path.basename(f, '.md');
          sourceFileMap.set(u, path.join(requiredDirResolved, f));
          addonSourceUuids.delete(u);
        }
      }

      const synced: string[] = [];
      const protected_: string[] = [];

      /**
       * Write source content to dest, stripping user-modified so a synced page
       * immediately shows as 'current' on the next Required Pages Sync load.
       */
      const syncFile = async (srcPath: string, dstPath: string, addonName?: string): Promise<void> => {
        const raw: string = await fse.readFile(srcPath, 'utf8');
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        delete parsed.data['user-modified'];
        // #931: for an addon-sourced page, stamp the provenance + content hash the
        // boot reseed relies on, so a UI sync leaves the page in the same state a
        // boot reseed would (otherwise the next boot sees it as legacy/unstamped).
        if (addonName) {
          parsed.data['addon'] = addonName;
          parsed.data['addon-source-hash'] = pageSourceHash(parsed.content);
          if (!parsed.data['system-category']) parsed.data['system-category'] = 'addon';
        }
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
        const addonName = addonSourceUuids.get(uuid);

        if (await fse.pathExists(sourcePath)) {
          if (!forceSync && await fse.pathExists(destPath)) {
            const liveRaw: string = await fse.readFile(destPath, 'utf8');
            const liveParsed = matter(liveRaw) as { data: Record<string, unknown>; content: string };
            let isProtected = liveParsed.data['user-modified'] === true;
            // #931: addon pages are also protected when the live body diverges
            // from the seed stamp (hash-based, same signal the boot pass + UI use)
            // — not only when the explicit user-modified flag is set.
            if (!isProtected && addonName) {
              const srcParsed = matter(await fse.readFile(sourcePath, 'utf8')) as { data: Record<string, unknown>; content: string };
              const st = evaluateSeededAddonPage({
                sourceContent: srcParsed.content,
                liveContent: liveParsed.content,
                storedHash: typeof liveParsed.data['addon-source-hash'] === 'string'
                  ? (liveParsed.data['addon-source-hash'])
                  : undefined
              });
              isProtected = st === 'locally-modified';
            }
            if (isProtected) {
              protected_.push(uuid);
              continue;
            }
          }
          await syncFile(sourcePath, destPath, addonName);
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
            // #1107: version history is stored per-UUID, so it must travel with
            // the page. Without this the tree kept the OLD uuid while the page
            // answered to the new one — and renamePageInIndex below copies the
            // index entry wholesale, carrying `currentVersion` and `hasVersions`
            // across to describe a tree that was not there. The index asserted
            // history nobody could read.
            //
            // Moved BEFORE the old file is removed, so a failure here leaves the
            // page recoverable rather than half-adopted.
            const oldVersionsDir = path.join(pagesDirResolved, 'versions', liveUuid);
            const newVersionsDir = path.join(pagesDirResolved, 'versions', sourceUuid);
            if (await fse.pathExists(oldVersionsDir)) {
              if (await fse.pathExists(newVersionsDir)) {
                // Two histories cannot be interleaved without inventing an order
                // for edits that never shared one. Refuse and report, as orphan
                // removal does when its precondition fails.
                logger.warn(
                  `[adminSyncRequiredPages] refused version-history move ${liveUuid} → ${sourceUuid} ` +
                  '— a version tree already exists at the destination; both left in place'
                );
              } else {
                await fse.move(oldVersionsDir, newVersionsDir);
                const manifestPath = path.join(newVersionsDir, 'manifest.json');
                try {
                  const manifest = await fse.readJson(manifestPath) as Record<string, unknown>;
                  manifest.pageId = sourceUuid;
                  await fse.writeJson(manifestPath, manifest, { spaces: 2 });
                } catch (err) {
                  // The tree moved; a manifest we could not rewrite still points
                  // at the old id. Say so rather than failing the adopt.
                  logger.warn(
                    `[adminSyncRequiredPages] moved version history for ${sourceUuid} but could not rewrite its manifest pageId:`,
                    err
                  );
                }
                logger.info(`[adminSyncRequiredPages] moved version history ${liveUuid} → ${sourceUuid}`);
              }
            }

            // Remove old NAS file if it existed there
            if (removeOldData) {
              await fse.remove(oldDataPath);
              // #1107: this step destroys data and used to be silent, while the
              // cosmetic required-pages cleanup below was logged.
              logger.info(`[adminSyncRequiredPages] removed superseded page file ${liveUuid} (adopted as ${sourceUuid})`);
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

      // #930: opt-in removal of orphaned addon pages (source removed). Re-verify
      // each is CURRENTLY an orphan server-side before deleting — never trust the
      // client list — and delete via PageManager so a revertable version is kept.
      const removedOrphans: string[] = [];
      if (removeOrphanUuids.length > 0) {
        const addonsMgr = this.engine.getManager('AddonsManager');
        const currentOrphans = addonsMgr ? await addonsMgr.findOrphanedAddonPages() : [];
        const orphanUuidSet = new Set(currentOrphans.map((o: { uuid: string }) => o.uuid));
        const pm = this.engine.getManager('PageManager');
        for (const uuid of removeOrphanUuids) {
          if (!orphanUuidSet.has(uuid)) {
            logger.warn(`[adminSyncRequiredPages] refused orphan removal for ${uuid} — not currently a source-removed addon page`);
            continue;
          }
          if (await pm.deletePage(uuid)) {
            removedOrphans.push(uuid);
            logger.info(`[adminSyncRequiredPages] removed orphaned addon page ${uuid} by ${currentUser.username}`);
          }
        }
      }

      const pageManager = this.engine.getManager('PageManager');
      await pageManager.refreshPageList();

      // #1040: evict every page this sync touched.
      //
      // The writes above go straight to disk through fse.writeFile rather than
      // PageManager.savePage. That bypass is deliberate — seeding must not run
      // the save-time content gate (see PageManager.ts:35, kept that way by
      // #1037) — but savePage is also what invalidates the caches, so nothing
      // did. The endpoint returned "N pages synced" while every reader kept
      // getting the pre-sync render until the next restart, with nothing in the
      // UI to suggest one was needed. Worst on exactly the page an operator is
      // trying to correct.
      //
      // refreshPageList() above rebuilds the page LIST; it does not touch the
      // per-page content cache or the rendered-pages region. invalidatePageCache
      // covers both, plus the rendering handler cache.
      //
      // Old UUIDs from reconcile/adopt are included: their files were removed,
      // so a cached render of the old identity would outlive the file.
      const touched = new Set<string>([...synced, ...removedOrphans]);
      for (const { liveUuid } of adoptedUuids) touched.add(liveUuid);
      for (const { liveUuid } of reconcileItems) touched.add(liveUuid);
      for (const identifier of touched) {
        try {
          pageManager.invalidatePageCache(identifier);
        } catch (err: unknown) {
          // Best-effort: a page that cannot be evicted must not fail the sync
          // that already wrote it to disk.
          logger.warn(`[adminSyncRequiredPages] cache eviction failed for ${identifier}:`, err);
        }
      }

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
      if (removedOrphans.length > 0) parts.push(`${removedOrphans.length} orphaned addon page${removedOrphans.length !== 1 ? 's' : ''} removed`);

      return res.json({
        success: true,
        message: parts.join('; ') || 'Nothing to sync',
        synced: synced.length,
        uuids: synced,
        protected: protected_,
        removedOrphans
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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

      // #738: load the last N per-run summaries for the trend view. Best-effort
      // — if the directory doesn't exist yet (first install or no imports yet)
      // listRecentRuns returns [] and the trend section renders empty.
      const configManager = this.engine.getManager('ConfigurationManager');
      const runsDir = configManager?.getResolvedDataPath?.('ngdpbase.import.runs-dir', './data/import-runs') as string | undefined;
      const { listRecentRuns } = await import('../utils/importRunSummary.js');
      const recentRuns = runsDir ? await listRecentRuns(runsDir, 10) : [];

      return res.render('admin-import', {
        ...commonData,
        title: 'Import Pages',
        converters,
        recentRuns,
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

      // #1198: asset-delete is held by exactly the roles this gate named; the
      // attachment admin surface is where attachments are managed and removed.
      if (!(await wikiContext.hasPermission('asset-delete'))) {
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
  /**
   * GET /admin/attachments/health (#865 Slice 2) — on-demand attachment
   * health report: orphans, recordless disk files, missing-file records,
   * broken markup references, loose text references. Read-only; walks all
   * page content (seconds on large instances), so fetched via button, not
   * on page load.
   */
  async adminAttachmentsHealth(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!(await wikiContext.hasPermission('asset-delete'))) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const attachmentManager = this.engine.getManager('AttachmentManager') as {
        getHealthReport?: () => Promise<unknown>;
      } | undefined;
      if (!attachmentManager?.getHealthReport) {
        return res.status(503).json({ success: false, error: 'AttachmentManager unavailable' });
      }
      const report = await attachmentManager.getHealthReport();
      return res.json({ success: true, report });
    } catch (err: unknown) {
      logger.error('Error building attachment health report:', err);
      return res.status(500).json({ success: false, error: 'Failed to build health report' });
    }
  }

  /**
   * POST /admin/attachments/quarantine (#865 Slice 3) — guarded orphan
   * cleanup. Admin ONLY (stricter than the read-only report). Body:
   * { dryRun, includeOrphans, includeRecordless }. The orphan/recordless
   * sets are recomputed server-side — client selections are never trusted.
   * Files move to <storage>/quarantine/ (reversible), never hard-deleted.
   */
  async adminAttachmentsQuarantine(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const attachmentManager = this.engine.getManager('AttachmentManager') as {
        quarantineOrphans?: (o: { dryRun: boolean; includeOrphans: boolean; includeRecordless: boolean }) => Promise<unknown>;
      } | undefined;
      if (!attachmentManager?.quarantineOrphans) {
        return res.status(503).json({ success: false, error: 'AttachmentManager unavailable' });
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await attachmentManager.quarantineOrphans({
        dryRun: body.dryRun !== false, // default DRY RUN — real run requires explicit dryRun:false
        includeOrphans: body.includeOrphans !== false,
        includeRecordless: body.includeRecordless !== false
      });
      return res.json({ success: true, result });
    } catch (err: unknown) {
      logger.error('Error running attachment quarantine:', err);
      return res.status(500).json({ success: false, error: 'Quarantine run failed' });
    }
  }

  async adminAttachmentsApi(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);

      if (!(await wikiContext.hasPermission('asset-delete'))) {
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

      // #1198: asset-upload is what the contributing roles hold; browsing the
      // asset library is the surface for those who add to it.
      if (!(await wikiContext.hasPermission('asset-upload'))) {
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
        // #1059: search-page gates the page source; a caller lacking it gets
        // no page hits, silently — same shape as the users branch below.
        if (!mimeCategory && !year && searchManager?.advancedSearchWithContext
          && await wikiContext.hasPermission('search-page')) {
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
        if (assetService && (await wikiContext.hasPermission('asset-upload'))) {
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

      // Auth model (#696, #1059):
      //   types=page  → search-page permission (anonymous holds it in the
      //                 default catalogue); SearchManager then filters
      //                 per-page ACL via wikiContext.
      //   types=user  → handled inside the user branch (search-user permission).
      //   anything else (attachments, media) → editor surface, keep the
      //                 editor/contributor/admin gate.
      const needsEditorRole = typesParam !== 'page' && typesParam !== 'user';
      if (needsEditorRole && !(await wikiContext.hasPermission('asset-upload'))) {
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
        // #1059: search-page gates page search (anonymous holds it in the
        // default catalogue). SearchManager's per-page ACL filter still runs
        // below — this decides whether the caller may search at all.
        if (!(await wikiContext.hasPermission('search-page'))) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
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

        // #893: editorial lifecycle status filter (draft/review/published).
        // Pages without a status count as published (provider contract).
        const rawStatuses = req.query.status;
        const statuses = (Array.isArray(rawStatuses)
          ? rawStatuses.filter((s): s is string => typeof s === 'string')
          : typeof rawStatuses === 'string' ? [rawStatuses] : []
        ).filter(s => s.trim() !== '');

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
            ...(statuses.length ? { statuses } : {}),
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

      // Source values are provider ids now that the picker dropdown is built
      // from the AssetManager registry. `attachment` / `media` still resolve —
      // bookmarks, the legacy `tab=` param and saved picker state use them.
      // Unknown ids are dropped rather than passed through, so a stale
      // bookmark degrades to an all-provider search instead of an empty one.
      //
      // Validation falls back to the two built-in providers when the registry
      // is unavailable. Without that floor, an unreachable AssetManager would
      // filter out every value and silently disable the source filter — a
      // worse failure than the one this dropdown change set out to fix.
      const registeredIds = this.getPickerAssetSources().map(s => s.id);
      const knownProviderIds = new Set(
        registeredIds.length > 0 ? registeredIds : ['local', 'media-library']
      );
      const providerIds = typesParam
        ? typesParam.split(',')
          .map(t => WikiRoutes.normalizeAssetSource(t.trim()))
          .filter(t => knownProviderIds.has(t))
        : undefined;
      const types = providerIds && providerIds.length > 0 ? providerIds : undefined;
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

      if (!(await wikiContext.hasPermission('asset-upload'))) {
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

      // #1198: asset-delete is the permission this action is; AttachmentManager
      // checks it again at the door, so this is the same authority twice, not two.
      if (!(await wikiContext.hasPermission('asset-delete'))) {
        return res.status(403).json({ success: false, error: 'asset-delete permission required to delete attachments' });
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

      const { sourceDir, format, limit, generateUUIDs, conflictPolicy } = req.body;

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
        generateUUIDs: generateUUIDs !== false,
        conflictPolicy: conflictPolicy === 'overwrite' ? 'overwrite' : 'skip',
        actor: currentUser.username,
        // #1179: the identity itself, not just its name — a string cannot carry
        // the delegation, and the attachment upload needs one to authorise.
        actorContext: currentUser
      });

      // On failure, surface the per-file messages as a top-level `error` too —
      // the dialog in admin-import.ejs only shows `error` (#815).
      const errorSummary = !result.success && result.errors.length
        ? result.errors.map((e: { file?: string; message: string }) =>
          e.file ? `${e.file}: ${e.message}` : e.message
        ).slice(0, 5).join('; ')
        : undefined;

      return res.json({
        success: result.success,
        files: result.files,
        converted: result.converted,
        skipped: result.skipped,
        failed: result.failed,
        errors: result.errors,
        ...(errorSummary ? { error: errorSummary } : {})
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

      const { sourceDir, format, limit, generateUUIDs, conflictPolicy } = req.body;

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
        dryRun: false,
        conflictPolicy: conflictPolicy === 'overwrite' ? 'overwrite' : 'skip',
        actor: currentUser.username,
        // #1179: the identity itself, not just its name — a string cannot carry
        // the delegation, and the attachment upload needs one to authorise.
        actorContext: currentUser
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

      const { sourceDir, format, limit, generateUUIDs, conflictPolicy } = req.body;

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
        conflictPolicy: conflictPolicy === 'overwrite' ? 'overwrite' : 'skip',
        actor: currentUser.username,
        // #1179: the identity itself, not just its name — a string cannot carry
        // the delegation, and the attachment upload needs one to authorise.
        actorContext: currentUser,
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

    // #1133: the URL comes from an <img src> in page content and the gate is
    // the page's own edit ACL (#1127), so this fetch is a capability the editor
    // does not otherwise have — the ability to make the server issue a request
    // from inside the network. guardedFetch judges the address actually
    // resolved, on every redirect hop; a bare fetch with redirect:'follow'
    // could be sent to 169.254.169.254 by a two-line page edit.
    const egress = resolveEgressPolicy((key, fallback) => cm?.getProperty?.(key, fallback));

    const deps: NcmImageDeps = {
      fetchBytes: async (url: string, timeoutMs: number): Promise<Buffer> => {
        const r = await guardedFetch(url, {
          policy: egress.policy,
          headers: { 'User-Agent': 'ngdpbase/1.0 (NCM image)' },
          timeoutMs,
          maxBytes
        });
        if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
        return r.body;
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
      if (!wikiContext.userContext || !(await this.hasAdminViewAccess(wikiContext))) {
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
      const pageName = (req.body as { page?: string }).page;
      if (!pageName) {
        return res.status(400).json({ success: false, error: 'page is required' });
      }
      const pageManager = this.engine.getManager<import('../managers/PageManager.js').default>('PageManager');
      const page = await pageManager?.getPage(pageName);
      if (!page) {
        return res.status(404).json({ success: false, error: `Page not found: ${pageName}` });
      }
      // #1127: converting IS an edit — anyone who may edit the page could
      // paste the converted text by hand — so the gate is the page's own
      // edit ACL, not admin-system. Lets the editor "More.." entry work for
      // page authors while the /admin/convert tool keeps its admin page gate.
      const wikiContext = await this.convertEditContext(req, pageName, page);
      if (!wikiContext) {
        return res.status(403).json({ success: false, error: 'You do not have permission to convert this page' });
      }
      const original = matter.stringify(page.content, page.metadata);
      const ncm = normalizeExistingPageToNcm(original);
      // S5a-ii: dry-run image localization (preview must not persist).
      const img = await this.localizePageImages(ncm.content, pageName, wikiContext.userContext, true);
      // #1125: dry-run footnote transfer — the preview shows the body with
      // definitions moved to the footnote list, but writes nothing.
      const fn = await this.transferPageFootnotes(
        img.content, page.metadata?.uuid, wikiContext.userContext?.username ?? 'unknown', true
      );
      return res.json({
        success: true,
        page: pageName,
        changed: fn.content !== original,
        ncmVersion: ncm.ncmVersion,
        original,
        proposed: fn.content,
        warnings: [...ncm.warnings.map(w => `${w.kind}: ${w.detail}`), ...img.warnings, ...fn.warnings]
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
      const pageName = (req.body as { page?: string }).page;
      if (!pageName) {
        return res.status(400).json({ success: false, error: 'page is required' });
      }
      const pageManager = this.engine.getManager<import('../managers/PageManager.js').default>('PageManager');
      const page = await pageManager?.getPage(pageName);
      if (!page) {
        return res.status(404).json({ success: false, error: `Page not found: ${pageName}` });
      }
      // #1127: page-edit ACL, same reasoning as the preview gate.
      const wikiContext = await this.convertEditContext(req, pageName, page);
      if (!wikiContext) {
        return res.status(403).json({ success: false, error: 'You do not have permission to convert this page' });
      }
      const original = matter.stringify(page.content, page.metadata);
      const ncm = normalizeExistingPageToNcm(original);
      // S5a-ii: real image localization (persists attachments via AttachmentManager).
      const img = await this.localizePageImages(ncm.content, pageName, wikiContext.userContext, false);
      // #1125: real footnote transfer — definitions land in the sidecar list.
      const fn = await this.transferPageFootnotes(
        img.content, page.metadata?.uuid, wikiContext.userContext?.username ?? 'unknown', false
      );
      const warnings = [...ncm.warnings.map(w => `${w.kind}: ${w.detail}`), ...img.warnings, ...fn.warnings];
      if (fn.content === original) {
        return res.json({ success: true, page: pageName, changed: false, warnings });
      }
      const split = matter(fn.content);
      // #1127: through the door WITH the user — savePage would audit this
      // write as 'system', and the person who converted is exactly what the
      // record is for.
      (wikiContext as unknown as { content: string | null }).content = split.content;
      await pageManager?.savePageWithContext(
        wikiContext as unknown as Parameters<NonNullable<typeof pageManager>['savePageWithContext']>[0],
        split.data,
        { audit: { ipAddress: req.ip } }
      );
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
   * #1125: transfer `[^id]: text` definitions from a page body into the
   * FootnoteManager sidecar (the footnote list with the CRUD UI), leaving
   * the `[^id]` refs in place and appending a [{FootnotesPlugin}] section
   * when the page has none. The pure extraction lives in
   * converters/ncm/footnotes.ts; this owns the side effect, mirroring the
   * image-localization split. dryRun reports without writing.
   *
   * An id already present in the sidecar is NOT clobbered: the body
   * definition stays where it is and a warning names the collision.
   */
  private async transferPageFootnotes(
    content: string,
    pageUuid: string | undefined,
    username: string,
    dryRun: boolean
  ): Promise<{ content: string; warnings: string[] }> {
    // #1126: FootnoteManager.transferFromContent is THE implementation —
    // convert, ingest, and import all delegate there so the funnel cannot
    // drift per-path.
    const footnoteManager = this.engine.getManager('FootnoteManager') as
      | { isEnabled?: () => boolean; transferFromContent?: (uuid: string, content: string, by: string, dryRun: boolean) => Promise<{ content: string; warnings: string[] }> }
      | null;
    if (!pageUuid || !footnoteManager?.isEnabled?.() || !footnoteManager.transferFromContent) {
      return { content, warnings: [] };
    }
    return footnoteManager.transferFromContent(pageUuid, content, username, dryRun);
  }

  /**
   * #1127: resolve the request into a WikiContext holding the target page,
   * or null when the caller may not edit it. The shared gate for the two
   * convert endpoints — the ACL evaluator gets the page's metadata and
   * content so audience/private rules apply exactly as they do on /save.
   */
  private async convertEditContext(
    req: Request,
    pageName: string,
    page: { content: string; metadata: Record<string, unknown> }
  ): Promise<ReturnType<WikiRoutes['createWikiContext']> | null> {
    const wikiContext = this.createWikiContext(req, {
      context: WikiContext.CONTEXT.EDIT,
      pageName
    });
    if (!wikiContext.userContext) return null;
    (wikiContext as unknown as { pageMetadata: unknown }).pageMetadata = page.metadata;
    (wikiContext as unknown as { content: string | null }).content = page.content;
    const aclManager = this.engine.getManager('ACLManager');
    const canEdit = await aclManager?.checkPagePermissionWithContext?.(wikiContext, 'edit');
    return canEdit ? wikiContext : null;
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
        !(await userManager.hasPermission(userContext, 'admin-system'))
      ) {
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
        !(await userManager.hasPermission(userContext, 'admin-system'))
      ) {
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
        !(await userManager.hasPermission(userContext, 'admin-system'))
      ) {
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
        !(await userManager.hasPermission(userContext, 'admin-system'))
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
        !(await userManager.hasPermission(userContext, 'admin-system'))
      ) {
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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
        !(await this.hasAdminViewAccess(wikiContext))
      ) {
        return res.status(403).json({
          error: 'This account cannot view the organization schema',
          reason: "Requires the 'admin-read' or 'admin-system' permission"
        });
      }

      const organizationManager = this.engine.getManager('OrganizationManager');
      const identifier = req.params.identifier;
      const organization = await this.findOrganizationByName(organizationManager, identifier);

      if (!organization) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Generate Schema.org JSON-LD using SchemaGenerator
      const schema = SchemaGenerator.generateOrganizationSchema(organization, {
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
        return res.status(403).json({
          error: 'This account cannot make that change',
          reason: "Read-only access — requires the 'admin-system' permission"
        });
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

    // #946 slice 2 — JSON mutation API for agent tokens (and anyone else)
    app.delete('/api/page/:identifier', (req: Request, res: Response) =>
      this.apiDeletePage(req, res)
    );
    app.post('/api/page/:identifier/rename', (req: Request, res: Response) =>
      this.apiRenamePage(req, res)
    );

    // #947 trash API — admin-only, enforced inside each handler
    app.get('/api/admin/deleted-pages', (req: Request, res: Response) =>
      this.listDeletedPages(req, res)
    );
    app.post('/api/admin/deleted-pages/:uuid/restore', (req: Request, res: Response) =>
      this.restoreDeletedPage(req, res)
    );
    app.delete('/api/admin/deleted-pages/:uuid', (req: Request, res: Response) =>
      this.purgeDeletedPage(req, res)
    );

    // Public routes
    // #885 — sitemap. Registered before /view/:page for clarity only; the
    // paths cannot collide. Both are no-ops unless ngdpbase.seo.enabled.
    app.get('/sitemap.xml', (req: Request, res: Response) => this.sitemap(req, res));
    app.get('/sitemap-:page.xml', (req: Request, res: Response) => this.sitemap(req, res));
    app.get('/', (req: Request, res: Response) => this.homePage(req, res));
    app.get('/view/:page', (req: Request, res: Response) => this.viewPage(req, res));
    // Backward-compatible redirect: /wiki/:page → /view/:page
    app.get('/wiki/:page', (req: Request, res: Response) => {
      const target = '/view/' + req.params.page + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
      res.redirect(301, target);
    });
    app.get('/edit/:page', (req: Request, res: Response) => this.editPage(req, res));
    app.post('/save/:page', (req: Request, res: Response) => this.savePage(req, res));
    app.get('/admin/edit-raw/:page', (req: Request, res: Response) => void this.adminEditRaw(req, res));
    app.post('/admin/edit-raw/:page', (req: Request, res: Response) => void this.adminSaveRaw(req, res));
    app.get('/create', (req: Request, res: Response) => this.createPage(req, res));
    app.post('/create', (req: Request, res: Response) => this.createPageFromTemplate(req, res));
    app.post('/delete/:page', (req: Request, res: Response) => this.deletePage(req, res));
    app.get('/search', (req: Request, res: Response) => this.searchPages(req, res));
    app.get('/api/keywords/related', (req: Request, res: Response) => this.relatedKeywords(req, res));
    app.get('/kiosk', (req: Request, res: Response) => this.kiosk(req, res));
    app.get('/login', (req: Request, res: Response) => this.loginPage(req, res));
    app.get('/admin/login', (req: Request, res: Response) => this.adminLoginPage(req, res));
    app.post('/login', (req: Request, res: Response) => this.processLogin(req, res));
    app.post('/auth/magic-link', (req: Request, res: Response) => this.requestMagicLink(req, res));
    // #1019: GET renders a confirmation interstitial and consumes nothing;
    // POST is where the token is spent. Splitting them is what stops an email
    // scanner's pre-fetch from burning the link.
    app.get('/auth/magic-link/verify', (req: Request, res: Response) => this.verifyMagicLink(req, res));
    app.post('/auth/magic-link/verify', (req: Request, res: Response) => this.completeMagicLink(req, res));
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
    // #1004 — captures made by the #881 bookmarklet; 404s when capture is off
    app.get('/my/captures', (req: Request, res: Response) => this.myCapturesPage(req, res));
    // #640 Phase 2
    app.get('/my/edits', (req: Request, res: Response) => this.myEditsPage(req, res));
    app.get('/my/shared', (req: Request, res: Response) => this.mySharedPage(req, res));
    app.post('/preferences', (req: Request, res: Response) => this.updatePreferences(req, res));
    // #819 — agent/markdown → NCM page ingest (upsert). Auth via Authentik
    // bearer token (#818) or an authenticated session.
    app.post('/api/page/ingest', (req: Request, res: Response) => void this.ingestPageMarkdown(req, res));
    // #946 — user-delegated agent API tokens. Any authenticated user manages
    // their own; admins may additionally list/revoke anyone's, but may never
    // mint on another user's behalf.
    app.get('/api/tokens', (req: Request, res: Response) => void this.listAgentTokens(req, res));
    app.post('/api/tokens', (req: Request, res: Response) => void this.mintAgentToken(req, res));
    app.delete('/api/tokens/:id', (req: Request, res: Response) => void this.revokeAgentToken(req, res));
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
    // One masked value per request, on demand — see adminRevealSecret.
    app.get('/api/admin/config/secret/:key', (req: Request, res: Response) =>
      this.adminRevealSecret(req, res)
    );
    app.post('/admin/configuration', (req: Request, res: Response) =>
      this.adminUpdateConfiguration(req, res)
    );
    app.post('/admin/configuration/posture', (req: Request, res: Response) =>
      void this.adminPostureIngredient(req, res)
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
    // #1113: these four handlers and views/admin-audit.ejs existed with no
    // registration at all, so /admin/audit was a 404 and the audit log had no
    // reader in the application.
    app.get('/admin/audit', (req: Request, res: Response) => void this.adminAuditLogs(req, res));
    app.get('/admin/audit/api', (req: Request, res: Response) => void this.adminAuditLogsApi(req, res));
    app.get('/admin/audit/export', (req: Request, res: Response) => void this.adminAuditExport(req, res));
    app.get('/admin/audit/details/:id', (req: Request, res: Response) => void this.adminAuditLogDetails(req, res));
    app.get('/admin/addons', (req: Request, res: Response) => void this.adminAddons(req, res));
    app.post('/admin/addons/:name/toggle', (req: Request, res: Response) => void this.adminAddonToggle(req, res));
    app.post('/admin/addons/:name/deploy-theme', (req: Request, res: Response) => void this.adminAddonDeployTheme(req, res));
    app.post('/admin/restart', (req: Request, res: Response) => this.adminRestart(req, res));
    app.post('/admin/reindex', (req: Request, res: Response) => this.adminReindex(req, res));
    app.get('/admin/events', (req: Request, res: Response) => this.adminEvents(req, res));
    // #969 — human surface over the #947 deleted-pages API
    app.get('/admin/trash', (req: Request, res: Response) => this.adminTrash(req, res));
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
    // #865 Slice 2: on-demand health report (registered before /:attachmentId routes)
    app.get('/admin/attachments/health', (req: Request, res: Response) => this.adminAttachmentsHealth(req, res));
    // #865 Slice 3: guarded quarantine cleanup (POST, CSRF-protected, admin only)
    app.post('/admin/attachments/quarantine', (req: Request, res: Response) => this.adminAttachmentsQuarantine(req, res));
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
    // #881 — bookmarklet capture
    app.get('/capture', (req: Request, res: Response) => this.captureForm(req, res));
    app.post('/capture', (req: Request, res: Response) => this.captureSubmit(req, res));
    app.get('/capture/install', (req: Request, res: Response) => this.captureInstall(req, res));

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
    // #776 — admin-only per-session listing for the dashboard
    app.get('/api/sessions/list', (req: Request, res: Response) =>
      void this.getActiveSessionDetails(req, res)
    );
    // #777 — admin action: clear all anonymous sessions (preserves authed sessions and caller's own)
    app.post('/api/sessions/clear-anonymous', (req: Request, res: Response) =>
      void this.clearAnonymousSessions(req, res)
    );
    // #787 — admin action: revoke a single session by id (force-logout that session's owner)
    app.delete('/api/sessions/:id', (req: Request, res: Response) =>
      void this.clearOneSession(req, res)
    );
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
    app.patch('/media/api/item/:id', (req: Request, res: Response) => void this.mediaApiItemUpdate(req, res));
    // #999: attachment metadata editing — same contract and permission as the
    // media route above. Sidecar-only on the provider side; see
    // BasicAttachmentProvider.updateMetadata.
    app.patch('/attachments/api/:attachmentId', (req: Request, res: Response) =>
      void this.attachmentApiMetadataUpdate(req, res));
    app.get('/media/api/year/:year', (req: Request, res: Response) => void this.mediaApiYear(req, res));
    app.get('/media/file/:id', (req: Request, res: Response) => void this.mediaFile(req, res));
    app.get('/media/thumb/:id', (req: Request, res: Response) => void this.mediaThumb(req, res));

    // Dawarich Immich-compat adapter (#864) — config-gated, x-api-key auth,
    // must stay off the public tunnel hostname (LAN/Tailscale only).
    registerDawarichCompatRoutes(app, this.engine);

    // Share routes (#853) — token-gated anonymous access (epic #842 slice 2)
    app.get('/share/:token', (req: Request, res: Response) => void this.shareAlbum(req, res));
    app.get('/share/:token/file/:id', (req: Request, res: Response) => void this.shareFile(req, res));
    app.get('/share/:token/thumb/:id', (req: Request, res: Response) => void this.shareThumb(req, res));
    app.get('/share/:token/page/:name', (req: Request, res: Response) => void this.sharePage(req, res));

    // Share management routes (#854) — admin/editor (epic #842 slice 3)
    app.get('/shares', (req: Request, res: Response) => void this.sharesList(req, res));
    app.post('/shares/create', (req: Request, res: Response) => void this.sharesCreate(req, res));
    app.post('/shares/:id/revoke', (req: Request, res: Response) => void this.sharesRevoke(req, res));
    app.get('/admin/media', (req: Request, res: Response) => void this.adminMedia(req, res));
    app.post('/admin/media/rescan', (req: Request, res: Response) => void this.adminMediaRescan(req, res));
    app.post('/admin/media/rebuild', (req: Request, res: Response) => void this.adminMediaRebuild(req, res));
    app.post('/api/admin/media/explain-path', (req: Request, res: Response) => void this.adminMediaExplainPath(req, res));
    app.get('/api/admin/media/skipped', (req: Request, res: Response) => void this.adminMediaSkipped(req, res));
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
        // #1034: was a bare res.send('Access denied') — unstyled text on a
        // blank page, and one of three different ways this account was
        // refused. Names the permission, never a role.
        return await this.renderError(
          req,
          res,
          403,
          'Access Denied',
          "Read-only access — clearing notifications requires the 'admin-system' permission"
        );
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
        !(await this.hasAdminViewAccess(wikiContext))
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
   * Build audit filters from query parameters (#1113).
   *
   * Shared by the page, the API and the export so all three answer the same
   * question for the same query string — otherwise a filtered export quietly
   * disagrees with the table it was exported from.
   */
  private auditFiltersFromQuery(req: Request): Record<string, unknown> {
    const pick = (key: string): string | undefined => {
      const value = req.query[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const filters: Record<string, unknown> = {};
    for (const key of ['user', 'eventType', 'result', 'severity', 'startDate', 'endDate', 'resource', 'action']) {
      const value = pick(key);
      if (value !== undefined) filters[key] = value;
    }
    return filters;
  }

  /**
   * The audit sink as a queryable manager, or null when auditing is
   * unconfigured. #1116: every query takes the caller's username — a fact —
   * and the manager derives the admin-system decision itself; the route's
   * own 403 gate is defense in depth, no longer the only door.
   */
  private auditQuery(): {
    searchAuditLogs?: (f: unknown, o: unknown, caller: { username?: string | null }) => Promise<unknown>;
    getAuditStats?: (f: unknown, caller: { username?: string | null }) => Promise<unknown>;
    exportAuditLogs?: (f: unknown, format: string, caller: { username?: string | null }) => Promise<string>;
  } | null {
    return this.engine.getManager('AuditManager') as {
      searchAuditLogs?: (f: unknown, o: unknown, caller: { username?: string | null }) => Promise<unknown>;
      getAuditStats?: (f: unknown, caller: { username?: string | null }) => Promise<unknown>;
      exportAuditLogs?: (f: unknown, format: string, caller: { username?: string | null }) => Promise<string>;
    } | null;
  }

  /**
   * Admin audit logs page (#1113).
   *
   * Reads AuditManager. It previously read `ACLManager.getAccessControlStats()`
   * and `getAccessLog()`, which do not exist — the handler compiled because a
   * local interface declared them and passed tests because a mock supplied
   * them. Those were a second door to "what happened"; AuditManager is the
   * first, and two managers owning one resource means neither is a chokepoint.
   */
  async adminAuditLogs(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to view audit logs.');
      }

      const audit = this.auditQuery();
      const filters = this.auditFiltersFromQuery(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // An unconfigured audit provider renders an empty page rather than a
      // 500: "auditing is off" and "auditing is broken" must not look alike.
      const emptyStats = { totalEvents: 0, eventsByType: {}, eventsByResult: {}, eventsBySeverity: {}, eventsByUser: {}, recentActivity: [], securityIncidents: 0 };
      const caller = { username: currentUser.username as string };
      const auditStats = audit?.getAuditStats ? await audit.getAuditStats(filters, caller) : emptyStats;
      const auditLogs = audit?.searchAuditLogs
        ? await audit.searchAuditLogs(filters, { limit, offset, sortBy: 'timestamp', sortOrder: 'desc' }, caller)
        : { results: [], total: 0, limit, offset, hasMore: false };

      const templateData = await this.getCommonTemplateData(req);
      return res.render('admin-audit', {
        ...templateData,
        auditStats,
        auditLogs,
        auditAvailable: Boolean(audit?.searchAuditLogs),
        // #1115: the filter options come from the vocabulary rather than a
        // hand-kept list in the template. The hand-kept list offered four
        // options of which three matched zero records in a 2,687-record log,
        // while page.* — 91% of the log — could not be filtered for at all.
        eventTypeOptions: auditEventTypes(),
        filters,
        title: 'Audit Logs - Admin',
        currentUser
      });
    } catch (err: unknown) {
      // #1165: an authorization refusal is not a server fault. Telling them
      // apart is why AuditQueryForbiddenError is a type — this catch rendered
      // both as the same plain-text 500, which is what hid the identity bug.
      if (err instanceof AuditQueryForbiddenError) {
        logger.warn(`Audit log access refused: ${err.message}`);
        return await this.renderError(
          req, res, 403, 'Access Denied',
          'You do not have permission to query the audit log.'
        );
      }
      logger.error('Error loading audit logs:', err);
      return await this.renderError(
        req, res, 500, 'Audit Logs Unavailable',
        'The audit log could not be read. The error has been logged.'
      );
    }
  }

  /** API endpoint for audit logs data (#1113). */
  async adminAuditLogsApi(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const audit = this.auditQuery();
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      if (!audit?.searchAuditLogs) {
        return res.json({ results: [], total: 0, limit, offset, hasMore: false });
      }

      return res.json(await audit.searchAuditLogs(
        this.auditFiltersFromQuery(req),
        { limit, offset, sortBy: 'timestamp', sortOrder: 'desc' },
        { username: currentUser.username }
      ));
    } catch (err: unknown) {
      if (err instanceof AuditQueryForbiddenError) {
        logger.warn(`Audit log access refused: ${err.message}`);
        return res.status(403).json({ error: 'You do not have permission to query the audit log.' });
      }
      logger.error('Error retrieving audit logs:', err);
      return res.status(500).json({ error: 'Error retrieving audit logs' });
    }
  }

  /** API endpoint for one audit event (#1113). */
  async adminAuditLogDetails(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const audit = this.auditQuery();
      if (!audit?.searchAuditLogs) {
        return res.status(404).json({ error: 'Audit log not found' });
      }

      // The provider has no get-by-id, so this pages through recent events.
      // Bounded deliberately: an unbounded scan on a large log is a denial of
      // service wearing a detail view.
      const logId = req.params.id;
      const page = await audit.searchAuditLogs({}, { limit: 1000, sortBy: 'timestamp', sortOrder: 'desc' }, { username: currentUser.username }) as { results?: Array<{ id?: string }> };
      const details = (page.results ?? []).find((entry) => entry.id === logId);

      if (!details) {
        return res.status(404).json({ error: 'Audit log not found' });
      }
      return res.json(details);
    } catch (err: unknown) {
      if (err instanceof AuditQueryForbiddenError) {
        logger.warn(`Audit log access refused: ${err.message}`);
        return res.status(403).json({ error: 'You do not have permission to query the audit log.' });
      }
      logger.error('Error retrieving audit log details:', err);
      return res.status(500).json({ error: 'Error retrieving audit log details' });
    }
  }

  /** Export audit logs (#1113). */
  async adminAuditExport(req: Request, res: Response) {
    try {
      const userManager = this.engine.getManager('UserManager');
      const wikiContext = this.createWikiContext(req);
      const currentUser = await userManager.getCurrentUser(req);

      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).send('Access denied');
      }

      const audit = this.auditQuery();
      if (!audit?.exportAuditLogs) {
        return res.status(503).send('Audit logging is not configured');
      }

      const format = req.query.format === 'csv' ? 'csv' : 'json';
      const data = await audit.exportAuditLogs(this.auditFiltersFromQuery(req), format, { username: currentUser.username });
      const stamp = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${stamp}.${format}"`);
      return res.send(data);
    } catch (err: unknown) {
      if (err instanceof AuditQueryForbiddenError) {
        logger.warn(`Audit log export refused: ${err.message}`);
        return res.status(403).json({ error: 'You do not have permission to export the audit log.' });
      }
      logger.error('Error exporting audit logs:', err);
      return res.status(500).json({ error: 'Error exporting audit logs' });
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
   * Guard for the #947 trash endpoints: admin-only, JSON responses.
   *
   * Deleted pages are visible across every author and every audience, so
   * listing or restoring them is strictly `admin-system`. It deliberately does
   * NOT fall back to the per-page delete ACL — being allowed to delete your own
   * page does not imply being allowed to browse everything anyone else deleted.
   *
   * @returns The provider when the caller is authorised, otherwise null (the
   *          response has already been sent)
   */
  private async requireTrashAdmin(req: Request, res: Response): Promise<IVersioningProvider | null> {
    if (!req.userContext?.isAuthenticated) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }

    const userManager = this.engine.getManager('UserManager');
    const isAdmin = await userManager?.hasPermission(req.userContext, 'admin-system');
    if (!isAdmin) {
      res.status(403).json({ error: 'Access denied', message: 'Administrator access required' });
      return null;
    }

    const provider = this.engine.getManager('PageManager')?.provider as IVersioningProvider | undefined;
    if (!provider || typeof provider.getDeletedPages !== 'function') {
      res.status(501).json({
        error: 'Soft delete not supported',
        message: 'Current page provider does not retain deleted pages'
      });
      return null;
    }

    return provider;
  }

  /**
   * GET /admin/trash — the human surface over the #947 deleted-pages API (#969).
   *
   * Renders server-side rather than fetching client-side, so the page is
   * useful with the list already present: an admin arriving here has usually
   * just deleted the wrong page and wants to see it immediately.
   *
   * Same `admin-system` gate as the API, but answers in HTML — a 403 rendered
   * as raw JSON in a browser tab is a dead end.
   */
  async adminTrash(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;

      if (!currentUser?.isAuthenticated) {
        return res.redirect('/login?redirect=' + encodeURIComponent('/admin/trash'));
      }
      if (!(await this.hasAdminViewAccess(wikiContext))) {
        return res.status(403).send('Access denied');
      }

      const provider = this.engine.getManager('PageManager')?.provider as IVersioningProvider | undefined;
      const configManager = this.engine.getManager('ConfigurationManager');
      const retentionDays = Number(
        configManager?.getProperty('ngdpbase.page.delete.retentiondays', 30) ?? 30
      );

      const commonData = await this.getCommonTemplateData(req);

      // A provider without soft-delete is not an error state to hide — say so,
      // because "trash is empty" and "this provider never keeps deleted pages"
      // look identical to an operator and mean very different things.
      if (!provider || typeof provider.getDeletedPages !== 'function') {
        return res.render('admin-trash', {
          ...commonData,
          title: 'Trash',
          supported: false,
          retentionDays,
          pages: [],
          csrfToken: req.session?.csrfToken || ''
        });
      }

      const now = Date.now();
      const pages = provider.getDeletedPages().map((entry) => {
        const deletedAtMs = new Date(entry.deletedAt).getTime();
        // retention 0 means keep forever — there is no purge date to show, and
        // rendering one would be a lie the operator might plan around.
        const purgeAt = retentionDays > 0
          ? new Date(deletedAtMs + retentionDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
        const daysLeft = purgeAt
          ? Math.ceil((new Date(purgeAt).getTime() - now) / (24 * 60 * 60 * 1000))
          : null;
        return {
          uuid: entry.uuid,
          title: entry.title,
          slug: entry.slug,
          deletedAt: entry.deletedAt,
          deletedBy: entry.deletedBy,
          currentVersion: entry.currentVersion,
          purgeAt,
          // Negative means the retention window already elapsed — the sweep
          // simply has not run yet. Surfaced as "due" rather than a negative
          // countdown, which reads as a bug.
          daysLeft
        };
      });

      return res.render('admin-trash', {
        ...commonData,
        title: 'Trash',
        supported: true,
        retentionDays,
        pages,
        csrfToken: req.session?.csrfToken || ''
      });
    } catch (error: unknown) {
      logger.error(`Error rendering trash view: ${getErrorMessage(error)}`);
      return res.status(500).send('Error loading trash');
    }
  }

  /**
   * GET /api/admin/deleted-pages
   * List soft-deleted pages awaiting restore or purge (#947).
   */
  async listDeletedPages(req: Request, res: Response) {
    try {
      const provider = await this.requireTrashAdmin(req, res);
      if (!provider) return;

      const pages = provider.getDeletedPages!().map((entry) => ({
        uuid: entry.uuid,
        title: entry.title,
        slug: entry.slug,
        deletedAt: entry.deletedAt,
        deletedBy: entry.deletedBy,
        currentVersion: entry.currentVersion
      }));

      return res.json({ success: true, count: pages.length, pages });
    } catch (error: unknown) {
      logger.error(`Error listing deleted pages: ${getErrorMessage(error)}`);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  /**
   * POST /api/admin/deleted-pages/:uuid/restore
   * Restore a soft-deleted page, with its version history (#947).
   */
  async restoreDeletedPage(req: Request, res: Response) {
    try {
      const provider = await this.requireTrashAdmin(req, res);
      if (!provider) return;

      const { uuid } = req.params;
      const result = await provider.restoreDeletedPage!(uuid);

      if (!result.ok) {
        // A name collision is the caller's to resolve, not ours to paper over:
        // 409 with the offending value rather than a silent rename.
        const status = result.reason === 'not-found' ? 404
          : result.reason === 'title-conflict' || result.reason === 'slug-conflict' ? 409
            : 500;
        return res.status(status).json({
          success: false,
          error: result.reason,
          detail: result.detail
        });
      }

      // Bring the derived indexes back in step with the restored page. Delete
      // pulled it out of the search index and the link graph; without this the
      // page is readable but unfindable until the next full rebuild.
      const pageManager = this.engine.getManager('PageManager');
      const restored = await pageManager?.getPage(result.title);
      if (restored) {
        await this.engine.getManager('SearchManager')?.updatePageInIndex(result.title, {
          name: result.title,
          content: restored.content,
          metadata: restored.metadata
        });
        this.engine.getManager('RenderingManager')?.updatePageInLinkGraph?.(result.title, restored.content);
      }

      logger.info(`[WikiRoutes] User ${req.userContext!.username} restored deleted page ${uuid} ('${result.title}')`);
      return res.json({ success: true, uuid, title: result.title });
    } catch (error: unknown) {
      logger.error(`Error restoring deleted page: ${getErrorMessage(error)}`);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
    }
  }

  /**
   * DELETE /api/admin/deleted-pages/:uuid
   * Permanently destroy a soft-deleted page and its versions (#947).
   *
   * The only irreversible page operation left in the app.
   */
  async purgeDeletedPage(req: Request, res: Response) {
    try {
      const provider = await this.requireTrashAdmin(req, res);
      if (!provider) return;

      const { uuid } = req.params;
      const purged = await provider.purgeDeletedPage!(uuid);

      if (!purged) {
        return res.status(404).json({ success: false, error: 'not-found' });
      }

      logger.warn(`[WikiRoutes] User ${req.userContext!.username} PERMANENTLY purged page ${uuid}`);
      return res.json({ success: true, uuid });
    } catch (error: unknown) {
      logger.error(`Error purging deleted page: ${getErrorMessage(error)}`);
      return res.status(500).json({ error: 'Internal server error', details: getErrorMessage(error) });
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

      // #714 Slice C: pageHistory previously only checked the private
      // dimension. Replaced with the full ACL evaluator via
      // `wikiContext.canAccess('view')` — same gate the rendered page
      // uses. This closes a pre-existing security gap where users who
      // couldn't view a page (audience-restricted, policy-denied) could
      // still see its full edit history. Now: if you can't view the
      // page, you can't view its history. (The route's input is the
      // current request page, so this is the same-page fast path through
      // `checkPagePermissionWithContext`, NOT the cross-page
      // `canUserAccessPage` route.)
      const pageMetadataForHistory = await pageManager.getPageMetadata(pageName);
      (wikiContext as { pageMetadata: unknown }).pageMetadata = pageMetadataForHistory ?? null;
      if (!(await wikiContext.canAccess('view'))) {
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

      // #869: canonical keyword value via the shared normalizer (lowercase,
      // diacritics transliterated, punctuation→hyphen, ≤64, comma-free). Because
      // the catalog is keyed by this value, `Dining` and `dining` both resolve
      // to `dining` — the existing-key check below then rejects the duplicate.
      const internalName = normalizeKeywordValue(trimmedLabel);

      if (!internalName) {
        return res.redirect(
          '/user-keywords/create?error=' + encodeURIComponent('Invalid label format')
        );
      }

      // #896: catalog reads/writes go through the vocabulary provider (seed +
      // instance store), never ConfigurationManager.setProperty.
      const kwProvider = this.getUserKeywordsProvider();
      if (!kwProvider) {
        return res.redirect(
          '/user-keywords/create?error=' + encodeURIComponent('Keyword catalog not available')
        );
      }

      // Get existing user-keywords
      const existingKeywords = await kwProvider.getCatalogObject();

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

      await kwProvider.saveCatalogObject(updatedKeywords);

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

      // #896: read the catalog through the vocabulary provider
      const userKeywordsConfig = (await this.getUserKeywordsProvider()?.getCatalogObject()) || {};

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
  async apiGetUserKeywords(_req: Request, res: Response): Promise<void> {
    try {
      const pageManager = this.engine.getManager('PageManager');
      // #896: catalog through the vocabulary provider (seed + instance store)
      const userKeywordsConfig = (await this.getUserKeywordsProvider()?.getCatalogObject()) || {};

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
        !(await this.hasAdminViewAccess(wikiContext))
      ) {
        res.status(403).send('Access denied');
        return;
      }

      const pageManager = this.engine.getManager('PageManager');
      // #896: catalog through the vocabulary provider (seed + instance store)
      const userKeywordsConfig = (await this.getUserKeywordsProvider()?.getCatalogObject()) || {};

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

      // #900: media keyword counts (EXIF-derived) — fetched up front so the
      // per-keyword rows can show media usage alongside pages. Same source the
      // drift card uses below.
      const mediaManagerCounts = this.engine.getManager('MediaManager') as {
        getAllKeywordCounts?: () => Promise<Record<string, number>>;
      } | undefined;
      let mediaKeywordCounts: Record<string, number> = {};
      try {
        mediaKeywordCounts = mediaManagerCounts?.getAllKeywordCounts ? await mediaManagerCounts.getAllKeywordCounts() : {};
      } catch (err) {
        logger.warn('[adminKeywords] media keyword counts unavailable:', err);
      }
      // Case-insensitive lookup of media counts by keyword string.
      const mediaCountLower: Record<string, number> = {};
      for (const [kw, count] of Object.entries(mediaKeywordCounts)) {
        const l = kw.toLowerCase();
        mediaCountLower[l] = (mediaCountLower[l] || 0) + count;
      }

      // Build keywords array with stats, sorted alphabetically by label to match the form dropdowns
      const keywords = Object.entries(userKeywordsConfig).map(([key, config]) => {
        const label = (config.label as string) || key;
        const hasPage = pageManager ? pageManager.pageExists(label) : false;
        const usageCount = keywordUsage[key]?.length || 0;
        // Media EXIF keywords are free text — match the catalog entry's id or
        // label, case-insensitively (a term catalogued as 'basketball' counts
        // media tagged 'Basketball').
        const mediaCount = (mediaCountLower[key.toLowerCase()] || 0)
          + (label.toLowerCase() !== key.toLowerCase() ? (mediaCountLower[label.toLowerCase()] || 0) : 0);

        return {
          id: key,
          label,
          description: (config.description as string) || '',
          category: (config.category as string) || '',
          enabled: config.enabled !== false,
          restrictEditing: config.restrictEditing === true,
          hasPage,
          usageCount,
          mediaCount,
          pageUrl: hasPage ? `/view/${encodeURIComponent(label)}` : null
        };
      }).sort((a, b) => a.label.localeCompare(b.label));

      // Calculate stats
      const totalKeywords = keywords.length;
      const enabledKeywords = keywords.filter(k => k.enabled).length;
      const keywordsWithPages = keywords.filter(k => k.hasPage).length;
      const keywordsInUse = keywords.filter(k => k.usageCount > 0 || k.mediaCount > 0).length;

      // #895 (Slice 3 of #869): drift report — observed vocabulary (page
      // frontmatter + media EXIF keywords) diffed against the canonical
      // catalog. Matching is case-insensitive against both catalog ids and
      // labels. Counts include private items — this is an admin-only surface.
      const canonicalNames = new Set<string>();
      for (const [key, config] of Object.entries(userKeywordsConfig)) {
        canonicalNames.add(key.toLowerCase());
        const label = (config).label;
        if (typeof label === 'string' && label) canonicalNames.add(label.toLowerCase());
      }

      // mediaKeywordCounts already fetched above (#900) — reused here.
      const uncataloguedMap = new Map<string, { term: string; pageCount: number; mediaCount: number }>();
      for (const [kw, pages] of Object.entries(keywordUsage)) {
        const lower = kw.toLowerCase();
        if (canonicalNames.has(lower)) continue;
        const row = uncataloguedMap.get(lower) ?? { term: kw, pageCount: 0, mediaCount: 0 };
        row.pageCount += pages.length;
        uncataloguedMap.set(lower, row);
      }
      for (const [kw, count] of Object.entries(mediaKeywordCounts)) {
        const lower = kw.toLowerCase();
        if (canonicalNames.has(lower)) continue;
        const row = uncataloguedMap.get(lower) ?? { term: kw, pageCount: 0, mediaCount: 0 };
        row.mediaCount += count;
        uncataloguedMap.set(lower, row);
      }
      const uncatalogued = [...uncataloguedMap.values()]
        .sort((a, b) => (b.pageCount + b.mediaCount) - (a.pageCount + a.mediaCount));
      // "Unused" means unused everywhere: zero page usage AND zero media usage
      // (a term adopted from media EXIF is in use even before any page carries it).
      const mediaUsedNames = new Set(Object.keys(mediaKeywordCounts).map(k => k.toLowerCase()));
      const unusedCatalog = keywords.filter(k =>
        k.usageCount === 0 && k.enabled
        && !mediaUsedNames.has(k.id.toLowerCase())
        && !mediaUsedNames.has(k.label.toLowerCase())
      );

      // #919 (Slice 4 of #869): variant/duplicate lint. Feed every keyword
      // display form seen anywhere — catalog labels, page frontmatter, media
      // EXIF — into the pure variant grouper (groups by canonical value, folds
      // case/space/accent/punctuation; clusters with 2+ distinct forms).
      const variantForms: KeywordFormStat[] = [
        ...Object.entries(userKeywordsConfig).map(([key, config]) => ({ form: (config.label as string) || key, catalogued: true, catalogId: key })),
        ...Object.entries(keywordUsage).map(([kw, pages]) => ({ form: kw, pageCount: pages.length })),
        ...Object.entries(mediaKeywordCounts).map(([kw, count]) => ({ form: kw, mediaCount: count }))
      ];
      const variants = groupKeywordVariants(variantForms);

      const successMessage = req.query.success as string | undefined;
      const errorMessage = req.query.error as string | undefined;

      // #1052: spread the common template data FIRST, exactly as every other
      // admin route does. Without it the payload carries no `lockedUnless`,
      // and admin-keywords.ejs calls that helper unguarded — so the page threw
      // `lockedUnless is not defined` and 500'd outright rather than degrading.
      //
      // Ordering matters: common data first, so the explicit keys below still
      // win. `csrfToken` is in both, and the local one is the request's own.
      const commonData = await this.getCommonTemplateData(req);

      res.render('admin-keywords', {
        ...commonData,
        title: 'Keyword Management',
        currentUser,
        keywords,
        stats: {
          total: totalKeywords,
          enabled: enabledKeywords,
          withPages: keywordsWithPages,
          inUse: keywordsInUse
        },
        drift: {
          uncatalogued,
          unusedCatalog,
          variants
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

      // #896: catalog through the vocabulary provider (seed + instance store)
      const kwProvider = this.getUserKeywordsProvider();
      if (!kwProvider) {
        res.status(503).json({ error: 'Keyword catalog not available' });
        return;
      }
      const userKeywordsConfig = await kwProvider.getCatalogObject();

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

      await kwProvider.saveCatalogObject(userKeywordsConfig);

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
        !(await this.hasAdminViewAccess(wikiContext))
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

      // #896: catalog through the vocabulary provider (seed + instance store)
      const kwProvider = this.getUserKeywordsProvider();
      if (!kwProvider) {
        res.status(503).json({ error: 'Keyword catalog not available' });
        return;
      }
      const userKeywordsConfig = await kwProvider.getCatalogObject();

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

      await kwProvider.saveCatalogObject(userKeywordsConfig);

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

      const pageManager = this.engine.getManager('PageManager');
      // #896: catalog through the vocabulary provider (seed + instance store)
      const kwProvider = this.getUserKeywordsProvider();
      if (!kwProvider) {
        res.status(503).json({ error: 'Keyword catalog not available' });
        return;
      }
      const userKeywordsConfig = await kwProvider.getCatalogObject();

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
      await kwProvider.saveCatalogObject(userKeywordsConfig);

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

      const pageManager = this.engine.getManager('PageManager');
      // #896: catalog through the vocabulary provider (seed + instance store)
      const kwProvider = this.getUserKeywordsProvider();
      if (!kwProvider) {
        res.status(503).json({ error: 'Keyword catalog not available' });
        return;
      }
      const userKeywordsConfig = await kwProvider.getCatalogObject();

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
        await kwProvider.saveCatalogObject(userKeywordsConfig);
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
        cmp = mediaSortDateKey(a) - mediaSortDateKey(b);
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
      // #854: Share entry point — visible only to users who may create shares.
      const shareManagerForAlbum = this.engine.getManager('ShareManager');
      const canShare = !!shareManagerForAlbum?.isEnabled() && (await this.canManageShares(wikiContext));
      return res.render('media-keyword', {
        ...commonData,
        wikiContext,
        keyword,
        items,
        sort,
        order,
        canShare,
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
      const canEdit = !!wikiContext.userContext && (await wikiContext.hasPermission('asset-edit'));
      // #1053: the keywords field now offers the SAME suggestions as the page
      // editors. The comment here used to claim parity — "same source as the
      // page editor's keyword dropdown" — but it only ever read the catalog,
      // while the page editors merged in keywords observed on real pages
      // (#897). On jimstest that was 110 suggestions here against 313 there.
      // Both now go through buildKeywordPool.
      const userKeywords = canEdit ? (await this.getUserKeywordsWithDescriptions()).map(k => k.label) : [];
      const keywordPool = canEdit
        ? buildKeywordPool(userKeywords, await this.getObservedUserKeywords())
        : [];
      // #883 one-click keyword sets, previously page-only for no reason other
      // than the widget having been copied rather than shared.
      const keywordSetSuggestions = canEdit
        ? await this.getSuggestedKeywordSetsForUser(
          (commonData as { user?: { username?: string } }).user?.username,
          Array.isArray(item?.metadata?.keywords) ? item.metadata.keywords as string[] : []
        )
        : [];
      // #1098: a container no browser decodes gets its poster frame and a
      // download rather than a <video> element that would show controls and
      // then do nothing. Computed here rather than in the template so the
      // decision is testable and lives next to the codec data that informs it.
      const unplayableVideo = isDefinitelyUnplayable(
        item?.mimeType,
        item?.metadata?.videoCodec
      );

      return res.render('media-item', {
        ...commonData,
        wikiContext,
        item,
        unplayableVideo,
        prevItem,
        nextItem,
        albumKeyword,
        sortParam,
        keywordPageExists,
        canEdit,
        userKeywords,
        keywordPool,
        keywordSetSuggestions,
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
   * PATCH /media/api/item/:id
   * Update user-editable metadata (title, description, keywords,
   * dateTimeOriginal) — written into the source file's EXIF/IPTC/XMP by the
   * provider, which also refreshes the media index entry.
   *
   * Requires the asset-edit permission. Body fields: absent = keep,
   * null = clear.
   */
  /**
   * PATCH /attachments/api/:attachmentId — edit an attachment's metadata (#999).
   *
   * The attachment counterpart of `mediaApiItemUpdate`. Same permission
   * (`asset-edit`), same body contract, and the same keyword canonicalization —
   * the part that matters most and is easiest to drop when porting a route.
   *
   * The two differ only in what the PROVIDER does with the patch: media writes
   * through to the file, attachments store it beside the file because their id
   * is a hash of the bytes. That asymmetry lives entirely in the provider; this
   * route is unaware of it.
   */
  async attachmentApiMetadataUpdate(req: Request, res: Response) {
    const attachmentManager = this.engine.getManager('AttachmentManager');
    if (!attachmentManager) {
      return res.status(503).json({ error: 'Attachment manager not enabled' });
    }
    try {
      const wikiContext = this.createWikiContext(req);
      if (!wikiContext.userContext || !(await wikiContext.hasPermission('asset-edit'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const existing = await attachmentManager.getAttachmentMetadata(req.params.attachmentId);
      if (!existing) {
        return res.status(404).json({ error: 'Not found' });
      }

      const parsed = this.parseAssetMetadataPatch(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }

      // #918/#915: snap keywords to catalog TITLES. Attachments do not write
      // these into the file, but they still feed search and the keyword catalog,
      // so an uncanonicalized variant would fragment the vocabulary just the
      // same — and this route never went through the editor typeahead.
      if (Array.isArray(parsed.value.keywords)) {
        parsed.value.keywords = dedupeKeywords(
          parsed.value.keywords,
          await this.getUserKeywordCanonicalMap()
        );
      }

      const updated = await attachmentManager.updateAssetMetadata(
        req.params.attachmentId,
        parsed.value,
        wikiContext.userContext
      );
      if (!updated) {
        return res.status(404).json({ error: 'Not found' });
      }

      logger.info(
        `[attachments] ${wikiContext.userContext.username} edited metadata on `
        + `${req.params.attachmentId} (${Object.keys(parsed.value).join(', ')})`
      );
      return res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // A bad date is the caller's mistake, not a server fault.
      if (message.startsWith('Invalid dateTimeOriginal')) {
        return res.status(400).json({ error: message });
      }
      if (message.startsWith('Permission denied')) {
        return res.status(403).json({ error: message });
      }
      if (message.includes('does not support metadata editing')) {
        return res.status(501).json({ error: message });
      }
      logger.error('[attachments] Error updating attachment metadata:', err);
      return res.status(500).json({ error: 'Metadata update failed', detail: message });
    }
  }

  /**
   * Validate an asset-metadata PATCH body into an `AssetMetadataPatch` (#999).
   *
   * Shared by the media and attachment routes so the two cannot drift on the
   * contract that matters: **absent means keep, explicit `null` means clear.**
   * That is why every field is tested with `in` rather than truthiness —
   * `{ description: null }` and `{}` must not behave alike.
   *
   * @param body - Raw request body
   * @returns The patch, or an error message for a 400
   */
  private parseAssetMetadataPatch(
    body: unknown
  ): { value: import('../types/Asset.js').AssetMetadataPatch } | { error: string } {
    const b = (body ?? {}) as Record<string, unknown>;
    const patch: import('../types/Asset.js').AssetMetadataPatch = {};

    if ('title' in b) {
      if (b.title !== null && typeof b.title !== 'string') {
        return { error: 'title must be a string or null' };
      }
      patch.title = b.title;
    }
    if ('description' in b) {
      if (b.description !== null && typeof b.description !== 'string') {
        return { error: 'description must be a string or null' };
      }
      patch.description = b.description;
    }
    if ('keywords' in b) {
      const kw = b.keywords;
      if (kw !== null && !(Array.isArray(kw) && kw.every(k => typeof k === 'string'))) {
        return { error: 'keywords must be a string array or null' };
      }
      patch.keywords = kw;
    }
    if ('dateTimeOriginal' in b) {
      if (b.dateTimeOriginal !== null && typeof b.dateTimeOriginal !== 'string') {
        return { error: 'dateTimeOriginal must be a string or null' };
      }
      patch.dateTimeOriginal = b.dateTimeOriginal;
    }

    if (Object.keys(patch).length === 0) {
      return { error: 'No editable fields in request body' };
    }
    return { value: patch };
  }

  async mediaApiItemUpdate(req: Request, res: Response) {
    const mediaManager = this.engine.getManager('MediaManager');
    if (!mediaManager) {
      return res.status(503).json({ error: 'Media manager not enabled' });
    }
    try {
      const wikiContext = this.createWikiContext(req);
      if (!wikiContext.userContext || !(await wikiContext.hasPermission('asset-edit'))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // ACL-aware existence check first — a private item the caller cannot
      // see must 404, not get edited blind.
      const existing = await mediaManager.getItem(req.params.id, wikiContext);
      if (!existing) {
        return res.status(404).json({ error: 'Not found' });
      }

      // #999: shared with the attachment route so the two cannot drift on
      // "absent means keep, explicit null means clear". Error strings are
      // unchanged from the inline version this replaced.
      const parsed = this.parseAssetMetadataPatch(req.body);
      if ('error' in parsed) {
        return res.status(400).json({ error: parsed.error });
      }
      const patch = parsed.value;

      // #918 (Slice 2 of #869): canonicalize keywords to catalog TITLES before
      // they are written into the file's IPTC:Keywords / XMP-dc:Subject. Writing
      // the vocabulary's display form (not a lowercase/spacing variant) is what
      // stops digiKam growing duplicate variants on re-read — the guarantee even
      // holds for a direct API call that bypassed the editor's typeahead. Same
      // snap-to-title + case/space/accent de-dup the page save applies (#915).
      if (Array.isArray(patch.keywords)) {
        patch.keywords = dedupeKeywords(patch.keywords, await this.getUserKeywordCanonicalMap());
      }

      const updated = await mediaManager.updateItemMetadata(req.params.id, patch);
      const username = wikiContext.userContext.username;
      logger.info(`[media] ${username} edited metadata on ${req.params.id} (${Object.keys(patch).join(', ')})`);
      if (!updated) {
        // Edit succeeded but the item left the index (ngdpbaseignore keyword)
        return res.json({ removed: true });
      }
      return res.json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('Invalid dateTimeOriginal')) {
        return res.status(400).json({ error: message });
      }
      logger.error('[media] Error updating media item metadata:', err);
      return res.status(500).json({ error: 'Metadata update failed', detail: message });
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

      return await this.streamMediaItemFile(req, res, item.filePath, item.mimeType, item.id);
    } catch (err: unknown) {
      logger.error('[media] Error serving media file:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * Stream a media file to the response with HTTP Range support and
   * on-the-fly HEIC/RAW transcode (#514). Shared by GET /media/file/:id and
   * the token-gated GET /share/:token/file/:id (#853) — access control is
   * the CALLER's responsibility; this helper only moves bytes.
   */
  private async streamMediaItemFile(req: Request, res: Response, filePath: string, itemMimeType: string | undefined, itemId: string) {
    const rawMime: string = itemMimeType || 'application/octet-stream';
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
        const mediaManager = this.engine.getManager('MediaManager');
        const buffer = mediaManager ? await mediaManager.getTranscodedBuffer(itemId, format) : null;
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

    // #1078: resolve the range BEFORE writing any header. The previous code
    // parsed with parseInt and no bounds check, so `bytes=999999999-`,
    // `bytes=abc-`, and `bytes=50-10` each sent 206 headers and then threw
    // inside createReadStream — too late to change the status, so the
    // response never completed and the socket was held until the client
    // timed out. resolveRange guarantees a satisfiable slice is streamable.
    const range = resolveRange(req.headers.range, fileSize);

    if (range.kind === 'unsatisfiable') {
      // RFC 7233 §4.4 — tell the client the real length so it can retry.
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType
      });
      return res.end();
    }

    if (range.kind === 'satisfiable') {
      const { start, end } = range;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mimeType,
        'Content-Disposition': 'inline'
      });
      this.pipeFileToResponse(fs.createReadStream(filePath, { start, end }), res, filePath);
      return;
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'inline',
      'Content-Length': fileSize,
      'Content-Type': mimeType
    });
    this.pipeFileToResponse(fs.createReadStream(filePath), res, filePath);
    return;
  }

  /**
   * Pipe a file stream to the response, destroying both sides on any failure.
   *
   * #1078: the previous bare `.pipe(res)` left the read stream alive when the
   * client disconnected mid-body — a routine event for video seeking, where a
   * browser opens and abandons many range requests per scrub. It also left an
   * fs read error (EIO, or the file removed under us) to reach a stream with
   * no `error` listener, which in Node is an uncaught exception. `src/app.ts`
   * installs a process-level handler so that does not take the server down,
   * but that handler is a backstop, not a design.
   *
   * Errors here cannot become an HTTP status: the headers are already sent by
   * the time any byte moves. Logging and closing the connection is the whole
   * available response, and it is the correct one — a truncated body with a
   * promised Content-Length tells the client something went wrong.
   */
  private pipeFileToResponse(source: NodeJS.ReadableStream, res: Response, filePath: string): void {
    pipeline(source, res, (err) => {
      if (!err) return;
      // A client that navigates away or seeks mid-download aborts the
      // response. That is normal traffic, not a fault worth an error line.
      const { code } = err;
      if (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'EPIPE' || code === 'ECONNRESET') {
        logger.debug(`[media] Client disconnected while streaming ${filePath}`);
        return;
      }
      logger.error(`[media] Error streaming ${filePath}:`, err);
    });
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

  // ---------------------------------------------------------------------------
  // Share routes (#853) — token-gated anonymous access (epic #842 slice 2)
  // ---------------------------------------------------------------------------

  /**
   * Common gate for every /share/:token* request (#853).
   *
   * - Rate-limits per token+IP BEFORE validation so invalid-token probing
   *   burns the same budget as real traffic (decision 5).
   * - Unknown, expired, and revoked tokens — and a disabled ShareManager —
   *   all produce an IDENTICAL 404 so share existence never leaks.
   * - Scope is re-validated on every request, never cached per token.
   * - Sets `X-Robots-Tag: noindex` and records an aggregated access hit.
   *
   * Returns the validated scope + manager, or null after having responded.
   */
  private shareGate(req: Request, res: Response): { shareManager: ShareManager; scope: ShareScope } | null {
    const notFound = (): null => {
      res.status(404).send('Not Found');
      return null;
    };
    const shareManager = this.engine.getManager('ShareManager');
    if (!shareManager || !shareManager.isEnabled()) return notFound();

    const token = req.params.token ?? '';
    const rl = shareRateLimiter.consume(`${token}:${req.ip}`);
    if (!rl.allowed) {
      res.status(429)
        .set('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
        .send('Too Many Requests');
      return null;
    }

    const scope = shareManager.validate(token);
    if (!scope) return notFound();

    res.setHeader('X-Robots-Tag', 'noindex');
    shareManager.recordAccess(token);
    return { shareManager, scope };
  }

  /**
   * GET /share/:token
   * Anonymous album view: thumbnail grid of in-scope media + list of
   * in-scope pages. Chrome-free standalone template — no site nav.
   */
  async shareAlbum(req: Request, res: Response) {
    try {
      const gate = this.shareGate(req, res);
      if (!gate) return;
      const resolved = await gate.shareManager.resolveScope(gate.scope);
      return res.render('share-album', {
        token: req.params.token,
        keyword: gate.scope.keyword,
        media: resolved.media,
        pages: resolved.pages,
        title: `Shared — ${gate.scope.keyword}`
      });
    } catch (err: unknown) {
      logger.error('[share] Error rendering share album:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /share/:token/file/:id
   * Stream a media file only if the item is in the share's LIVE scope.
   */
  async shareFile(req: Request, res: Response) {
    try {
      const gate = this.shareGate(req, res);
      if (!gate) return;
      const resolved = await gate.shareManager.resolveScope(gate.scope);
      const item = resolved.media.find(m => m.id === req.params.id);
      if (!item) return res.status(404).send('Not Found');
      return await this.streamMediaItemFile(req, res, item.filePath, item.mimeType, item.id);
    } catch (err: unknown) {
      logger.error('[share] Error serving share file:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /share/:token/thumb/:id
   * Thumbnail, only if the item is in the share's LIVE scope.
   * Cache-Control is `private` — the URL embeds the capability token, so
   * shared caches must not store it.
   */
  async shareThumb(req: Request, res: Response) {
    try {
      const gate = this.shareGate(req, res);
      if (!gate) return;
      const resolved = await gate.shareManager.resolveScope(gate.scope);
      const item = resolved.media.find(m => m.id === req.params.id);
      if (!item) return res.status(404).send('Not Found');
      const mediaManager = this.engine.getManager('MediaManager');
      const size = (req.query.size as string) || '300x300';
      const buffer = mediaManager ? await mediaManager.getThumbnailBuffer(item.id, size) : null;
      if (!buffer) return res.status(404).send('Not Found');
      res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'private, max-age=3600');
      return res.send(buffer);
    } catch (err: unknown) {
      logger.error('[share] Error serving share thumbnail:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * GET /share/:token/page/:name
   * Read-only rendered page, only if in the share's LIVE scope.
   *
   * Known v1 caveat (documented, not fixed): links inside the rendered HTML
   * point at normal /view/ URLs the anonymous visitor may not be able to open.
   */
  async sharePage(req: Request, res: Response) {
    try {
      const gate = this.shareGate(req, res);
      if (!gate) return;
      const name = req.params.name;
      const resolved = await gate.shareManager.resolveScope(gate.scope);
      const entry = resolved.pages.find(p => p.name === name);
      if (!entry) return res.status(404).send('Not Found');

      const pageManager = this.engine.getManager('PageManager');
      const renderingManager = this.engine.getManager('RenderingManager');
      const markdown = pageManager
        ? await pageManager.getPageContent(entry.name).catch(() => null)
        : null;
      if (markdown === null || !renderingManager) return res.status(404).send('Not Found');

      const wikiContext = this.createWikiContext(req, {
        context: WikiContext.CONTEXT.VIEW,
        pageName: entry.name,
        response: res
      });
      const html = await renderingManager.textToHTML(wikiContext, markdown);
      return res.render('share-page', {
        token: req.params.token,
        keyword: gate.scope.keyword,
        pageName: entry.name,
        pageTitle: entry.title ?? entry.name,
        html,
        title: `Shared — ${entry.title ?? entry.name}`
      });
    } catch (err: unknown) {
      logger.error('[share] Error rendering share page:', err);
      return res.status(500).send('Internal server error');
    }
  }

  // ---------------------------------------------------------------------------
  // Share management routes (#854) — privileged users (epic #842 slice 3)
  // ---------------------------------------------------------------------------

  /**
   * Who may create and manage shares (#1198).
   *
   * Was `isAuthenticated && hasRole('admin', 'editor')`. Neither is an allow
   * (security-posture.md P2): a role name skips the policy evaluator and the
   * token ceiling, and a share is an anonymous-access credential. Issuing one
   * is a governed capability (#1224): `share-manage`, shipped to admin and
   * editor, the two roles the original decision named. Listing everyone's and
   * revoking anyone's stay `admin-system`.
   */
  private async canManageShares(wikiContext: WikiContext): Promise<boolean> {
    return wikiContext.hasPermission('share-manage');
  }

  /**
   * Absolute base for displaying share links. Prefers the canonical
   * configured base-url; falls back to the request's own origin so the
   * page still works on instances without an explicit base-url.
   */
  private shareBaseUrl(req: Request): string {
    const configManager = this.engine.getManager('ConfigurationManager');
    const configured = configManager?.getBaseURL?.() ?? '';
    return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  }

  /**
   * GET /shares
   * Management list: own shares for editors, all shares for admins.
   * Shows full share link, status (active/expired/revoked), and expiry.
   */
  async sharesList(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!(await this.canManageShares(wikiContext))) {
        return await this.renderError(req, res, 403, 'Access Denied', 'You do not have permission to manage shares.');
      }
      const shareManager = this.engine.getManager('ShareManager');
      if (!shareManager || !shareManager.isEnabled()) {
        return await this.renderError(req, res, 404, 'Not Found', 'Share links are disabled on this instance.');
      }

      const isAdmin = await wikiContext.hasPermission('admin-system');
      const username = wikiContext.userContext?.username ?? '';
      const now = Date.now();
      const shares = shareManager.list(isAdmin ? undefined : username).map(r => ({
        ...r,
        status: r.revokedAt
          ? 'revoked'
          : (r.expiresAt && now > Date.parse(r.expiresAt)) ? 'expired' : 'active'
      }));

      // Referer-aware Back link — /shares is reached from keyword albums,
      // the page More menu, the admin dashboard, and the profile card, so a
      // hardcoded "Media" back button lies most of the time. Same-host
      // referers only, and never /shares itself (create/revoke redirects).
      let backLink: string | null = null;
      const referer = req.get('referer');
      if (referer) {
        try {
          const refUrl = new URL(referer);
          if (refUrl.host === req.get('host') && !refUrl.pathname.startsWith('/shares')) {
            backLink = refUrl.pathname + refUrl.search;
          }
        } catch {
          // unparseable referer — no back link
        }
      }

      const commonData = await this.getCommonTemplateData(req);
      return res.render('shares', {
        ...commonData,
        wikiContext,
        shares,
        isAdmin,
        backLink,
        baseUrl: this.shareBaseUrl(req),
        createdId: typeof req.query.created === 'string' ? req.query.created : null,
        revoked: req.query.revoked === '1',
        error: typeof req.query.error === 'string' ? req.query.error : null,
        keywordPrefill: typeof req.query.keyword === 'string' ? req.query.keyword : '',
        title: 'Share Links'
      });
    } catch (err: unknown) {
      logger.error('[share] Error rendering shares list:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * POST /shares/create
   * Create a share for a keyword with a fixed expiry choice (decision 4).
   * CSRF-validated by the app-wide middleware; admin/editor only (decision 2).
   */
  async sharesCreate(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!(await this.canManageShares(wikiContext))) {
        return res.status(403).send('Access denied');
      }
      const shareManager = this.engine.getManager('ShareManager');
      if (!shareManager || !shareManager.isEnabled()) {
        return res.status(404).send('Not Found');
      }

      const body = req.body as Record<string, unknown>;
      const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
      if (!keyword) {
        return res.redirect('/shares?error=keyword');
      }
      const ttlRaw = typeof body.ttl === 'string' ? body.ttl : '';
      if (!['24h', '7d', '30d', 'never'].includes(ttlRaw)) {
        return res.redirect('/shares?error=ttl');
      }
      const ttl = ttlRaw === 'never' ? null : (ttlRaw as '24h' | '7d' | '30d');

      const record = await shareManager.issue(
        { kind: 'keyword', keyword },
        ttl,
        wikiContext.userContext?.username ?? 'unknown'
      );
      return res.redirect(`/shares?created=${encodeURIComponent(record.id)}`);
    } catch (err: unknown) {
      logger.error('[share] Error creating share:', err);
      return res.status(500).send('Internal server error');
    }
  }

  /**
   * POST /shares/:id/revoke
   * Immediate revocation — creator or admin. CSRF-validated app-wide.
   */
  async sharesRevoke(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      if (!(await this.canManageShares(wikiContext))) {
        return res.status(403).send('Access denied');
      }
      const shareManager = this.engine.getManager('ShareManager');
      if (!shareManager || !shareManager.isEnabled()) {
        return res.status(404).send('Not Found');
      }

      const record = shareManager.get(req.params.id);
      if (!record) {
        return res.status(404).send('Not Found');
      }
      const username = wikiContext.userContext?.username ?? '';
      if (!(await wikiContext.hasPermission('admin-system')) && record.createdBy !== username) {
        return res.status(403).send('Access denied');
      }

      await shareManager.revoke(record.id, username);
      return res.redirect('/shares?revoked=1');
    } catch (err: unknown) {
      logger.error('[share] Error revoking share:', err);
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
      if (!currentUser || !(await this.hasAdminViewAccess(wikiContext))) {
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
  /**
   * POST /api/admin/media/explain-path (#848 part 3).
   *
   * Answers "why isn't my file showing?" for one absolute path. #814 reported
   * media as undiscovered when triage found zero indexing bugs — every missing
   * file was correctly skipped by a rule that leaves no visible trace.
   *
   * Requires `admin-system`, not merely `admin-read`. The response reveals
   * filesystem layout — which roots are scanned, which directories are ignored,
   * whether a given path exists at all — so it is a probe of the host, not just
   * of the index.
   *
   * POST rather than GET: a filesystem path in a query string lands in access
   * logs and browser history, and paths are the one thing this endpoint is for.
   */
  async adminMediaExplainPath(req: Request, res: Response) {
    try {
      const wikiContext = this.createWikiContext(req);
      const currentUser = wikiContext.userContext;
      if (!currentUser || !(await wikiContext.hasPermission('admin-system'))) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const target = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      if (!target) {
        return res.status(400).json({ error: 'A "path" is required' });
      }
      if (!path.isAbsolute(target)) {
        // A relative path would be resolved against the server's cwd, which is
        // never what the operator meant and would answer about the wrong file.
        return res.status(400).json({ error: 'Path must be absolute' });
      }

      const mediaManager = this.engine.getManager('MediaManager');
      if (!mediaManager) {
        return res.status(503).json({ error: 'Media manager not enabled' });
      }
      const explanation = await mediaManager.explainPath(target);
      if (!explanation) {
        return res.status(501).json({ error: 'The configured media provider cannot explain paths' });
      }
      return res.json({ path: target, ...explanation });
    } catch (err: unknown) {
      logger.error('[media] Error explaining path:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/admin/media/skipped (#1056).
   *
   * The list of files the last scan passed over, and why. `explain-path`
   * answers for one path the operator can name; this answers when they cannot,
   * which is the more common case behind #814's "media often not discovered".
   *
   * Same `admin-system` bar as `explain-path`, for the same reason: the
   * response is a partial listing of the host filesystem, including paths that
   * are deliberately excluded from the library.
   *
   * GET is safe here where `explain-path` needed POST — this takes no path as
   * input, so nothing sensitive lands in a query string.
   */
  async adminMediaSkipped(req: Request, res: Response) {
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
      const report = await mediaManager.getSkipReport();
      if (!report) {
        // 200 with an explicit "never scanned" rather than 404: the endpoint
        // exists and the answer is real. A 404 would read as a broken route.
        return res.json({ available: false, reason: 'No scan has been recorded yet — run a media rescan.' });
      }
      return res.json({ available: true, ...report });
    } catch (err: unknown) {
      logger.error('[media] Error reading skip report:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

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
      const runId = await jobManager.enqueue('media.rescan', jobContextFromRequest(req.userContext));
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
      const runId = await jobManager.enqueue('media.rebuild', jobContextFromRequest(req.userContext));
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
      const runId = await jobManager.enqueue('attachments.rebuild', jobContextFromRequest(req.userContext));
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
      const runId = await jobManager.enqueue(jobId, jobContextFromRequest(req.userContext));
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
      if (!currentUser || !(await this.hasAdminViewAccess(wikiContext))) {
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
      if (!currentUser || !(await this.hasAdminViewAccess(wikiContext))) {
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
        const r = result as { scanned?: number; added?: number; updated?: number; errors?: number; excluded?: number };
        // #1056: `excluded` used to omit four of the six skip reasons, so this
        // line could read 0 while a whole ignored tree was dropped. It now
        // counts every skip, and the paths are at /api/admin/media/skipped.
        const skipped = r.excluded ?? 0;
        return {
          success: true,
          summary:
            `Scanned ${r.scanned ?? 0}, added ${r.added ?? 0}, updated ${r.updated ?? 0}, errors ${r.errors ?? 0}` +
            (skipped > 0 ? `, skipped ${skipped}` : '')
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
