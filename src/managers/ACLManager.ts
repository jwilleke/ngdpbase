import BaseManager from './BaseManager.js';
import { promises as fs } from 'fs';
import logger from '../utils/logger.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type UserManager from './UserManager.js';
import type PolicyEvaluator from './PolicyEvaluator.js';
import type NotificationManager from './NotificationManager.js';
import type { PageFrontmatter } from '../types/Page.js';
import { decideFrontmatterAccess } from '../utils/frontmatterAccess.js';

/**
 * Minimal WikiContext interface for type safety
 * TODO: Convert WikiContext.js to TypeScript and import proper type
 */
interface WikiContext {
  pageName: string;
  content: string;
  context?: Record<string, unknown>;
  userContext?: UserContext;
  pageMetadata?: PageFrontmatter | null;
}

/**
 * User context for permission checks
 * Note: Index signature required for PolicyEvaluator compatibility
 */
interface UserContext {
  username?: string;
  name?: string;
  roles?: string[];
  isAuthenticated?: boolean;
  [key: string]: unknown;
}

/**
 * Access control policy definition
 */
interface AccessPolicy {
  id: string;
  effect?: string;
  [key: string]: unknown;
}

/**
 * Permission check result
 */
interface PermissionResult {
  allowed: boolean;
  reason: string;
  message?: string;
}

/**
 * Maintenance mode configuration
 */
interface MaintenanceConfig {
  enabled?: boolean;
  allowAdmins?: boolean;
  allowedRoles?: string[];
  message?: string;
}

/**
 * Business hours configuration
 */
interface BusinessHoursConfig {
  enabled?: boolean;
  days?: string[];
  start?: string;
  end?: string;
}

/**
 * Holiday configuration
 */
interface HolidayConfig {
  enabled?: boolean;
  dates?: Record<string, { name?: string; message?: string }>;
  recurring?: Record<string, { name?: string; message?: string }>;
}

/**
 * Schedules configuration
 */
interface SchedulesConfig {
  enabled?: boolean;
  timeZone?: string;
  businessHours?: BusinessHoursConfig;
  holidays?: HolidayConfig;
  customSchedules?: {
    enabled?: boolean;
    [key: string]: unknown;
  };
}

/**
 * Context configuration
 */
interface ContextConfig {
  enabled?: boolean;
  timeZone?: string;
  maintenanceMode?: MaintenanceConfig;
}

/**
 * Access decision log entry
 */
interface AccessDecisionLog {
  user?: UserContext;
  pageName?: string;
  action?: string;
  allowed?: boolean;
  reason?: string;
  context?: Record<string, unknown>;
}

/**
 * ACLManager - Handles Access Control Lists and context-aware permissions
 *
 * Implements JSPWiki-style access control with extensions for context-aware
 * permissions (time-based, location-based, etc.). Supports both page-level
 * ACLs embedded in page content and global policy-based access control.
 *
 * Key features:
 * - JSPWiki-style ACL markup parsing ([{ALLOW view Admin}])
 * - Context-aware permission evaluation
 * - Global policy-based access control
 * - Audit logging of access decisions
 * - Role-based permission checking
 * - Category-based access control
 *
 * @class ACLManager
 * @extends BaseManager
 *
 * @property {Map<string, AccessPolicy>} accessPolicies - Global access policies
 * @property {any} policyEvaluator - Policy evaluation engine
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link PolicyEvaluator} for policy evaluation
 * @see {@link AuditManager} for audit logging
 *
 * @example
 * const aclManager = engine.getManager('ACLManager');
 * const canView = await aclManager.checkPermission('Main', 'view', userContext);
 * if (canView) console.log('User can view page');
 */
class ACLManager extends BaseManager {
  private accessPolicies: Map<string, AccessPolicy> = new Map();
  private policyEvaluator: PolicyEvaluator | null = null;

  /**
   * Creates a new ACLManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initializes the ACLManager by loading policies and configurations
   *
   * Loads access policies from configuration and initializes the policy
   * evaluator for context-aware permission evaluation.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await aclManager.initialize();
   * console.log('ACL system ready');
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('ACLManager requires ConfigurationManager');
    }

    const policies = configManager.getProperty('ngdpbase.access.policies', []) as AccessPolicy[];
    this.accessPolicies = new Map(policies.map((p) => [p.id, p]));
    logger.info(`📋 Loaded ${this.accessPolicies.size} access policies from ConfigurationManager`);

    // Get the PolicyEvaluator instance from the engine
    this.policyEvaluator = this.engine.getManager<PolicyEvaluator>('PolicyEvaluator') ?? null;
    if (!this.policyEvaluator) {
      logger.warn('[ACL] PolicyEvaluator manager not found. Global policies will not be evaluated.');
    }
  }

  /**
   * Initialize audit logging system based on configuration.
   */
  async initializeAuditLogging(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      return;
    }

    const auditEnabled = configManager.getProperty('ngdpbase.audit.enabled', true) as boolean;

    if (auditEnabled) {
      const logDir = configManager.getResolvedDataPath('ngdpbase.audit.provider.file.logdirectory', './data/logs');
      const preflight = this.preflightConfiguredPath(
        'ngdpbase.audit.provider.file.logdirectory',
        logDir
      );
      if (preflight.ok) {
        try {
          await fs.mkdir(logDir, { recursive: true });
          logger.info('📋 Audit logging initialized');
        } catch (error) {
          logger.warn('Warning: Could not create audit log directory:', { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }

  /**
   * Load access policies from ConfigurationManager.
   */
  async loadAccessPolicies(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      return;
    }

    const policies = configManager.getProperty('ngdpbase.access.policies', []) as AccessPolicy[];

    this.accessPolicies.clear();
    for (const policy of policies) {
      if (policy && policy.id) {
        this.accessPolicies.set(policy.id, policy);
      }
    }
    logger.info(`📋 Loaded ${this.accessPolicies.size} access policies from ConfigurationManager`);
  }

  /**
   * Parses JSPWiki-style ACL markup from page content
   *
   * Extracts ACL directives from page content in the format [{ALLOW action principals}].
   * Multiple actions and principals can be comma-separated.
   *
   * @param {string} content - The page's raw markdown content
   * @returns {Map<string, Set<string>>} Map of actions to sets of allowed principals
   *
   * @example
   * const acl = aclManager.parsePageACL('[{ALLOW view All}] [{ALLOW edit Admin}]');
   * // acl.get('view') => Set(['All'])
   * // acl.get('edit') => Set(['Admin'])
   */
  parsePageACL(content: string): Map<string, Set<string>> {
    const acl = new Map<string, Set<string>>();
    if (!content) return acl;

    // Regex to match [{ALLOW action principals}]
    const aclRegex = /\[\{\s*ALLOW\s+([a-z, ]+)\s+([^}]+)\s*\}\]/gi;
    let match;

    while ((match = aclRegex.exec(content)) !== null) {
      const actions = match[1].split(',').map((s) => s.trim().toLowerCase());
      const principals = match[2].split(',').map((s) => s.trim());

      for (const action of actions) {
        if (!acl.has(action)) {
          acl.set(action, new Set());
        }
        const principalSet = acl.get(action);
        if (principalSet) {
          principals.forEach((p) => principalSet.add(p));
        }
      }
    }
    return acl;
  }

  /**
   * Check page permission using WikiContext — rich-return form (#714 Slice F).
   *
   * Same evaluator as {@link checkPagePermissionWithContext} but returns a
   * `{ allowed, reason }` object instead of a bare boolean. Lets callers
   * specialise their 403 response on the reason — e.g. an editPage route
   * handler can detect `reason === 'author_lock_deny'` and render the
   * specific "This page is author-locked" message rather than the generic
   * "no permission to edit" 403.
   *
   * `reason` values currently emitted (from `logAccessDecision` call sites):
   *   - `private_match` / `private_deny`           (Tier 0)
   *   - `author_lock_deny`                         (Tier 0.5 — Slice A)
   *   - `frontmatter_principal_<p>` / `frontmatter_deny`  (Tier 1)
   *   - `<policyName>` / `global_policy`           (Tier 2)
   *   - `page_acl_all` / `page_acl_role_<r>` / `page_acl_user`  (Tier 3)
   *   - `default_deny`                             (no tier decided)
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page and user info
   * @param {string} action - Action to check (view, edit, delete, rename, upload)
   * @returns {Promise<{ allowed: boolean; reason: string }>} Rich decision
   */
  async evaluatePagePermission(wikiContext: WikiContext, action: string): Promise<{ allowed: boolean; reason: string }> {
    return this._runEvaluator(wikiContext, action);
  }

  /**
   * Check page permission using WikiContext — boolean (back-compat) form.
   *
   * Thin wrapper around {@link evaluatePagePermission} (#714 Slice F) that
   * discards the `reason` and returns just `allowed`. Existing callers
   * (which only care about allow/deny) keep working without change.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page and user info
   * @param {string} action - Action to check (view, edit, delete, rename, upload)
   * @returns {Promise<boolean>} True if permission granted
   *
   * @example
   * const canEdit = await aclManager.checkPagePermissionWithContext(wikiContext, 'edit');
   * if (canEdit) console.log('User can edit page');
   */
  async checkPagePermissionWithContext(wikiContext: WikiContext, action: string): Promise<boolean> {
    const { allowed } = await this._runEvaluator(wikiContext, action);
    return allowed;
  }

  /**
   * Internal evaluator — runs the 3-tier evaluator (Tier 0 private →
   * Tier 0.5 author-lock → Tier 1 audience/access → Tier 2 global
   * policies → Tier 3 deprecated page-ACL markup → default deny) and
   * returns the rich `{ allowed, reason }` decision.
   *
   * `evaluatePagePermission` (rich) and `checkPagePermissionWithContext`
   * (boolean) both delegate here.
   */
  private async _runEvaluator(wikiContext: WikiContext, action: string): Promise<{ allowed: boolean; reason: string }> {
    if (!wikiContext) {
      throw new Error('ACLManager.checkPagePermissionWithContext requires a WikiContext');
    }

    const pageName = wikiContext.pageName;
    const userContext = wikiContext.userContext;
    const pageContent = wikiContext.content;

    const roles = (userContext?.roles || []).join('|');
    logger.info(`[ACL] checkPagePermissionWithContext page=${pageName} action=${action} user=${userContext?.username} roles=${roles}`);

    // Map legacy action names to policy action names
    const actionMap: Record<string, string> = {
      view: 'page-read',
      edit: 'page-edit',
      delete: 'page-delete',
      create: 'page-create',
      rename: 'page-rename',
      upload: 'asset-upload'
    };

    // #946 Tier -1: agent-token scope ceiling.
    //
    // A delegated token may only ever exercise a SUBSET of its owner's rights,
    // so this is a hard ceiling checked BEFORE every other tier — not a tier of
    // its own. It must precede tier 1, because frontmatter `access` overrides
    // global policies and returns directly; a scope check living at tier 2
    // would simply never run on a page whose frontmatter grants the action.
    //
    // Absent `viaToken` means an ordinary session/password request, which this
    // does not constrain at all.
    const viaToken = (userContext as { viaToken?: { id: string; name: string; scopes: string[] } } | undefined)?.viaToken;
    if (viaToken) {
      const required = actionMap[action.toLowerCase()] || action;
      if (!viaToken.scopes.includes(required)) {
        this.logAccessDecision({
          user: userContext, pageName, action, allowed: false, reason: 'token_scope_deny',
          context: { wikiContext: wikiContext.context, token: viaToken.id, scopes: viaToken.scopes }
        });
        logger.info(
          `[ACL] token ${viaToken.id} ("${viaToken.name}") lacks scope '${required}' ` +
          `(has: ${viaToken.scopes.join(',') || 'none'}) — denied`
        );
        return { allowed: false, reason: 'token_scope_deny' };
      }
    }

    const policyAction = actionMap[action.toLowerCase()] || action;

    // Tier 0: private — hard constraint, not overridable by front matter.
    // #639 Slice E: top-level `private: true` is the canonical signal; the
    // user-keywords back-compat fallback was dropped after all datasets
    // migrated (Slices A–D, v3.7.0).
    //
    // #711: delegate the actual decision to PageManager.checkPrivatePageAccess
    // when available. That helper reads the page-index `creator` (sticky)
    // rather than `metadata.author` (mutable), matching the documented privacy
    // semantics in the [Page Audience] required-pages doc — an admin who
    // reassigns frontmatter `author` cannot shift private-page ownership.
    // Falls back to the previous frontmatter-author check when the helper
    // isn't available (test fixtures without a PageManager mock).
    const pmForPrivate = this.engine.getManager<{
      checkPrivatePageAccess?: (ctx: WikiContext, name: string) => Promise<boolean | null>;
        }>('PageManager');
    if (pmForPrivate?.checkPrivatePageAccess) {
      const decision = await pmForPrivate.checkPrivatePageAccess(wikiContext, pageName);
      if (decision !== null) {
        const reason = decision ? 'private_match' : 'private_deny';
        this.logAccessDecision({
          user: userContext, pageName, action, allowed: decision, reason,
          context: { wikiContext: wikiContext.context }
        });
        return { allowed: decision, reason };
      }
    } else if (wikiContext.pageMetadata?.private === true) {
      // Fallback for legacy callers without a PageManager: use frontmatter
      // `author` as the creator identity (the pre-#711 behaviour). This
      // path only fires in tests; production always has a PageManager.
      const creator = (wikiContext.pageMetadata?.author) ?? '';
      const userRoles = userContext?.roles ?? [];
      const username  = userContext?.username ?? '';
      const allowed   = userRoles.includes('admin') || username === creator;
      const reason    = allowed ? 'private_match' : 'private_deny';
      this.logAccessDecision({
        user: userContext, pageName, action, allowed, reason,
        context: { wikiContext: wikiContext.context }
      });
      return { allowed, reason };
    }

    // Tier 0.5: author-lock — write-time constraint on `edit` actions only
    // (#714 Slice A — first slice of the unified-access-control epic).
    //
    // Semantics (mirrors the route-layer branch at `WikiRoutes.editPage`):
    //   - Only applies when `action === 'edit'` (author-lock is a write
    //     constraint, not a read constraint).
    //   - Tier 0 (private) takes precedence — if we reached Tier 0.5, the
    //     page is NOT private. The route-layer's explicit
    //     `private !== true` guard is implicit here through tier ordering.
    //   - Author-lock DENIES non-author, non-admin edit attempts. It does
    //     NOT grant access — if the user IS author or admin, we fall
    //     through to Tier 1+ so the normal evaluator decides.
    //
    // During #714 Slice A we DO NOT remove the route-layer branch
    // (`WikiRoutes.ts:2338`); both paths can deny independently. They
    // produce different error messages — the route-layer branch's
    // "This page is author-locked..." vs the more general "no permission
    // to edit" rendered by callers consuming `checkPagePermissionWithContext`.
    // Slice E removes the route-layer branch once `evaluatePagePermission`
    // (Slice F's rich-return form) lets the route specialise the 403
    // message on `reason === 'author_lock_deny'`.
    if (action.toLowerCase() === 'edit'
        && wikiContext.pageMetadata?.['author-lock'] === true) {
      const isAdmin = (userContext?.roles ?? []).includes('admin');
      const isAuthor = (userContext?.username ?? '') === (wikiContext.pageMetadata?.author ?? '');
      if (!isAdmin && !isAuthor) {
        this.logAccessDecision({
          user: userContext,
          pageName,
          action,
          allowed: false,
          reason: 'author_lock_deny',
          context: { wikiContext: wikiContext.context }
        });
        return { allowed: false, reason: 'author_lock_deny' };
      }
      // fall through — author-lock doesn't grant edit, it only denies.
      // Tier 1+ decides whether this author/admin is actually permitted.
    }

    // Tier 1: Front matter audience / access check — page-level overrides global policies
    if (wikiContext.pageMetadata) {
      const fm = this.checkFrontmatterAccess(wikiContext.pageMetadata, userContext, action);
      if (fm.decided) {
        this.logAccessDecision({
          user: userContext,
          pageName,
          action,
          allowed: fm.allowed,
          reason: fm.reason,
          context: { wikiContext: wikiContext.context }
        });
        return { allowed: fm.allowed, reason: fm.reason };
      }
    }

    // Tier 2: Evaluate Global Policies (fallback when no frontmatter audience set)
    if (this.policyEvaluator) {
      try {
        const policyContext = { pageName, action: policyAction, userContext };

        const policyResult = await this.policyEvaluator.evaluateAccess(policyContext);

        logger.info(`[ACL] PolicyEvaluator decision hasDecision=${policyResult.hasDecision} allowed=${policyResult.allowed} policy=${policyResult.policyName}`);

        if (policyResult.hasDecision) {
          const reason = policyResult.policyName || 'global_policy';
          this.logAccessDecision({
            user: userContext,
            pageName,
            action,
            allowed: policyResult.allowed,
            reason,
            context: { wikiContext: wikiContext.context }
          });

          return { allowed: policyResult.allowed, reason };
        }
      } catch (e) {
        logger.warn('[ACL] PolicyEvaluator error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
      }
    }

    // Tier 3: Page-Level ACL markup (deprecated — blocked on new saves)
    if (pageContent && typeof pageContent === 'string') {
      const pageAcl = this.parsePageACL(pageContent);
      const principals = pageAcl.get(action.toLowerCase());
      logger.info(`[ACL] Page ACL for action=${action}: ${principals ? Array.from(principals).join('|') : 'none'}`);

      if (principals) {
        if (principals.has('All')) {
          this.logAccessDecision({
            user: userContext,
            pageName,
            action,
            allowed: true,
            reason: 'page_acl_all',
            context: { wikiContext: wikiContext.context }
          });
          return { allowed: true, reason: 'page_acl_all' };
        }
        if (userContext?.roles) {
          for (const r of userContext.roles) {
            if (principals.has(r)) {
              const reason = `page_acl_role_${r}`;
              this.logAccessDecision({
                user: userContext,
                pageName,
                action,
                allowed: true,
                reason,
                context: { wikiContext: wikiContext.context }
              });
              return { allowed: true, reason };
            }
          }
        }
        if (userContext?.username && principals.has(userContext.username)) {
          this.logAccessDecision({
            user: userContext,
            pageName,
            action,
            allowed: true,
            reason: 'page_acl_user',
            context: { wikiContext: wikiContext.context }
          });
          return { allowed: true, reason: 'page_acl_user' };
        }
      }
    }

    logger.info(`[ACL] Default deny for page=${pageName} (no policy/ACL matched)`);
    this.logAccessDecision({
      user: userContext,
      pageName,
      action,
      allowed: false,
      reason: 'default_deny',
      context: { wikiContext: wikiContext.context }
    });
    return { allowed: false, reason: 'default_deny' };
  }

  /**
   * Check whether a user can access a given page — for cross-page checks where
   * the current WikiContext describes a DIFFERENT page than the one being
   * checked (#714 Slice B).
   *
   * Loads the target page's metadata internally (`PageManager.getPageMetadata`)
   * and constructs a minimal WikiContext shape for the evaluator. This is the
   * implementation that {@link WikiContext.canAccess} delegates to when its
   * `pageNameOverride` parameter is set.
   *
   * Used today by:
   *   - linked-page visibility filters (a list page wanting to drop entries
   *     the user can't view)
   *   - {@link WikiRoutes.serveAttachment}'s owning-page check (the page
   *     hosting the attachment may be private; the request URL is the
   *     attachment URL, not the page URL).
   *
   * Returns false when:
   *   - the target page has no resolvable metadata (deleted, never existed,
   *     or PageManager unavailable). This is the **conservative-on-security**
   *     default — see #714 EPIC body's "Behavior decision point" for the
   *     pre-#714 allow→deny shift for the private-attachment-no-page-name
   *     case.
   *   - any tier returns deny.
   *
   * @param userContext - The user requesting access (may be null / anonymous).
   * @param pageName    - Target page to check.
   * @param action      - Action verb (e.g., `'view'`, `'edit'`, `'delete'`).
   */
  async canUserAccessPage(
    userContext: UserContext | null | undefined,
    pageName: string,
    action: string
  ): Promise<boolean> {
    if (!pageName) {
      // Conservative-on-security: no page name → deny. Pre-#714 callers in
      // WikiRoutes.checkPrivatePageAccess returned allow for the
      // can't-resolve-page-name case (conservative-on-availability). The
      // EPIC body flags this as the user-visible shift in Slice C/D.
      return false;
    }

    // Load target metadata. PageManager.getPageMetadata may be unavailable
    // in test fixtures without a PageManager mock — deny in that case (we
    // can't evaluate without metadata).
    type PageManagerShape = {
      getPageMetadata?: (id: string) => Promise<PageFrontmatter | null>;
    };
    const pm = this.engine.getManager<PageManagerShape>('PageManager');
    const pageMetadata = pm?.getPageMetadata
      ? await pm.getPageMetadata(pageName).catch(() => null)
      : null;
    if (!pageMetadata) {
      return false;
    }

    // Build a minimal WikiContext-shaped object for the evaluator. We don't
    // have a full request-scope context here (no req/res, no rendering
    // context); the evaluator only reads pageName / userContext /
    // pageMetadata / context fields.
    const minimalCtx = {
      pageName,
      userContext: userContext ?? null,
      pageMetadata,
      content: null,
      context: 'cross-page-check'
    };
    return this.checkPagePermissionWithContext(
      minimalCtx as unknown as WikiContext,
      action
    );
  }

  /**
   * Check front matter audience / access fields (Tier 1.5).
   * Returns a decision object; decided=false means no front matter restriction — fall through.
   */
  private checkFrontmatterAccess(
    metadata: PageFrontmatter,
    userContext: UserContext | null | undefined,
    action: string
  ): { decided: boolean; allowed: boolean; reason: string } {
    // #1054: the rule itself now lives in utils/frontmatterAccess so the page
    // LISTERS decide identically to this evaluator. They previously did not —
    // getRecentChanges only consulted `audience` on already-private pages, so a
    // non-private page with an audience was listed to viewers this method
    // correctly 403s. Behaviour here is unchanged; only the home of the logic
    // moved. The `reason` strings stay, since callers branch on them.
    const userRoles = userContext?.roles ?? [];
    const username  = userContext?.username ?? '';
    const viewerPrincipals = username ? [...userRoles, username] : [...userRoles];

    const decision = decideFrontmatterAccess(metadata, viewerPrincipals, action);
    if (!decision.decided) return { decided: false, allowed: false, reason: '' };
    return decision.allowed
      ? { decided: true, allowed: true, reason: `frontmatter_principal_${decision.matched}` }
      : { decided: true, allowed: false, reason: 'frontmatter_deny' };
  }

  // #632: deprecated `checkPagePermission(pageName, action, userContext, content)`
  // removed. All callers migrated to `checkPagePermissionWithContext(wikiContext, action)`,
  // which runs the full 3-tier evaluator (private flag → frontmatter audience/access
  // → global policies). The old 4-arg form lacked tier 0 entirely.

  /**
   * Perform standard ACL check (original logic)
   * @param {string} pageName - Name of the page
   * @param {string} action - Action to check
   * @param {UserContext | null} user - User object
   * @param {string} pageContent - Page content
   * @returns {Promise<boolean>} True if permission granted
   */
  async performStandardACLCheck(pageName: string, action: string, user: UserContext | null, pageContent: string): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      throw new Error('UserManager not available');
    }

    // If user has admin:system permission, always allow
    if (user?.username && (await userManager.hasPermission(user.username, 'admin:system'))) {
      return true;
    }

    // Parse ACL from page content
    const acl = this.parseACL(pageContent);

    // If ACL exists, use ACL rules
    if (acl) {
      const allowedPrincipals = acl[action.toLowerCase()] || [];

      // If specific ACL for this action exists, check it
      if (allowedPrincipals.length > 0) {
        const result = this.userMatchesPrincipals(user, allowedPrincipals);
        return result;
      }
    }

    // Default policy: Allow read access to all pages unless it's a system/admin page
    if (action.toLowerCase() === 'view') {
      // Check if this is a system/admin page that should be restricted
      const isSystemPage = this.isSystemOrAdminPage(pageName);

      if (isSystemPage) {
        // System/admin pages require proper permissions
        const result = await this.checkDefaultPermission(action, user);
        return result;
      }
      // Regular pages are readable by everyone (including anonymous)
      return true;
    }

    // For non-view actions (edit, delete, etc.), check role-based permissions
    const result = await this.checkDefaultPermission(action, user);
    return result;
  }

  /**
   * Parse ACL from page content (legacy format)
   * @private
   */
  private parseACL(pageContent: string): Record<string, string[]> | null {
    // This is a simplified implementation for backwards compatibility
    const acl = this.parsePageACL(pageContent);
    if (acl.size === 0) return null;

    const result: Record<string, string[]> = {};
    for (const [action, principals] of acl.entries()) {
      result[action] = Array.from(principals);
    }
    return result;
  }

  /**
   * Check if user matches principals
   * @private
   */
  private userMatchesPrincipals(user: UserContext | null, principals: string[]): boolean {
    if (principals.includes('All')) return true;
    if (!user) return false;

    if (user.roles) {
      for (const role of user.roles) {
        if (principals.includes(role)) return true;
      }
    }

    if (user.username && principals.includes(user.username)) return true;
    return false;
  }

  /**
   * Check if page is system or admin page
   * @private
   */
  private isSystemOrAdminPage(pageName: string): boolean {
    const systemPages = ['admin', 'system', 'config', 'settings'];
    const lowerName = pageName.toLowerCase();
    return systemPages.some((prefix) => lowerName.startsWith(prefix));
  }

  /**
   * Check default permissions for actions using UserManager
   * @param {string} action - Action to check (view, edit, delete, etc.)
   * @param {UserContext | null} user - User object or null for anonymous
   * @returns {Promise<boolean>} True if user has permission, false otherwise
   */
  async checkDefaultPermission(action: string, user: UserContext | null): Promise<boolean> {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) {
      logger.warn('UserManager not available for permission check');
      return false;
    }

    // Map actions to permission strings
    const permissionMap: Record<string, string> = {
      view: 'page:read',
      edit: 'page:edit',
      delete: 'page:delete',
      create: 'page:create'
    };

    const permission = permissionMap[action.toLowerCase()] || `page:${action.toLowerCase()}`;
    const username = user?.username ?? 'anonymous';

    const result = await userManager.hasPermission(username, permission);

    return result;
  }

  /**
   * Check context-aware restrictions (time-based, maintenance mode)
   * @param {UserContext | null} user - User object
   * @param {Record<string, unknown>} context - Request context
   * @returns {Promise<PermissionResult>} Permission result with reason
   */
  async checkContextRestrictions(user: UserContext | null, context: Record<string, unknown>): Promise<PermissionResult> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      return { allowed: true, reason: 'no_config' };
    }

    const contextAwareEnabled = configManager.getProperty('ngdpbase.access-control.context-aware.enabled', true) as boolean;

    if (!contextAwareEnabled) {
      return { allowed: true, reason: 'context_disabled' };
    }

    // Build context config object from ConfigurationManager properties
    const contextConfig: ContextConfig = {
      enabled: contextAwareEnabled,
      timeZone: configManager.getProperty('ngdpbase.access-control.context-aware.time-zone', 'UTC') as string,
      maintenanceMode: {
        enabled: configManager.getProperty('ngdpbase.features.maintenance.enabled', false) as boolean,
        allowAdmins: configManager.getProperty('ngdpbase.features.maintenance.allow-admins', true) as boolean
      }
    };

    // Skip context restrictions for anonymous users on public wiki
    if (!user || user.username === 'anonymous' || user.username === 'asserted') {
      return { allowed: true, reason: 'anonymous_user' };
    }

    // Check maintenance mode
    const maintenanceCheck = this.checkMaintenanceMode(user, contextConfig.maintenanceMode);
    if (!maintenanceCheck.allowed) {
      return maintenanceCheck;
    }

    // Check time-based restrictions (enhanced)
    const timeCheck = await this.checkEnhancedTimeRestrictions(user, context);
    if (!timeCheck.allowed) {
      return timeCheck;
    }

    return { allowed: true, reason: 'context_allowed' };
  }

  /**
   * Check maintenance mode restrictions
   * @param {UserContext} user - User object
   * @param {MaintenanceConfig} maintenanceConfig - Maintenance mode configuration
   * @returns {PermissionResult} Permission result
   */
  checkMaintenanceMode(user: UserContext, maintenanceConfig: MaintenanceConfig = {}): PermissionResult {
    if (!maintenanceConfig.enabled) {
      return { allowed: true, reason: 'maintenance_disabled' };
    }

    // Check if user has allowed role during maintenance
    if (user && user.roles) {
      const allowedRoles = maintenanceConfig.allowedRoles || ['admin'];
      const hasAllowedRole = user.roles.some((role) => allowedRoles.includes(role));

      if (hasAllowedRole) {
        return { allowed: true, reason: 'maintenance_override' };
      }
    }

    return {
      allowed: false,
      reason: 'maintenance_mode',
      message: maintenanceConfig.message || 'System is under maintenance'
    };
  }

  /**
   * Check business hours restrictions
   * @param {BusinessHoursConfig} businessHoursConfig - Business hours configuration
   * @param {string} timeZone - Time zone for business hours
   * @returns {PermissionResult} Permission result
   */
  checkBusinessHours(businessHoursConfig: BusinessHoursConfig = {}, timeZone: string = 'UTC'): PermissionResult {
    if (!businessHoursConfig.enabled) {
      return { allowed: true, reason: 'business_hours_disabled' };
    }

    try {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-US', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      const currentDay = now
        .toLocaleDateString('en-US', {
          timeZone,
          weekday: 'long'
        })
        .toLowerCase();

      const allowedDays = businessHoursConfig.days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
      const startTime = businessHoursConfig.start || '09:00';
      const endTime = businessHoursConfig.end || '17:00';

      // Check if current day is allowed
      if (!allowedDays.includes(currentDay)) {
        return {
          allowed: false,
          reason: 'outside_business_days',
          message: `Access restricted outside business days (${allowedDays.join(', ')})`
        };
      }

      // Check if current time is within business hours
      if (currentTime < startTime || currentTime > endTime) {
        return {
          allowed: false,
          reason: 'outside_business_hours',
          message: `Access restricted outside business hours (${startTime}-${endTime} ${timeZone})`
        };
      }

      return { allowed: true, reason: 'within_business_hours' };
    } catch (error) {
      logger.warn('Error checking business hours:', error instanceof Error ? error.message : String(error));
      return { allowed: true, reason: 'business_hours_error' };
    }
  }

  /**
   * Enhanced time-based permission checking with custom schedules and holidays
   * @param {UserContext} user - User object
   * @param {Record<string, unknown>} context - Access context
   * @returns {Promise<PermissionResult>} Permission result
   */
  async checkEnhancedTimeRestrictions(user: UserContext, context: Record<string, unknown>): Promise<PermissionResult> {
    try {
      const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      if (!cfg) {
        await this.notify('ConfigurationManager not available for time restrictions', 'error');
        throw new Error('ConfigurationManager not available');
      }

      const enabled = cfg.getProperty('ngdpbase.schedules.enabled', true);
      if (!enabled) {
        return { allowed: true, reason: 'schedules_disabled' };
      }

      const schedulesRaw: unknown = cfg.getProperty('ngdpbase.schedules', null);
      if (!schedulesRaw || typeof schedulesRaw !== 'object' || Object.keys(schedulesRaw).length === 0) {
        await this.notify('ACLManager: ngdpbase.schedules missing during check', 'error');
        throw new Error('Schedules configuration missing');
      }
      const schedules = schedulesRaw as SchedulesConfig;

      const now = new Date();
      const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

      const timeZone = String(cfg.getProperty('ngdpbase.time-zone', 'UTC'));
      const currentTime = now.toLocaleTimeString('en-US', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      // Check holidays first (they override all other schedules)

      if (schedules.holidays?.enabled) {
        const holidayCheck = await this.checkHolidayRestrictions(currentDate, schedules.holidays);
        if (!holidayCheck.allowed) {
          return holidayCheck;
        }
      }

      // Check custom schedules if enabled

      if (schedules.customSchedules?.enabled) {
        const scheduleCheck = await this.checkCustomSchedule(user, context, currentDate, currentTime, schedules);
        if (scheduleCheck.allowed !== undefined) {
          return scheduleCheck as PermissionResult;
        }
      }

      // Fall back to basic business hours

      return this.checkBusinessHours(schedules.businessHours, schedules.timeZone);
    } catch (error) {
      await this.notify(`Error in enhanced time restrictions: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return { allowed: false, reason: 'schedule_check_error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Check custom schedule
   * @private
   */
  private async checkCustomSchedule(_user: UserContext, _context: Record<string, unknown>, _currentDate: string, _currentTime: string, _schedules: SchedulesConfig): Promise<Partial<PermissionResult>> {
    // Placeholder for custom schedule logic
    return {};
  }

  /**
   * Check holiday restrictions
   * @param {string} currentDate - Current date in YYYY-MM-DD format
   * @param {HolidayConfig} holidaysConfig - Holiday configuration
   * @returns {Promise<PermissionResult>} Permission result
   */
  async checkHolidayRestrictions(currentDate: string, _holidaysConfig: HolidayConfig): Promise<PermissionResult> {
    try {
      // Require holidays from ConfigurationManager only (no file fallback)
      const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      if (!cfg) {
        await this.notify('ConfigurationManager not available for holiday checks', 'error');
        throw new Error('Holiday checks require ConfigurationManager');
      }

      const enabled = cfg.getProperty('ngdpbase.holidays.enabled', false) as boolean;
      if (!enabled) {
        return { allowed: true, reason: 'holidays_disabled' };
      }

      const dates = cfg.getProperty('ngdpbase.holidays.dates', null) as Record<string, { name?: string; message?: string }> | null;
      const recurring = cfg.getProperty('ngdpbase.holidays.recurring', null) as Record<string, { name?: string; message?: string }> | null;
      if (!dates || typeof dates !== 'object' || !recurring || typeof recurring !== 'object') {
        await this.notify('Holiday configuration missing: ngdpbase.holidays.dates/recurring', 'error');
        throw new Error('Holiday configuration missing');
      }

      // Exact date match
      if (dates[currentDate]) {
        const holiday = dates[currentDate] ?? {};
        return {
          allowed: false,
          reason: 'holiday_restriction',
          message: holiday.message ?? `Access restricted on ${holiday.name ?? 'holiday'}`
        };
      }

      // Recurring holiday match (*-MM-DD)
      const [, month, day] = currentDate.split('-');
      const recurringKey = `*-${month}-${day}`;

      if (recurring[recurringKey]) {
        const holiday = recurring[recurringKey] ?? {};
        return {
          allowed: false,
          reason: 'recurring_holiday_restriction',
          message: holiday.message ?? `Access restricted on ${holiday.name ?? 'holiday'}`
        };
      }

      return { allowed: true, reason: 'not_a_holiday' };
    } catch (error) {
      await this.notify(`Error checking holiday restrictions: ${error instanceof Error ? error.message : String(error)}`, 'error');
      // Treat as a hard failure to satisfy "no fallback"
      return { allowed: false, reason: 'holiday_check_error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Send notification to NotificationManager
   * @private
   */
  private async notify(message: string, level: 'warn' | 'error' = 'warn'): Promise<void> {
    const nm = this.engine.getManager<NotificationManager>('NotificationManager');
    try {
      if (nm?.addNotification) {
        // Map 'warn' to 'warning' for NotificationInput compatibility
        const notificationLevel: 'info' | 'warning' | 'error' | 'success' = level === 'warn' ? 'warning' : level;
        await nm.addNotification({ level: notificationLevel, message, title: 'ACLManager' });
      } else {
        if (level === 'error') {
          logger.error(message);
        } else {
          logger.warn(message);
        }
      }
    } catch {
      logger.warn(message);
    }
  }

  /**
   * Record/audit an access decision.
   * Accepts either a single object or positional args for backward compatibility.
   */
  logAccessDecision(userOrObj: UserContext | AccessDecisionLog, pageName?: string, action?: string, allowed?: boolean, reason?: string, _context: Record<string, unknown> = {}): void {
    let user: UserContext | undefined = userOrObj as UserContext;
    if (arguments.length === 1 && userOrObj && typeof userOrObj === 'object') {
      const obj = userOrObj as AccessDecisionLog;
      user = obj.user;
      pageName = obj.pageName;
      action = obj.action;
      allowed = obj.allowed;
      reason = obj.reason;
      // context preserved for potential future use or logging
      void (obj.context || {});
    }
    const username = user?.username || user?.name || 'anonymous';
    const msg = `ACL decision: user=${username} page=${pageName} action=${action} allowed=${!!allowed} reason=${reason || 'n/a'}`;
    if (allowed) {
      this.engine?.logger?.info?.(msg);
    } else {
      this.engine?.logger?.warn?.(msg);
    }
    // ACL decisions are audit-log entries only — do NOT forward to NotificationManager
    // as they fire on every page view and flood the notification UI (#334)
  }

  /**
   * Strip ACL markup from page content before rendering menus/partials.
   * Supports common patterns: [{ALLOW ...}], [{DENY ...}], %%acl ... %%, (:acl ... :)
   */
  removeACLMarkup(content: string): string {
    if (typeof content !== 'string' || !content) return content;
    const pluginPattern = /\[\{\s*(ALLOW|DENY)\b[^}]*\}\]/gim;
    const percentBlock = /%%acl[\s\S]*?%%/gim;
    const directiveParen = /\(:\s*acl\b[^:]*:\)/gim;
    return content.replace(pluginPattern, '').replace(percentBlock, '').replace(directiveParen, '');
  }

  // Alias for compatibility if other code calls stripACLMarkup
  stripACLMarkup(content: string): string {
    return this.removeACLMarkup(content);
  }

  // NOTE: ACLManager does not need backup/restore methods because:
  // - All policies are loaded from ConfigurationManager (backed up by ConfigurationManager)
  // - Per-page ACLs are embedded in page content (backed up by PageManager)
  // - The accessPolicies Map is just a runtime cache that can be rebuilt from config
}

export default ACLManager;
