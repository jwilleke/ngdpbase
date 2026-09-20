import BaseManager from './BaseManager.js';
import { permissionForPageAction } from '../security/pageActions.js';
import PolicyDecisionPoint from '../security/PolicyDecisionPoint.js';
import type { PolicyResource } from '../types/Policy.js';
import { promises as fs } from 'fs';
import { mayActInPrivateContainer } from '../utils/privateStoreAccess.js';
import type { ActorContext } from '../context/ActorContext.js';
import logger from '../utils/logger.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { AgentTokenGrant } from './UserManager.js';
import type PolicyEvaluator from './PolicyEvaluator.js';
import type { PageFrontmatter } from '../types/Page.js';
import { shareCoversResource, type ShareGrant } from '../types/Share.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
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

    // #1431: ACLManager holds no policy cache. It used to read
    // `ngdpbase.access.policies` into a Map here and refill it in
    // loadAccessPolicies — written, logged, and read by nothing. The policies
    // belong to PolicyManager, and PolicyEvaluator asks it for them.

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
  /**
   * The PDP this manager asks for the delegation ceilings and, in the next
   * step, for the policy decision itself. Registered on the engine; built here
   * only when it is not, so tests that stand an ACLManager up alone still
   * exercise the real ordering rather than skipping it (#1431).
   */
  private policyDecisionPoint(): PolicyDecisionPoint {
    const registered = this.engine?.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (registered) return registered;
    this._pdp ??= new PolicyDecisionPoint(this.engine);
    return this._pdp;
  }

  private _pdp?: PolicyDecisionPoint;

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
   *   - `token_scope_deny`                         (Tier -1, the PDP's ceiling)
   *   - `share_action_deny` / `share_expired` / `share_resource_deny` /
   *     `share_issuer_deny`                        (Tier -1, the PDP's ceiling)
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


    const policyAction = permissionForPageAction(action);

    // Tier -1: the delegation ceilings, asked of the PDP (#1431).
    //
    // A delegated token may only ever exercise a SUBSET of its owner's rights,
    // and a share only what its issuer delegated and still holds — hard
    // ceilings, checked BEFORE every other tier. They must precede tier 1,
    // because frontmatter `access` overrides global policies and returns
    // directly; a ceiling living at tier 2 would never run on a page whose
    // frontmatter grants the action.
    //
    // These were implemented here AND in UserManager.hasPermission, the same
    // protection twice with nothing keeping the two in step. Now there is one
    // implementation. The PAGE half the PDP cannot know — whether the share
    // covers this particular page — is supplied as `resourceCoverage`, which
    // is PIP work.
    const delegated = (userContext as { viaToken?: unknown; viaShare?: unknown } | undefined);
    // Only a DELEGATED caller has a ceiling to check. Asking unconditionally
    // would evaluate the policies twice for every ordinary request — once here
    // and again at Tier 2 — and would let an evaluator error escape the Tier 2
    // catch that exists to fall through to Tier 3.
    const ceiling = (delegated?.viaToken || delegated?.viaShare)
      ? await this.policyDecisionPoint().ceiling(
        userContext,
        {
          action: policyAction,
          resource: { type: 'page', id: pageName },
          resourceCoverage: (shareResources: readonly PolicyResource[]) => {
            const keywords = wikiContext.pageMetadata?.['user-keywords'];
            return !!wikiContext.pageMetadata && shareCoversResource(shareResources, 'page', (keywords as string[]) ?? []);
          }
        }
      )
      : null;
    if (ceiling && !ceiling.permit) {
      this.logAccessDecision({
        user: userContext, pageName, action, allowed: false, reason: ceiling.reason,
        context: { wikiContext: wikiContext.context }
      });
      logger.info(`[ACL] ${ceiling.reason} for '${policyAction}' on '${pageName}' — denied`);
      return { allowed: false, reason: ceiling.reason };
    }
    // NOT an early allow for a share. A share that passed its ceiling still
    // faces the page's own rules — Tier 0 private, Tier 0.5 author-lock,
    // Tier 1 audience — because a share visitor is an anonymous visitor, and a
    // private page or a restricted audience refuses one. The share becomes the
    // policy only at Tier 2, below, where global policy would otherwise ask
    // about roles this bearer does not have.
    const viaShare = delegated?.viaShare as ShareGrant | undefined;

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
      // Owner only — no role reaches into a private container (P2; private-stores.md, Access).
      const creator = (wikiContext.pageMetadata?.author) ?? '';
      const allowed   = userContext ? mayActInPrivateContainer(userContext, creator) : false;
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

    // Tier 2: the policies, asked of the PDP (#1431).
    //
    // `applicable` is why this needs a three-state answer: when no policy
    // spoke, the page door still has Tier 3 to try, so silence must not read
    // as a deny here — it does for a capability check, which has no further
    // tier.
    try {
      const decision = await this.policyDecisionPoint().decide(userContext, {
        action: policyAction,
        resource: { type: 'page', id: pageName }
      });
      logger.info(`[ACL] PDP decision applicable=${decision.applicable} permit=${decision.permit} reason=${decision.reason}`);
      if (decision.applicable) {
        const reason = decision.reason || 'global_policy';
        this.logAccessDecision({
          user: userContext,
          pageName,
          action,
          allowed: decision.permit,
          reason,
          context: { wikiContext: wikiContext.context }
        });
        return { allowed: decision.permit, reason };
      }
    } catch (e) {
      logger.warn('[ACL] PDP error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
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
   * The private-container decision for something that is not a page — a file
   * in a store (docs/planning/private-stores.md, Access). The same rule a
   * private page gets at Tier 0: the owner, or a delegate of the owner; never
   * a role. A refusal is recorded like any page refusal (`authorization-deny`).
   *
   * @param userContext - the request's subject, as given (null = anonymous)
   * @param owner - the container's owner (a private file's `creator`)
   * @param resource - what is being reached, for the record (e.g. `attachment:<id>`)
   * @param action - the action asked for (e.g. `view`)
   */
  canAccessPrivateContainer(
    userContext: UserContext | null | undefined,
    owner: string,
    resource: string,
    action: string
  ): boolean {
    const allowed = Boolean(userContext && owner) && mayActInPrivateContainer(userContext as ActorContext, owner);
    if (!allowed) {
      this.logAccessDecision({
        user: userContext ?? undefined, pageName: resource, action, allowed: false, reason: 'private_deny',
        context: {}
      });
    }
    return allowed;
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
    const policyAction = permissionForPageAction(action);
    const roles = userContext?.roles ?? [];
    const username = userContext?.username ?? '';
    const isAdmin = roles.includes('admin');

    // The ceilings that bound the SUBJECT decide once, for every page — the
    // PDP's, so this is not a third copy of them (#1431). No resource is
    // passed: coverage is per PAGE and is checked in the loop below, where the
    // page's keywords are to hand.
    const viaToken = (userContext as { viaToken?: { scopes: string[] } } | null | undefined)?.viaToken;
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    if (viaToken || viaShare) {
      const ceiling = await this.policyDecisionPoint().ceiling(userContext, { action: policyAction });
      if (ceiling && !ceiling.permit) return [];
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
      // creator; owner or delegate, never a role); the frontmatter flag is the
      // fallback where the helper is absent (fixtures without a PageManager).
      if (pageManager?.checkPrivatePageAccess) {
        const decision = await pageManager.checkPrivatePageAccess(privateCtx, title);
        if (decision === false) continue;
        if (decision === true) { out.push(title); continue; }
      } else if (metadata.private === true) {
        // Owner only — no role reaches into a private container.
        if (!(userContext && mayActInPrivateContainer(userContext, metadata.author ?? ''))) continue;
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
    // #1431: the share ceiling is the PDP's — this was the fourth copy of it,
    // after the page door, the list filter and UserManager. The media half it
    // cannot know (does the share cover THIS item, and is the item private) is
    // supplied as coverage, which is PIP work.
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    if (viaShare) {
      const ceiling = await this.policyDecisionPoint().ceiling(userContext, {
        action: 'asset-read',
        resource: { type: 'media', id: item.id },
        resourceCoverage: (shareResources) => {
          // `metadata.keywords` sits under the index signature as string | string[].
          const raw = item.metadata?.keywords;
          const keywords: string[] = Array.isArray(raw)
            ? raw.filter((k): k is string => typeof k === 'string')
            : typeof raw === 'string' ? [raw] : [];
          return !item.isPrivate && shareCoversResource(shareResources, 'media', keywords);
        }
      });
      if (ceiling && !ceiling.permit) {
        logger.info(`[ACL] share ${viaShare.id} (issued by ${viaShare.issuer}): ${ceiling.reason} — media ${item.id} denied`);
        void this.auditDenial(userContext?.username || 'anonymous', item.id, 'asset-read', ceiling.reason, viaShare, 'media');
        return false;
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

  // #1174/#1431: performStandardACLCheck and checkDefaultPermission are gone.
  // Neither had a caller outside its own tests, and checkDefaultPermission
  // mapped page actions to COLON names — `page:read`, `page:edit` — declared
  // in no registry, so the check could only ever deny. The action map that
  // matters is the one in checkPagePermissionWithContext.

  // #1432: the availability checks that used to live here are gone —
  // checkContextRestrictions, checkMaintenanceMode, checkBusinessHours,
  // checkEnhancedTimeRestrictions and checkHolidayRestrictions. None had a
  // caller anywhere in src, addons or views, while the configuration shipped
  // their switches, so an operator could turn business hours on and nothing
  // happened. They also asked the wrong question for this manager: "is the
  // site open" is not "may this identity do this". src/utils/availability.ts
  // answers the first, and the gate middleware in app.ts enforces it.

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
  // - It holds no policy cache of its own (#1431)
}

export default ACLManager;
