import BaseManager, { BackupData } from './BaseManager.js';
import { recordSystemAction, systemContext } from '../context/bootActions.js';
import { actorOf, type ActorContext } from '../context/ActorContext.js';

import crypto from 'crypto';
import logger from '../utils/logger.js';
import { hashPassword, verifyPassword, needsRehash, isLegacyHash } from '../utils/passwordHash.js';
import LocaleUtils from '../utils/LocaleUtils.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { UserProvider, ProviderInfo } from '../types/Provider.js';
import { User, Role, UserPreferences, UserSession } from '../types/User.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PersonManager from './PersonManager.js';
import type OrganizationManager from './OrganizationManager.js';
import type RoleManager from './RoleManager.js';
import type PolicyEvaluator from './PolicyEvaluator.js';
import type PolicyManager from './PolicyManager.js';
import type PageManager from './PageManager.js';
import type TemplateManager from './TemplateManager.js';
import type ValidationManager from './ValidationManager.js';
import type { Person, PersonUpdate } from '../types/Person.js';
import type { ShareGrant } from '../types/Share.js';
import type { Organization } from '../types/Organization.js';
import type { Role as OrganizationRoleRecord } from '../types/Role.js';
import type { Request, Response, NextFunction } from 'express';
import { assertHeadlessBootstrapPassword } from '../utils/headlessAdminPassword.js';
import { UserCreateError } from '../utils/userCreateError.js';
import { recordAuditEvent, type AuditEventSink } from '../utils/auditEvents.js';
import { AUDIT_EVENT } from '../utils/auditEventNames.js';

// #1179: the account writes below take an `ActorContext` — the request's
// subject or a JobContext — mandatory and positional. `AuditActor`, the
// optional `{ username?, ipAddress?, provider? }` bag that preceded it,
// recorded `unknown` when omitted and let a caller pass a literal `'system'`;
// both were the shape this principle exists to end. An identity provider that
// provisions an account now says so in the JobContext's reason.

/** Account fields whose change alters what the account may do or who holds it. Preferences are not among them. */
const SENSITIVE_USER_FIELDS = ['password', 'roles', 'isActive', 'isExternal', 'email', 'profileLocked', 'username'] as const;

/**
 * Catalog entry shape under `ngdpbase.roles.definitions[<name>]`. Snapshot
 * source for OrganizationRole records (#617 follow-up, iteration 2).
 */
interface RoleCatalogEntry {
  name?: string;
  displayname?: string;
  description?: string;
  issystem?: boolean;
  icon?: string;
  color?: string;
  permissions?: string[];
}

/**
 * Provider constructor type for dynamic loading
 */
interface UserProviderConstructor {
  new (engine: WikiEngine): UserProvider;
}

/**
 * Session user data structure
 */
interface SessionUser {
  username: string;
  isAuthenticated: boolean;
}

/**
 * Express session with user data
 */
interface SessionWithUser {
  user?: SessionUser;
  username?: string;
  [key: string]: unknown;
}

/**
 * Express request with user context (using type intersection to avoid extends conflict)
 */
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
  roles: ['anonymous', 'All'],
  isAuthenticated: false
};

/**
 * The subject for an asserted-but-unverified reader.
 *
 * Named for the same reason as {@link ANONYMOUS_SUBJECT}: a constant cannot be
 * built slightly differently at a second call site, and a literal can.
 */
export const ASSERTED_SUBJECT: PermissionSubject = {
  username: 'Asserted',
  roles: ['reader', 'All'],
  isAuthenticated: false
};

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

type RequestWithUser = Request & {
  user?: SessionUser;
  session?: SessionWithUser;
};

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
 * User context for permission evaluation
 */
interface UserContext {
  username: string;
  displayName?: string;
  roles: string[];
  isAuthenticated: boolean;
  /** Alias for isAuthenticated - used by WikiContext */
  authenticated?: boolean;
  isExternal?: boolean;
  hasSessionCookie?: boolean;
}

/**
 * Role creation data (deprecated)
 */
interface RoleCreateData {
  name: string;
  displayName?: string;
  description?: string;
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
  private roles: Map<string, Role> = new Map();
  /**
   * The permission catalog, read live from `ngdpbase.permissions.definitions`
   * (#1220). Not cached: a cached copy of an authorization attribute is not
   * authoritative (guiding-framework.md), and a hardcoded copy is how
   * `admin-read` came to be declared in configuration and "never registered"
   * (#1190). Format: {target}-{action} — target-first, hyphen-separated.
   */
  get permissions(): Map<string, string> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const defs = (configManager?.getProperty('ngdpbase.permissions.definitions', {}) ?? {}) as Record<string, { description?: string }>;
    return new Map(Object.entries(defs).map(([name, def]) => [name, def?.description ?? name]));
  }
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

    // Load role definitions from config
    const roleDefinitions = configManager.getProperty('ngdpbase.roles.definitions', {}) as Record<string, Role>;
    this.roles = new Map(Object.entries(roleDefinitions));

    logger.info(`👤 Loaded ${this.roles.size} role definitions from configuration`);

    // Initialize permissions registry
    this.initializePermissions();

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
   * Initialize the permissions registry with all available permissions
   * @private
   */
  private initializePermissions(): void {
    // #1220: nothing to copy — `permissions` reads configuration live. Say how
    // many the configuration declares at this point, for the boot log.
    logger.info(`👤 ${this.permissions.size} permissions declared in configuration`);
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
    await this.applyRoleDiff(adminUser.username, [], ['admin']);

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
    const oldRoles = existedBefore ? await this.resolveUserRoles(username) : [];

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
    await this.applyRoleDiff(username, oldRoles, roles);

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
   * Authorise a request: may THIS subject perform `action`?
   *
   * Takes a `PermissionSubject` — the request's own identity, forwarded from
   * `req.userContext` (WikiContext, ApiContext, ParseContext) or a
   * `JobContext` for work with no request (#631). Roles arrive already
   * resolved; the session middleware did that once per request.
   *
   * #1173 Part B: the username-string overload this method once accepted is
   * gone. A string cannot carry `viaToken`, so the agent-token ceiling below
   * had nothing to read and every string-form call resolved against the
   * owner's full roles. There is one path now, and the type makes the other
   * impossible. Callers with no subject to hand over have one of two
   * legitimate shapes: `ANONYMOUS_SUBJECT` / `ASSERTED_SUBJECT`, or the
   * separate question `userHoldsPermission()` — "does the named user hold
   * this?" — which is a lookup about somebody else, not an authorisation.
   *
   * @param subject - The identity being authorised, with `roles` resolved and
   *                  `viaToken` present when a bearer token authenticated it.
   * @param action - Action/permission to check (e.g., 'page-create', 'user-read')
   * @returns True if the subject may perform the action under current policy
   */
  async hasPermission(
    subject: PermissionSubject | JobSubject,
    action: string
  ): Promise<boolean> {
    const policyEvaluator = this.engine?.getManager<PolicyEvaluator>('PolicyEvaluator');
    if (!policyEvaluator) {
      logger.warn('[UserManager] PolicyEvaluator not available, denying permission');
      return false;
    }

    // #946: agent-token scope ceiling for CAPABILITY checks.
    //
    // This is a second enforcement point, not a duplicate. ACLManager's ceiling
    // covers page-resource checks (checkPagePermissionWithContext); this one
    // covers capability checks, which reach here via WikiContext.hasPermission
    // and never touch ACLManager at all. POST /api/page/ingest uses exactly
    // that path — without this, a token scoped `page-read` could create pages.
    //
    // Only applies when the caller passed a resolved context carrying a token;
    // an ordinary session request is unaffected.
    {
      const viaToken = subject.viaToken;
      if (viaToken && !viaToken.scopes.includes(action)) {
        logger.info(
          `[UserManager] token ${viaToken.id} ("${viaToken.name}") lacks scope '${action}' ` +
          `(has: ${viaToken.scopes.join(',') || 'none'}) — denied`
        );
        return false;
      }
    }

    // #1222: a share is a delegation, and for a capability check the share IS
    // the policy. The subject is anonymous; what it may do is what the issuer
    // delegated, bounded by what the issuer holds NOW. Three refusals, in
    // order: the action is not in the share; the share has expired (re-read
    // here rather than trusted from resolution, so a long request cannot
    // outlive it); the issuer no longer holds the action — resolved live, so
    // revoking the issuer's role stops every share they issued on the next
    // request (epic #1225). Nothing about the anonymous roles is consulted:
    // a share must work on an instance whose policy gives anonymous nothing.
    {
      const viaShare = subject.viaShare;
      if (viaShare) {
        if (!viaShare.actions.includes(action)) {
          logger.info(`[UserManager] share ${viaShare.id} does not delegate '${action}' (has: ${viaShare.actions.join(',') || 'none'}) — denied`);
          return false;
        }
        if (viaShare.expiresAt && Date.now() > Date.parse(viaShare.expiresAt)) {
          logger.info(`[UserManager] share ${viaShare.id} expired ${viaShare.expiresAt} — denied`);
          return false;
        }
        const issuerHolds = await this.userHoldsPermission(viaShare.issuer, action);
        if (!issuerHolds) {
          logger.info(`[UserManager] share ${viaShare.id}: issuer ${viaShare.issuer} no longer holds '${action}' — denied`);
        }
        return issuerHolds;
      }
    }

    let userContext: UserContext;

    // #1173: one path. There is no username-string branch any more — see
    // `userHoldsPermission` for the question that legitimately takes a name.
    if (typeof subject === 'object' && subject !== null && 'resolveRolesNow' in subject) {
      // #631: a JobSubject asks to be resolved NOW. That is the shape
      // `toPermissionSubject` hands over for a request-origin job: it carries
      // who asked and drops the roles they held at enqueue time, so a reindex
      // enqueued at 09:00 and running at 09:12 authorises against 09:12's
      // roles. #1212 made the request explicit: until then it was "roles
      // absent", and the type could not tell a job from a caller that forgot.
      userContext = await this.resolveSubjectNow(subject.username);
    } else {
      // #1212: the three fields are required on the type, so nothing is
      // defaulted here. A missing username used to fail closed by luck
      // (`?? 'Anonymous'`); now it does not compile.
      userContext = {
        username: subject.username,
        roles: subject.roles,
        isAuthenticated: subject.isAuthenticated
      };
    }

    // Evaluate using policies - use generic page resource for permission checks
    const result = await policyEvaluator.evaluateAccess({
      pageName: '*', // Generic - checking user capability, not specific page
      action: action,
      userContext: userContext as unknown as { username: string; roles: string[]; isAuthenticated: boolean }
    }) as { allowed: boolean };

    return result.allowed;
  }

  /**
   * Resolve a named user's CURRENT roles for a permission decision (#631).
   *
   * Used when a subject arrives without roles — a background job asking
   * "what may my requester do, now?". An unknown, inactive or absent user
   * resolves to the anonymous subject: the job then holds exactly what a
   * visitor holds, which is the safe answer for someone who no longer exists.
   */
  private async resolveSubjectNow(username: string | undefined): Promise<UserContext> {
    if (username && this.isSystemPrincipal(username)) {
      return this.systemSubject();
    }
    const user = username && this.provider ? await this.provider.getUser(username) : null;
    if (!user || !user.isActive) {
      // permission-subject-ignore: the anonymous subject, copied so the constant is never mutated.
      return { username: 'Anonymous', roles: [...(ANONYMOUS_SUBJECT.roles ?? [])], isAuthenticated: false };
    }
    const baseRoles = await this.resolveUserRoles(user.username);
    // permission-subject-ignore: THE resolution site — roles come from the store, now, not from a caller.
    return { username: user.username, roles: [...baseRoles, 'Authenticated', 'All'], isAuthenticated: true };
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
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const name = configManager?.getProperty(SYSTEM_PRINCIPAL_KEY, '');
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`${SYSTEM_PRINCIPAL_KEY} is empty. Set NGDPBASE_SYSTEM_USER in .env (#631).`);
    }
    return name.trim();
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
   * request (P2). Nothing here is a grant: the roles are read, not asserted,
   * which is why this is the sanctioned construction rather than a literal.
   * The name is reserved in {@link createUser}, so no person can hold it.
   */
  systemSubject(): UserContext {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const declared = configManager?.getProperty(SYSTEM_ROLES_KEY, ['admin']);
    const roles = Array.isArray(declared) ? declared.filter((r): r is string => typeof r === 'string') : ['admin'];
    // permission-subject-ignore: the system principal — name from .env, roles from the catalog (#631).
    return { username: this.systemPrincipalName(), roles: [...roles, 'Authenticated', 'All'], isAuthenticated: true };
  }

  /**
   * Get user's effective permissions from PolicyManager
   * @param {string} username - Username (null for anonymous)
   * @returns {Promise<string[]>} Array of permission strings
   */
  async getUserPermissions(username: string): Promise<string[]> {
    // Query PolicyManager for actual permissions
    const policyManager = this.engine.getManager<PolicyManager>('PolicyManager');
    if (!policyManager) {
      logger.warn('PolicyManager not available, returning empty permissions');
      return [];
    }

    if (!this.provider) {
      return [];
    }

    // Handle anonymous user (no session cookie)
    if (!username || username === 'anonymous') {
      const userRoles = ['anonymous', 'All'];
      return this.getPermissionsFromPolicies(policyManager, userRoles);
    }

    // Handle asserted user (has session cookie but expired/invalid) — treat as anonymous
    if (username === 'asserted') {
      const userRoles = ['anonymous', 'All'];
      return this.getPermissionsFromPolicies(policyManager, userRoles);
    }

    const user = await this.provider.getUser(username);
    if (!user || !user.isActive) {
      return [];
    }

    // Get all user's roles (including Authenticated, All) via RoleManager
    const baseRoles = await this.resolveUserRoles(username);
    const userRoles = [...baseRoles, 'Authenticated', 'All'];
    return this.getPermissionsFromPolicies(policyManager, userRoles);
  }

  /**
   * Helper method to get permissions from policies for given roles
   * @private
   * @param {any} policyManager - PolicyManager instance
   * @param {string[]} userRoles - Array of role names
   * @returns {string[]} Array of permission strings
   */

  private getPermissionsFromPolicies(policyManager: PolicyManager, userRoles: string[]): string[] {
    interface PolicySubject {
      type: string;
      value: string;
    }
    interface Policy {
      effect: string;
      subjects: PolicySubject[];
      actions: string[];
    }
    const policies = policyManager.getAllPolicies() as unknown as Policy[];
    const permissions = new Set<string>();

    // Collect permissions from all matching allow policies
    for (const policy of policies) {
      if (policy.effect === 'allow') {
        const hasMatchingRole = policy.subjects.some((subject: PolicySubject) => subject.type === 'role' && userRoles.includes(subject.value));

        if (hasMatchingRole) {
          policy.actions.forEach((action: string) => permissions.add(action));
        }
      }
    }

    return Array.from(permissions);
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
      return pageManager.pageExists(displayName);
    } catch (error) {
      logger.error('Error checking display name page conflict:', error);
      return false; // On error, assume no conflict to avoid blocking registration
    }
  }

  /**
   * Create a user page for a new user
   * @param {User} user - User object
   * @returns {Promise<boolean>} True if user page was created successfully
   */
  async createUserPage(user: User): Promise<boolean> {
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
      if (pageManager.pageExists(user.displayName)) {
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

      // Save the user page
      await pageManager.savePage(profileTitle, populatedContent, metadata, { skipValidation: true });
      logger.info(`✅ Created user page for ${user.displayName}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error creating user page for ${user.displayName}:`, error);
      return false;
    }
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

    if (this.isSystemPrincipal(username)) {
      // #631: the system principal is an identity named in .env, not an
      // account. Letting a person register under that name would hand them
      // its roles the first time a job resolved the name. Same reason code as
      // a taken username so the registration form cannot tell the two apart.
      throw new UserCreateError('username-taken', `Username is reserved for the system principal: "${username}"`);
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
    await this.applyRoleDiff(username, [], roles);

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
      const pageCreated = await this.createUserPage(user);
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
  async updateUser(username: string, updates: UserUpdateInput, ctx: ActorContext): Promise<User> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }

    if (updates.password) {
      // Use the incoming isExternal value if being changed in the same request
      const willBeExternal = updates.isExternal !== undefined ? updates.isExternal : user.isExternal;
      if (willBeExternal) {
        throw new Error('Cannot set a password for an external OAuth user. Change the account type to Local first.');
      }
      updates.password = this.hashPassword(updates.password);
    }

    // #617 iteration 3b: the `roles` field on User is deprecated; role
    // membership is owned by RoleManager. Strip it from the update before
    // it lands on the User record, diff against the current RoleManager
    // state, and apply the changes through the canonical write path.
    const { roles: incomingRoles, ...userFieldUpdates } = updates;
    const oldRoles = incomingRoles ? await this.resolveUserRoles(username) : [];
    Object.assign(user, userFieldUpdates);
    await this.provider.updateUser(username, user);

    await this.syncPersonOnUpdate(username, updates);
    if (incomingRoles) {
      await this.applyRoleDiff(username, oldRoles, incomingRoles);
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
      const roles = await this.resolveUserRoles(username);
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
    await this.syncRolesAllRemovedOnDelete(username);
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
      if (await this.hasRole(u.username, 'admin')) return u.email;
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
      if (role && !(await this.hasRole(u.username, role))) continue;
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

  getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  getPermissions(): Map<string, string> {
    return this.permissions;
  }

  getRole(roleName: string): Role | null {
    return this.roles.get(roleName) || null;
  }

  createRole(roleData: RoleCreateData): never {
    logger.warn(`[DEPRECATED] createRole() is deprecated. Add role '${roleData.name}' to config/app-custom-config.json`);
    throw new Error('createRole() is deprecated. Please add custom roles to config/app-custom-config.json');
  }

  deleteRole(roleName: string): never {
    logger.warn(`[DEPRECATED] deleteRole() is deprecated. Remove role '${roleName}' from config`);
    throw new Error('deleteRole() is deprecated. Please remove custom roles from config');
  }

  updateRolePermissions(_roleName: string, _updates: unknown): never {
    logger.warn('[DEPRECATED] updateRolePermissions() is deprecated.');
    throw new Error('updateRolePermissions() is deprecated. Use config files and policies');
  }

  /**
   * Does this NAMED USER hold a permission? (#1173)
   *
   * A different question from {@link hasPermission}, and that is why it has a
   * different name. This one __inspects a user__ — "does bob hold
   * `admin-system`?" — where there is no request, no token, and nothing to cap.
   * `hasPermission` __authorises a request__, so it must be handed the subject
   * the request carries or an agent token's scope ceiling has nothing to read.
   *
   * They shared a name and one of them took a bare string, which is how #1164
   * happened seventeen times: route code reached for the convenient overload
   * and silently lost the token. Splitting them means the dangerous question
   * cannot be asked by accident — a route authorising a request has no reason
   * to call this, and calling it does not compile in place of the other.
   *
   * Resolves roles live from the provider, so the answer is current rather than
   * a replay of whatever the caller happened to hold.
   */
  async userHoldsPermission(username: string, action: string): Promise<boolean> {
    if (!this.provider) return false;

    if (!username || username === 'anonymous') {
      // The named constant, not a copy of it — ANONYMOUS_SUBJECT exists so this
      // literal never appears anywhere (#1164).
      return this.hasPermission(ANONYMOUS_SUBJECT, action);
    }
    if (username === 'asserted') {
      return this.hasPermission(ASSERTED_SUBJECT, action);
    }

    const user = await this.provider.getUser(username);
    if (!user || !user.isActive) return false;
    // permission-subject-ignore: THE sanctioned construction site.
    //
    // This is the one place a subject is legitimately built rather than
    // forwarded, and it is what makes the exception safe: the roles come from
    // `resolveUserRoles` — resolved live from the provider a line above — not
    // from a caller, and there is no request and therefore no token to drop.
    // Every other construction asserts roles it was handed, which is the
    // defect (#1179).
    const baseRoles = await this.resolveUserRoles(username);
    return this.hasPermission(
      { username: user.username, roles: [...baseRoles, 'Authenticated', 'All'], isAuthenticated: true },
      action
    );
  }

  /**
   * Who is making this request.
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
  async getCurrentUser(req: Request): Promise<UserContext> {
    const fromRequest = (req as RequestWithUser).userContext;
    if (fromRequest?.isAuthenticated) {
      return fromRequest;
    }

    if (!this.provider) {
      return this.getAnonymousUser();
    }

    const reqWithUser = req as RequestWithUser;
    if (reqWithUser.session?.username && reqWithUser.session.isAuthenticated) {
      const freshUser = await this.provider.getUser(reqWithUser.session.username);
      if (!freshUser || !freshUser.isActive) {
        return this.getAnonymousUser();
      }

      const currentUserContext: UserContext = {
        ...freshUser,
        isAuthenticated: true,
        authenticated: true
      } as UserContext;

      const roles = new Set(currentUserContext.roles || []);
      roles.add('All');
      roles.add('Authenticated');
      currentUserContext.roles = Array.from(roles);

      return currentUserContext;
    }

    return this.getAnonymousUser();
  }

  ensureAuthenticated(req: Request, res: Response, next: NextFunction): void {
    const reqWithUser = req as RequestWithUser;
    const user = reqWithUser.user;

    if (!user || !user.isAuthenticated) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  requirePermissions(requiredPermissions: string[] = []) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const reqWithUser = req as RequestWithUser;
      // #1198: no `isAuthenticated` gate ahead of policy. Allow or deny is
      // policy's answer and nobody else's; the anonymous role's policy already
      // says what a visitor may do. What stays is the HTTP distinction AFTER
      // the denial — 401 tells an anonymous caller to log in, 403 tells an
      // authenticated one it is not allowed — a status choice, not a second
      // decision.
      // #1212: the request's OWN context, which the session and bearer
      // middleware write. This read `req.user`, which nothing in the codebase
      // sets — so every caller was evaluated as anonymous, and a bearer
      // request's token never reached the ceiling. Required fields on
      // `PermissionSubject` are what made the mismatch a compile error.
      const user: PermissionSubject = reqWithUser.userContext ?? ANONYMOUS_SUBJECT;
      // #1164: forward the request's context so an agent token is still capped.
      Promise.all(requiredPermissions.map((p) => this.hasPermission(user, p)))
        .then((results) => {
          if (!results.every(Boolean)) {
            if (user.isAuthenticated) res.status(403).json({ error: 'Forbidden' });
            else res.status(401).json({ error: 'Unauthorized' });
          } else {
            next();
          }
        })
        .catch(next);
    };
  }

  getAnonymousUser(): UserContext {
    return {
      username: 'Anonymous',
      displayName: 'Anonymous User',
      // 'anonymous' lowercase — the role key in ngdpbase.roles.definitions and
      // the subject the anonymous-read-only policy names. The capitalized
      // spelling matched no policy subject, so every capability check that
      // took the resolved-context path (WikiContext.hasPermission) denied
      // anonymous even where the catalogue granted it (#1059).
      roles: ['anonymous', 'All'],
      isAuthenticated: false,
      authenticated: false
    };
  }

  getAssertedUser(): UserContext {
    return {
      username: 'asserted',
      displayName: 'Asserted User',
      roles: ['anonymous'],
      isAuthenticated: false,
      authenticated: false,
      hasSessionCookie: true
    };
  }

  async hasRole(username: string, roleName: string): Promise<boolean> {
    if (!this.provider) {
      return false;
    }
    const roles = await this.resolveUserRoles(username);
    return roles.includes(roleName);
  }

  async assignRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }
    if (!this.roles.has(roleName)) {
      throw new Error('Role not found');
    }
    // syncRoleAdd is idempotent (no-op when the Person is already a member),
    // so we can call unconditionally.
    await this.syncRoleAdd(username, roleName);
    logger.info(`👤 Assigned role '${roleName}' to user '${username}'`);
    await this.recordRoleChange(username, 'assign', roleName, ctx);
    return true;
  }

  /** #1204: a role assigned or removed is a user-edit; what the account may do changed. */
  private async recordRoleChange(username: string, op: 'assign' | 'remove', roleName: string, ctx: ActorContext): Promise<void> {
    const { user: who, ipAddress, actorMeta } = UserManager.actorFields(ctx);
    await recordAuditEvent(this.auditSink(), {
      eventType: AUDIT_EVENT.USER_EDIT,
      user: who,
      ipAddress,
      action: 'user-edit',
      result: 'success',
      severity: 'high',
      resource: username,
      resourceType: 'user',
      metadata: { username, fields: ['roles'], role: { [op]: roleName }, ...actorMeta }
    }, (err) => logger.warn(`[UserManager] Audit record failed for user-edit (${op} ${roleName}) of ${username}:`, err));
  }

  async removeRole(username: string, roleName: string, ctx: ActorContext): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }
    await this.syncRoleRemove(username, roleName);
    logger.info(`👤 Removed role '${roleName}' from user '${username}'`);
    await this.recordRoleChange(username, 'remove', roleName, ctx);
    return true;
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

  /**
   * Resolve a user's effective base role names from the canonical
   * OrganizationRole records owned by RoleManager (#617).
   *
   * Returns the array of `namedPosition` strings for every role whose
   * `member[]` contains the user's Person `@id`. The pseudo-roles
   * `'Authenticated'` and `'All'` are NOT added here — the caller adds
   * those when constructing `userContext.roles` (matches the convention
   * in `src/app.ts` and `hasPermission` / `getUserPermissions`).
   *
   * Returns `[]` when:
   *   - the User provider is unavailable, or
   *   - PersonManager / RoleManager are unavailable (degraded init), or
   *   - the user has no paired Person record, or
   *   - RoleManager.listByMember returns no records, or
   *   - the underlying lookup throws.
   *
   * The legacy `User.roles[]` fallback that bridged iterations 2 and 3a
   * was removed in iteration 3b — RoleManager is the single source of
   * truth. Run `scripts/strip-user-roles.ts` to clear the deprecated
   * field from existing `users.json` files.
   */
  async resolveUserRoles(username: string): Promise<string[]> {
    if (!this.provider) return [];
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    if (!personManager || !roleManager) return [];

    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return [];
      const roles = await roleManager.listByMember(person['@id']);
      return roles.map((r) => r.namedPosition);
    } catch (error) {
      logger.warn(
        `[UserManager.resolveUserRoles] lookup failed for ${username}: ` +
        (error instanceof Error ? error.message : String(error))
      );
      return [];
    }
  }

  /**
   * Add the user's Person `@id` to the OrganizationRole record for
   * (installOrg, roleName). #617 iteration 3b: this is now the canonical
   * role-membership write — RoleManager is the single store. Idempotent:
   * a no-op when the Person is already a member.
   *
   * Best-effort under degraded init: skips silently when PersonManager,
   * RoleManager, or OrganizationManager are unavailable, when no Person
   * record exists for `username`, or when the install has no anchor org.
   * Failures are logged, not thrown — User-record writes must succeed even
   * when role storage is degraded.
   */
  private async syncRoleAdd(username: string, roleName: string): Promise<void> {
    // #1027: every abandon path below used to `return` in silence, so a failed
    // role assignment was indistinguishable from a successful one — the caller
    // gets no error and the user simply never has the role. Each now says why.
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!roleManager || !personManager) {
      logger.warn(`🔑 Cannot add role ${roleName} to ${username}: RoleManager or PersonManager unavailable (#1027)`);
      return;
    }
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) {
        logger.warn(`🔑 Cannot add role ${roleName} to ${username}: no Person record for that username (#1027)`);
        return;
      }
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      if (!installOrg) {
        logger.warn(
          `🔑 Cannot add role ${roleName} to ${username}: no anchor Organization — ` +
          'set ngdpbase.application.organization.file and supply the JSON-LD file (#1027)'
        );
        return;
      }
      const role = await this.getOrCreateRoleRecord(roleManager, installOrg, roleName);
      if (!role) {
        logger.warn(`🔑 Cannot add role ${roleName} to ${username}: role record could not be created (#1027)`);
        return;
      }
      const memberIds = new Set((role.member ?? []).map((m) => m['@id']));
      if (memberIds.has(person['@id'])) return;
      const newMembers = [...(role.member ?? []), { '@id': person['@id'] }];
      await roleManager.update(role['@id'], { member: newMembers });
      logger.info(`🔑 Role added: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to add role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async syncRoleRemove(username: string, roleName: string): Promise<void> {
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    // #1027: same silent-abandon problem as syncRoleAdd. A revocation that
    // quietly does nothing is the more dangerous direction of the two — the
    // operator believes access was removed when it was not.
    if (!roleManager || !personManager) {
      logger.warn(`🔑 Cannot remove role ${roleName} from ${username}: RoleManager or PersonManager unavailable (#1027)`);
      return;
    }
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) {
        logger.warn(`🔑 Cannot remove role ${roleName} from ${username}: no Person record for that username (#1027)`);
        return;
      }
      const installOrg = await this.engine
        .getManager<OrganizationManager>('OrganizationManager')
        ?.getInstallOrg();
      if (!installOrg) {
        logger.warn(
          `🔑 Cannot remove role ${roleName} from ${username}: no anchor Organization — ` +
          'the role may still be in effect (#1027)'
        );
        return;
      }
      const role = await roleManager.getByOrgAndPosition(installOrg['@id'], roleName);
      if (!role) {
        // Not an error: nothing to revoke if the role record never existed.
        return;
      }
      const before = role.member ?? [];
      const after = before.filter((m) => m['@id'] !== person['@id']);
      if (after.length === before.length) return;
      await roleManager.update(role['@id'], { member: after });
      logger.info(`🔑 Role removed: ${username} → ${roleName}`);
    } catch (error) {
      logger.error(`❌ Failed to remove role (${username}, ${roleName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async applyRoleDiff(username: string, oldRoles: string[], newRoles: string[]): Promise<void> {
    const oldSet = new Set(oldRoles);
    const newSet = new Set(newRoles);
    for (const r of newRoles) {
      if (!oldSet.has(r)) await this.syncRoleAdd(username, r);
    }
    for (const r of oldRoles) {
      if (!newSet.has(r)) await this.syncRoleRemove(username, r);
    }
  }

  private async syncRolesAllRemovedOnDelete(username: string): Promise<void> {
    const roleManager = this.engine.getManager<RoleManager>('RoleManager');
    const personManager = this.engine.getManager<PersonManager>('PersonManager');
    if (!roleManager || !personManager) return;
    try {
      const person = await personManager.getByIdentifier(username);
      if (!person) return;
      const memberOf = await roleManager.listByMember(person['@id']);
      for (const role of memberOf) {
        const after = (role.member ?? []).filter((m) => m['@id'] !== person['@id']);
        await roleManager.update(role['@id'], { member: after });
      }
    } catch (error) {
      logger.error(`❌ Failed to clean up role memberships for deleted user ${username}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Look up the OrganizationRole record for (installOrg, namedPosition); if
   * absent, create a fresh record snapshotted from the role catalog at
   * `ngdpbase.roles.definitions[namedPosition]`. The catalog snapshot is a
   * best-effort copy at create time — later catalog edits do not retroactively
   * rewrite existing role files (per Role.ts docstring).
   */
  private async getOrCreateRoleRecord(
    roleManager: RoleManager,
    installOrg: Organization,
    namedPosition: string
  ): Promise<OrganizationRoleRecord | null> {
    const existing = await roleManager.getByOrgAndPosition(installOrg['@id'], namedPosition);
    if (existing) return existing;

    const orgUrl = installOrg.url || installOrg['@id'];
    const base = orgUrl.endsWith('/') ? orgUrl : `${orgUrl}/`;
    const id = `${base}roles/${namedPosition}#role`;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const definitions = (configManager?.getProperty(
      'ngdpbase.roles.definitions',
      {}
    ) ?? {}) as Record<string, RoleCatalogEntry>;
    const def = definitions[namedPosition] ?? {};

    const snapshot: Partial<OrganizationRoleRecord> = {};
    const label = def.displayname ?? def.name;
    if (label) snapshot.roleName = label;
    if (def.description) snapshot.description = def.description;
    if (def.issystem !== undefined) snapshot.issystem = def.issystem;
    if (def.icon) snapshot.icon = def.icon;
    if (def.color) snapshot.color = def.color;
    if (def.permissions) {
      snapshot.additionalProperty = [
        { '@type': 'PropertyValue', name: 'permissions', value: def.permissions }
      ];
    }

    const role: OrganizationRoleRecord = {
      '@context': 'https://schema.org',
      '@type': 'OrganizationRole',
      '@id': id,
      namedPosition,
      organization: { '@id': installOrg['@id'] },
      member: [],
      ...snapshot
    };
    return roleManager.create(role);
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
