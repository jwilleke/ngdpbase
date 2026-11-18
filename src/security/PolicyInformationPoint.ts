import BaseManager from '../managers/BaseManager.js';
import { permissionForPageAction } from './pageActions.js';
import PolicyDecisionPoint from './PolicyDecisionPoint.js';
import type { PolicyResource } from '../types/Policy.js';
import { promises as fs } from 'fs';
import { mayActInPrivateContainer } from '../utils/privateStoreAccess.js';
import { carriesCeiling, proxyAttribution } from '../utils/proxyClaim.js';
import { isSharedFolderOwner, parsePrivatePageName } from '../utils/privateStorePath.js';
import { permitsInSharedFolder } from '../utils/sharedFolderAccess.js';
import { ATTRIBUTE_RESOURCE_TYPES, attributesForResourceTypes, readDeclaredAsWritten, declaredEnvironmentAttributes, declaredSubjectAttributes, effectiveAal, environmentDeclarationProblem, subjectDeclarationProblem, valueFits, aalFactsOf, type AalFacts, type DeclaredSubjectAttribute, type ResourceTypeDeclarations } from '../utils/policyAttributes.js';
import { SCHEDULES_KEY, TIME_ZONE_KEY, scheduleIsEnabled, scheduleIsOpen, scheduleProblem, type Schedule } from '../utils/availability.js';
import { SENSITIVE_USER_FIELDS } from '../types/User.js';
import type { VaultDecider } from '../utils/privateStoreAccess.js';
import { decisionSubject, type ActorContext } from '../context/ActorContext.js';
import { systemContext } from '../context/bootActions.js';
import logger from '../utils/logger.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type { AgentTokenGrant, ProxyClaim } from '../managers/UserManager.js';
import { subjectMayDo } from '../utils/subjectMayDo.js';
import { ANONYMOUS_SUBJECT, SYSTEM_PRINCIPAL_KEY, SYSTEM_ROLES_KEY } from '../managers/UserManager.js';
import type UserManager from '../managers/UserManager.js';
import type RoleManager from '../managers/RoleManager.js';
import type IdentityManager from '../managers/IdentityManager.js';
import { IDENTITY_ID_PREFIX, isReservedUsername, normalizeUsername } from '../utils/username.js';
import { pageWriteAlternatives } from '../utils/permissionCatalog.js';
import type { Request } from 'express';
import type PolicyEvaluator from '../managers/PolicyEvaluator.js';
import type { PageFrontmatter } from '../types/Page.js';
import { shareCoversPage, shareCoversResource, type ShareGrant } from '../types/Share.js';
import type { MediaItem } from '../providers/BaseMediaProvider.js';
import { audienceExcludes, audiencePrincipals, decideFrontmatterAccess, namesAddonPrincipal } from '../utils/frontmatterAccess.js';
import { hiddenByFeature } from '../utils/pageFeature.js';
import { REQUIRED_SETTINGS_HELP } from '../utils/requiredSettings.js';

/**
 * The system principal's name from configuration, or a refusal (#631, #1953).
 *
 * `ngdpbase.system.principal` ships as the bare env-ref `$NGDPBASE_SYSTEM_USER`,
 * which throws when the variable is unset; an empty value is refused the same
 * way. One rule for both readers: the PIP at run time, and `WikiEngine` right
 * after configuration loads, before any manager writes — so a first boot
 * without a principal refuses before the admin account exists, not after it
 * was written without its person (#1953).
 */
export function systemPrincipalFromConfig(configManager: { getProperty(key: string, defaultValue: unknown): unknown } | null | undefined): string {
  let name: unknown;
  try {
    name = configManager?.getProperty(SYSTEM_PRINCIPAL_KEY, '');
  } catch (cause) {
    throw new Error(systemPrincipalRefusal('is not set'), { cause });
  }
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(systemPrincipalRefusal('is empty'));
  }
  return name.trim();
}

/** The scheduled job a job's subject acts as (#1999), when it names one. */
function jobOf(userContext: unknown): string | undefined {
  const job = (userContext as { job?: unknown } | null | undefined)?.job;
  return typeof job === 'string' ? job : undefined;
}

function systemPrincipalRefusal(why: string): string {
  return `Refusing to start: NGDPBASE_SYSTEM_USER ${why}. It names the system principal, the identity the server acts ` +
    'under at boot and from timers; it is a name, not an account. Set it in .env, e.g. NGDPBASE_SYSTEM_USER=system, ' +
    `and restart (#631). ${REQUIRED_SETTINGS_HELP}`;
}

/** The one thing the page tiers need from PageManager (#1431 7c). */
interface PrivateAccessCheck {
  checkPrivatePageAccess?: (ctx: WikiContext, name: string, adminEntry?: 'record' | 'quiet' | 'none') => Promise<boolean | null>;
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
  viaProxy?: ProxyClaim;
  [key: string]: unknown;
}







/**
 * What the page questions take (#2022): the caller's context as given — a
 * request's subject or a job's `JobContext` — or a subject already in decision
 * form. They convert it themselves, through {@link asSubject}.
 */
type PageQuestionCaller = ActorContext | UserContext | null | undefined;

/**
 * The caller as the subject the tiers read: `decisionSubject`, the one
 * conversion the PDP also uses. A job becomes a `JobSubject`, which carries
 * `resolveRolesNow` and no roles; the tiers and the PDP already read it so
 * (#1212), and the type below has always been a little wider than that.
 */
function asSubject(caller: PageQuestionCaller): UserContext | null | undefined {
  return decisionSubject(caller) as UserContext | null | undefined;
}

/** What a subject attribute is read from (#2261): who, and what bears on `subject:aal`. */
export type SubjectFacts = AalFacts & { username?: string };

/**
 * Access decision log entry
 */
interface AccessDecisionLog {
  user?: UserContext;
  pageName?: string;
  action?: string;
  allowed?: boolean;
  reason?: string;
  /** The policies that decided (#2255), recorded on a denial. */
  policyIds?: string[];
  /** Allows that matched but whose condition was not met (#2288), recorded on a denial. */
  conditionNotMet?: string[];
  context?: Record<string, unknown>;
}

/**
 * What the policies may read about a page (#2255), resolved by the PIP from
 * the page itself. `attributes` holds what a resource type matches on
 * (`system-category`), read eagerly; `read` answers a condition's
 * `resource:<name>` for an attribute declared on the `page` resource type,
 * lazily, so a lookup (the owner's account) is made only when a policy needs
 * it. `undefined` is a missing attribute.
 */
export interface PageAttributes {
  attributes: Record<string, unknown>;
  read(name: string): unknown;
}

/** One attribute declared on a resource type (#2255): its type and the PIP source it is read from. */
interface DeclaredAttribute {
  type?: string;
  from?: string;
}

/** The legacy `access:` stamp install wrote on shipped pages (#971, #1411); left on disk silently (#2255). */
function isLegacyAccessStamp(access: unknown): boolean {
  if (!access || typeof access !== 'object' || Array.isArray(access)) return false;
  const entries = Object.entries(access as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'edit'
    && Array.isArray(entries[0][1]) && entries[0][1].length === 1 && entries[0][1][0] === 'admin';
}

/**
 * A subject as Tier 1 matches it: its roles, then its username, then (#2097)
 * its identity @id when {@link PolicyInformationPoint.matchableNow} resolved
 * one, so an `audience` or `access` entry stored as the @id matches, and one
 * not yet converted still matches the username. An orphan entry matches
 * nobody: no principal ever starts `orphan:`.
 */
function principalsOf(userContext: UserContext | null | undefined): string[] {
  const roles = userContext?.roles ?? [];
  const username = userContext?.username ?? '';
  const identityId = (userContext as { identityId?: unknown } | null | undefined)?.identityId;
  return [...roles, ...(username ? [username] : []), ...(typeof identityId === 'string' && identityId ? [identityId] : [])];
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
 *   a request that already holds it; the latter returns the reason. These are
 *   the doors: asked before acting, and every decision is recorded.
 * - `pageAffordance` / `pageAffordanceFor` — the same evaluator (this page /
 *   another page), asked only to decide whether to show a control; records
 *   nothing (#1668).
 * - `canUserAccessPage` — another page, loaded as this subject (cross-page:
 *   inserts, includes, attachments).
 * - `filterAccessiblePages` — many pages, over the index, with no per-page
 *   disk read, log line or audit record; agrees with the single-page answer in
 *   both directions (#1219).
 * - `canUserAccessMediaItem` / `canAccessPrivateContainer` — media and store
 *   files, by the same rules.
 * - `logAccessDecision` — every single-page door decision is recorded; a
 *   denial becomes an `authorization-deny` record carrying the request's
 *   address. An affordance is not recorded.
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
  /** Read at the moment of use: this manager starts before PolicyEvaluator (#1431 step 13). */
  private get policyEvaluator(): PolicyEvaluator | null {
    return this.engine.getManager<PolicyEvaluator>('PolicyEvaluator') ?? null;
  }

  /**
   * Creates a new PolicyInformationPoint instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   * @param {() => Date} [clock] - The time `environment:` attributes are read at; injectable for tests
   */
  constructor(engine: WikiEngine, private readonly clock: () => Date = () => new Date()) {
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
  }

  // ── The subject (#1431 step 13) ──────────────────────────────────────────
  //
  // The PIP supplies the attributes a decision needs about the SUBJECT as
  // well as the page: who is asking, and the roles they hold now. It builds
  // the subject from the account (UserManager) and membership (RoleManager),
  // and stores neither. This was UserManager's, and app.ts built the request
  // subject a second time inline.

  /** The anonymous visitor. Lowercase `anonymous` is the role the policies name (#1059). */
  anonymousSubject(): UserContext {
    return {
      username: 'Anonymous',
      displayName: 'Anonymous User',
      roles: ['anonymous'],
      isAuthenticated: false,
      authenticated: false
    };
  }

  /**
   * The name of the system principal — the server acting for itself at boot
   * and from timers (#631).
   *
   * Owned by the environment: `ngdpbase.system.principal` ships as the bare
   * env-ref `$NGDPBASE_SYSTEM_USER`, which THROWS when the variable is unset,
   * so an instance with no named principal refuses to boot rather than
   * acting as a default nobody chose. `.env` is not reachable from the admin
   * UI, so the identity cannot be renamed through a form.
   */
  systemPrincipalName(): string {
    return systemPrincipalFromConfig(this.engine.getManager<ConfigurationManager>('ConfigurationManager'));
  }

  /** Whether `username` names the system principal. Case-insensitive, like the user store. */
  isSystemPrincipal(username: string): boolean {
    return username.trim().toLowerCase() === this.systemPrincipalName().toLowerCase();
  }

  /**
   * The system principal as a permission subject (#631).
   *
   * Identity from `.env`; authority from the role catalog — `ngdpbase.system.roles`,
   * `["admin"]` by default — evaluated by policy through the same door as any
   * request (P2). Nothing here is a grant: the roles are read, not asserted.
   * The name is reserved in `UserManager.createUser`, so no person can hold it.
   */
  systemSubject(): UserContext {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = configManager?.getProperty(SYSTEM_ROLES_KEY, ['admin']);
    const roles = Array.isArray(declared) ? declared.filter((r): r is string => typeof r === 'string') : ['admin'];
    // permission-subject-ignore: the system principal — name from .env, roles from the catalog (#631).
    return { username: this.systemPrincipalName(), roles: [...roles], isAuthenticated: true };
  }

  /**
   * An active account as a subject: its record, and the roles it holds NOW.
   * `null` when there is no such account or it is inactive — the caller
   * decides what that means (usually the anonymous subject).
   */
  async subjectFor(username: string): Promise<UserContext | null> {
    const user = await this.userManager().getUser(username);
    if (!user?.isActive) return null;
    // #2018: core's own read, on every request — the system context, which the
    // identity-record door allows without a policy evaluation.
    const roles = await this.roleManager().resolveUserRoles(
      systemContext(this.engine, `resolve the roles of account ${username} for a decision`),
      username
    );
    // permission-subject-ignore: THE resolution site — roles come from the store, now.
    return { ...user, username, roles: [...roles], isAuthenticated: true, authenticated: true };
  }

  /**
   * Resolve a named user's CURRENT roles for a permission decision (#631).
   *
   * Used when a subject arrives without roles — a background job asking
   * "what may my requester do, now?". An unknown, inactive or absent user
   * resolves to the anonymous subject: the job then holds exactly what a
   * visitor holds, which is the safe answer for someone who no longer exists.
   */
  async resolveSubjectNow(username: string | undefined, job?: string): Promise<UserContext> {
    if (username && this.isSystemPrincipal(username)) {
      // #1999: a scheduled run that a policy names acts as the job itself:
      // `job:<id>`, no roles, holding only what the job's policies grant. A
      // job no policy names keeps the system principal's roles. Only the
      // system principal's context can act as a job.
      if (job && this.policyDecisionPoint().namesJob(job)) {
        // permission-subject-ignore: the job's own subject — no roles, matched by its `job` policies (#1999).
        return { username: `job:${job}`, roles: [], isAuthenticated: true, job };
      }
      return this.systemSubject();
    }
    const subject = username ? await this.subjectFor(username) : null;
    if (!subject) {
      // permission-subject-ignore: the anonymous subject, copied so the constant is never mutated.
      return { username: 'Anonymous', roles: [...(ANONYMOUS_SUBJECT.roles ?? [])], isAuthenticated: false };
    }
    // permission-subject-ignore: resolved above, from the store.
    return { username: subject.username, roles: subject.roles, isAuthenticated: true };
  }

  /**
   * The subject as a page's own rules match it (#2022): for a job's subject
   * (`resolveRolesNow`, #1212), its username with the roles its account
   * holds NOW, read through {@link resolveSubjectNow} — the path the PDP
   * takes for the same subject; anyone else as carried. A job carries no
   * roles, so matching it without this matched none, and an audience naming
   * a role its user holds left the job out.
   */
  private async matchableNow(userContext: UserContext | null | undefined): Promise<UserContext | null | undefined> {
    if (!(userContext as { resolveRolesNow?: boolean } | null | undefined)?.resolveRolesNow || !userContext) return this.withIdentityId(userContext);
    // permission-subject-ignore: matching only — the roles are resolved now, from the store.
    const now = await this.resolveSubjectNow(userContext.username, jobOf(userContext));
    // #1999: a job that acts as itself is matched as `job:<id>`, never as the system principal.
    if (now.job) return { username: now.username, roles: now.roles ?? [], job: now.job } as unknown as UserContext;
    return this.withIdentityId({ username: userContext.username, roles: now.roles ?? [] } as UserContext);
  }

  /**
   * The subject as matched, carrying its identity @id (#2097): page access
   * lists name users by @id. Matching only: the subject is never changed for
   * any other use. No lookup for nobody or a reserved name; null when the
   * identity store cannot answer, and then only entries not yet converted match.
   */
  private async withIdentityId(userContext: UserContext | null | undefined): Promise<UserContext | null | undefined> {
    const username = userContext?.username;
    if (!userContext || !username || isReservedUsername(username)) return userContext;
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (typeof identities?.identityIdOf !== 'function') return userContext;
    const identityId = await identities.identityIdOf(systemContext(this.engine, 'match a page access list: the subject identity @id (#2097)'), username);
    // permission-subject-ignore: matching only — the same subject, with the @id its account holds.
    return identityId ? { ...userContext, identityId } : userContext;
  }

  /**
   * Who is making this request: the subject the session middleware resolved,
   * else the session's account resolved now, else the anonymous visitor.
   * It was `UserManager.getCurrentUser` until #1431 step 13.
   *
   * __This returned Anonymous for every authenticated user, always (#1165).__
   * It read `req.session.user.isAuthenticated`, and nothing in the codebase
   * ever writes `req.session.user` — every login path writes the flat
   * `req.session.username` + `req.session.isAuthenticated`
   * (`WikiRoutes.ts:6786`, `:7002`, `:7081`, `app.ts:657`), which is also what
   * the session middleware reads. `session.user` is a declared field with no
   * writer, so the condition was never true.
   *
   * It went unnoticed because the one hot caller guards against it:
   * `getCommonTemplateData` uses `req.userContext || getCurrentUser(req)`, so
   * every rendered page took the first branch and looked correct. The audit
   * routes call this directly, which is why they were the ones to break —
   * `AuditManager` refused the query as 'Anonymous' on a request the route had
   * just authorised as an admin.
   *
   * __`req.userContext` is preferred over the session now__, rather than only
   * repairing the field name. It is the identity the middleware already
   * resolved and validated, enriched with roles from RoleManager, and it is
   * what the policy engine authorises against — so this method and every
   * permission check now answer from the same place instead of two. It is also
   * the only identity a bearer-token request has (#818): those carry no
   * session at all, so the session path alone would still have said Anonymous.
   */
  async currentSubject(req: Request): Promise<UserContext> {
    const r = req as Request & { userContext?: UserContext; session?: { username?: string; isAuthenticated?: boolean } };
    if (r.userContext?.isAuthenticated) {
      return r.userContext;
    }
    if (r.session?.username && r.session.isAuthenticated) {
      return (await this.subjectFor(r.session.username)) ?? this.anonymousSubject();
    }
    return this.anonymousSubject();
  }

  /**
   * The subject's per-person add-ons that are turned on (#1963): an attribute
   * the PIP supplies to a decision (the page audience `addon:<slug>`, #1964)
   * the way it supplies roles from RoleManager. AddonsManager owns the answer;
   * none when it is not running.
   */
  async subjectEnabledAddons(ctx: ActorContext): Promise<string[]> {
    const addonsManager = this.engine.getManager<{ enabledAddonsFor(c: ActorContext): Promise<string[]> }>('AddonsManager');
    return addonsManager ? addonsManager.enabledAddonsFor(ctx) : [];
  }

  /**
   * {@link subjectEnabledAddons} for a page decision (#1964): none for no
   * subject, and none when the lookup fails — an `addon:<slug>` entry then
   * matches nobody, never everyone.
   */
  private async enabledAddonsOf(userContext: UserContext | null | undefined): Promise<readonly string[]> {
    if (!userContext) return [];
    try {
      return await this.subjectEnabledAddons(userContext);
    } catch (e) {
      logger.warn('[ACL] could not read the subject\'s enabled add-ons — addon: audience entries match nobody', { error: e instanceof Error ? e.message : String(e) });
      return [];
    }
  }

  private userManager(): UserManager {
    const userManager = this.engine.getManager<UserManager>('UserManager');
    if (!userManager) throw new Error('PolicyInformationPoint requires UserManager');
    return userManager;
  }

  private roleManager(): RoleManager {
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    if (!roleManager) throw new Error('PolicyInformationPoint requires RoleManager');
    return roleManager;
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
   * Would the page door allow this action — asked only to decide whether to
   * SHOW a control (the view's Edit button), never before performing it
   * (#1668). The page analogue of `holdsPermission` / `pdp.holds`: an
   * affordance, which a door never asks.
   *
   * The same evaluator as {@link checkPagePermissionWithContext}, so the two
   * always agree on allow/deny for the same subject and page. What it does not
   * do is record: no audit record and no info log line. Showing a control is
   * not an attempt, and recording it wrote an `authorization-deny` for every
   * anonymous page view. Acting on the control goes through the door, which
   * records a refusal.
   *
   * @param wikiContext - The request's context, holding the page and its metadata
   * @param action - Page action (view, edit, delete, rename, upload)
   * @returns True if the door would allow the action
   */
  async pageAffordance(wikiContext: WikiContext, action: string): Promise<boolean> {
    const { allowed } = await this._runEvaluator(wikiContext, action, false);
    return allowed;
  }

  /**
   * Internal evaluator — walks the tiers in order (Tier -1 delegation
   * ceilings → Tier 0 private → Tier 0.5 author-lock → Tier 1
   * audience/access → Tier 2 global policies → default deny) and returns the
   * rich `{ allowed, reason }` decision. First tier to answer wins.
   *
   * `evaluatePagePermission` (rich) and `checkPagePermissionWithContext`
   * (boolean) both delegate here — the doors, which record every decision.
   * `pageAffordance` delegates here with `record` false (#1668): the same
   * walk, with no audit record and its trace at debug, because it only decides
   * whether to show a control.
   */
  private async _runEvaluator(wikiContext: WikiContext, action: string, record = true): Promise<{ allowed: boolean; reason: string; policyIds?: string[]; conditionNotMet?: string[] }> {
    if (!wikiContext) {
      throw new Error('PolicyInformationPoint.checkPagePermissionWithContext requires a WikiContext');
    }

    const pageName = wikiContext.pageName;
    const userContext = wikiContext.userContext;
    // A door's trace is info; an affordance's is debug — it runs on every view.
    const trace = (msg: string): void => {
      if (record) logger.info(msg); else logger.debug(msg);
    };
    const recordDecision = (entry: AccessDecisionLog): void => {
      if (record) this.logAccessDecision(entry);
    };

    const roles = (userContext?.roles || []).join('|');
    trace(`[ACL] ${record ? 'checkPagePermissionWithContext' : 'pageAffordance'} page=${pageName} action=${action} user=${userContext?.username} roles=${roles}`);


    const policyAction = permissionForPageAction(action);

    // Tier -1: the delegation ceilings, asked of the PDP (#1431).
    //
    // A delegated token may only ever exercise a SUBSET of its owner's rights,
    // a share only what its issuer delegated and still holds, and a proxy
    // only what its grant carries and its actor holds (#1762) — hard
    // ceilings, checked BEFORE every other tier. They must precede tier 1,
    // because a frontmatter audience decides a view and returns directly; a
    // ceiling living at tier 2 would never run on a page it admits.
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
    const ceiling = carriesCeiling(userContext)
      ? await this.policyDecisionPoint().ceiling(
        userContext,
        {
          action: policyAction,
          resource: { type: 'page', id: pageName },
          resourceCoverage: (shareResources: readonly PolicyResource[]) =>
            !!wikiContext.pageMetadata && shareCoversPage(shareResources, pageName, wikiContext.pageMetadata)
        }
      )
      : null;
    if (ceiling && !ceiling.permit) {
      recordDecision({
        user: userContext, pageName, action, allowed: false, reason: ceiling.reason,
        context: { wikiContext: wikiContext.context }
      });
      trace(`[ACL] ${ceiling.reason} for '${policyAction}' on '${pageName}' — denied`);
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
      recordDecision({
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
      adminEntry: record ? 'record' : 'quiet',
      // Asked only when a rule has an administrator exception and the subject
      // needs it: an author-lock they did not write, an audience that leaves
      // them out (#1964).
      holdsAdminSystem: () => subjectMayDo(this.engine, userContext, 'admin-system'),
      enabledAddons: () => this.enabledAddonsOf(userContext),
      matchable: () => this.matchableNow(userContext),
      policy: async (extra) => {
        // An evaluator fault denies; it never opens the page. There is no tier
        // below this one to fall through to (Tier 3 was removed in #1431 7a).
        try {
          // #2255: the PDP asks this PIP for the page's own attributes
          // (system-category, owner); the metadata already loaded is handed
          // along so the page is not read twice.
          const d = await this.policyDecisionPoint().decide(userContext, {
            action: policyAction,
            resource: { type: 'page', id: pageName },
            attributes: { ...extra },
            pageMetadata: wikiContext.pageMetadata
          });
          trace(`[ACL] PDP decision applicable=${d.applicable} permit=${d.permit} reason=${d.reason} policies=${d.policyIds.join(',')}`);
          return { applicable: d.applicable, permit: d.permit, reason: d.reason || 'global_policy', policyIds: d.policyIds, conditionNotMet: d.conditionNotMet };
        } catch (e) {
          logger.warn('[ACL] PDP error', { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
          return null;
        }
      }
    });

    if (decision.reason === 'default_deny') {
      trace(`[ACL] Default deny for page=${pageName} (no policy matched)`);
    }
    recordDecision({
      user: userContext,
      pageName,
      action,
      allowed: decision.allowed,
      reason: decision.reason,
      policyIds: decision.policyIds,
      conditionNotMet: decision.conditionNotMet,
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
   *   It only REFUSES (#1539): a subject it admits still faces policy, asked
   *   with the page's `vault`, so the owner's rights in their own vaults come
   *   from a policy on the `vault` resource type — the same door as any page.
   *   Tier 1 is skipped for a vault page: `audience` grants nothing there.
   * - __Tier 0.5, author-lock__, `edit` only. It only denies: an author, or a
   *   subject holding `admin-system` (#1431 7b), falls through to Tier 1+.
   * - __Tier 1, frontmatter__ `audience`. Page-level, and decides a view
   *   when it states a rule (#1054). An `audience` covers every action, and a
   *   subject holding `admin-system` is its one exception (#1964). `access`
   *   is no longer read (#2255).
   * - A page in a shared folder is decided by the folder's permission, and a
   *   change also by the `shared` category's policy and author-lock (#2255).
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
    /**
     * Whether an administrator may enter an unencrypted vault here (#2255):
     * a door ('record'), an affordance ('quiet'), or a list ('none').
     */
    adminEntry?: 'record' | 'quiet' | 'none';
    /**
     * Does the subject hold `admin-system`? The exception to an author-lock
     * (#1431 7b) and to an audience (#1964); asked only when one applies.
     */
    holdsAdminSystem: () => Promise<boolean>;
    /** The subject's enabled per-person add-ons (#1964); asked only for a page that names one. */
    enabledAddons: () => Promise<readonly string[]>;
    /** The subject as Tier 1 matches it ({@link matchableNow}); asked only for a page with frontmatter rules. */
    matchable: () => Promise<UserContext | null | undefined>;
    policy: (attributes: { vault?: string }) => Promise<{ applicable: boolean; permit: boolean; reason: string; policyIds?: string[]; conditionNotMet?: string[] } | null>;
  }): Promise<{ allowed: boolean; reason: string; policyIds?: string[]; conditionNotMet?: string[] }> {
    const { userContext, pageName, metadata, action, viaShare } = args;

    // #1677: a page whose feature is off is not there to view — for anyone, so
    // listings leave it out exactly as the page-read door answers not-found.
    if (action.toLowerCase() === 'view'
      && hiddenByFeature(metadata, this.engine.getManager<{ getProperty(k: string, d: unknown): unknown }>('ConfigurationManager'))) {
      return { allowed: false, reason: 'feature_disabled' };
    }

    // A shared folder's page (#2125) is decided by permission alone:
    // `shared-folder-read` to read it, `shared-folder-file` to change it, on
    // the folder. No vault policy, no audience, no site-wide page grant.
    // #2255: a change also needs the `shared` category's own permission,
    // and an author-lock narrows it to the author.
    const named = parsePrivatePageName(pageName);
    if (named && isSharedFolderOwner(named.owner)) {
      const subject = (args.privateCtx?.userContext ?? userContext) as ActorContext | null | undefined;
      const inFolder = Boolean(subject)
        && await permitsInSharedFolder(this.engine.getManager<VaultDecider>('PolicyDecisionPoint'), subject as ActorContext, action, named.store);
      if (!inFolder) return { allowed: false, reason: 'shared_folder_deny' };
      if (pageWriteAlternatives(permissionForPageAction(action)).length === 1) return { allowed: true, reason: 'shared_folder_allow' };
      if (action.toLowerCase() === 'edit' && metadata?.['author-lock'] === true
        && !(await this.isPageAuthor(metadata.author, userContext?.username)) && !(await args.holdsAdminSystem())) {
        return { allowed: false, reason: 'author_lock_deny' };
      }
      const policy = await args.policy({});
      if (policy?.applicable) return { allowed: policy.permit, reason: policy.permit ? 'shared_folder_allow' : policy.reason, policyIds: policy.policyIds, conditionNotMet: policy.conditionNotMet };
      return { allowed: false, reason: 'default_deny', conditionNotMet: policy?.conditionNotMet };
    }

    // Tier 0: private. Refuses only (#1539); an admitted subject goes on to
    // policy with the page's vault. The frontmatter fallback (no PageManager)
    // names no vault, so its page is taken to be in the default one.
    let vault: string | undefined;
    if (args.pageManager?.checkPrivatePageAccess) {
      const decision = await args.pageManager.checkPrivatePageAccess(args.privateCtx, pageName, args.adminEntry ?? 'none');
      if (decision === false) return { allowed: false, reason: 'private_deny' };
      if (decision === true) vault = parsePrivatePageName(pageName)?.store;
    } else if (metadata?.private === true) {
      // #2097: the author is stored as an identity @id; a container is named by username.
      const owner = await this.authorUsername(metadata.author);
      const allowed = userContext && owner ? mayActInPrivateContainer(userContext, owner) : false;
      if (!allowed) return { allowed: false, reason: 'private_deny' };
      vault = 'default';
    }

    // Tier 0.5: author-lock denies a non-author edit; it grants nothing.
    if (action.toLowerCase() === 'edit' && metadata?.['author-lock'] === true) {
      const isAuthor = await this.isPageAuthor(metadata.author, userContext?.username);
      if (!isAuthor && !(await args.holdsAdminSystem())) {
        return { allowed: false, reason: 'author_lock_deny' };
      }
    }

    // Tier 1: frontmatter audience, when it states a rule. Not on a
    // vault page — its container already decided who may be here.
    if (metadata && vault === undefined) {
      // #1964: an `addon:<slug>` entry needs the subject's enabled add-ons —
      // asked only when this page names one, and by the caller's own means
      // (once per batch for a list).
      const enabledAddons = namesAddonPrincipal(metadata, action) ? await args.enabledAddons() : [];
      const fm = await this.checkFrontmatterAccess(metadata, await args.matchable(), action, enabledAddons, args.holdsAdminSystem);
      if (fm.decided) return { allowed: fm.allowed, reason: fm.reason };
    }

    // Tier 2: the share is the policy for a share visitor; global policy otherwise.
    if (viaShare) return { allowed: true, reason: 'share_grant' };
    const policy = await args.policy(vault === undefined ? {} : { vault });
    if (policy?.applicable) return { allowed: policy.permit, reason: policy.reason, policyIds: policy.policyIds, conditionNotMet: policy.conditionNotMet };

    return { allowed: false, reason: 'default_deny', conditionNotMet: policy?.conditionNotMet };
  }

  /**
   * Whether `username` is the page's author (#2097): `IdentityManager.refersTo`,
   * so an author stored as an identity @id matches only its own account, one
   * not yet converted matches its username, and an orphan matches nobody.
   */
  private async isPageAuthor(author: unknown, username: string | undefined): Promise<boolean> {
    if (!username || typeof author !== 'string' || !author) return false;
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identities) return author === username;
    return identities.refersTo(systemContext(this.engine, 'author-lock: is this subject the page author (#2097)'), author, username);
  }

  /** The username a page's stored author names (#2097), for the private-container fallback. */
  private async authorUsername(author: unknown): Promise<string | null> {
    if (typeof author !== 'string' || !author) return null;
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identities) return author;
    return identities.usernameOf(systemContext(this.engine, 'private page fallback: the author username (#2097)'), author);
  }

  /**
   * The private-container decision for something that is not a page — a file
   * in a store (docs/private-stores.md, Access). The same rule a
   * private page gets at Tier 0: the owner, or a delegate of the owner; never
   * a role. A refusal is recorded like any page refusal (`authorization-deny`).
   *
   * @param caller - the caller's context, as given: a request's subject or a job's (#2022); null is anonymous
   * @param owner - the container's owner (a private file's `creator`)
   * @param resource - what is being reached, for the record (e.g. `attachment:<id>`)
   * @param action - the action asked for (e.g. `view`)
   * @param vault - the vault inside the container, when the question is about one:
   *   a share link the owner issued gets in only for a vault it names (#1388)
   */
  canAccessPrivateContainer(
    caller: PageQuestionCaller,
    owner: string,
    resource: string,
    action: string,
    vault?: string
  ): boolean {
    const userContext = asSubject(caller);
    const allowed = Boolean(userContext && owner)
      && mayActInPrivateContainer(userContext as ActorContext, owner, vault === undefined ? {} : { vault });
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
   * @param caller      - The caller's context, as given: a request's subject or a job's (#2022); null / undefined is anonymous.
   * @param pageName    - Target page to check.
   * @param action      - Action verb (e.g., `'view'`, `'edit'`, `'delete'`).
   * @param knownMetadata - The page's metadata when the caller has just
   *   resolved it: the page door (#1622), which reads the page by the same
   *   resolution it decides on. Omitted, it is loaded here.
   */
  async canUserAccessPage(
    caller: PageQuestionCaller,
    pageName: string,
    action: string,
    knownMetadata?: PageFrontmatter
  ): Promise<boolean> {
    return this.crossPageDecision(asSubject(caller), pageName, action, knownMetadata, true);
  }

  /**
   * {@link canUserAccessPage} as an affordance (#1668): would the door allow
   * this action on that page — asked only to decide whether to show a control
   * (the journal entry view's Edit link, `<wiki:If exists:>`). The same
   * cross-page path and the same evaluator, so it agrees with the door; it
   * records nothing. Acting on the control asks the door.
   *
   * @param knownMetadata - As for {@link canUserAccessPage}: the page's
   *   metadata when the caller has just resolved it (`PageManager.mayShowPage`).
   */
  async pageAffordanceFor(
    caller: PageQuestionCaller,
    pageName: string,
    action: string,
    knownMetadata?: PageFrontmatter
  ): Promise<boolean> {
    return this.crossPageDecision(asSubject(caller), pageName, action, knownMetadata, false);
  }

  /** The cross-page check, for the door (`record`) or an affordance (#1668). */
  private async crossPageDecision(
    userContext: UserContext | null | undefined,
    pageName: string,
    action: string,
    knownMetadata: PageFrontmatter | undefined,
    record: boolean
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
    const pageMetadata = knownMetadata ?? (pm?.getPageMetadata
      ? await pm.getPageMetadata(
        pageName,
        (userContext as unknown as ActorContext) ?? ANONYMOUS_SUBJECT
      ).catch(() => null)
      : null);
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
    const { allowed } = await this._runEvaluator(minimalCtx as unknown as WikiContext, action, record);
    return allowed;
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
    caller: PageQuestionCaller,
    action: string,
    candidates: ReadonlyArray<{ title: string; metadata: PageFrontmatter | null | undefined }>
  ): Promise<string[]> {
    const userContext = asSubject(caller);
    const policyAction = permissionForPageAction(action);
    // #1431 step 7b, #1964: `admin-system` — the exception to an author-lock
    // and to an audience — asked once for the subject, since it does not vary
    // by page, and only when some page needs it.
    let adminSystem: Promise<boolean> | undefined;
    const adminSystemOnce = (): Promise<boolean> => (adminSystem ??= subjectMayDo(this.engine, userContext, 'admin-system'));

    // The ceilings that bound the SUBJECT decide once, for every page — the
    // PDP's, so this is not a third copy of them (#1431). No resource is
    // passed: coverage is per PAGE and is checked in the loop below, where the
    // page's keywords are to hand.
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    // #1762: a proxy claim too — the page's own frontmatter must not let a
    // proxy past what the grant and the actor allow.
    if (carriesCeiling(userContext)) {
      const ceiling = await this.policyDecisionPoint().ceiling(userContext, { action: policyAction });
      if (ceiling && !ceiling.permit) return [];
    }

    const proxiedWrite = Boolean(userContext?.viaProxy) && pageWriteAlternatives(policyAction).length > 1;

    const pageManager = this.engine.getManager<PrivateAccessCheck>('PageManager');
    // Tier 0 reads only the subject: owner or delegate, never a role.
    const privateCtx = { userContext: userContext ?? null } as unknown as WikiContext;
    // #2022: a job's roles are its account's NOW, for the policy compiled
    // once here as the PDP resolves them for one page — so the list and the
    // single-page answer agree for a job too — and for Tier 1's matching.
    const subjectNow = (userContext as { resolveRolesNow?: boolean } | null | undefined)?.resolveRolesNow
      ? await this.resolveSubjectNow(userContext?.username, jobOf(userContext))
      : userContext;
    const decidePolicy = this.policyEvaluator?.compile(subjectNow ?? undefined, policyAction, pageWriteAlternatives(policyAction));
    // #2261: the resolved identity, and what bears on `subject:aal` from the caller's own subject.
    const subjectForConditions = { ...aalFactsOf(userContext), username: subjectNow?.username ?? '', isAuthenticated: subjectNow?.isAuthenticated === true };
    // A subject attribute does not vary by page: read once per listing.
    const subjectReads = new Map<string, unknown>();
    const readSubject = (name: string): unknown => {
      if (!subjectReads.has(name)) subjectReads.set(name, this.subjectAttribute(subjectForConditions, name));
      return subjectReads.get(name);
    };
    // #2261 slice 5: whether a vault is encrypted does not vary by page: asked once per vault for the listing.
    const vaultsEncrypted = new Map<string, Promise<boolean | undefined>>();
    // #2261: nor does the moment: the clock is read once for the listing.
    const readEnvironment = this.environmentReader();
    const matchable = await this.matchableNow(userContext);
    // #1964: the subject's add-ons, resolved once for the whole batch and only
    // if some page names one.
    let enabledAddons: Promise<readonly string[]> | undefined;
    const enabledAddonsOnce = (): Promise<readonly string[]> => (enabledAddons ??= this.enabledAddonsOf(userContext));

    const out: string[] = [];
    for (const { title, metadata } of candidates) {
      // A candidate without metadata is not listed (#714) — the decider
      // refuses the same page (#1431 step 7).
      if (!metadata) continue;
      // The share's cover is per PAGE, so it is checked here rather than in
      // the subject's ceiling above.
      if (viaShare && !shareCoversPage(viaShare.resources, title, metadata)) continue;
      // #2255: a proxy's actor must hold a page write on THIS page's category,
      // which the subject-wide ceiling above could only ask of some category.
      if (proxiedWrite) {
        const onPage = await this.policyDecisionPoint().ceiling(userContext, { action: policyAction, resource: { type: 'page', id: title }, pageMetadata: metadata });
        if (onPage && !onPage.permit) continue;
      }

      // The same tiers the decider walks, in the same order (#1431 7c).
      const decision = await this.walkPageTiers({
        userContext,
        pageName: title,
        metadata,
        action,
        viaShare,
        privateCtx,
        pageManager,
        holdsAdminSystem: adminSystemOnce,
        enabledAddons: enabledAddonsOnce,
        matchable: () => Promise.resolve(matchable),
        policy: async (extra) => {
          // #2255: the same page attributes the PDP asks this PIP for.
          const page = this.pageAttributesFrom(title, metadata, vaultsEncrypted);
          const p = await decidePolicy?.(title, { ...extra, ...page.attributes }, (name) =>
            name.startsWith('resource:') ? page.read(name.slice('resource:'.length)) : name.startsWith('environment:') ? readEnvironment(name) : readSubject(name));
          if (p?.hasDecision) return { applicable: true, permit: p.allowed, reason: 'global_policy', policyIds: p.policyIds, conditionNotMet: p.conditionNotMet };
          return p?.conditionNotMet ? { applicable: false, permit: false, reason: 'default_deny', conditionNotMet: p.conditionNotMet } : null;
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
   * in `MediaManager.getItem` and again in the share routes.
   *
   * __The share ceiling__, for a subject carrying `viaShare` — the twin of
   * the page ceiling in `_runEvaluator`: `asset-read` must be delegated, the
   * share unexpired, the item's keywords covered by the share's media
   * resources (and not `owner-only`), and the issuer still holding
   * `asset-read` live. An ordinary session is allowed: media items carry no
   * per-item privacy and no page link (#1427).
   *
   * A refusal is audited as `authorization-deny` on the media resource, with
   * the share attribution when there is one.
   */
  async canUserAccessMediaItem(
    caller: PageQuestionCaller,
    item: MediaItem
  ): Promise<boolean> {
    const userContext = asSubject(caller);
    // #1431: the share ceiling is the PDP's — this was the fourth copy of it,
    // after the page door, the list filter and UserManager. The media half it
    // cannot know (does the share cover THIS item) is
    // supplied as coverage, which is PIP work.
    const viaShare = (userContext as { viaShare?: ShareGrant } | null | undefined)?.viaShare;
    // #1762: someone acting for a person reads media only under a grant that
    // carries asset-read and an actor who holds it.
    if (viaShare || userContext?.viaProxy) {
      const ceiling = await this.policyDecisionPoint().ceiling(userContext, {
        action: 'asset-read',
        resource: { type: 'media', id: item.id },
        resourceCoverage: (shareResources) => {
          // `metadata.keywords` sits under the index signature as string | string[].
          const raw = item.metadata?.keywords;
          const keywords: string[] = Array.isArray(raw)
            ? raw.filter((k): k is string => typeof k === 'string')
            : typeof raw === 'string' ? [raw] : [];
          return shareCoversResource(shareResources, 'media', keywords);
        }
      });
      if (ceiling && !ceiling.permit) {
        logger.info(`[ACL] ${viaShare ? `share ${viaShare.id} (issued by ${viaShare.issuer})` : `proxy grant ${userContext?.viaProxy?.grantId}`}: ${ceiling.reason} — media ${item.id} denied`);
        void this.auditDenial(userContext, item.id, 'asset-read', ceiling.reason, 'media');
        return false;
      }
    }
    return true;
  }

  /**
   * Check the front matter audience (Tier 1).
   * Returns a decision object; decided=false means no front matter restriction — fall through.
   *
   * An audience that leaves the subject out refuses every action, unless the
   * subject holds `admin-system` (#1964, operator 2026-10-23): asked only
   * then. `access` is no longer read (#2255).
   */
  private async checkFrontmatterAccess(
    metadata: PageFrontmatter,
    userContext: UserContext | null | undefined,
    action: string,
    enabledAddons: readonly string[],
    holdsAdminSystem: () => Promise<boolean>
  ): Promise<{ decided: boolean; allowed: boolean; reason: string }> {
    // #1054: the rule itself lives in utils/frontmatterAccess so the page
    // LISTERS decide identically to this evaluator. The `reason` strings
    // stay, since callers branch on them.
    const viewerPrincipals = principalsOf(userContext);
    const admin = audienceExcludes(metadata, viewerPrincipals, enabledAddons) && await holdsAdminSystem();

    const decision = decideFrontmatterAccess(metadata, viewerPrincipals, action, enabledAddons, admin);
    if (!decision.decided) return { decided: false, allowed: false, reason: '' };
    return decision.allowed
      ? { decided: true, allowed: true, reason: `frontmatter_principal_${decision.matched}` }
      : { decided: true, allowed: false, reason: 'frontmatter_deny' };
  }

  /**
   * A page's attributes for the policies (#2255, XACML's PIP): the PDP asks
   * this from the page id, so no route passes them. `knownMetadata` is the
   * frontmatter when this PIP already holds it (the page door); otherwise the
   * page is read with the caller's own context, so a sealed page stays closed
   * to anyone without its key (#1422). A page that cannot be read has no
   * attributes: no category policy matches it and every condition on it is
   * unknown.
   */
  async pageAttributes(caller: PageQuestionCaller, pageName: string, knownMetadata?: Record<string, unknown> | null): Promise<PageAttributes> {
    let metadata = knownMetadata as PageFrontmatter | null | undefined;
    if (metadata === undefined) {
      const pm = this.engine.getManager<{ getPageMetadata?: (id: string, ctx: ActorContext) => Promise<PageFrontmatter | null> }>('PageManager');
      metadata = pm?.getPageMetadata
        ? await pm.getPageMetadata(pageName, (asSubject(caller) as unknown as ActorContext) ?? ANONYMOUS_SUBJECT).catch(() => null)
        : null;
    }
    return this.pageAttributesFrom(pageName, metadata);
  }

  /**
   * {@link pageAttributes} from frontmatter already in hand (the list
   * filter). Attributes are those declared in `ngdpbase.access.resource-types`
   * on `page`, `vault` and `shared-folder` (which of them a policy may read is
   * the evaluator's call, from the types the policy names), each read from its
   * `from` source; the sources are code (`frontmatter:<field>` and
   * `vault:<field>`).
   *
   * - `system-category` is lowercased; a page with none is in the default
   *   category (the entry with `default: true`); a page in a shared folder is
   *   `shared`, whatever its frontmatter says (#2255).
   * - An `identity` attribute (`owner`, from `author`) is compared by the
   *   account it names: an @id or a username not yet converted both read as
   *   that account's username, an orphan as missing (#2097).
   * - `vault:owner` is the account that owns the vault the page is in, and
   *   `vault:encrypted` whether that vault is encrypted (#2261). Both are
   *   missing, not false, for a page that is not in a vault (a public page, a
   *   shared folder's page), and `vault:encrypted` is missing when the vault's
   *   state cannot be read: a condition on a missing attribute fails closed.
   *   Derived from the page's name, so a list reads what a single page does.
   *   `vaultsEncrypted` lets a listing ask once per vault.
   */
  pageAttributesFrom(pageName: string, metadata: PageFrontmatter | null | undefined, vaultsEncrypted: Map<string, Promise<boolean | undefined>> = new Map()): PageAttributes {
    if (!metadata) return { attributes: {}, read: () => undefined };
    this.warnLegacyAccess(pageName, metadata);
    const category = this.pageCategory(pageName, metadata);
    const declared = this.declaredResourceAttributes();
    const vault = parsePrivatePageName(pageName);
    const inVault = vault && !isSharedFolderOwner(vault.owner) ? vault : null;
    const memo = new Map<string, unknown>();
    const read = (name: string): unknown => {
      if (memo.has(name)) return memo.get(name);
      const decl = Object.hasOwn(declared, name) ? declared[name] : undefined;
      const from = typeof decl?.from === 'string' ? decl.from : '';
      const field = from.startsWith('frontmatter:') ? from.slice('frontmatter:'.length) : null;
      const type = decl?.type ?? 'string';
      let value: unknown;
      if (field === 'system-category') value = category;
      else if (field) {
        const raw = (metadata as Record<string, unknown>)[field];
        // A value that does not fit the declared type is missing, never coerced (#2261).
        value = type === 'identity' ? this.identityValue(raw) : valueFits(type, raw) ? raw : undefined;
      } else if (from === 'vault:owner' && inVault) {
        value = valueFits(type, inVault.owner) ? (type === 'identity' ? normalizeUsername(inVault.owner) : inVault.owner) : undefined;
      } else if (from === 'vault:encrypted' && inVault && type === 'boolean') {
        value = this.vaultEncrypted(inVault.owner, inVault.store, vaultsEncrypted);
      }
      memo.set(name, value);
      return value;
    };
    return { attributes: { 'system-category': category }, read };
  }

  /** Whether `owner`'s vault is encrypted, once per vault for `known`; a read that fails, or no ShareManager, is missing (never "not encrypted"). */
  private vaultEncrypted(owner: string, vault: string, known: Map<string, Promise<boolean | undefined>>): Promise<boolean | undefined> {
    const key = `${owner}/${vault}`;
    let asked = known.get(key);
    if (!asked) {
      const shares = this.engine.getManager<{ isEncryptedVault?(owner: string, vault: string): Promise<boolean> }>('ShareManager');
      try {
        asked = shares?.isEncryptedVault
          ? shares.isEncryptedVault(owner, vault).then((encrypted) => (typeof encrypted === 'boolean' ? encrypted : undefined), () => undefined)
          : Promise.resolve(undefined);
      } catch {
        asked = Promise.resolve(undefined); // a synchronous throw is missing too, never an error out of a decision
      }
      known.set(key, asked);
    }
    return asked;
  }

  /**
   * A subject attribute a condition reads (#2255, #2261): `subject:<name>`,
   * declared in `ngdpbase.access.subject-attributes` (`id` always is) and read
   * from its `from` source here, the only place a subject attribute is read. A
   * request cannot send one. Missing when it is not declared, cannot be read, or
   * the subject has none (`subject:aal` of a visitor who is not signed in, of a
   * token made before it was stored); the evaluator then fails closed. Returns
   * the value, or a Promise of it for a field read from the account (the
   * evaluator awaits every read).
   */
  subjectAttribute(subject: SubjectFacts | null | undefined, name: string): unknown {
    if (!name.startsWith('subject:')) return undefined;
    const attr = name.slice('subject:'.length);
    const declared = declaredSubjectAttributes(readDeclaredAsWritten(this.engine.getManager<ConfigurationManager>('ConfigurationManager'), 'ngdpbase.access.subject-attributes'));
    if (!Object.hasOwn(declared, attr) || subjectDeclarationProblem(attr, declared[attr], SENSITIVE_USER_FIELDS) !== null) return undefined;
    return this.readSubjectSource(attr, declared[attr], subject);
  }

  /**
   * An environment attribute a condition reads (#2261): `environment:<name>`,
   * declared in `ngdpbase.access.environment-attributes` and read from its
   * `from` source here, the only place one is read. `schedule:<name>` is whether
   * that schedule in `ngdpbase.schedules` is open at `now`; `config:<key>` is
   * the boolean stored at that configuration key, any key, secrets included.
   * Missing when it is not declared, the schedule is absent, the stored value is
   * not a boolean, or the read fails; the evaluator then fails closed. The value
   * is returned to the evaluator and goes nowhere else: it is never logged.
   */
  environmentAttribute(name: string, now: Date = this.clock()): boolean | undefined {
    if (!name.startsWith('environment:')) return undefined;
    const attr = name.slice('environment:'.length);
    const config = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = declaredEnvironmentAttributes(readDeclaredAsWritten(config, 'ngdpbase.access.environment-attributes'));
    if (!config || !Object.hasOwn(declared, attr) || environmentDeclarationProblem(attr, declared[attr]) !== null) return undefined;
    const from = declared[attr].from as string;
    try {
      if (from.startsWith('config:')) {
        const stored: unknown = config.getProperty(from.slice('config:'.length), undefined);
        return typeof stored === 'boolean' ? stored : undefined;
      }
      const schedules = config.getProperty(SCHEDULES_KEY, null) as Record<string, Schedule> | null;
      const key = from.slice('schedule:'.length);
      const schedule = schedules && typeof schedules === 'object' && Object.hasOwn(schedules, key) ? schedules[key] : undefined;
      if (!schedule || typeof schedule !== 'object') return undefined;
      const zone: unknown = config.getProperty(TIME_ZONE_KEY, 'UTC');
      const fallback = typeof zone === 'string' && zone ? zone : 'UTC';
      // A switched-off, malformed or wrong-zone schedule is missing, not open: the site gate's leniency does not carry over.
      if (!scheduleIsEnabled(schedule) || scheduleProblem(schedule, fallback) !== null) return undefined;
      return scheduleIsOpen(schedule, now, fallback);
    } catch (err) {
      // Said without the value: a `config:` read may be a secret's.
      logger.warn(`[PIP] environment:${attr} could not be read from ${from.startsWith('config:') ? 'config' : 'its schedule'}: ${err instanceof Error ? err.name : 'error'}`);
      return undefined;
    }
  }

  /**
   * A reader of environment attributes for one decision or one listing
   * (#2261): the clock is read once, on the first attribute asked for, and
   * each attribute once, so every policy and every page sees one instant.
   */
  environmentReader(): (name: string) => unknown {
    let now: Date | undefined;
    const reads = new Map<string, unknown>();
    return (name) => {
      if (!reads.has(name)) reads.set(name, this.environmentAttribute(name, (now ??= this.clock())));
      return reads.get(name);
    };
  }

  /** One read of a declared subject attribute from its source. A value of the wrong type, or a source that throws, is missing. */
  private readSubjectSource(attr: string, decl: DeclaredSubjectAttribute, subject: SubjectFacts | null | undefined): unknown {
    const from = decl.from as string;
    const type = decl.type as string;
    const fit = (value: unknown): unknown => (valueFits(type, value) ? (type === 'identity' ? normalizeUsername(value) : value) : undefined);
    if (from === 'sign-in') return fit(effectiveAal(subject));
    if (!subject?.isAuthenticated || !subject.username) return undefined;
    if (from === 'account:id') return fit(subject.username);
    const field = from.slice(from.indexOf(':') + 1);
    return this.userManager().getUser(subject.username).then(
      (record) => (record && Object.hasOwn(record, field) ? fit((record as unknown as Record<string, unknown>)[field]) : undefined),
      (err: unknown) => {
        logger.warn(`[PIP] subject:${attr} could not be read from ${from}: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    );
  }

  /** The page's category for the policies (#2255): lowercased; the default when it has none; `shared` in a shared folder. */
  private pageCategory(pageName: string, metadata: PageFrontmatter): string | undefined {
    const named = parsePrivatePageName(pageName);
    if (named && isSharedFolderOwner(named.owner)) return 'shared';
    const raw = metadata['system-category'];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().toLowerCase();
    const validation = this.engine.getManager<{ getDefaultSystemCategory?: () => string }>('ValidationManager');
    return validation?.getDefaultSystemCategory?.()?.toLowerCase() ?? 'general';
  }

  /**
   * The attributes declared on the `page` resource type (#2255) and on `vault`
   * and `shared-folder` (#2261), all of them: which a policy may read is
   * decided by the evaluator, from the resource types the policy names.
   */
  private declaredResourceAttributes(): Record<string, DeclaredAttribute> {
    const types = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.access.resource-types', null) as ResourceTypeDeclarations | null;
    return attributesForResourceTypes(types, ATTRIBUTE_RESOURCE_TYPES);
  }

  /** An identity reference as the policies compare it: the username of the account it names, or missing (#2097). */
  private async identityValue(stored: unknown): Promise<string | undefined> {
    if (typeof stored !== 'string' || !stored) return undefined;
    const identities = this.engine.getManager<IdentityManager>('IdentityManager');
    const username = identities
      ? await identities.usernameOf(systemContext(this.engine, 'policy condition: the account a page owner names (#2255)'), stored)
      // Without IdentityManager a urn: id names no username, so it is unknown; `URN:` too (#2279), so it is never taken for a username.
      : stored.toLowerCase().startsWith(IDENTITY_ID_PREFIX) ? undefined : stored;
    return username ? normalizeUsername(username) : undefined;
  }

  /** Pages already warned about for an `access:` that is not the legacy stamp (#2255): once per page per process. */
  private readonly warnedAccess = new Set<string>();

  /**
   * `access:` frontmatter no longer has any effect (#2255). The stamp install
   * wrote (`{ edit: [admin] }`) is left alone silently; any other value is
   * someone's rule that is now ignored, so it is said once per page.
   */
  private warnLegacyAccess(pageName: string, metadata: PageFrontmatter): void {
    const access = (metadata as Record<string, unknown>).access;
    if (access === undefined || isLegacyAccessStamp(access) || this.warnedAccess.has(pageName)) return;
    this.warnedAccess.add(pageName);
    logger.warn(`[ACL] page '${pageName}' has an 'access' frontmatter field; it is no longer read and has no effect. Who may change a page is decided by its system-category and the policies (#2255). Use 'audience' or 'author-lock' to narrow it`);
  }

  /**
   * Does the page's `audience` admit this subject (#1964)? True when the page
   * names no audience, the subject matches it, or the subject holds
   * `admin-system`. The same rule Tier 1 applies, asked by PageManager's
   * write door, so a write cannot reach a page its writer is outside the
   * audience of — whatever route it came by. Records nothing; the door does.
   *
   * @param caller - the caller's context, as given (a job's included, #2022)
   * @param metadata - the page's current frontmatter
   */
  async audienceAdmits(
    caller: PageQuestionCaller,
    metadata: PageFrontmatter | null | undefined
  ): Promise<boolean> {
    if (!audiencePrincipals(metadata)) return true;
    const userContext = asSubject(caller);
    // A job's subject carries no roles, only the instruction to resolve them
    // now (#1212): an audience naming a role is matched against what its
    // principal holds at this moment.
    const matchable = await this.matchableNow(userContext);
    const enabledAddons = namesAddonPrincipal(metadata, 'view') ? await this.enabledAddonsOf(userContext) : [];
    if (!audienceExcludes(metadata, principalsOf(matchable), enabledAddons)) return true;
    return subjectMayDo(this.engine, userContext, 'admin-system');
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
    let policyIds: string[] | undefined;
    let conditionNotMet: string[] | undefined;
    if (arguments.length === 1 && userOrObj && typeof userOrObj === 'object') {
      const obj = userOrObj as AccessDecisionLog;
      user = obj.user;
      pageName = obj.pageName;
      action = obj.action;
      allowed = obj.allowed;
      reason = obj.reason;
      policyIds = obj.policyIds;
      conditionNotMet = obj.conditionNotMet;
      // context preserved for potential future use or logging
      void (obj.context || {});
    }
    const username = PolicyInformationPoint.recordedUser(user);
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
      void this.auditDenial(user, pageName, action, reason, 'page', policyIds, conditionNotMet);
    }
  }

  /**
   * Record a page write a door refused on a capability alone (#2272): the
   * route's `page-edit` / `page-create` check asks the PDP, which records
   * nothing. Same record as every other page denial, `policyIds` included.
   */
  recordPageRefusal(subject: UserContext | null | undefined, pageName: string, action: string, reason: string, policyIds: readonly string[] = [], conditionNotMet: readonly string[] = []): Promise<void> {
    this.engine?.logger?.warn?.(`ACL decision: user=${PolicyInformationPoint.recordedUser(subject)} page=${pageName} action=${action} allowed=false reason=${reason}`);
    return this.auditDenial(subject, pageName, action, reason, 'page', policyIds, conditionNotMet);
  }

  /**
   * Record a write the signed-out write gate refused before any route ran
   * (#2298). The resource is the route as asked (`POST /save/Home`): method
   * and path, never the query or the body, which can carry a password or a
   * token. Standard tier and best-effort, like every other denial.
   */
  recordRouteRefusal(subject: UserContext | null | undefined, route: string): Promise<void> {
    logger.warn(`ACL decision: user=${PolicyInformationPoint.recordedUser(subject)} route=${route} allowed=false reason=signed_out_write`);
    return this.auditDenial(subject, route, 'signed-out-write', 'signed_out_write', 'route');
  }

  /** The name a decision is recorded under: the subject's, or `anonymous`. */
  private static recordedUser(subject: UserContext | null | undefined): string {
    return subject?.username || subject?.name || 'anonymous';
  }

  /**
   * Record a denied access decision in the audit trail (#1115).
   *
   * Best-effort and never awaited by the decision path: the answer to "may
   * this user do this" must not depend on the audit backend being healthy, and
   * a slow sink must not delay a page render. `authorization-deny` is standard
   * tier for that reason — the critical tier is destruction and credentials.
   *
   * Everything about who asked — the name, the request's address, a share —
   * is read here from the subject the decision was made for, so every
   * denial this manager records carries the same fields (#1668: the address
   * was dropped, `ipAddress: undefined`, on every page and media denial). The
   * session and bearer middleware put the request's address on the subject.
   */
  private async auditDenial(
    subject: UserContext | null | undefined,
    pageName: string | undefined,
    action: string | undefined,
    reason: string | undefined,
    resourceType: 'page' | 'media' | 'route' = 'page',
    policyIds: readonly string[] = [],
    conditionNotMet: readonly string[] = []
  ): Promise<void> {
    const username = PolicyInformationPoint.recordedUser(subject);
    const ipAddress = typeof subject?.ipAddress === 'string' && subject.ipAddress ? subject.ipAddress : undefined;
    const viaShare = subject?.viaShare;
    // #1762 slice 3: a denial under a proxy grant names the represented person
    // in `user` and the person who tried in `actor`, as every other row does.
    const { metadata: proxyMeta, ...proxy } = proxyAttribution(subject?.viaProxy);
    // #1205: through recordAuditEvent, so the enabled switch, the tier and the
    // outcome are the same door every emitter uses. Standard tier: a slow
    // sink must not delay a page render, and the drop is counted, not hidden.
    const sink = this.engine?.getManager?.('AuditManager') as AuditEventSink | null;
    await recordAuditEvent(
      sink,
      {
        eventType: AUDIT_EVENT.AUTHORIZATION_DENY,
        user: username,
        ...proxy,
        ipAddress,
        action: action ?? 'unknown',
        resource: pageName ?? '',
        resourceType,
        result: 'deny',
        reason: reason || 'not permitted',
        severity: 'medium',
        // #1222: a share visit is attributed to the share and its issuer —
        // "anonymous via share, issued by" — on every record it produces.
        // #2255: the policies that decided, so "why was I refused" has an answer.
        metadata: {
          ...(viaShare ? { viaShareId: viaShare.id, viaShareIssuer: viaShare.issuer } : proxyMeta),
          ...(policyIds.length > 0 ? { policyIds: [...policyIds] } : {}),
          // #2288: allows that matched but whose condition was not met. Ids only, never attribute values.
          ...(conditionNotMet.length > 0 ? { conditionNotMet: [...conditionNotMet] } : {})
        }
      },
      (err) => logger.warn(`Audit log failed for authorization-deny of '${pageName}':`, err)
    );
  }

  // NOTE: PolicyInformationPoint does not need backup/restore methods because:
  // - All policies are loaded from ConfigurationManager (backed up by ConfigurationManager)
  // - It holds no policy cache of its own (#1431)
}

export default PolicyInformationPoint;
