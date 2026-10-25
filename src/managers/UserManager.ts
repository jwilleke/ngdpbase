import BaseManager, { BackupData } from './BaseManager.js';
import type PolicyInformationPoint from '../security/PolicyInformationPoint.js';
import { recordSystemAction, systemContext } from '../context/bootActions.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { emailDomain } from '../utils/emailForLog.js';
import { isReservedUsername, normalizeUsername } from '../utils/username.js';
import { KeyedSerial } from '../utils/keyedSerial.js';
import { hashPassword, verifyPassword } from '../utils/passwordHash.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { UserProvider, ProviderInfo } from '../types/Provider.js';
import { User, UserPreferences, UserSession } from '../types/User.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type IdentityManager from './IdentityManager.js';
import type OrganizationManager from './OrganizationManager.js';
import type RoleManager from './RoleManager.js';
import type PageManager from './PageManager.js';
import type TemplateManager from './TemplateManager.js';
import type SessionStatsManager from './SessionStatsManager.js';
import { endSession, type SessionEndReason } from '../utils/sessionEnd.js';
import { checkSessionAccount } from '../utils/sessionAccount.js';
import type ValidationManager from './ValidationManager.js';
import type { PersonUpdate } from '../types/Person.js';
import type { JobContext } from '../context/JobContext.js';
import type { ShareGrant } from '../types/Share.js';
import { assertHeadlessBootstrapPassword } from '../utils/headlessAdminPassword.js';
import { UserCreateError } from '../utils/userCreateError.js';
import { setPassword } from '../utils/passwordChange.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { requireLookupPermission } from '../utils/contactAccess.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { enabledEntries } from '../utils/configFiles.js';
import { resetPasswordWrapWithMnemonic, rewrapUserKeysOnPasswordChange } from '../utils/privateStoreUnlock.js';
import { USER_DATA_TOPIC } from '../cache/CacheDependencies.js';

// #1179: the account writes below take an `ActorContext` — the request's
// subject or a JobContext — mandatory and positional. `AuditActor`, the
// optional `{ username?, ipAddress?, provider? }` bag that preceded it,
// recorded `unknown` when omitted and let a caller pass a literal `'system'`;
// both were the shape this principle exists to end. An identity provider that
// provisions an account now says so in the JobContext's reason.

/** Account fields whose change alters what the account may do or who holds it. Preferences are not among them. */
const SENSITIVE_USER_FIELDS = ['password', 'roles', 'isActive', 'isExternal', 'isTest', 'email', 'profileLocked', 'username'] as const;

/**
 * An account record as UserManager hands it out: never the password hash, and
 * `isTest` always a boolean (#1805) — an account saved before the flag existed
 * carries none, and reads it as `false`.
 */
function publicRecord(user: User): Omit<User, 'password'> {
  const { password: _pwd, ...rest } = user;
  return { ...rest, isTest: user.isTest === true };
}

/**
 * Provider constructor type for dynamic loading
 */
interface UserProviderConstructor {
  new (engine: WikiEngine): UserProvider;
}

/**
 * The agent token a request arrived with (#946).
 *
 * Declared rather than reached by a cast (#1164). `hasPermission` used to read
 * `viaToken` off a parameter typed `{ username; roles; isAuthenticated }` — a
 * field the declared type did not mention. That is not a detail: the type
 * described a three-field object, so satisfying it by BUILDING one was the
 * obvious thing to do, and any object built that way silently carries no token
 * for the ceiling to find. `AttachmentManager` did exactly that and bypassed
 * the ceiling on the path that looked safe.
 */
export interface AgentTokenGrant {
  id: string;
  name: string;
  scopes: string[];
}

/**
 * A person acting for another under a proxy grant (#1762 slice 2), as a
 * subject carries it. The subject's `username` and `roles` are the person
 * REPRESENTED; this names who is actually acting and under which grant.
 *
 * The PDP re-reads the grant on every decision (`AuthManager.liveProxyGrant`)
 * — nothing here is trusted beyond naming it — and bounds the action by the
 * grant's permissions and by what `actor` holds, live. A proxy is not a
 * delegated credential for step-up: the actor's own fresh sign-in counts, so
 * the subject's `signIn` and `aalCap` are the ACTOR's (the session's).
 *
 * `kind: 'impersonation'` is reserved for #1763 "view as"; nothing admits it
 * yet, so a subject carrying it is refused everywhere.
 */
export interface ProxyClaim {
  kind: 'proxy' | 'impersonation';
  /** The grant's id in the credentials store. */
  grantId: string;
  /** Who is acting: the grant's proxy. */
  actor: string;
  /** The grant's permissions as the subject was built with them; the live grant must still carry every one. */
  scopes: string[];
  /**
   * The actor's OWN private-store handle (#1762 slice 5): where a key copy
   * opened under this grant is held (`privateStoreUnlock.openKeyCopy`). It
   * reaches only that copy — never the actor's own keys — and only while the
   * copy was opened for this grant and this represented person (`dekFor`).
   */
  keyHandle?: string;
}

/**
 * The subject for a check about nobody in particular (#1164).
 *
 * There is one honest reason to hand `hasPermission` a subject you built:
 * asking what an ANONYMOUS visitor may do, where there is no user and no token
 * by definition. Naming it once keeps that case explicit and keeps
 * `check-permission-subject.ts` free to reject every inline literal — an
 * escape hatch nobody can reach by accident.
 */
export const ANONYMOUS_SUBJECT: PermissionSubject = {
  username: 'Anonymous',
  roles: ['anonymous'],
  isAuthenticated: false
};

/*
 * There is deliberately no ASSERTED subject (#1435).
 *
 * JSPWiki's "asserted" state means: a cookie says this browser has been here
 * before, and nobody authenticated. Its visible form is the greeting — "Good
 * morning, Jim (please log in)" — and that is the flaw, not a bug in it. A
 * cookie evidences the BROWSER, never the person holding it, so on a shared
 * laptop or a kiosk the cookie is correct and the greeting is wrong. It
 * discloses that Jim has an account, and his name, to precisely the one
 * visitor who should not learn it, and Jim never sees it happen.
 *
 * Nothing here ever produced one: `getAssertedUser()` had no callers, the
 * constant was declared twice with different roles (`['reader']` against
 * `['anonymous']`), and no shipped role or policy named it.
 *
 * Continuity without an identity claim is still fine — a draft, a theme, a
 * collapsed sidebar, keyed to the browser and displaying no name. None of that
 * needs a subject, roles, or a constant to hang them on.
 */

/** Config key naming the system principal. Ships as `$NGDPBASE_SYSTEM_USER` — env-owned, bare form (#631). */
export const SYSTEM_PRINCIPAL_KEY = 'ngdpbase.system.principal';
/** Config key listing the roles the system principal holds. Ships as `["admin"]` (#631). */
export const SYSTEM_ROLES_KEY = 'ngdpbase.system.roles';

/**
 * Who a permission check is about.
 *
 * __Forward the context you were given; do not rebuild one.__ `viaToken` is
 * optional because an ordinary session request has none — which means the type
 * cannot force you to carry it. Rebuilding a subject from parts therefore still
 * compiles, and still drops the ceiling. What stops that is
 * `scripts/check-permission-subject.ts`, not the compiler.
 */
export interface PermissionSubject {
  username: string;
  roles: string[];
  isAuthenticated: boolean;
  /** Present only when the request authenticated with an agent token. */
  viaToken?: AgentTokenGrant;
  /** Present only when the request presented a share token (#1222). Forwarded like `viaToken`. */
  viaShare?: ShareGrant;
  /**
   * Present only when someone is acting for this subject's person under a
   * proxy grant (#1762). Forwarded like `viaToken`; never combined with a
   * token or a share (the PDP refuses a subject carrying both).
   */
  viaProxy?: ProxyClaim;
  /** The address the request came from (#1179) — provenance for the record, set where the request subject is built. */
  ipAddress?: string;
  /**
   * Opaque handle to this session's unlocked private-store keys (#1382).
   * Random — not the session id — created at password login and dropped at
   * logout; resolved live, so after logout it reaches nothing. Set only where
   * the request subject is built; never recorded (`actorOf` must not gain it).
   */
  privateStoreHandle?: string;
  /**
   * How and when this session signed in (#1525, #1635): the factors and when
   * each was last satisfied. Set only where the request subject is built from
   * the session, so the PDP can decide a step-up permission itself — the door
   * decides, not the route in front of it. Never recorded. Under `viaProxy`
   * it is the actor's: the proxy's own fresh sign-in is what counts (#1762).
   */
  signIn?: import('./AuthManager.js').SignInRecord;
  /**
   * The highest level this account's allowed sign-in methods can reach, at
   * least 1 (#1690). A role's required level never exceeds it: an account
   * with no way to reach AAL2 holds its roles at AAL1. Set where the request
   * subject is built, beside `signIn` — under `viaProxy`, the actor's
   * account's cap, since it is the actor who signs in (#1762).
   */
  aalCap?: import('../providers/BaseAuthProvider.js').Aal;
}

/**
 * The subject of work with no request behind it (#631, #1212).
 *
 * A job enqueued at 09:00 and run at 09:12 must authorise against 09:12's
 * roles, so it carries who asked and __no roles__ — they resolve at decision
 * time. Until #1212 that shape was "a `PermissionSubject` whose `roles` happen
 * to be absent", which the type could not tell apart from a caller that
 * forgot them. `resolveRolesNow` says it on purpose: the compiler now refuses
 * a subject missing `roles`, and this is the one sanctioned way to ask for
 * live resolution. `viaToken` / `viaShare` / `viaProxy` ride along exactly as on a request.
 */
export interface JobSubject {
  username: string;
  isAuthenticated: boolean;
  /** Roles are resolved live at decision time, not carried. */
  resolveRolesNow: true;
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
  viaProxy?: ProxyClaim;
  /** #1999: the scheduled job a run acts as (`JobContext.job`). */
  job?: string;
}


/**
 * User creation input data
 */
interface UserCreateInput {
  username: string;
  email: string;
  displayName?: string;
  password: string;
  roles?: string[];
  isExternal?: boolean;
  isActive?: boolean;
  acceptLanguage?: string;
  /** Freeze password/email/displayName against self-service change (#1029). */
  profileLocked?: boolean;
  /** A test account (#1805): attribute only, grants nothing. Default false. */
  isTest?: boolean;
}

/**
 * User update input data
 */
export interface UserUpdateInput {
  email?: string;
  displayName?: string;
  password?: string;
  roles?: string[];
  isActive?: boolean;
  isExternal?: boolean;
  /** A test account (#1805); the change is recorded on user-edit. */
  isTest?: boolean;
  preferences?: Partial<UserPreferences>;
  profilePage?: string;
  [key: string]: unknown; // allow addon/extended fields
}

/**
 * A change worked out from the account as it is now (#2025), the function form
 * of `updateUser`. It runs inside the account's key, is handed a copy of the
 * account without the password hash (an add-on's own fields included, as
 * `UserUpdateInput` allows them), and returns the fields to merge, or
 * `undefined` to change nothing.
 */
export type UserUpdateFn = (current: Omit<User, 'password'> & { [key: string]: unknown }) => UserUpdateInput | undefined | Promise<UserUpdateInput | undefined>;

/** One account change, read and written inside the account's key; what is left to do after it (#2025). */
interface AccountEdit {
  /** The account as written (or as read, when nothing changed). */
  user: User;
  /** The fields merged; null when the function form changed nothing. */
  updates: UserUpdateInput | null;
  disabling: boolean;
  recordEdit: (result: 'success' | 'failure', reason?: string) => Promise<void>;
}

/**
 * UserManager - Handles user authentication, authorization, and roles
 *
 * Similar to JSPWiki's UserManager with role-based permissions. This manager
 * orchestrates user operations through a pluggable provider system, allowing
 * different storage backends (file, database, LDAP, etc.) to be used.
 *
 * Key responsibilities:
 * - User authentication (login/logout)
 * - Password management with hashing
 * - Role and permission management
 * - Session management
 * - User profile management
 * - Provider abstraction for storage
 *
 * Follows JSPWiki's provider pattern where the actual storage implementation
 * is abstracted behind a provider interface. This allows for different storage
 * backends (file, database, LDAP, etc.) to be swapped via configuration.
 *
 * @class UserManager
 * @extends BaseManager
 *
 * @property {UserProvider|null} provider - The active user storage provider
 * @property {string} providerClass - The class name of the loaded provider
 * @property {Map<string, Role>} roles - Role definitions
 * @property {Map<string, string>} permissions - Permission definitions
 * @property {string} passwordSalt - Salt for password hashing
 * @property {number} sessionExpiration - Session expiration time in milliseconds
 * @property {string} defaultTimezone - Default timezone for users
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link FileUserProvider} for default provider implementation
 *
 * @example
 * const userManager = engine.getManager('UserManager');
 * const ok = await authManager.authenticate('password', { username: 'admin', password: 'password' });
 * if (user) logger.info('Logged in:', user.username);
 */
class UserManager extends BaseManager {
  private provider: UserProvider | null = null;
  private providerClass?: string;
  private passwordSalt?: string;
  /** One read-merge-write at a time per account, keyed by the normalized username (#2025). */
  private readonly accountWrites = new KeyedSerial();

  /**
   * Creates a new UserManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initialize the UserManager and load the configured provider
   *
   * Loads the user provider, role definitions, and creates a default admin
   * user if no users exist.
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available or provider fails to load
   *
   * @example
   * await userManager.initialize();
   * // Creates default admin if no users exist
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('UserManager requires ConfigurationManager');
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.user.provider.default', 'fileuserprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.user.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`👤 Loading user provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    try {
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: UserProviderConstructor };
      const ProviderClass = mod.default;

      this.provider = new ProviderClass(this.engine);
      if (!this.provider) {
        throw new Error('Failed to create user provider');
      }
      await this.provider.initialize();

      const info = this.getProviderInfo();
      logger.info(`👤 UserManager initialized with ${info.name} v${info.version}`);
      if (info.features && info.features.length > 0) {
        logger.info(`👤 Provider features: ${info.features.join(', ')}`);
      }
    } catch (error) {
      logger.error(`👤 Failed to initialize user provider: ${this.providerClass}`, error);
      throw error;
    }

    // Load configuration settings (for business logic)
    this.passwordSalt = configManager.getProperty('ngdpbase.user.security.passwordsalt', 'amdwiki-salt') as string;

    // NOT read here on purpose. `ngdpbase.user.security.defaultpassword` ships
    // as the literal `admin123` (#1087 — an earlier version of this comment
    // wrongly claimed it shipped as the bare env-ref). An operator MAY point it
    // at "$NGDPBASE_ADMIN_PASSWORD", and a bare ref throws when the variable is
    // unset (#775) — so reading it on every startup would refuse to boot every
    // install that had made that choice and then removed the variable, even
    // though those installs already have an admin and will never use the value.
    // It is read where it is actually needed, in createDefaultAdmin(), which
    // runs only when the user store is empty.

    // Create the bootstrap admin if it is missing.
    //
    // This used to fire only on a COMPLETELY empty store. That left a trap
    // with no way out: remove the `admin` record while other accounts remain —
    // a hand-edited users.json, a botched migration, a restore from a partial
    // backup — and the instance has no administrator and never regains one,
    // because the store is not empty. The only escape was deleting every other
    // account to trigger the empty-store path, destroying the user base to
    // recover one login. There is no password-reset route to fall back on.
    //
    // Keyed on the admin account specifically rather than on "any user with
    // the admin role", so an operator who deliberately renamed or removed
    // `admin` in favour of their own named administrator does not get it
    // resurrected on every boot. Recreating it is safe regardless: the
    // password is the configured bootstrap value, and the startup banner
    // warns for as long as that value is still in force.
    if (this.provider) {
      // Only act on a well-formed store. The provider contract is
      // Map<string, User>; a degraded or third-party provider can return
      // something else, and creating an administrator over a store we could
      // not actually read is far worse than skipping a recovery that was
      // probably unnecessary. The previous `allUsers.size === 0` check
      // tolerated those shapes by accident — `undefined === 0` is false — and
      // a bare `.has()` would have turned that into a startup TypeError.
      const allUsers = await this.provider.getAllUsers();
      if (allUsers instanceof Map && !allUsers.has('admin')) {
        if (allUsers.size > 0) {
          logger.warn(
            `👤 No 'admin' account found among ${allUsers.size} existing user(s) — recreating it. ` +
            'Change its password immediately; see scripts/reset-admin-password.ts if you need to set it directly.'
          );
        }
        await this.createDefaultAdmin();
      }
      await this.giveIdentityRecordsToAccountsWithout();
      await this.grantAccountRolesToExistingAccounts();
    }

    const userCount = this.provider ? (await this.provider.getAllUsers()).size : 0;
    logger.info(`👤 UserManager initialized with ${userCount} users`);
    await this.reportDuplicateEmails();
  }

  /** An email as accounts are compared on it (#1748): trimmed, any case. No provider rules (Gmail dots, plus addressing, aliases). */
  private static emailKey(email: unknown): string {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  }

  /** The accounts holding this email, by username. Empty for no email. */
  private async accountsWithEmail(email: unknown): Promise<string[]> {
    const key = UserManager.emailKey(email);
    if (!key || !this.provider) return [];
    const all = await this.provider.getAllUsers();
    return Array.from(all.values())
      .filter((u): u is User => u != null && UserManager.emailKey(u.email) === key)
      .map((u) => u.username);
  }

  /**
   * One email, one account (#1748): refuse to save an email another account
   * already has. Not a setting. Thrown as `email-taken`, so registration shows
   * its safe message and other routes their own.
   */
  private async assertEmailFree(email: unknown, ownUsername: string | null): Promise<void> {
    const holders = (await this.accountsWithEmail(email)).filter((u) => u !== ownUsername);
    if (holders.length > 0) {
      throw new UserCreateError('email-taken', `Email address is already used by another account (${holders.join(', ')})`);
    }
  }

  /**
   * Accounts that share an email, saved before #1748 refused it. They are not
   * changed — an admin decides — but they are never silent: the manager is
   * degraded (dashboard, `manager-state-change` audit), the log says which,
   * and admins get a notification. Until resolved, a lookup by that email
   * refuses (see `getUserByEmail`).
   */
  private async reportDuplicateEmails(): Promise<void> {
    if (!this.provider) return;
    const byEmail = new Map<string, string[]>();
    for (const u of (await this.provider.getAllUsers()).values()) {
      const key = UserManager.emailKey(u?.email);
      if (!key) continue;
      byEmail.set(key, [...(byEmail.get(key) ?? []), u.username]);
    }
    const shared = [...byEmail.entries()].filter(([, names]) => names.length > 1);
    if (shared.length === 0) return;
    const detail = shared.map(([email, names]) => `${email}: ${names.join(', ')}`).join('; ');
    const reason = `${shared.length} email address(es) are shared by more than one account — give each account its own (Admin → Users). Sign-in by email refuses them until then (#1748)`;
    // #1916: the log names each address's domain only; the notice names the address.
    const logDetail = shared.map(([email, names]) => `an address at ${emailDomain(email)}: ${names.join(', ')}`).join('; ');
    logger.error(`👤 ${reason}. ${logDetail}`);
    if (this.markNeedsAttention(reason)) {
      try {
        await this.engine.getManager<{ addNotification(n: object): Promise<string> }>('NotificationManager')?.addNotification({
          type: 'system', level: 'error', title: 'Accounts share an email address', message: `${reason}. ${detail}`
        });
      } catch (err) {
        logger.warn('👤 Could not post the shared-email notification:', err);
      }
    }
  }

  /**
   * Normalize provider name from configuration (lowercase) to class name (PascalCase)
   * @param {string} providerName - Provider name from configuration (e.g., 'fileuserprovider')
   * @returns {string} Normalized class name (e.g., 'FileUserProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      fileuserprovider: 'FileUserProvider',
      jsonuserprovider: 'FileUserProvider', // Alias
      databaseuserprovider: 'DatabaseUserProvider',
      ldapuserprovider: 'LDAPUserProvider'
    };

    if (knownProviders[lower]) {
      return knownProviders[lower];
    }

    // Fallback: Split on common separators and capitalize each word
    const words = lower.split(/[-_]/);
    const pascalCase = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

    return pascalCase;
  }

  /**
   * Get the current user provider instance
   * @returns {UserProvider | null} The active provider
   */
  getCurrentUserProvider(): UserProvider | null {
    return this.provider;
  }

  /**
   * Get provider information
   * @private
   */
  private getProviderInfo(): ProviderInfo {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    if (this.provider.getProviderInfo) {
      return this.provider.getProviderInfo();
    }
    return {
      name: 'UnknownProvider',
      version: '1.0.0'
    };
  }

  /**
   * Hash a password for storage (#1042).
   *
   * scrypt with a per-user random salt. Was one round of SHA-256 with a single
   * instance-wide salt, which is fast to crack offline and made two users with
   * the same password produce identical hashes.
   *
   * @param {string} password - Plain text password
   * @returns {string} Self-describing hash: `scrypt$N$r$p$salt$hash`
   */
  hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  /**
   * Verify a password against a stored hash, in either scheme (#1042).
   *
   * Pre-#1042 hashes keep verifying against the instance-wide salt — the
   * plaintext is not recoverable, so they cannot be converted in bulk. They are
   * upgraded individually by `PasswordAuthProvider` on the next successful check (#1758).
   *
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash, either scheme
   * @returns {boolean} True if password matches
   */
  verifyPassword(password: string, hash: string): Promise<boolean> {
    // The legacy salt keeps its historic value on purpose. Renaming it to
    // `ngdp-salt` was floated as free once hashing moved to scrypt — it is not,
    // and cannot be while ANY legacy hash remains: those digests were computed
    // with this exact string, so changing it locks those accounts out with no
    // way back. It becomes safe to delete, not rename, once a store holds no
    // legacy hashes (#1042).
    return verifyPassword(password, hash, this.passwordSalt || 'amdwiki-salt');
  }

  /** The value shipped in config; also the fallback when config is unreadable. */
  private static readonly DEFAULT_BOOTSTRAP_PASSWORD = 'admin123';

  /**
   * Read the bootstrap password for the `admin` account.
   *
   * `ngdpbase.user.security.defaultpassword` ships as `admin123`, so a fresh
   * install comes up unattended and the setup wizard is reachable. An operator
   * who prefers it out of the repository can point the key at an env-ref —
   * `"$NGDPBASE_ADMIN_PASSWORD"` — and a bare ref is strict, so an unset
   * variable stops the boot rather than silently falling back to the default.
   *
   * The literal fallback below covers only a missing or blank config value,
   * which is what an embedder or a partially-mocked test sees. It deliberately
   * matches the shipped default: a caller with no configuration should get the
   * documented account, not an exception.
   */
  private getBootstrapPassword(): string {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const value = configManager?.getProperty('ngdpbase.user.security.defaultpassword');
    if (typeof value !== 'string' || value === '') {
      return UserManager.DEFAULT_BOOTSTRAP_PASSWORD;
    }
    return value;
  }

  /**
   * Same, but null instead of throwing. For callers that merely want to WARN
   * about the bootstrap password still being in force — an install with no
   * such variable set is the normal case there, not an error.
   */
  private tryGetBootstrapPassword(): string | null {
    try {
      return this.getBootstrapPassword();
    } catch {
      return null;
    }
  }

  /**
   * Check whether the admin account still has the configured bootstrap
   * password. False when none is configured — there is then no shipped,
   * well-known credential to warn about.
   *
   * @returns {Promise<boolean>} True if admin still has the bootstrap password
   */
  async isAdminUsingDefaultPassword(): Promise<boolean> {
    try {
      if (!this.provider) {
        return false;
      }
      const adminUser = await this.provider.getUser('admin');
      if (!adminUser) {
        return false;
      }
      const defaultPassword = this.tryGetBootstrapPassword();
      if (defaultPassword === null) {
        return false;
      }
      return await this.verifyPassword(defaultPassword, adminUser.password);
    } catch (error) {
      logger.error('Error checking admin default password:', error);
      return false;
    }
  }

  /**
   * The roles an account is made with: those its sign-up path or the admin
   * chose, plus `ngdpbase.user.account-roles`, the roles every account gets
   * (#1539 — `vault-owner`, without which a person's own vaults refuse them).
   */
  private withAccountRoles(chosen: readonly string[]): string[] {
    return [...new Set([...chosen, ...this.accountRoles()])];
  }

  /** `ngdpbase.user.account-roles`: the roles every account holds (#1539). */
  private accountRoles(): string[] {
    const configured = this.engine.getManager<ConfigurationManager>('ConfigurationManager')?.getProperty('ngdpbase.user.account-roles', []);
    return enabledEntries(configured);
  }

  /**
   * Every account has exactly one identity record, made by `createUser`
   * (#2037). One that has none (written straight into the user store, or
   * whose record was lost) gets it at boot, once, through IdentityManager's
   * door under the system context, each creation recorded as
   * `identity-manage`. The identity records are listed once and only the
   * missing ones are made, so a large user store costs one read. A failure
   * is logged and the boot goes on: the role paths make the record when the
   * account is next used (`getByUserIdentifier`).
   */
  private async giveIdentityRecordsToAccountsWithout(): Promise<void> {
    const identityManager = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!this.provider || !identityManager?.getProvider?.()) return;
    const all = await this.provider.getAllUsers();
    if (!(all instanceof Map) || all.size === 0) return;
    const ctx = systemContext(this.engine, 'give every account that has none its identity record (#2037)');
    let have: Set<unknown>;
    try {
      have = new Set((await identityManager.list(ctx)).map((p) => p.identifier));
    } catch (error) {
      logger.error(`❌ Could not list identity records to find accounts without one: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const missing = [...all.keys()].filter((username) => !have.has(username));
    if (missing.length === 0) return;
    let made = 0;
    for (const username of missing) {
      try {
        if (await identityManager.getByUserIdentifier(ctx, username)) made++;
      } catch (error) {
        logger.error(`❌ Could not make the identity record of account ${username}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    logger.info(`👤 Gave ${made} of ${missing.length} account(s) without an identity record their record (#2037)`);
  }

  /**
   * Accounts made before a role joined `ngdpbase.user.account-roles` get it
   * once, at boot (#1539) — RoleManager decides "once" and records each grant.
   */
  private async grantAccountRolesToExistingAccounts(): Promise<void> {
    const roles = this.accountRoles();
    if (!this.provider || roles.length === 0) return;
    // The provider contract is Map<string, User>; a store of any other shape
    // is not one to act on (the same guard as the bootstrap check above).
    const all = await this.provider.getAllUsers();
    if (!(all instanceof Map)) return;
    const usernames = [...all.keys()];
    const ctx = systemContext(this.engine, `give ${roles.join(', ')} to accounts made before it was given to every account`);
    for (const role of roles) {
      await this.roleManager().grantToEveryAccountOnce(role, usernames, ctx);
    }
  }

  /**
   * Create the bootstrap admin account.
   *
   * Called only when the user store is empty. The password is
   * `ngdpbase.user.security.defaultpassword`, which ships as `admin123` so a
   * first run needs no setup; a headless install refuses that well-known value
   * (#1087), and startup warns while the admin still uses it. Low first-run
   * friction is a decision: warn, never force (crypto/auth review, 2026-10-05).
   */
  async createDefaultAdmin(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const defaultPassword = this.getBootstrapPassword();

    // #1087: a headless install must not create this account on the password
    // shipped in the repository. Only reachable on the boot that finds an empty
    // user store, so an existing deployment is unaffected by a restart.
    assertHeadlessBootstrapPassword(defaultPassword, process.env.HEADLESS_INSTALL === 'true');

    const adminUser: User = {
      username: 'admin',
      email: 'admin@localhost',
      displayName: 'Administrator',
      password: await this.hashPassword(defaultPassword),
      isActive: true,
      isSystem: true,
      isExternal: false, // Local account
      createdAt: new Date().toISOString(),
      lastLogin: undefined,
      loginCount: 0,
      preferences: {}
    };

    const bootstrapCtx = systemContext(this.engine, 'create the bootstrap admin account at first boot');
    // #1197: the bootstrap ACTS — an account now exists. Recorded under the
    // system principal, origin boot; deferred until the audit sink is up.
    const recordBootstrap = (result: 'success' | 'failure', reason?: string): Promise<void> => recordSystemAction(this.engine, bootstrapCtx, {
      eventType: AUDIT_EVENT.USER_CREATE,
      action: 'create',
      resource: adminUser.username,
      resourceType: 'user',
      result,
      severity: 'high',
      metadata: { bootstrap: true, ...(reason ? { reason } : {}) }
    });

    await this.writeAccounts(this.provider.createUser(adminUser));
    await this.syncPersonOnCreate(adminUser, bootstrapCtx);
    // #2015: the admin is created with its roles or not at all. A failure
    // takes the account back and stops this boot; the user store is empty
    // again, so the next boot tries again.
    try {
      await this.roleManager().applyRoleDiff(adminUser.username, [], this.withAccountRoles(['admin']));
    } catch (error) {
      await this.undoAccountCreate(adminUser.username, bootstrapCtx);
      await recordBootstrap('failure', error instanceof Error ? error.message : String(error));
      throw error;
    }
    void recordBootstrap('success');

    // Never log the value. `2b48d838` removed the equivalent echo from the
    // startup banner but left this one, which writes the live credential into
    // the structured log — and /admin/logs is readable by anyone holding
    // `admin-read`, which is exactly what the read-only demo role grants
    // (#1029). The operator already knows the password: they set it.
    logger.info('👤 Created bootstrap admin user (username: admin)');
  }

  /**
   * The stored password hash of an active local account, or null (#1758).
   * The password check is `PasswordAuthProvider`'s, through AuthManager — the
   * one door for every check of a secret; this manager keeps the hash on the
   * account and hands it only to that check. `getUser()` still strips it.
   */
  async storedPasswordHash(username: string): Promise<string | null> {
    if (!this.provider) throw new Error('Provider not initialized');
    const user = await this.provider.getUser(username);
    if (!user || !user.isActive || typeof user.password !== 'string' || user.password === '') return null;
    return user.password;
  }

  /**
   * Replace a stored hash with one at the current cost, after a successful
   * check (#1042): the only moment it can be done, since the old digest can't
   * be converted. Called by `PasswordAuthProvider` (#1758).
   */
  async upgradePasswordHash(username: string, newHash: string, legacy: boolean): Promise<void> {
    if (!this.provider) throw new Error('Provider not initialized');
    if (!(await this.patchAccount(username, (user) => { user.password = newHash; }))) return;
    logger.info(`🔐 Upgraded stored password hash for "${username}" (${legacy ? 'legacy SHA-256 → scrypt' : 'scrypt parameters raised'}) (#1042)`);
  }

  /** Count a completed sign-in on the account: last sign-in and sign-in count (#1758; AuthManager calls it for a sign-in, never a re-check). */
  async recordSignIn(username: string): Promise<void> {
    if (!this.provider) throw new Error('Provider not initialized');
    await this.patchAccount(username, (user) => {
      user.lastLogin = new Date().toISOString();
      user.loginCount = (user.loginCount || 0) + 1;
    });
  }

  /** Run `task` inside the account's key: one read-merge-write at a time per account (#2025). Not re-entrant. */
  private inAccountKey<T>(username: string, task: () => Promise<T>): Promise<T> {
    return this.accountWrites.run(normalizeUsername(username), task);
  }

  /**
   * Read an account, change it and write it back, inside its key (#2025): for
   * core's own bookkeeping (sign-in counters, the hash upgrade, the profile
   * page), which is not an edit and is not recorded. False when there is no
   * such account.
   */
  private patchAccount(username: string, change: (user: User) => void): Promise<boolean> {
    const provider = this.provider;
    if (!provider) throw new Error('Provider not initialized');
    return this.inAccountKey(username, async () => {
      const user = await provider.getUser(username);
      if (!user) return false;
      change(user);
      await this.writeAccounts(provider.updateUser(username, user));
      return true;
    });
  }


  /**
   * Check if a display name conflicts with existing page names or other users
   * @param {string} displayName - Display name to check
   * @param {string | null} excludeUsername - Username to exclude from the check (for updates)
   * @returns {Promise<boolean>} True if conflict exists
   */
  async checkDisplayNamePageConflict(displayName: string, excludeUsername: string | null = null): Promise<boolean> {
    try {
      if (!this.provider) {
        return false;
      }

      // Check if display name is already used by another user
      const allUsers = await this.provider.getAllUsers();
      for (const [username, user] of allUsers) {
        if (username !== excludeUsername && user.displayName === displayName) {
          return true; // Display name already in use by another user
        }
      }

      const pageManager = this.engine.getManager<PageManager>('PageManager');
      if (!pageManager) {
        return false; // If no page manager, no conflict possible
      }

      // Check if page exists with this name (as title, slug, or exact match)
      return pageManager.pageExists(displayName, ANONYMOUS_SUBJECT);
    } catch (error) {
      logger.error('Error checking display name page conflict:', error);
      return false; // On error, assume no conflict to avoid blocking registration
    }
  }

  /**
   * Create a user page for a new user.
   *
   * The page is written AS the new user (#1462): it is their page, and the
   * door takes a new page's author from who is acting. Written as the admin
   * who created the account — or as whoever ran self-registration — the
   * profile would be authored by them, and `author-lock` would leave the
   * account's own owner unable to edit it.
   *
   * @param {User} user - User object
   * @param ctx - Who created the account, for the log line only
   * @returns {Promise<boolean>} True if user page was created successfully
   */
  async createUserPage(user: User, ctx: ActorContext): Promise<boolean> {
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      if (!pageManager) {
        logger.warn('PageManager not available, cannot create user page');
        return false;
      }

      const templateManager = this.engine.getManager<TemplateManager>('TemplateManager');
      if (!templateManager) {
        logger.warn('TemplateManager not available, cannot create user page');
        return false;
      }

      // Check if user page already exists
      if (pageManager.pageExists(user.displayName, ANONYMOUS_SUBJECT)) {
        logger.info(`User page already exists for ${user.displayName}`);
        return true;
      }

      const profileTitle = `Profile: ${user.displayName}`;

      // Apply user page template with user data
      const populatedContent = templateManager.applyTemplate('user-page', {
        pageName: profileTitle,
        displayName: user.displayName,
        username: user.username,
        createdDate: new Date(user.createdAt).toLocaleDateString(),
        userKeywords: ['user-page', user.displayName.toLowerCase().replace(/\s+/g, '-')]
      });

      // Generate metadata for the user page
      const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
      if (!validationManager) {
        logger.warn('ValidationManager not available, cannot create user page');
        return false;
      }

      const metadata = validationManager.generateValidMetadata(profileTitle, {
        'user-keywords': ['user-page', user.displayName.toLowerCase().replace(/\s+/g, '-')],
        'system-category': 'user-profile',
        created: user.createdAt,
        author: user.username,
        'author-lock': true,
        description: `${user.displayName}'s profile page`,
        badge: `Profile ${user.displayName}`
      });
      // #2008: a test account's profile is a test artifact — found by the
      // end-of-run sweep, and deleted with the account.
      if (user.isTest === true) {
        const current = Array.isArray(metadata['system-keywords']) ? metadata['system-keywords'] as string[] : [];
        metadata['system-keywords'] = [...current, 'test-artifact'];
      }

      // The new account's own subject — never a rebuilt or ambient one (#1399).
      const owner = await this.policyInformationPoint().subjectFor(user.username);
      if (!owner) {
        logger.warn(`Cannot create a user page for ${user.username}: the account is not active`);
        return false;
      }

      // Save the user page, as its owner
      await pageManager.savePage(profileTitle, populatedContent, metadata, owner, { skipValidation: true });
      logger.info(`✅ Created user page for ${user.displayName} by ${actorOf(ctx).user}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error creating user page for ${user.displayName}:`, error);
      return false;
    }
  }

  /**
   * Who holds which role is RoleManager's (#1431 step 12). An account write
   * that changes roles asks it; it is registered before UserManager, so its
   * absence is a broken engine, not a degraded one.
   */
  private roleManager(): RoleManager {
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    if (!roleManager) {
      throw new Error('UserManager requires RoleManager');
    }
    return roleManager;
  }

  /** The subject's attributes are the PIP's (#1431 step 13); an account write asks it about names. */
  private policyInformationPoint(): PolicyInformationPoint {
    const pip = this.engine.getManager<PolicyInformationPoint>('PolicyInformationPoint');
    if (!pip) {
      throw new Error('UserManager requires PolicyInformationPoint');
    }
    return pip;
  }

  private auditSink(): AuditEventSink | null {
    return this.engine.getManager('AuditManager') as AuditEventSink | null;
  }


  /**
   * Every account write goes through here (#1751): it writes, then bumps the
   * account-data version, so cached renders that show names or decide by
   * roles re-render.
   */
  private async writeAccounts<T>(write: Promise<T>): Promise<T> {
    const result = await write;
    await this.engine.getManager<{ bump(topic: string): Promise<string> }>('CacheManager')?.bump(USER_DATA_TOPIC);
    return result;
  }

  /**
   * Create new user
   * @param {UserCreateInput} userData - User data
   * @returns {Promise<Omit<User, 'password'>>} Created user (without password)
   */
  async createUser(userData: UserCreateInput, ctx: ActorContext): Promise<Omit<User, 'password'>> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const { username, email, displayName, password, roles: chosenRoles = ['reader'], isExternal = false, isActive = true, acceptLanguage, profileLocked = false, isTest = false } = userData;
    const roles = this.withAccountRoles(chosenRoles);

    if (this.policyInformationPoint().isSystemPrincipal(username)) {
      // #631: the system principal is an identity named in .env, not an
      // account. Letting a person register under that name would hand them
      // its roles the first time a job resolved the name. Same reason code as
      // a taken username so the registration form cannot tell the two apart.
      throw new UserCreateError('username-taken', `Username is reserved for the system principal: "${username}"`);
    }

    if (isReservedUsername(username)) {
      // #1436: `anonymous` is the principal for "nobody authenticated", not an
      // account — nothing is seeded under that name and nothing should be. An
      // account holding it would collide with the principal wherever the name
      // is compared, and `getAnonymousUser()` emits exactly that name on every
      // unauthenticated request. `asserted` is reserved for the same reason
      // one step earlier: the subject was removed (#1435), so the name must not
      // become claimable in the meantime.
      //
      // Same reason code as a taken username, so the registration form cannot
      // tell a reserved name from an existing one (#1086).
      throw new UserCreateError('username-taken', `Username is reserved: "${username}"`);
    }

    if (await this.provider.userExists(username)) {
      // #1086: this used to append `getAllUsernames()` to the message, and
      // processRegister forwarded the text straight to an unauthenticated
      // visitor — so guessing one existing username returned the whole roster.
      // The reason is what callers branch on; the message is for logs only.
      throw new UserCreateError('username-taken', `Username already exists: "${username}"`);
    }

    await this.assertEmailFree(email, null);

    const finalDisplayName = displayName || username;
    const hasPageConflict = await this.checkDisplayNamePageConflict(finalDisplayName);
    if (hasPageConflict) {
      // #1086: the cause names a page, so this message tells its reader whether
      // a given page exists — including a private one. Safe for a log and for
      // an admin; not for the unauthenticated registration form, which now maps
      // the reason to a message that does not say why.
      throw new UserCreateError(
        'display-name-conflict',
        `Display name "${finalDisplayName}" conflicts with an existing page`
      );
    }

    const hashedPassword = isExternal ? '' : await this.hashPassword(password);

    const userLocale = LocaleUtils.parseAcceptLanguage(acceptLanguage || 'en-US');
    const defaultDateFormat = LocaleUtils.getDateFormatFromLocale(userLocale);
    const defaultTimeFormat = LocaleUtils.getTimeFormatFromLocale(userLocale);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defaultTimezone = configManager ? (configManager.getProperty('ngdpbase.default.timezone', 'UTC') as string) : 'UTC';

    const user: User = {
      username,
      email,
      displayName: displayName || username,
      password: hashedPassword,
      isActive: isActive,
      isSystem: false,
      isExternal: isExternal,
      isTest: isTest === true,
      profileLocked: profileLocked || undefined,
      createdAt: new Date().toISOString(),
      lastLogin: undefined,
      loginCount: 0,
      preferences: {
        locale: userLocale,
        dateFormat: defaultDateFormat,
        timeFormat: defaultTimeFormat,
        timezone: defaultTimezone
      }
    };

    await this.writeAccounts(this.provider.createUser(user));

    await this.syncPersonOnCreate(user, ctx);
    // #2015: an account is created with its roles or not at all. When a role
    // cannot be given, the account and its Person are removed again, so a
    // retry finds the username and email free, and the creation is recorded
    // as failed.
    try {
      await this.roleManager().applyRoleDiff(username, [], roles);
    } catch (error) {
      await this.undoAccountCreate(username, ctx);
      const who = actorOf(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_CREATE,
        ...who,
        action: 'user-create',
        result: 'failure',
        severity: 'medium',
        resource: username,
        resourceType: 'user',
        metadata: { username, roles: [...roles], isExternal, isTest: user.isTest, selfRegistration: ctx.username === username, reason: error instanceof Error ? error.message : String(error), ...who.metadata }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-create of ${username}:`, err));
      throw error;
    }
    await this.offerContactLink(username, ctx);

    logger.info(`👤 Created user: ${username} (${isExternal ? 'External' : 'Local'})`);

    // #1204: recorded at the door, so an admin form, self-registration and an
    // identity provider's auto-provisioning all leave the same record.
    {
      const who = actorOf(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_CREATE,
        ...who,
        action: 'user-create',
        result: 'success',
        severity: 'medium',
        resource: username,
        resourceType: 'user',
        metadata: { username, roles: [...roles], isExternal, isTest: user.isTest, selfRegistration: ctx.username === username, ...who.metadata }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-create of ${username}:`, err));
    }

    try {
      const pageCreated = await this.createUserPage(user, ctx);
      if (pageCreated) {
        user.profilePage = user.displayName;
        // #2025: read again inside the key, so a change made since the create is kept.
        await this.patchAccount(username, (stored) => { stored.profilePage = user.displayName; });
      }
    } catch (error) {
      logger.warn(`⚠️  Failed to create user page for ${username}:`, error instanceof Error ? error.message : String(error));
    }

    return publicRecord(user);
  }

  /**
   * Take back an account whose roles could not be given (#2015): its Person,
   * then the account. A failure here is an error in the log; the role failure
   * that caused it is what the caller is told.
   */
  private async undoAccountCreate(username: string, ctx: ActorContext): Promise<void> {
    await this.syncPersonOnDelete(username, ctx);
    try {
      await this.writeAccounts(this.provider!.deleteUser(username));
      logger.error(`❌ Account ${username} was not created: its roles could not be given (#2015)`);
    } catch (error) {
      logger.error(`❌ Account ${username} could not be taken back after its roles failed; delete it by hand (#2015): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update user
   */
  /**
   * A forgotten password, reset with the 12 recovery words (#1452).
   *
   * The words are the account owner's own escrow: they unwrap the key the
   * password used to, so proving them is proving you are the person the key
   * was made for. The password wrap is replaced first — the recovery wrap and
   * the key are unchanged, so every encrypted store still opens — and then the
   * sign-in password is set, through `updateUser`, so the two stay one
   * password and the change is recorded like any other.
   *
   * `false`, changing nothing, for any reason it cannot be done: no such
   * account, an inactive or external one, no keys, or words that do not open
   * them. The caller cannot tell which, so the door cannot be used to learn
   * which accounts exist.
   */
  async resetPasswordWithRecoveryWords(username: string, words: string, newPassword: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider || !username || !words || !newPassword) return false;
    const provider = this.provider;
    // #2025: the read, the key rewrap and the password write are one change to the account.
    const edit = await this.inAccountKey(username, async () => {
      const user = await provider.getUser(username);
      if (!user || user.isExternal || user.isActive === false) return null;

      const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
      if (!pagesDirectory) return null;
      if (!(await resetPasswordWrapWithMnemonic({ pagesDirectory, username, words, newPassword }))) return null;

      return this.editAccount(username, { password: newPassword }, ctx);
    });
    if (!edit) return false;
    await this.finishEdit(username, edit, ctx);
    logger.info(`🔑 Password reset with recovery words for ${username}`);
    return true;
  }

  /**
   * Change an account (#2025: one change at a time per account).
   *
   * `updates` is the fields to merge, or a function that works them out from
   * the account as it is now: `(current) => updates`. The function runs inside
   * the account's `KeyedSerial` key, between the read and the write, so two
   * changes to one account never read the same old record. It gets a copy of
   * the account without the password hash, and returns the fields to merge, or
   * `undefined` to change nothing (nothing is written or recorded). It must not
   * call `updateUser` for the same account: the key is not re-entrant.
   * Either form is checked, applied and recorded the same way.
   *
   * Returns the account as written (as read, when nothing changed), without
   * the password hash: the hash never leaves UserManager except to the
   * password check (`storedPasswordHash`).
   */
  async updateUser(username: string, updates: UserUpdateInput | UserUpdateFn, ctx: ActorContext): Promise<Omit<User, 'password'>> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const edit = await this.inAccountKey(username, () => this.editAccount(username, updates, ctx));
    return this.finishEdit(username, edit, ctx);
  }

  /**
   * The steps of an account change that come after the write, outside the
   * account's key: they reach other managers, which may change the account
   * themselves.
   */
  private async finishEdit(username: string, edit: AccountEdit, ctx: ActorContext): Promise<Omit<User, 'password'>> {
    if (!edit.updates) return publicRecord(edit.user);
    // #1765: turning an account off goes through the one deactivation step.
    if (edit.disabling) await this.closeAccess(username, 'disable', ctx);

    await this.syncPersonOnUpdate(username, edit.updates, ctx);

    logger.info(`👤 Updated user: ${username}`);
    await edit.recordEdit('success');
    return publicRecord(edit.user);
  }

  /** Read, check and write one account change. Runs inside the account's key (#2025). */
  private async editAccount(username: string, change: UserUpdateInput | UserUpdateFn, ctx: ActorContext): Promise<AccountEdit> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }
    const updates = typeof change === 'function' ? await change(structuredClone(publicRecord(user))) : change;
    if (updates === undefined) {
      return { user, updates: null, disabling: false, recordEdit: () => Promise.resolve() };
    }

    const currentPasswordPlain =
      typeof updates.currentPassword === 'string' ? updates.currentPassword : undefined;
    delete updates.currentPassword;

    // Everything that can refuse the edit is checked before anything is written.
    if (updates.password) {
      // Use the incoming isExternal value if being changed in the same request
      const willBeExternal = updates.isExternal !== undefined ? updates.isExternal : user.isExternal;
      if (willBeExternal) {
        throw new Error('Cannot set a password for an external OAuth user. Change the account type to Local first.');
      }
    }
    // #1748: one email, one account — a change to another account's email is refused.
    if (updates.email !== undefined && UserManager.emailKey(updates.email) !== UserManager.emailKey(user.email)) {
      await this.assertEmailFree(updates.email, username);
    }

    // #617 iteration 3b: the `roles` field on User is deprecated; role
    // membership is owned by RoleManager. Strip it from the update before
    // it lands on the User record, diff against the current RoleManager
    // state, and apply the changes through the canonical write path.
    // The password is not copied: setPassword() is the one definition of a
    // change (#1592) — hash, end every other session (#1482; the session that
    // made the change is re-stamped by its route), and record when.
    const { roles: incomingRoles, password: _password, ...userFieldUpdates } = updates;
    // #1805: the value, not only the field name — recorded only when it changes.
    const wasTest = user.isTest === true;
    const testChange = updates.isTest !== undefined && (updates.isTest === true) !== wasTest
      ? { from: wasTest, to: updates.isTest === true } : undefined;
    const oldRoles = incomingRoles ? await this.roleManager().resolveUserRoles(this.lifecycleContext(`read the current roles of account ${username}`, ctx), username) : [];
    const disabling = user.isActive !== false && updates.isActive === false;
    // #1204: only a change that alters what the account may do or who holds
    // it is recorded. Preferences, last-login and login-count updates arrive
    // through the same method on every sign-in and every theme toggle; a
    // record for each would bury the ones that matter. Field NAMES only —
    // never a password or an email value.
    const changed = SENSITIVE_USER_FIELDS.filter((f) => f in updates && (updates as Record<string, unknown>)[f] !== undefined);
    const recordEdit = async (result: 'success' | 'failure', reason?: string): Promise<void> => {
      if (changed.length === 0) return;
      const who = actorOf(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_EDIT,
        ...who,
        action: 'user-edit',
        result,
        severity: changed.includes('roles') || changed.includes('isActive') ? 'high' : 'medium',
        resource: username,
        resourceType: 'user',
        metadata: {
          username,
          fields: changed,
          ...(incomingRoles ? { roles: { from: oldRoles, to: [...incomingRoles] } } : {}),
          ...(testChange ? { isTest: testChange } : {}),
          selfEdit: ctx.username === username,
          ...(reason ? { reason } : {}),
          ...who.metadata
        }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-edit of ${username}:`, err));
    };

    // #2015: the role change goes first, all or nothing. When it cannot be
    // made, nothing of this edit is written and the edit is recorded as failed.
    if (incomingRoles) {
      try {
        await this.roleManager().applyRoleDiff(username, oldRoles, incomingRoles);
      } catch (error) {
        await recordEdit('failure', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    try {
      if (updates.password && currentPasswordPlain) {
        const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
        const pagesDirectory = configManager?.getResolvedDataPath?.(
          'ngdpbase.page.provider.filesystem.storagedir',
          './data/pages'
        );
        if (pagesDirectory) {
          await rewrapUserKeysOnPasswordChange({
            pagesDirectory,
            username,
            oldPassword: currentPasswordPlain,
            newPassword: updates.password
          });
        }
      }
      Object.assign(user, userFieldUpdates);
      if (updates.password) await setPassword(user, updates.password);
      await this.writeAccounts(this.provider.updateUser(username, user));
    } catch (error) {
      // #2015: the account was not saved, so its roles go back as they were.
      // A failure to put them back is reported by RoleManager; the caller hears the original error.
      if (incomingRoles) await this.roleManager().applyRoleDiff(username, incomingRoles, oldRoles).catch(() => undefined);
      throw error;
    }
    return { user, updates, disabling, recordEdit };
  }

  /**
   * Delete user
   */
  async deleteUser(username: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.isSystem) {
      throw new Error('Cannot delete system user');
    }

    const who = actorOf(ctx);
    const roles = await this.roleManager().resolveUserRoles(this.lifecycleContext(`read the roles of account ${username} for the delete record`, ctx), username);
    const recordDelete = (result: 'success' | 'failure', reason?: string): Promise<unknown> => recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.USER_DELETE,
      ...who,
      action: 'user-delete',
      result,
      severity: 'high',
      resource: username,
      resourceType: 'user',
      metadata: { username, roles, isExternal: user.isExternal === true, ...(reason ? { reason } : {}), ...who.metadata }
    }, (err) => logger.warn(`[UserManager] Audit record failed for user-delete of ${username}:`, err));

    // #2015: the account's role memberships go first, all or nothing — while
    // the Person record still exists. When they cannot all be removed the
    // delete does not happen, and is recorded as failed.
    let giveRolesBack: () => Promise<void>;
    try {
      giveRolesBack = await this.roleManager().removeAllMemberships(username);
    } catch (error) {
      await recordDelete('failure', error instanceof Error ? error.message : String(error));
      throw error;
    }

    try {
      // #1204: user-delete is CRITICAL — destruction of an identity and its
      // attribution — so the record is written and flushed BEFORE the delete,
      // and a failure refuses it (the token-mint / share-create ordering).
      await recordDelete('success');
      await this.writeAccounts(this.provider.deleteUser(username));
    } catch (error) {
      // A failure to give them back is reported by RoleManager; the caller hears the original error.
      await giveRolesBack().catch(() => undefined);
      throw error;
    }
    // #1765: the one deactivation step — sessions, tokens, app grants, shares, credentials.
    await this.closeAccess(username, 'delete', ctx);
    await this.syncPersonOnDelete(username, ctx);

    // #2008: a test account's profile page goes with it; an ordinary
    // account's is kept (operator, 2026-10-23). Only pages stamped
    // test-artifact are reached. A failure is logged: the account is gone.
    if (user.isTest === true) {
      await this.engine.getManager<PageManager>('PageManager')
        ?.deleteTestArtifacts(ctx, { author: username, systemCategory: 'user-profile' })
        .catch((err: unknown) => logger.error(`[UserManager] The profile page of test account ${username} was not deleted:`, err));
    }

    logger.info(`👤 Deleted user: ${username}`);
    return true;
  }

  /** Hand the account to AuthManager's one deactivation step (#1765); a failure there is logged, never thrown. */
  private async closeAccess(username: string, mode: 'disable' | 'delete', ctx: ActorContext): Promise<void> {
    await this.engine.getManager<{ closeAccess(u: string, m: 'disable' | 'delete', c: ActorContext): Promise<void> }>('AuthManager')
      ?.closeAccess(username, mode, ctx).catch((err: unknown) => logger.error(`[UserManager] closeAccess(${username}, ${mode}) failed:`, err));
  }

  async getUsers(): Promise<Omit<User, 'password'>[]> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const allUsers = await this.provider.getAllUsers();
    return Array.from(allUsers.values())
      .filter((user): user is User => user != null)
      .map(publicRecord);
  }

  async getUser(username: string): Promise<Omit<User, 'password'> | undefined> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    if (!user) {
      return undefined;
    }
    return publicRecord(user);
  }

  /**
   * Whether the account signs in with a password of its own: a local account
   * whose record carries a hash. Asked here because this is the one door that
   * sees the hash — `getUser()` strips it, which is why AuthManager's
   * last-way-in rule, asking through `getUser()`, saw no password on any
   * account and refused to remove anyone's only passkey (#1524).
   */
  async hasPassword(username: string): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    return Boolean(user && !user.isExternal && user.password);
  }

  async getUserByEmail(email: string): Promise<Omit<User, 'password'> | undefined> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const allUsers = await this.provider.getAllUsers();
    const normalizedEmail = UserManager.emailKey(email);
    if (!normalizedEmail) return undefined;
    const matches = Array.from(allUsers.values()).filter(
      (u): u is User => u != null && UserManager.emailKey(u.email) === normalizedEmail
    );
    // #1748: an email two accounts share (saved before it was refused) finds
    // nobody, rather than whichever account came first — a magic link must
    // never sign into another person's account.
    if (matches.length > 1) {
      logger.warn(`👤 getUserByEmail: ${matches.length} accounts share this address — refusing to pick one (#1748)`);
      return undefined;
    }
    const found = matches[0];
    if (!found) return undefined;
    return publicRecord(found);
  }

  /**
   * #658: resolve the recipient address for /contact submissions.
   *
   * 1. Trimmed `recipientOverride` (from `ngdpbase.application.contact.recipient`)
   *    if non-empty — used verbatim, may be a list or alias.
   * 2. Else: first user with the `admin` role whose email is non-empty AND
   *    not the install-default sentinel `admin@localhost`. The sentinel
   *    keeps the contact feature dormant on fresh installs that haven't
   *    set a real admin email yet, instead of mailing into a black hole.
   * 3. Else: `null` — caller must render "Contact form is not configured"
   *    rather than attempting to send.
   *
   * The returned address is server-side only; never render it to clients.
   */
  async getContactRecipient(recipientOverride: string): Promise<string | null> {
    const trimmed = (recipientOverride ?? '').trim();
    if (trimmed) return trimmed;

    const all = await this.getUsers();
    const finder = systemContext(this.engine, 'find the contact form\'s recipient: the first administrator with an email address');
    for (const u of all) {
      if (!u.email || u.email === 'admin@localhost') continue;
      if (await this.roleManager().hasRole(finder, u.username, 'admin')) return u.email;
    }
    return null;
  }

  /**
   * Search users by username, displayName, or email (case-insensitive substring).
   * Optionally filter by role and active status.
   *
   * Decides `search-user` itself, with `ctx` (#2018): every user holds it as
   * shipped, anonymous does not. A refusal throws `ContactRefusedError`. Core's
   * own lookups (a notice's recipients, a role's holders) pass the system
   * context with a reason, allowed without a policy evaluation.
   */
  async searchUsers(
    query: string,
    options: { role?: string; limit?: number; activeOnly?: boolean },
    ctx: ActorContext
  ): Promise<Omit<User, 'password'>[]> {
    await requireLookupPermission(this.engine, ctx, 'search-user');
    const all = await this.getUsers();
    const q = query.trim().toLowerCase();
    const { role, limit = 50, activeOnly = true } = options;

    // #617 iteration 3b: role filter resolved via RoleManager
    // (User.roles[] is deprecated). Sync filters run first; the async
    // hasRole call only fires for candidates that already pass them.
    const results: Omit<User, 'password'>[] = [];
    // #2018: the role filter is this search's own work, so it reads membership
    // under the system context; the search itself was asked for by `ctx`.
    const roleFilter = role ? systemContext(this.engine, `filter a user search by the role ${role} (search by ${actorOf(ctx).user})`) : null;
    for (const u of all) {
      if (activeOnly && u.isActive === false) continue;
      if (q) {
        const matchesQuery = (
          u.username.toLowerCase().includes(q) ||
          (u.displayName ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
        );
        if (!matchesQuery) continue;
      }
      if (role && roleFilter && !(await this.roleManager().hasRole(roleFilter, u.username, role))) continue;
      results.push(u);
      if (limit > 0 && results.length >= limit) break;
    }
    // #1204: search-user ships switched off (read volume); recordAuditEvent
    // honours the switch. Enumerating people is disclosive, so a deployment
    // that wants it on can have it without a code change.
    {
      const who = actorOf(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.SEARCH_USER,
        ...who,
        action: 'search-user',
        result: 'success',
        severity: 'low',
        metadata: { query: q, role: role ?? null, results: results.length, ...who.metadata }
      }, (err) => logger.warn('[UserManager] Audit record failed for search-user:', err));
    }
    return results;
  }



  /**
   * The account lifecycle reaches IdentityManager's door under a system context
   * (#1930): keeping an account's person in step with the account is core's
   * own bookkeeping, not the caller's contact management, so it never depends
   * on the caller holding `identity-manage`. The reason names the account and
   * who changed it, so the record says why.
   */
  private personSyncContext(what: string, username: string, ctx: ActorContext): JobContext {
    return this.lifecycleContext(`${what} the person for account ${username}`, ctx);
  }

  /** Core's bookkeeping for an account write, the read of its roles included (#2018): the system context, saying what and who changed the account. */
  private lifecycleContext(what: string, ctx: ActorContext): JobContext {
    return systemContext(this.engine, `account lifecycle: ${what} (account changed by ${actorOf(ctx).user})`);
  }

  /**
   * Persist a Person record paired with a newly-created User. The install's
   * anchor org (when configured) is referenced via `memberOf`; without it
   * the Person is written without an org link. Failures are logged, not
   * thrown — auth must still succeed if Person storage is degraded.
   */
  private async syncPersonOnCreate(user: User, ctx: ActorContext): Promise<void> {
    const identityManager = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identityManager) return;
    try {
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      await identityManager.create(this.personSyncContext('create', user.username, ctx), {
        identifier: user.username,
        ...(user.displayName ? { name: user.displayName } : {}),
        ...(user.email ? { email: user.email } : {}),
        ...(installOrg ? { memberOf: { '@id': installOrg['@id'] } } : {})
      });
      logger.info(`📋 Created Person record for ${user.username}`);
    } catch (error) {
      logger.error(`❌ Failed to create Person record for ${user.username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * At sign-up, offer the new account a person with no account who has the
   * same email (#1930): IdentityManager mails an "Is this you?" link, and joins
   * them only when the account confirms. Skipped when email is off. Never
   * fails the account write.
   */
  private async offerContactLink(username: string, ctx: ActorContext): Promise<void> {
    try {
      await this.engine.getManager<IdentityManager>('IdentityManager')?.offerSignUpLink(ctx, username);
    } catch (error) {
      logger.warn(`👤 Could not offer ${username} a contact record: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async syncPersonOnUpdate(username: string, updates: UserUpdateInput, ctx: ActorContext): Promise<void> {
    const identityManager = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identityManager) return;
    try {
      const person = await identityManager.getByIdentifier(this.personSyncContext('update', username, ctx), username);
      if (!person) return;
      const patch: PersonUpdate = {};
      if (updates.displayName !== undefined) patch.name = updates.displayName;
      if (updates.email !== undefined) patch.email = updates.email;
      if (Object.keys(patch).length === 0) return;
      await identityManager.update(this.personSyncContext('update', username, ctx), person['@id'], patch);
    } catch (error) {
      logger.error(`❌ Failed to update Person record for ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async syncPersonOnDelete(username: string, ctx: ActorContext): Promise<void> {
    const identityManager = this.engine.getManager<IdentityManager>('IdentityManager');
    if (!identityManager) return;
    try {
      const person = await identityManager.getByIdentifier(this.personSyncContext('delete', username, ctx), username);
      if (!person) return;
      await identityManager.delete(this.personSyncContext('delete', username, ctx), person['@id']);
    } catch (error) {
      logger.error(`❌ Failed to delete Person record for ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createSession(username: string, additionalData: Record<string, unknown> = {}): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sessionData: UserSession = {
      sessionId,
      username,
      userId: username,
      createdAt: now,
      expiresAt,
      lastActivity: now,
      data: additionalData
    };
    await this.provider.createSession(sessionId, sessionData);
    return sessionId;
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    return await this.provider.getSession(sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    await this.provider.deleteSession(sessionId);
  }

  /**
   * End every signed-in session of `username` in the live session store
   * (#1937): the account was deleted or turned off (`AuthManager.closeAccess`).
   * Each goes through `endSession` (its keys dropped, `authentication-logout`
   * recorded with the reason) and is removed from the store. Returns how many.
   * The provider's own session list was cleared here before; nothing writes it,
   * and the store express-session reads was never touched.
   */
  async deleteUserSessions(username: string, reason: 'account-deleted' | 'account-disabled', from: { ipAddress?: string } = {}): Promise<number> {
    return this.endStoredSessions(session => Promise.resolve(session.username === username ? reason : null), from);
  }

  /**
   * End every signed-in session in the store that no longer belongs to its
   * account (#1937): the account is gone, turned off, another account of the
   * same name, or its password changed since (`checkSessionAccount`, the
   * per-request rule). Run once at startup, so sessions left from before the
   * fix, or from a close the store missed, do not wait for their next request.
   */
  async endStaleSessions(): Promise<number> {
    return this.endStoredSessions(async session => checkSessionAccount(session, await this.getUser(session.username)).end, {});
  }

  /** End and remove each signed-in session `which` names a reason for; none without a session store. */
  private async endStoredSessions(
    which: (session: Record<string, unknown> & { username: string }) => Promise<SessionEndReason | null>,
    from: { ipAddress?: string }
  ): Promise<number> {
    const store = this.engine.getManager<SessionStatsManager>('SessionStatsManager');
    if (!store?.hasStore()) return 0;
    let ended = 0;
    for (const { sid, session } of await store.sessions()) {
      if (typeof session.username !== 'string' || session.username === '') continue;
      const reason = await which(session as Record<string, unknown> & { username: string });
      if (!reason) continue;
      endSession(this.engine, session, reason, from);
      await store.destroy(sid);
      ended++;
    }
    return ended;
  }

  async backup(): Promise<BackupData> {
    logger.info('[UserManager] Starting backup...');
    if (!this.provider) {
      logger.warn('[UserManager] No provider available for backup');
      return {
        managerName: 'UserManager',
        timestamp: new Date().toISOString(),
        providerClass: null,
        data: null,
        note: 'No provider initialized'
      };
    }

    try {
      let providerBackup: Record<string, unknown> | null = null;
      if (this.provider.backup) {
        providerBackup = await this.provider.backup();
      }
      return {
        managerName: 'UserManager',
        timestamp: new Date().toISOString(),
        providerClass: this.providerClass,
        providerBackup: providerBackup
      };
    } catch (error) {
      logger.error('[UserManager] Backup failed:', error);
      throw error;
    }
  }

  async restore(backupData: BackupData): Promise<void> {
    logger.info('[UserManager] Starting restore...');
    if (!backupData) {
      throw new Error('UserManager: No backup data provided for restore');
    }
    if (!this.provider) {
      throw new Error('UserManager: No provider available for restore');
    }

    if (backupData.providerClass && typeof backupData.providerClass === 'string' && backupData.providerClass !== this.providerClass) {
      logger.warn(`[UserManager] Provider mismatch: backup has ${backupData.providerClass}, current is ${this.providerClass}`);
    }

    try {
      if (backupData.providerBackup && this.provider.restore) {
        await this.provider.restore(backupData.providerBackup as Record<string, unknown>);
        logger.info('[UserManager] Restore completed successfully');
      } else {
        logger.warn('[UserManager] No provider backup data found in backup or provider does not support restore');
      }
    } catch (error) {
      logger.error('[UserManager] Restore failed:', error);
      throw error;
    }
  }
}

export default UserManager;
