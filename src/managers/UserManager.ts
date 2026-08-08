import BaseManager, { BackupData } from './BaseManager.js';

import crypto from 'crypto';
import logger from '../utils/logger.js';
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
import type { Organization } from '../types/Organization.js';
import type { Role as OrganizationRoleRecord } from '../types/Role.js';
import type { Request, Response, NextFunction } from 'express';

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
 * @property {string} defaultPassword - Default password for new admin user
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
  private permissions: Map<string, string> = new Map();
  private passwordSalt?: string;
  private defaultPassword?: string;

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
    this.defaultPassword = configManager.getProperty('ngdpbase.user.security.defaultpassword', 'admin123') as string;

    // Load role definitions from config
    const roleDefinitions = configManager.getProperty('ngdpbase.roles.definitions', {}) as Record<string, Role>;
    this.roles = new Map(Object.entries(roleDefinitions));

    logger.info(`👤 Loaded ${this.roles.size} role definitions from configuration`);

    // Initialize permissions registry
    this.initializePermissions();

    // Create default admin if needed
    if (this.provider) {
      const allUsers = await this.provider.getAllUsers();
      if (allUsers.size === 0) {
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
    // Define all available permissions in the system
    // Format: {target}-{action} — target-first, hyphen-separated (URL-safe)
    this.permissions.set('page-read',    'View pages');
    this.permissions.set('page-edit',    'Edit pages');
    this.permissions.set('page-create',  'Create new pages');
    this.permissions.set('page-delete',  'Delete pages');
    this.permissions.set('page-rename',  'Rename pages');
    this.permissions.set('page-export',  'Export pages');
    this.permissions.set('asset-read',   'View assets (attachments)');
    this.permissions.set('asset-upload', 'Upload assets');
    this.permissions.set('asset-delete', 'Delete assets');
    this.permissions.set('asset-edit',   'Edit asset metadata (EXIF/IPTC/XMP)');
    this.permissions.set('search-page',  'Search pages');
    this.permissions.set('search-user',  'Search users');
    this.permissions.set('user-read',    'View user list and profiles');
    this.permissions.set('user-edit',    'Edit user accounts');
    this.permissions.set('user-create',  'Create user accounts');
    this.permissions.set('user-delete',  'Delete user accounts');
    this.permissions.set('admin-system', 'System administration');
    this.permissions.set('admin-roles',  'Role management');

    logger.info(`👤 Initialized ${this.permissions.size} permissions`);
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
   * Simple password hashing using crypto
   * @param {string} password - Plain text password
   * @returns {string} Hashed password
   */
  hashPassword(password: string): string {
    const salt = this.passwordSalt || 'amdwiki-salt';
    return crypto
      .createHash('sha256')
      .update(password + salt)
      .digest('hex');
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash
   * @returns {boolean} True if password matches
   */
  verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Check if admin user still has the default password
   * @returns {Promise<boolean>} True if admin has default password
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
      const defaultPassword = this.defaultPassword || 'admin123';
      return this.verifyPassword(defaultPassword, adminUser.password);
    } catch (error) {
      logger.error('Error checking admin default password:', error);
      return false;
    }
  }

  /**
   * Create default admin user
   */
  async createDefaultAdmin(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const defaultPassword = this.defaultPassword || 'admin123';

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

    await this.syncPersonOnCreate(adminUser);
    await this.applyRoleDiff(adminUser.username, [], ['admin']);

    logger.info(`👤 Created default admin user (username: admin, password: ${defaultPassword})`);
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
   * Check if user has permission using policy-based access control.
   *
   * #637: accepts either a username string OR a pre-resolved UserContext-shaped
   * object. The fast path (passing a UserContext) skips `provider.getUser` and
   * `resolveUserRoles` — both of which the session middleware already did once
   * per request when building `req.userContext`. Callers that already have
   * `req.userContext` (WikiContext, ApiContext, ParseContext) should pass it
   * through to avoid the redundant work.
   *
   * The string path is preserved for callers without a context (background
   * jobs, CLI tools, tests).
   *
   * Anonymous/asserted role-expansion happens here only on the string path.
   * UserContext callers are responsible for the correct role array — the
   * session middleware handles this for HTTP requests.
   *
   * @param usernameOrContext - Username string, or a UserContext-shaped object
   *                            with `roles` already resolved.
   * @param action - Action/permission to check (e.g., 'page-create', 'user-read')
   * @returns True if user has permission via policies
   */
  async hasPermission(
    usernameOrContext: string | { username: string; roles: string[]; isAuthenticated: boolean },
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
    if (typeof usernameOrContext === 'object' && usernameOrContext !== null) {
      const viaToken = (usernameOrContext as { viaToken?: { id: string; name: string; scopes: string[] } }).viaToken;
      if (viaToken && !viaToken.scopes.includes(action)) {
        logger.info(
          `[UserManager] token ${viaToken.id} ("${viaToken.name}") lacks scope '${action}' ` +
          `(has: ${viaToken.scopes.join(',') || 'none'}) — denied`
        );
        return false;
      }
    }

    let userContext: UserContext;

    // Fast path: caller already has a resolved userContext — trust it.
    if (typeof usernameOrContext === 'object' && usernameOrContext !== null) {
      userContext = {
        username: usernameOrContext.username,
        roles: usernameOrContext.roles,
        isAuthenticated: usernameOrContext.isAuthenticated
      };
    } else {
      // String path: build the context from scratch (existing behavior).
      const username = usernameOrContext;
      if (!this.provider) {
        return false;
      }
      if (!username || username === 'anonymous') {
        userContext = {
          username: 'Anonymous',
          roles: ['anonymous', 'All'],
          isAuthenticated: false
        };
      } else if (username === 'asserted') {
        userContext = {
          username: 'Asserted',
          roles: ['reader', 'All'],
          isAuthenticated: false
        };
      } else {
        const user = await this.provider.getUser(username);
        if (!user || !user.isActive) {
          return false;
        }
        const baseRoles = await this.resolveUserRoles(username);
        userContext = {
          username: user.username,
          roles: [...baseRoles, 'Authenticated', 'All'],
          isAuthenticated: true
        };
      }
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
      await pageManager.savePage(profileTitle, populatedContent, metadata);
      logger.info(`✅ Created user page for ${user.displayName}`);
      return true;
    } catch (error) {
      logger.error(`❌ Error creating user page for ${user.displayName}:`, error);
      return false;
    }
  }

  /**
   * Create new user
   * @param {UserCreateInput} userData - User data
   * @returns {Promise<Omit<User, 'password'>>} Created user (without password)
   */
  async createUser(userData: UserCreateInput): Promise<Omit<User, 'password'>> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const { username, email, displayName, password, roles = ['reader'], isExternal = false, isActive = true, acceptLanguage, profileLocked = false } = userData;

    if (await this.provider.userExists(username)) {
      const existingUsers = await this.provider.getAllUsernames();

      throw new Error(`Username already exists: "${username}". Existing users: ${existingUsers.join(', ')}`);
    }

    const finalDisplayName = displayName || username;
    const hasPageConflict = await this.checkDisplayNamePageConflict(finalDisplayName);
    if (hasPageConflict) {
      throw new Error(`Display name "${finalDisplayName}" conflicts with an existing page. Please choose a different display name.`);
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
  async updateUser(username: string, updates: UserUpdateInput): Promise<User> {
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
    return user;
  }

  /**
   * Delete user
   */
  async deleteUser(username: string): Promise<boolean> {
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
    options: { role?: string; limit?: number; activeOnly?: boolean } = {}
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

  async getCurrentUser(req: Request): Promise<UserContext> {
    if (!this.provider) {
      return this.getAnonymousUser();
    }

    const reqWithUser = req as RequestWithUser;
    if (reqWithUser.session?.user && reqWithUser.session.user.isAuthenticated) {
      const userFromSession = reqWithUser.session.user;
      const freshUser = await this.provider.getUser(userFromSession.username);
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
      const user = reqWithUser.user;
      if (!user || !user.isAuthenticated) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      Promise.all(requiredPermissions.map((p) => this.hasPermission(user.username, p)))
        .then((results) => {
          if (!results.every(Boolean)) {
            res.status(403).json({ error: 'Forbidden' });
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
      roles: ['Anonymous', 'All'],
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

  async assignRole(username: string, roleName: string): Promise<boolean> {
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
    return true;
  }

  async removeRole(username: string, roleName: string): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const user = await this.provider.getUser(username);
    if (!user) {
      throw new Error('User not found');
    }
    await this.syncRoleRemove(username, roleName);
    logger.info(`👤 Removed role '${roleName}' from user '${username}'`);
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
