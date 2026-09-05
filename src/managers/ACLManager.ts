import BaseManager from './BaseManager.js';
import { promises as fs } from 'fs';
import logger from '../utils/logger.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type UserManager from './UserManager.js';
import { ANONYMOUS_SUBJECT, type AgentTokenGrant } from './UserManager.js';
import type PolicyEvaluator from './PolicyEvaluator.js';
import type NotificationManager from './NotificationManager.js';
import type { PageFrontmatter } from '../types/Page.js';
import { shareCoversResource, type ShareGrant } from '../types/Share.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import { decideFrontmatterAccess } from '../utils/frontmatterAccess.js';
import { resolveMaintenanceState } from '../utils/maintenanceState.js';

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
  /** #1212: the three authorisation fields are required; `null` is the anonymous visitor. */
  username: string;
  name?: string;
  roles: string[];
  isAuthenticated: boolean;
  /** The delegations a request carries; declared so the index signature does not erase their type. */
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
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

    // #1222 Tier -1: share ceiling (epic #1225).
    //
    // A share visit is an anonymous subject carrying `viaShare`. The share is
    // a delegation, so it bounds the request the way a token does — before
    // every tier, for the same reason as above — and in four ways: the action
    // must be one the share carries; the page must be covered by the share's
    // resources (its user-keywords match, and it is not `owner-only`); the
    // share must not have expired; and the issuer must STILL hold the action,
    // resolved live, so revoking the issuer's role stops every share they
    // issued on the next request. Metadata that cannot be read refuses —
    // conservative on security, the #714 convention. What passes here is
    // then subject to the page's own rules (tiers 0–1) exactly as any
    // anonymous visitor is: a private page or a restricted audience refuses.
    const viaShare = (userContext as { viaShare?: ShareGrant } | undefined)?.viaShare;
    if (viaShare) {
      const refuse = (reason: string, detail: string): { allowed: false; reason: string } => {
        this.logAccessDecision({
          user: userContext, pageName, action, allowed: false, reason,
          context: { wikiContext: wikiContext.context, share: viaShare.id, issuer: viaShare.issuer }
        });
        logger.info(`[ACL] share ${viaShare.id} (issued by ${viaShare.issuer}): ${detail} — denied`);
        return { allowed: false, reason };
      };
      if (!viaShare.actions.includes(policyAction)) {
        return refuse('share_action_deny', `does not delegate '${policyAction}' (has: ${viaShare.actions.join(',') || 'none'})`);
      }
      if (viaShare.expiresAt && Date.now() > Date.parse(viaShare.expiresAt)) {
        return refuse('share_expired', `expired ${viaShare.expiresAt}`);
      }
      const keywords = wikiContext.pageMetadata?.['user-keywords'];
      if (!wikiContext.pageMetadata || !shareCoversResource(viaShare.resources, 'page', keywords ?? [])) {
        return refuse('share_resource_deny', `does not cover page '${pageName}'`);
      }
      const userManager = this.engine.getManager<Pick<UserManager, 'userHoldsPermission'>>('UserManager');
      if (!userManager || !(await userManager.userHoldsPermission(viaShare.issuer, policyAction))) {
        return refuse('share_issuer_deny', `issuer no longer holds '${policyAction}'`);
      }
    }

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

    // #1222 Tier 2 for a share: the share IS the policy. The ceiling above
    // already held the issuer's live authority over it, and the page's own
    // rules have had their say. Global policy is about the bearer's roles,
    // and this bearer has none — asking it would refuse every share on an
    // instance that gives anonymous nothing, which is the instance a share
    // exists for.
    if (viaShare) {
      this.logAccessDecision({
        user: userContext, pageName, action, allowed: true, reason: 'share_grant',
        context: { wikiContext: wikiContext.context, share: viaShare.id, issuer: viaShare.issuer }
      });
      return { allowed: true, reason: 'share_grant' };
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
    //
    // #1219: `hasRole` is carried. Tier 0 asks `wikiContext.hasRole('admin')`
    // for the private-page bypass, and this shape never had it, so an admin
    // was refused a private page through every cross-page check — the
    // attachment owning-page check, linked media, `canAccess(action, other)` —
    // while the same-page path allowed it. The two doors disagreed; a filter
    // that has to agree with both made it visible.
    const ctxRoles = userContext?.roles ?? [];
    const minimalCtx = {
      pageName,
      userContext: userContext ?? null,
      pageMetadata,
      content: null,
      context: 'cross-page-check',
      hasRole: (...names: string[]) => names.some((n) => ctxRoles.includes(n))
    };
    return this.checkPagePermissionWithContext(
      minimalCtx as unknown as WikiContext,
      action
    );
  }

  /**
   * Which of these pages may this user perform `action` on? (#1219)
   *
   * Rule 10's `filter(ctx, action, query)`: the tiers `_runEvaluator` applies
   * to ONE page, applied over the page index — no disk read (metadata comes
   * from the provider's in-memory cache), no log line and no audit record per
   * page. Listing many and deciding one are the same evaluator, so a listing
   * can never name a page its reader cannot open, nor hide one they can.
   *
   * Tier by tier, mirroring `_runEvaluator`: the token and share ceilings
   * (once for the subject, then the share's resource cover per page); tier 0
   * private through `PageManager.checkPrivatePageAccess`; tier 0.5
   * author-lock for `edit`; tier 1 frontmatter audience/access; tier 2 global
   * policy, compiled once through `PolicyEvaluator.compile`, or the share
   * standing in for it. Tier 3 — deprecated page-ACL markup, blocked on new
   * saves — needs page content and is not indexed: a page whose only grant is
   * that markup is hidden here. That is the conservative direction, and it is
   * the one documented divergence from `canUserAccessPage`.
   *
   * A candidate without metadata is not listed (#714's convention). Order is
   * preserved. Returns titles.
   */
  async filterAccessiblePages(
    userContext: UserContext | null | undefined,
    action: string,
    candidates: ReadonlyArray<{ title: string; metadata: PageFrontmatter | null | undefined }>
  ): Promise<string[]> {
    const actionMap: Record<string, string> = {
      view: 'page-read', edit: 'page-edit', delete: 'page-delete', create: 'page-create', rename: 'page-rename', upload: 'asset-upload'
    };
    const policyAction = actionMap[action.toLowerCase()] || action;
    const roles = userContext?.roles ?? [];
    const username = userContext?.username ?? '';
    const isAdmin = roles.includes('admin');

    // The ceilings that bound the SUBJECT decide once, for every page.
    const viaToken = (userContext as { viaToken?: { scopes: string[] } } | null | undefined)?.viaToken;
    if (viaToken && !viaToken.scopes.includes(policyAction)) return [];
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    if (viaShare) {
      if (!viaShare.actions.includes(policyAction)) return [];
      if (viaShare.expiresAt && Date.now() > Date.parse(viaShare.expiresAt)) return [];
      const userManager = this.engine.getManager<Pick<UserManager, 'userHoldsPermission'>>('UserManager');
      if (!userManager || !(await userManager.userHoldsPermission(viaShare.issuer, policyAction))) return [];
    }

    const pageManager = this.engine.getManager<{
      checkPrivatePageAccess?: (ctx: WikiContext, name: string) => Promise<boolean | null>;
        }>('PageManager');
    // Tier 0 reads `hasRole('admin')` off the context, as the decider's does.
    const privateCtx = { userContext: userContext ?? null, hasRole: (r: string) => roles.includes(r) } as unknown as WikiContext;
    const decidePolicy = this.policyEvaluator?.compile(userContext ?? undefined, policyAction);

    const out: string[] = [];
    for (const { title, metadata } of candidates) {
      if (!metadata) continue;

      if (viaShare && !shareCoversResource(viaShare.resources, 'page', metadata['user-keywords'] ?? [])) continue;

      // Tier 0: private — through the same helper the decider uses (index
      // creator, admin bypass); the frontmatter flag is the fallback where the
      // helper is absent (fixtures without a PageManager).
      if (pageManager?.checkPrivatePageAccess) {
        const decision = await pageManager.checkPrivatePageAccess(privateCtx, title);
        if (decision === false) continue;
        if (decision === true) { out.push(title); continue; }
      } else if (metadata.private === true) {
        if (!(isAdmin || (username && username === (metadata.author ?? '')))) continue;
        out.push(title); continue;
      }

      // Tier 0.5: author-lock denies a non-author, non-admin edit; it grants nothing.
      if (action.toLowerCase() === 'edit' && metadata['author-lock'] === true) {
        if (!isAdmin && username !== (metadata.author ?? '')) continue;
      }

      // Tier 1: frontmatter audience / access decides when it states a rule.
      const fm = this.checkFrontmatterAccess(metadata, userContext, action);
      if (fm.decided) { if (fm.allowed) out.push(title); continue; }

      // Tier 2: the share is the policy for a share subject; global policy otherwise.
      if (viaShare) { out.push(title); continue; }
      const policy = decidePolicy?.(title);
      if (policy?.hasDecision) { if (policy.allowed) out.push(title); continue; }

      // Tier 3 is not indexed; default deny.
    }
    return out;
  }

  /**
   * May this user read this media item? (#1223, epic #1225)
   *
   * The media door's question, asked of the evaluator rather than answered
   * in `MediaManager.getItem` and again in the share routes. Two parts:
   *
   * 1. __The share ceiling__, for a subject carrying `viaShare` — the twin of
   *    the page ceiling in `_runEvaluator`: `asset-read` must be delegated,
   *    the share unexpired, the item's keywords covered by the share's media
   *    resources (and not `owner-only`), the item not private, and the issuer
   *    still holding `asset-read` live. An ordinary session skips this part.
   * 2. __The linked page's own rules__, for everyone: an item linked to a page
   *    is readable only by someone who may view that page (#714 Slice D),
   *    which for a share subject runs the page ceiling too.
   *
   * A refusal is audited as `authorization-deny` on the media resource, with
   * the share attribution when there is one.
   */
  async canUserAccessMediaItem(
    userContext: UserContext | null | undefined,
    item: MediaItem
  ): Promise<boolean> {
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    if (viaShare) {
      const refuse = (reason: string, detail: string): false => {
        logger.info(`[ACL] share ${viaShare.id} (issued by ${viaShare.issuer}): ${detail} — media ${item.id} denied`);
        void this.auditDenial(userContext?.username || 'anonymous', item.id, 'asset-read', reason, viaShare, 'media');
        return false;
      };
      if (!viaShare.actions.includes('asset-read')) {
        return refuse('share_action_deny', 'does not delegate asset-read');
      }
      if (viaShare.expiresAt && Date.now() > Date.parse(viaShare.expiresAt)) {
        return refuse('share_expired', `expired ${viaShare.expiresAt}`);
      }
      // `metadata.keywords` sits under the index signature as string | string[].
      const raw = item.metadata?.keywords;
      const keywords: string[] = Array.isArray(raw)
        ? raw.filter((k): k is string => typeof k === 'string')
        : typeof raw === 'string' ? [raw] : [];
      if (item.isPrivate || !shareCoversResource(viaShare.resources, 'media', keywords)) {
        return refuse('share_resource_deny', 'does not cover the item');
      }
      const userManager = this.engine.getManager<Pick<UserManager, 'userHoldsPermission'>>('UserManager');
      if (!userManager || !(await userManager.userHoldsPermission(viaShare.issuer, 'asset-read'))) {
        return refuse('share_issuer_deny', 'issuer no longer holds asset-read');
      }
    }
    if (item.linkedPageName) {
      return this.canUserAccessPage(userContext, item.linkedPageName, 'view');
    }
    return true;
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
    if (user?.username && (await userManager.hasPermission(user, 'admin:system'))) {
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

    // #1164: the context carries the agent token; `username` alone does not.
    // #1212: and the named constant for nobody, not `{ username }` — a
    // one-field literal was a rebuilt subject the lint could not see (it
    // matched only `hasPermission({`). The compiler refuses it now.
    const result = await userManager.hasPermission(user ?? ANONYMOUS_SUBJECT, permission);

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
      // #1147: resolved through the shared helper, the same one the gate
      // middleware uses, so the ACL evaluator and the gate cannot disagree
      // about whether the instance is in maintenance.
      maintenanceMode: (() => {
        const state = resolveMaintenanceState((key, fallback) => configManager.getProperty(key, fallback));
        return {
          enabled: state.enabled,
          allowAdmins: state.allowAdmins,
          // allowAdmins was previously read and then ignored: checkMaintenanceMode
          // consults allowedRoles, which nothing set, so it always let the admin
          // role through even when the operator had turned that off.
          allowedRoles: state.allowAdmins ? ['admin'] : []
        };
      })()
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

    // #1115: until now this method wrote to the APPLICATION log and stopped
    // there, despite its name and despite the comment above calling these
    // audit-log entries. Every access denial in the system was invisible to the
    // audit trail — a real gap rather than a naming one, since a denied access
    // going unrecorded is the first thing an assessment asks about.
    //
    // Denials only. An allow fires on every page view, which is the read-volume
    // that auditRegistry exempts `page-read` for and that #334 was filed about.
    // A denial is rare and is the half worth keeping.
    if (!allowed) {
      void this.auditDenial(username, pageName, action, reason, (user as { viaShare?: ShareGrant } | undefined)?.viaShare);
    }
  }

  /**
   * Record a denied access decision in the audit trail (#1115).
   *
   * Best-effort and never awaited by the decision path: the answer to "may
   * this user do this" must not depend on the audit backend being healthy, and
   * a slow sink must not delay a page render. `authorization-deny` is standard
   * tier for that reason — the critical tier is destruction and credentials.
   */
  private async auditDenial(
    username: string,
    pageName: string | undefined,
    action: string | undefined,
    reason: string | undefined,
    viaShare?: ShareGrant,
    resourceType: 'page' | 'media' = 'page'
  ): Promise<void> {
    // #1205: through recordAuditEvent, so the enabled switch, the tier and the
    // outcome are the same door every emitter uses. Standard tier: a slow
    // sink must not delay a page render, and the drop is counted, not hidden.
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    await recordAuditEvent(
      sink,
      {
        eventType: AUDIT_EVENT.AUTHORIZATION_DENY,
        user: username,
        ipAddress: undefined,
        action: action ?? 'unknown',
        resource: pageName ?? '',
        resourceType,
        result: 'deny',
        reason: reason || 'not permitted',
        severity: 'medium',
        // #1222: a share visit is attributed to the share and its issuer —
        // "anonymous via share, issued by" — on every record it produces.
        metadata: viaShare ? { viaShareId: viaShare.id, viaShareIssuer: viaShare.issuer } : {}
      },
      (err) => logger.warn(`Audit log failed for authorization-deny of '${pageName}':`, err)
    );
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
