import BaseManager, { BackupData } from './BaseManager.js';
import type PolicyInformationPoint from '../security/PolicyInformationPoint.js';
import { recordSystemAction, systemContext } from '../context/bootActions.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { isReservedUsername } from '../utils/username.js';
import { hashPassword, verifyPassword, needsRehash, isLegacyHash } from '../utils/passwordHash.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { UserProvider, ProviderInfo } from '../types/Provider.js';
import { User, UserPreferences, UserSession } from '../types/User.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PersonManager from './PersonManager.js';
import type OrganizationManager from './OrganizationManager.js';
import type RoleManager from './RoleManager.js';
import type PageManager from './PageManager.js';
import type TemplateManager from './TemplateManager.js';
import type ValidationManager from './ValidationManager.js';
import type { Person, PersonUpdate } from '../types/Person.js';
import type { ShareGrant } from '../types/Share.js';
import { assertHeadlessBootstrapPassword } from '../utils/headlessAdminPassword.js';
import { UserCreateError } from '../utils/userCreateError.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';
import { resetPasswordWrapWithMnemonic, rewrapUserKeysOnPasswordChange } from '../utils/privateStoreUnlock.js';

// #1179: the account writes below take an `ActorContext` — the request's
// subject or a JobContext — mandatory and positional. `AuditActor`, the
// optional `{ username?, ipAddress?, provider? }` bag that preceded it,
// recorded `unknown` when omitted and let a caller pass a literal `'system'`;
// both were the shape this principle exists to end. An identity provider that
// provisions an account now says so in the JobContext's reason.

/** Account fields whose change alters what the account may do or who holds it. Preferences are not among them. */
const SENSITIVE_USER_FIELDS = ['password', 'roles', 'isActive', 'isExternal', 'email', 'profileLocked', 'username'] as const;

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
  /** The address the request came from (#1179) — provenance for the record, set where the request subject is built. */
  ipAddress?: string;
  /**
   * Opaque handle to this session's unlocked private-store keys (#1382).
   * Random — not the session id — created at password login and dropped at
   * logout; resolved live, so after logout it reaches nothing. Set only where
   * the request subject is built; never recorded (`actorOf` must not gain it).
   */
  privateStoreHandle?: string;
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
 * live resolution. `viaToken` / `viaShare` ride along exactly as on a request.
 */
export interface JobSubject {
  username: string;
  isAuthenticated: boolean;
  /** Roles are resolved live at decision time, not carried. */
  resolveRolesNow: true;
  viaToken?: AgentTokenGrant;
  viaShare?: ShareGrant;
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
}

/**
 * User update input data
 */
interface UserUpdateInput {
  email?: string;
  displayName?: string;
  password?: string;
  roles?: string[];
  isActive?: boolean;
  isExternal?: boolean;
  preferences?: Partial<UserPreferences>;
  profilePage?: string;
  [key: string]: unknown; // allow addon/extended fields
}

/**
 * External user data from OAuth/JWT
 */
interface ExternalUserData {
  username: string;
  email: string;
  displayName?: string;
  roles?: string[];
  provider: string;
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
 * const user = await userManager.authenticateUser('admin', 'password');
 * if (user) logger.info('Logged in:', user.username);
 */
class UserManager extends BaseManager {
  private provider: UserProvider | null = null;
  private providerClass?: string;
  private passwordSalt?: string;

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
    }

    const userCount = this.provider ? (await this.provider.getAllUsers()).size : 0;
    logger.info(`👤 UserManager initialized with ${userCount} users`);
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
  hashPassword(password: string): string {
    return hashPassword(password);
  }

  /**
   * Verify a password against a stored hash, in either scheme (#1042).
   *
   * Pre-#1042 hashes keep verifying against the instance-wide salt — the
   * plaintext is not recoverable, so they cannot be converted in bulk. They are
   * upgraded individually by `authenticateUser` on the next successful login.
   *
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash, either scheme
   * @returns {boolean} True if password matches
   */
  verifyPassword(password: string, hash: string): boolean {
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
      return this.verifyPassword(defaultPassword, adminUser.password);
    } catch (error) {
      logger.error('Error checking admin default password:', error);
      return false;
    }
  }

  /**
   * Create the bootstrap admin account.
   *
   * Called only when the user store is empty. Throws when no bootstrap
   * password is configured — refusing to start is the point: ngdpbase used to
   * ship `admin123`, which meant any install left unattended was reachable
   * with a credential published in this repository, and the login page
   * advertised it (#1033).
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
      password: this.hashPassword(defaultPassword),
      isActive: true,
      isSystem: true,
      isExternal: false, // Local account
      createdAt: new Date().toISOString(),
      lastLogin: undefined,
      loginCount: 0,
      preferences: {}
    };

    await this.provider.createUser(adminUser);
    // #1197: the bootstrap ACTS — an account now exists. Recorded under the
    // system principal, origin boot; deferred until the audit sink is up.
    void recordSystemAction(this.engine, systemContext(this.engine, 'create the bootstrap admin account at first boot'), {
      eventType: AUDIT_EVENT.USER_CREATE,
      action: 'create',
      resource: adminUser.username,
      resourceType: 'user',
      result: 'success',
      severity: 'high',
      metadata: { bootstrap: true }
    });

    await this.syncPersonOnCreate(adminUser);
    await this.roleManager().applyRoleDiff(adminUser.username, [], ['admin']);

    // Never log the value. `2b48d838` removed the equivalent echo from the
    // startup banner but left this one, which writes the live credential into
    // the structured log — and /admin/logs is readable by anyone holding
    // `admin-read`, which is exactly what the read-only demo role grants
    // (#1029). The operator already knows the password: they set it.
    logger.info('👤 Created bootstrap admin user (username: admin)');
  }

  /**
   * Create or update external user from OAuth/JWT token
   * @param {ExternalUserData} externalUserData - User data from external provider
   * @returns {Omit<User, 'password'>} User object
   */
  async createOrUpdateExternalUser(externalUserData: ExternalUserData): Promise<Omit<User, 'password'>> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const { username, email, displayName, roles = ['reader'], provider } = externalUserData;

    let user = await this.provider.getUser(username);
    const existedBefore = !!user;
    const oldRoles = existedBefore ? await this.roleManager().resolveUserRoles(username) : [];

    if (!user) {
      // Create new external user
      user = {
        username,
        email,
        displayName: displayName || username,
        password: '', // No password for external users
        isActive: true,
        isSystem: false,
        isExternal: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        loginCount: 1,
        preferences: {}
      };

      await this.provider.createUser(user);
      logger.info(`👤 Created external user: ${username} (${provider})`);
    } else {
      // Update existing external user
      user.email = email;
      user.displayName = displayName || user.displayName;
      user.lastLogin = new Date().toISOString();
      user.loginCount = (user.loginCount || 0) + 1;

      await this.provider.updateUser(username, user);
      logger.info(`👤 Updated external user: ${username} (${provider})`);
    }

    // #617 iteration 3b: external users now go through Person + Role sync,
    // closing the gap left in iterations 1+2. Person record is created on
    // first sight; role memberships diffed against the current state in
    // RoleManager (= [] for new users).
    if (!existedBefore) {
      await this.syncPersonOnCreate(user);
    } else {
      await this.syncPersonOnUpdate(username, { displayName: user.displayName, email: user.email });
    }
    await this.roleManager().applyRoleDiff(username, oldRoles, roles);

    // Return user without password
    const { password: _pwd, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Authenticate user with username/password
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<(Omit<User, 'password'> & { isAuthenticated: boolean }) | null>} User object if authenticated
   */
  async authenticateUser(username: string, password: string): Promise<(Omit<User, 'password'> & { isAuthenticated: boolean }) | null> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const user = await this.provider.getUser(username);
    if (!user || !user.isActive) {
      return null;
    }

    const isValid = this.verifyPassword(password, user.password);
    if (!isValid) {
      return null;
    }

    // #1042: upgrade the stored hash in place, now that we hold the plaintext
    // and know it is correct — the only moment a rehash is possible, since the
    // old digest cannot be converted. The store ages over as people sign in;
    // nobody is locked out and no reset mail is needed.
    if (needsRehash(user.password)) {
      const wasLegacy = isLegacyHash(user.password);
      user.password = hashPassword(password);
      logger.info(
        `🔐 Upgraded stored password hash for "${username}" ` +
        `(${wasLegacy ? 'legacy SHA-256 → scrypt' : 'scrypt parameters raised'}) (#1042)`
      );
    }

    // Update login stats
    user.lastLogin = new Date().toISOString();
    user.loginCount = (user.loginCount || 0) + 1;
    await this.provider.updateUser(username, user);

    // CRITICAL FIX: Return a user object that is ready to be placed in the session.
    // It must include the `isAuthenticated` flag.
    const { password: _pwd, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      isAuthenticated: true
    };
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

  /** Build the actor half of an account event (#1204). */
  /** The record's actor fields, read from the context the write was handed (#1179). */
  private static actorFields(ctx: ActorContext): { user: string; ipAddress: string | undefined; actorMeta: Record<string, unknown> } {
    const who = actorOf(ctx);
    return { user: who.user, ipAddress: who.ipAddress, actorMeta: who.metadata };
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

    const { username, email, displayName, password, roles = ['reader'], isExternal = false, isActive = true, acceptLanguage, profileLocked = false } = userData;

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

    const hashedPassword = isExternal ? '' : this.hashPassword(password);

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

    await this.provider.createUser(user);

    await this.syncPersonOnCreate(user);
    await this.roleManager().applyRoleDiff(username, [], roles);

    logger.info(`👤 Created user: ${username} (${isExternal ? 'External' : 'Local'})`);

    // #1204: recorded at the door, so an admin form, self-registration and an
    // identity provider's auto-provisioning all leave the same record.
    {
      const { user: who, ipAddress, actorMeta } = UserManager.actorFields(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_CREATE,
        user: who,
        ipAddress,
        action: 'user-create',
        result: 'success',
        severity: 'medium',
        resource: username,
        resourceType: 'user',
        metadata: { username, roles: [...roles], isExternal, selfRegistration: ctx.username === username, ...actorMeta }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-create of ${username}:`, err));
    }

    try {
      const pageCreated = await this.createUserPage(user, ctx);
      if (pageCreated) {
        user.profilePage = user.displayName;
        await this.provider.updateUser(username, user);
      }
    } catch (error) {
      logger.warn(`⚠️  Failed to create user page for ${username}:`, error instanceof Error ? error.message : String(error));
    }

    const { password: _pwd, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
    const user = await this.provider.getUser(username);
    if (!user || user.isExternal || user.isActive === false) return false;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const pagesDirectory = configManager?.getResolvedDataPath?.('ngdpbase.page.provider.filesystem.storagedir', './data/pages');
    if (!pagesDirectory) return false;
    if (!(await resetPasswordWrapWithMnemonic({ pagesDirectory, username, words, newPassword }))) return false;

    await this.updateUser(username, { password: newPassword }, ctx);
    logger.info(`🔑 Password reset with recovery words for ${username}`);
    return true;
  }

  async updateUser(username: string, updates: UserUpdateInput, ctx: ActorContext): Promise<User> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }

    const currentPasswordPlain =
      typeof updates.currentPassword === 'string' ? updates.currentPassword : undefined;
    delete updates.currentPassword;

    if (updates.password) {
      // Use the incoming isExternal value if being changed in the same request
      const willBeExternal = updates.isExternal !== undefined ? updates.isExternal : user.isExternal;
      if (willBeExternal) {
        throw new Error('Cannot set a password for an external OAuth user. Change the account type to Local first.');
      }
      const newPasswordPlain = updates.password;
      if (currentPasswordPlain) {
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
            newPassword: newPasswordPlain
          });
        }
      }
      updates.password = this.hashPassword(newPasswordPlain);
    }

    // #617 iteration 3b: the `roles` field on User is deprecated; role
    // membership is owned by RoleManager. Strip it from the update before
    // it lands on the User record, diff against the current RoleManager
    // state, and apply the changes through the canonical write path.
    const { roles: incomingRoles, ...userFieldUpdates } = updates;
    const oldRoles = incomingRoles ? await this.roleManager().resolveUserRoles(username) : [];
    Object.assign(user, userFieldUpdates);
    await this.provider.updateUser(username, user);

    await this.syncPersonOnUpdate(username, updates);
    if (incomingRoles) {
      await this.roleManager().applyRoleDiff(username, oldRoles, incomingRoles);
    }

    logger.info(`👤 Updated user: ${username}`);

    // #1204: only a change that alters what the account may do or who holds
    // it is recorded. Preferences, last-login and login-count updates arrive
    // through the same method on every sign-in and every theme toggle; a
    // record for each would bury the ones that matter. Field NAMES only —
    // never a password or an email value.
    const changed = SENSITIVE_USER_FIELDS.filter((f) => f in updates && (updates as Record<string, unknown>)[f] !== undefined);
    if (changed.length > 0) {
      const { user: who, ipAddress, actorMeta } = UserManager.actorFields(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_EDIT,
        user: who,
        ipAddress,
        action: 'user-edit',
        result: 'success',
        severity: changed.includes('roles') || changed.includes('isActive') ? 'high' : 'medium',
        resource: username,
        resourceType: 'user',
        metadata: {
          username,
          fields: changed,
          ...(incomingRoles ? { roles: { from: oldRoles, to: [...incomingRoles] } } : {}),
          selfEdit: ctx.username === username,
          ...actorMeta
        }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-edit of ${username}:`, err));
    }
    return user;
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

    // #1204: user-delete is CRITICAL — destruction of an identity and its
    // attribution — so the record is written and flushed BEFORE the delete,
    // and a failure refuses it (the token-mint / share-create ordering).
    {
      const { user: who, ipAddress, actorMeta } = UserManager.actorFields(ctx);
      const roles = await this.roleManager().resolveUserRoles(username);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.USER_DELETE,
        user: who,
        ipAddress,
        action: 'user-delete',
        result: 'success',
        severity: 'high',
        resource: username,
        resourceType: 'user',
        metadata: { username, roles, isExternal: user.isExternal === true, ...actorMeta }
      }, (err) => logger.warn(`[UserManager] Audit record failed for user-delete of ${username}:`, err));
    }

    await this.provider.deleteUser(username);

    // Order matters: clear role memberships while the Person record still
    // exists, then delete the Person.
    await this.roleManager().removeAllMemberships(username);
    await this.syncPersonOnDelete(username);

    logger.info(`👤 Deleted user: ${username}`);
    return true;
  }

  async getUsers(): Promise<Omit<User, 'password'>[]> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const allUsers = await this.provider.getAllUsers();
    return Array.from(allUsers.values())
      .filter((user): user is User => user != null)
      .map((user) => {
        const { password: _pwd, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
  }

  async getUser(username: string): Promise<Omit<User, 'password'> | undefined> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    if (!user) {
      return undefined;
    }
    const { password: _pwd, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserByEmail(email: string): Promise<Omit<User, 'password'> | undefined> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const allUsers = await this.provider.getAllUsers();
    const normalizedEmail = email.trim().toLowerCase();
    const found = Array.from(allUsers.values()).find(
      (u): u is User => u != null && typeof u.email === 'string' &&
        u.email.toLowerCase() === normalizedEmail
    );
    if (!found) return undefined;
    const { password: _pwd, ...userWithoutPassword } = found;
    return userWithoutPassword;
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
    for (const u of all) {
      if (!u.email || u.email === 'admin@localhost') continue;
      if (await this.roleManager().hasRole(u.username, 'admin')) return u.email;
    }
    return null;
  }

  /**
   * Search users by username, displayName, or email (case-insensitive substring).
   * Optionally filter by role and active status.
   */
  async searchUsers(
    query: string,
    options: { role?: string; limit?: number; activeOnly?: boolean },
    ctx: ActorContext
  ): Promise<Omit<User, 'password'>[]> {
    const all = await this.getUsers();
    const q = query.trim().toLowerCase();
    const { role, limit = 50, activeOnly = true } = options;

    // #617 iteration 3b: role filter resolved via RoleManager
    // (User.roles[] is deprecated). Sync filters run first; the async
    // hasRole call only fires for candidates that already pass them.
    const results: Omit<User, 'password'>[] = [];
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
      if (role && !(await this.roleManager().hasRole(u.username, role))) continue;
      results.push(u);
      if (limit > 0 && results.length >= limit) break;
    }
    // #1204: search-user ships switched off (read volume); recordAuditEvent
    // honours the switch. Enumerating people is disclosive, so a deployment
    // that wants it on can have it without a code change.
    {
      const { user: who, ipAddress, actorMeta } = UserManager.actorFields(ctx);
      await recordAuditEvent(this.auditSink(), {
        eventType: AUDIT_EVENT.SEARCH_USER,
        user: who,
        ipAddress,
        action: 'search-user',
        result: 'success',
        severity: 'low',
        metadata: { query: q, role: role ?? null, results: results.length, ...actorMeta }
      }, (err) => logger.warn('[UserManager] Audit record failed for search-user:', err));
    }
    return results;
  }



  /**
   * Persist a Person record paired with a newly-created User. The install's
   * anchor org (when configured) is referenced via `memberOf`; without it
   * the Person is written without an org link. Failures are logged, not
   * thrown — auth must still succeed if Person storage is degraded.
   */
  private async syncPersonOnCreate(user: User): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return;
    try {
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      const person: Person = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': `urn:uuid:${crypto.randomUUID()}`,
        identifier: user.username,
        ...(user.displayName ? { name: user.displayName } : {}),
        ...(user.email ? { email: user.email } : {}),
        ...(installOrg ? { memberOf: { '@id': installOrg['@id'] } } : {})
      };
      await personManager.create(person);
      logger.info(`📋 Created Person record for ${user.username}`);
    } catch (error) {
      logger.error(`❌ Failed to create Person record for ${user.username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async syncPersonOnUpdate(username: string, updates: UserUpdateInput): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return;
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return;
      const patch: PersonUpdate = {};
      if (updates.displayName !== undefined) patch.name = updates.displayName;
      if (updates.email !== undefined) patch.email = updates.email;
      if (Object.keys(patch).length === 0) return;
      await personManager.update(person['@id'], patch);
    } catch (error) {
      logger.error(`❌ Failed to update Person record for ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async syncPersonOnDelete(username: string): Promise<void> {
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!personManager) return;
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return;
      await personManager.delete(person['@id']);
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

  async deleteUserSessions(username: string): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const allSessions = await this.provider.getAllSessions();

    for (const [sessionId, session] of allSessions.entries()) {
      if (session.username === username) {
        await this.provider.deleteSession(sessionId);
      }
    }
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
