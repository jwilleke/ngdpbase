import BaseManager from '../managers/BaseManager.js';
import { permissionForPageAction } from './pageActions.js';
import PolicyDecisionPoint from './PolicyDecisionPoint.js';
import type { PolicyResource } from '../types/Policy.js';
import { promises as fs } from 'fs';
import { mayActInPrivateContainer } from '../utils/privateStoreAccess.js';
import type { ActorContext } from '../context/ActorContext.js';
import logger from '../utils/logger.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type { AgentTokenGrant } from '../managers/UserManager.js';
import { subjectMayDo } from '../utils/subjectMayDo.js';
import { ANONYMOUS_SUBJECT } from '../managers/UserManager.js';
import type PolicyEvaluator from '../managers/PolicyEvaluator.js';
import type { PageFrontmatter } from '../types/Page.js';
import { shareCoversResource, type ShareGrant } from '../types/Share.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import { decideFrontmatterAccess } from '../utils/frontmatterAccess.js';

/** The one thing the page tiers need from PageManager (#1431 7c). */
interface PrivateAccessCheck {
  checkPrivatePageAccess?: (ctx: WikiContext, name: string) => Promise<boolean | null>;
}

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
 * PolicyInformationPoint — what a page decision needs to know about the page
 * (#1431; was ACLManager until step 8).
 *
 * In the model the access subject follows (docs/managers/Manager-SOT.md):
 *
 * - the __PEPs__ are the doors — routes, manager doors, the availability gate;
 * - the __PDP__ (`PolicyDecisionPoint`) answers "may this subject do this", with
 *   the delegation ceilings, over the policies;
 * - __this__ supplies the page's own attributes and walks the page's own rules
 *   in order, asking the PDP where global policy decides;
 * - the __PAP__ is ConfigurationManager plus the admin screens.
 *
 * What it holds, all of it about a PAGE (or a private container, or media
 * linked to one):
 *
 * - `walkPageTiers` — the one implementation of the page's rules: private
 *   (owner or delegate, never a role), author-lock (`edit` only; the override
 *   is the `admin-system` permission), frontmatter `audience` / `access`, then
 *   the share or global policy. Shared by every entry point below (#1431 7c).
 * - `checkPagePermissionWithContext` / `evaluatePagePermission` — one page, for
 *   a request that already holds it; the latter returns the reason.
 * - `canUserAccessPage` — another page, loaded as this subject (cross-page:
 *   inserts, includes, attachments).
 * - `filterAccessiblePages` — many pages, over the index, with no per-page
 *   disk read, log line or audit record; agrees with the single-page answer in
 *   both directions (#1219).
 * - `canUserAccessMediaItem` / `canAccessPrivateContainer` — media and store
 *   files, by the same rules.
 * - `logAccessDecision` — every single-page decision is recorded.
 *
 * What it no longer holds, so nobody goes looking: JSPWiki's page-body ACL
 * markup (#1431 7a — imports convert it to audience terms, #1446); the
 * availability checks (#1432); a policy cache (#1431 step 4); any role-name
 * gate (#1431 7b).
 *
 * @class PolicyInformationPoint
 * @extends BaseManager
 *
 * @see {@link PolicyDecisionPoint} for the decision over the policies
 * @see {@link PolicyEvaluator} for policy matching
 * @see {@link AuditManager} for the access record
 *
 * @example
 * const pip = engine.getManager('PolicyInformationPoint');
 * if (await pip.checkPagePermissionWithContext(wikiContext, 'edit')) { ... }
 */
class PolicyInformationPoint extends BaseManager {
  private policyEvaluator: PolicyEvaluator | null = null;

  /**
   * Creates a new PolicyInformationPoint instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initializes the PolicyInformationPoint by loading policies and configurations
   *
   * Loads access policies from configuration and initializes the policy
   * evaluator for context-aware permission evaluation.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await policyInformationPoint.initialize();
   * console.log('ACL system ready');
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PolicyInformationPoint requires ConfigurationManager');
    }

    // #1431: PolicyInformationPoint holds no policy cache. It used to read
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
   * The PDP this manager asks for the delegation ceilings and, in the next
   * step, for the policy decision itself. Registered on the engine; built here
   * only when it is not, so tests that stand an PolicyInformationPoint up alone still
   * exercise the real ordering rather than skipping it (#1431).
   */
  private policyDecisionPoint(): PolicyDecisionPoint {
    const registered = this.engine?.getManager<PolicyDecisionPoint>('PolicyDecisionPoint');
    if (registered) return registered;
    this._pdp ??= new PolicyDecisionPoint(this.engine);
    return this._pdp;
  }

  private _pdp?: PolicyDecisionPoint;

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
   * const canEdit = await policyInformationPoint.checkPagePermissionWithContext(wikiContext, 'edit');
   * if (canEdit) console.log('User can edit page');
   */
  async checkPagePermissionWithContext(wikiContext: WikiContext, action: string): Promise<boolean> {
    const { allowed } = await this._runEvaluator(wikiContext, action);
    return allowed;
  }

  /**
   * Internal evaluator — walks the tiers in order (Tier -1 delegation
   * ceilings → Tier 0 private → Tier 0.5 author-lock → Tier 1
   * audience/access → Tier 2 global policies → default deny) and returns the
   * rich `{ allowed, reason }` decision. First tier to answer wins.
   *
   * `evaluatePagePermission` (rich) and `checkPagePermissionWithContext`
   * (boolean) both delegate here.
   */
  private async _runEvaluator(wikiContext: WikiContext, action: string): Promise<{ allowed: boolean; reason: string }> {
    if (!wikiContext) {
      throw new Error('PolicyInformationPoint.checkPagePermissionWithContext requires a WikiContext');
    }

    const pageName = wikiContext.pageName;
    const userContext = wikiContext.userContext;

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
    // catch, which exists so an evaluator fault denies rather than throws.
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

    // No metadata, no decision — except `create` (#1431 step 7, operator
    // 2026-09-21). The page's own rules below (private, author-lock,
    // audience) all read frontmatter; without it they silently fall away and
    // global policy answers alone, which is how an include came to render an
    // audience-restricted page to readers outside its audience. A page being
    // CREATED legitimately has none yet, and there policy decides.
    //
    // This refuses; it does not report. The decider cannot tell a page that
    // does not exist, a sealed page this session cannot unlock, and a damaged
    // page apart — only a caller that has just loaded the content can, and
    // those callers raise the loud 500 + admin notification themselves
    // (utils/pageMetadataMissing). A caller reaching here without metadata
    // for a page it did load is a caller bug, and the warning names it.
    if (!wikiContext.pageMetadata && policyAction !== 'page-create') {
      logger.warn(`[ACL] no metadata for '${pageName}' (action=${action}) — refused; a caller deciding about a page must load its metadata`);
      this.logAccessDecision({
        user: userContext, pageName, action, allowed: false, reason: 'no_page_metadata',
        context: { wikiContext: wikiContext.context }
      });
      return { allowed: false, reason: 'no_page_metadata' };
    }

    // Tiers 0 → 2, one implementation shared with the list filter (#1431 7c).
    // What differs between the two is only what each may afford: this door asks
    // the PDP per page and records every decision; the filter compiles policy
    // once and records nothing per page. The ORDER is decided in one place.
    const decision = await this.walkPageTiers({
      userContext,
      pageName,
      metadata: wikiContext.pageMetadata,
      action,
      viaShare,
      privateCtx: wikiContext,
      pageManager: this.engine.getManager<PrivateAccessCheck>('PageManager'),
      // Asked only if the page is author-locked and the subject is not its
      // author — the author needs no override.
      mayOverrideLock: () => subjectMayDo(this.engine, userContext, 'admin-system'),
      policy: async () => {
        // An evaluator fault denies; it never opens the page. There is no tier
        // below this one to fall through to (Tier 3 was removed in #1431 7a).
        try {
          const d = await this.policyDecisionPoint().decide(userContext, {
            action: policyAction,
            resource: { type: 'page', id: pageName }
          });
          logger.info(`[ACL] PDP decision applicable=${d.applicable} permit=${d.permit} reason=${d.reason}`);
          return { applicable: d.applicable, permit: d.permit, reason: d.reason || 'global_policy' };
        } catch (e) {
          logger.warn('[ACL] PDP error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
          return null;
        }
      }
    });

    if (decision.reason === 'default_deny') {
      logger.info(`[ACL] Default deny for page=${pageName} (no policy matched)`);
    }
    this.logAccessDecision({
      user: userContext,
      pageName,
      action,
      allowed: decision.allowed,
      reason: decision.reason,
      context: decision.reason === 'share_grant' && viaShare
        ? { wikiContext: wikiContext.context, share: viaShare.id, issuer: viaShare.issuer }
        : { wikiContext: wikiContext.context }
    });
    return decision;
  }

  /**
   * The page's own tiers, walked in order, for ONE page (#1431 step 7c).
   *
   * The single implementation of the sequence. The decider and the list filter
   * each used to carry their own copy of it, and "a listing can never name a
   * page its reader cannot open, nor hide one they can" (#1219) held only for
   * as long as someone remembered to change both. Now there is one to change.
   *
   * It decides and does nothing else — no log line, no audit record — because
   * the filter runs it over thousands of pages. Each caller supplies what it
   * can afford: how to ask policy (per page, or compiled once), and how to ask
   * the author-lock override (lazily, or once per subject).
   *
   * Runs AFTER the delegation ceilings, which bound the subject rather than
   * the page and so are each caller's to ask first. First tier to answer wins:
   *
   * - __Tier 0, private.__ Through `PageManager.checkPrivatePageAccess` — the
   *   page-index creator, owner or delegate, never a role (#711). Frontmatter
   *   `private` + `author` is the fallback where there is no PageManager.
   * - __Tier 0.5, author-lock__, `edit` only. It only denies: an author, or a
   *   subject holding `admin-system` (#1431 7b), falls through to Tier 1+.
   * - __Tier 1, frontmatter__ `access[action]` / `audience`. Page-level, and
   *   overrides global policy when it states a rule (#1054).
   * - __Tier 2.__ For a share visitor the share IS the policy (#1222); for
   *   anyone else, global policy.
   * - __Default deny.__ Nothing below Tier 2 grants — JSPWiki's page-body ACL
   *   markup was removed (#1431 7a); an imported page's ACL is converted to
   *   audience terms by the NCM funnel (#1446).
   */
  private async walkPageTiers(args: {
    userContext: UserContext | null | undefined;
    pageName: string;
    metadata: PageFrontmatter | null | undefined;
    action: string;
    viaShare: ShareGrant | undefined;
    privateCtx: WikiContext;
    pageManager: PrivateAccessCheck | null | undefined;
    mayOverrideLock: () => Promise<boolean>;
    policy: () => Promise<{ applicable: boolean; permit: boolean; reason: string } | null>;
  }): Promise<{ allowed: boolean; reason: string }> {
    const { userContext, pageName, metadata, action, viaShare } = args;

    // Tier 0: private.
    if (args.pageManager?.checkPrivatePageAccess) {
      const decision = await args.pageManager.checkPrivatePageAccess(args.privateCtx, pageName);
      if (decision !== null) return { allowed: decision, reason: decision ? 'private_match' : 'private_deny' };
    } else if (metadata?.private === true) {
      const allowed = userContext ? mayActInPrivateContainer(userContext, metadata.author ?? '') : false;
      return { allowed, reason: allowed ? 'private_match' : 'private_deny' };
    }

    // Tier 0.5: author-lock denies a non-author edit; it grants nothing.
    if (action.toLowerCase() === 'edit' && metadata?.['author-lock'] === true) {
      const isAuthor = (userContext?.username ?? '') === (metadata.author ?? '');
      if (!isAuthor && !(await args.mayOverrideLock())) {
        return { allowed: false, reason: 'author_lock_deny' };
      }
    }

    // Tier 1: frontmatter audience / access, when it states a rule.
    if (metadata) {
      const fm = this.checkFrontmatterAccess(metadata, userContext, action);
      if (fm.decided) return { allowed: fm.allowed, reason: fm.reason };
    }

    // Tier 2: the share is the policy for a share visitor; global policy otherwise.
    if (viaShare) return { allowed: true, reason: 'share_grant' };
    const policy = await args.policy();
    if (policy?.applicable) return { allowed: policy.permit, reason: policy.reason };

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
    // #1422: the real signature takes the caller's context, and this local
    // type used to omit it — which is how a decision came to read page
    // metadata as nobody. A page in an encrypted store resolves only through
    // its owner's unlocked session, so without the context this check could
    // not see a sealed page at all and refused its owner.
    type PageManagerShape = {
      getPageMetadata?: (id: string, ctx: ActorContext) => Promise<PageFrontmatter | null>;
    };
    const pm = this.engine.getManager<PageManagerShape>('PageManager');
    const pageMetadata = pm?.getPageMetadata
      ? await pm.getPageMetadata(
        pageName,
        (userContext as unknown as ActorContext) ?? ANONYMOUS_SUBJECT
      ).catch(() => null)
      : null;
    if (!pageMetadata) {
      return false;
    }

    // Build a minimal WikiContext-shaped object for the evaluator. We don't
    // have a full request-scope context here (no req/res, no rendering
    // context); the evaluator only reads pageName / userContext /
    // pageMetadata / context fields.
    //
    // No `hasRole` is carried. #1219 added one because Tier 0 once gave admins
    // a private-page bypass; it no longer does — `checkPrivatePageAccess` ends
    // in `mayActInPrivateContainer`, owner or delegate, never a role — and for
    // an encrypted store there is no key an admin could hold anyway. Carrying
    // a role lookup into Tier 0 only invited one to be used there again.
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
   * standing in for it. There is no longer a tier below that: the deprecated
   * page-ACL markup was deleted in #1431 step 7, which is what removed the one
   * divergence this filter had from `canUserAccessPage` — it could not read
   * page content, so a page granted only by that markup used to be hidden
   * here and visible there.
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
    // #1431 step 7b: the author-lock override is `admin-system`, asked once
    // for the subject — it does not vary by page — and only for `edit`, the
    // one action author-lock constrains.
    const mayOverrideLock = action.toLowerCase() === 'edit'
      && await subjectMayDo(this.engine, userContext, 'admin-system');

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

    const pageManager = this.engine.getManager<PrivateAccessCheck>('PageManager');
    // Tier 0 reads only the subject: owner or delegate, never a role.
    const privateCtx = { userContext: userContext ?? null } as unknown as WikiContext;
    const decidePolicy = this.policyEvaluator?.compile(userContext ?? undefined, policyAction);

    const out: string[] = [];
    for (const { title, metadata } of candidates) {
      // A candidate without metadata is not listed (#714) — the decider
      // refuses the same page (#1431 step 7).
      if (!metadata) continue;
      // The share's cover is per PAGE, so it is checked here rather than in
      // the subject's ceiling above.
      if (viaShare && !shareCoversResource(viaShare.resources, 'page', metadata['user-keywords'] ?? [])) continue;

      // The same tiers the decider walks, in the same order (#1431 7c).
      const decision = await this.walkPageTiers({
        userContext,
        pageName: title,
        metadata,
        action,
        viaShare,
        privateCtx,
        pageManager,
        mayOverrideLock: async () => mayOverrideLock,
        policy: async () => {
          const p = decidePolicy?.(title);
          return p?.hasDecision ? { applicable: true, permit: p.allowed, reason: 'global_policy' } : null;
        }
      });
      if (decision.allowed) out.push(title);
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

  // NOTE: PolicyInformationPoint does not need backup/restore methods because:
  // - All policies are loaded from ConfigurationManager (backed up by ConfigurationManager)
  // - It holds no policy cache of its own (#1431)
}

export default PolicyInformationPoint;
