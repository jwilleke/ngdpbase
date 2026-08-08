/**
 * User type definitions for ngdpbase
 *
 * This module defines types for users, authentication, roles, and permissions
 * used by UserManager and authorization systems.
 */

/**
 * An item pinned to the user's My Links sidebar section. The shape is unified
 * across wiki pages and arbitrary app-route bookmarks (e.g. /my/journal,
 * /profile, /search?q=foo). `url` is the canonical identifier; `pageName` is
 * carried for wiki pages so the rendering path can still use page-aware
 * affordances when relevant.
 *
 * Legacy entries (`{pageName, title}` only, no `url`) are normalised at read
 * time by normalizePinnedItem in src/utils/pinnedItems.ts.
 */
export interface PinnedItem {
  url: string;
  title: string;
  pageName?: string;
  pinnedAt?: string;
}

/**
 * @deprecated Use PinnedItem. Kept as an alias for back-compat with callers
 * that only handle wiki-page pins.
 */
export type PinnedPage = PinnedItem;

/**
 * User preferences
 *
 * User-specific settings and preferences.
 */
export interface UserPreferences {
  /** Editor smart pairs (auto-close brackets, quotes) */
  'editor.plain.smartpairs'?: boolean;

  /** Editor auto-indent */
  'editor.autoindent'?: boolean;

  /** Show line numbers in editor */
  'editor.linenumbers'?: boolean;

  /** Editor theme (light, dark, etc.) */
  'editor.theme'?: string;

  /** Display page size for lists */
  'display.pagesize'?: string;

  /** Show tooltips */
  'display.tooltips'?: boolean;

  /** Reader mode enabled */
  'display.readermode'?: boolean;

  /** Date format (iso, us, eu, etc.) */
  'display.dateformat'?: string;

  /** Timezone */
  timezone?: string;

  /** Language/locale */
  locale?: string;

  /** Items pinned to the My Links sidebar section (wiki pages and app-route URLs) */
  'nav.pinnedPages'?: PinnedItem[];

  /** Additional custom preferences */
  [key: string]: unknown;
}

/**
 * User object
 *
 * Complete user record stored in the user provider.
 */
export interface User {
  /** Username (unique identifier for login) */
  username: string;

  /** Email address */
  email: string;

  /** Display name (full name) */
  displayName: string;

  /** Hashed password (SHA-256 or bcrypt) */
  password: string;

  /**
   * @deprecated since #617 iteration 3b. Role membership is now stored
   * canonically as OrganizationRole records owned by `RoleManager`; resolve
   * a user's roles via `UserManager.resolveUserRoles(username)`. The field
   * is retained as optional for backwards compatibility while in-flight
   * `users.json` files still carry it; the `strip-user-roles.ts` migration
   * removes it. New code MUST NOT read or write this field directly.
   */
  roles?: string[];

  /** Whether user account is active */
  isActive: boolean;

  /** Whether user is system user */
  isSystem: boolean;

  /** Whether user is external (LDAP, OAuth) */
  isExternal: boolean;

  /**
   * Freeze this account's identity against self-service change (#1029).
   *
   * For a shared account whose credentials are published — a demo login, say —
   * letting the holder edit their own identity hands the account away:
   *
   * - **password** — the first visitor to change it locks out every other
   *   visitor and makes the published credential wrong.
   * - **email** — worse, and the reason this covers more than the password.
   *   Magic-link login resolves an account by email address
   *   (`MagicLinkAuthProvider.getUserByEmail`), so a visitor who repoints the
   *   address at their own inbox can magic-link back in indefinitely. The
   *   password lock alone would not have stopped them.
   * - **displayName** — defacement on a public instance.
   *
   * Preferences, avatar and pinned links stay editable: the point is to let a
   * visitor drive the account, not to freeze it.
   *
   * Blocks the `/profile` path only. An administrator can still change any of
   * it through `/admin/users/<name>/edit`, which requires `user-edit`, so the
   * account is never unrecoverable.
   *
   * Distinct from `isSystem`, which means "cannot be deleted" and is set on
   * `admin` — an account that must keep self-service password change.
   */
  profileLocked?: boolean;

  /** Account creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last login timestamp (ISO 8601) */
  lastLogin?: string;

  /** Total login count */
  loginCount: number;

  /** User preferences */
  preferences: UserPreferences;

  /** Profile picture URL or data */
  avatar?: string;

  /** Wiki page name for this user's profile page */
  profilePage?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /**
   * Allowed authentication methods for this user.
   * If absent, the user may use any method enabled at the system level.
   * If present, only the listed provider IDs are accepted (e.g. ["google-oidc", "password"]).
   * Useful for ensuring admin accounts can always use password as an emergency fallback.
   */
  allowedAuthMethods?: string[];
}

/**
 * User creation data
 *
 * Data required to create a new user (no password hash yet).
 */
export interface UserCreateData {
  /** Username (unique) */
  username: string;

  /** Email address */
  email: string;

  /** Display name */
  displayName: string;

  /** Plain text password (will be hashed) */
  password: string;

  /** Initial roles */
  roles?: string[];

  /** Whether account starts active */
  isActive?: boolean;

  /** User preferences */
  preferences?: Partial<UserPreferences>;
}

/**
 * User update data
 *
 * Partial user data for updates (all fields optional).
 */
export interface UserUpdateData {
  /** Email address */
  email?: string;

  /** Display name */
  displayName?: string;

  /** New plain text password (will be hashed) */
  password?: string;

  /** Updated roles */
  roles?: string[];

  /** Active status */
  isActive?: boolean;

  /** Updated preferences */
  preferences?: Partial<UserPreferences>;

  /** Avatar */
  avatar?: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * User session data
 *
 * Active session information stored by session manager.
 */
export interface UserSession {
  /** Session ID (unique) */
  sessionId: string;

  /** Username */
  username: string;

  /** User ID (username or external ID) */
  userId: string;

  /** Session creation timestamp (ISO 8601) */
  createdAt: string;

  /** Session expiration timestamp (ISO 8601) */
  expiresAt: string;

  /** Last activity timestamp (ISO 8601) */
  lastActivity: string;

  /** Client IP address */
  ipAddress?: string;

  /** User agent string */
  userAgent?: string;

  /** Additional session data */
  data?: Record<string, unknown>;
}

/**
 * User authentication result
 *
 * Result of authentication attempt.
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean;

  /** User object if successful */
  user?: User;

  /** Session ID if successful */
  sessionId?: string;

  /** Error message if failed */
  error?: string;

  /** Error code (invalid_credentials, account_disabled, etc.) */
  errorCode?: string;
}

/**
 * User role definition
 *
 * Defines a role and its permissions.
 */
export interface Role {
  /** Role name (unique identifier) */
  name: string;

  /** Display name */
  displayName: string;

  /** Role description */
  description?: string;

  /** Permissions granted by this role */
  permissions: string[];

  /** Whether this is a system role (cannot be deleted) */
  isSystem: boolean;

  /** Parent roles (inheritance) */
  inherits?: string[];
}

/**
 * User permission
 *
 * Defines a specific permission.
 */
export interface Permission {
  /** Permission name (unique identifier) */
  name: string;

  /** Display name */
  displayName: string;

  /** Permission description */
  description?: string;

  /** Resource this permission applies to */
  resource: string;

  /** Action allowed (view, edit, delete, etc.) */
  action: string;

  /** Whether this is a system permission */
  isSystem: boolean;
}

/**
 * User profile
 *
 * Public user profile (safe to expose to other users).
 */
export interface UserProfile {
  /** Username */
  username: string;

  /** Display name */
  displayName: string;

  /** Email (may be hidden based on privacy settings) */
  email?: string;

  /** Avatar */
  avatar?: string;

  /** Roles (may be filtered based on permissions) */
  roles?: string[];

  /** Whether user is active */
  isActive: boolean;

  /** Account creation date */
  createdAt: string;

  /** Last login (may be hidden) */
  lastLogin?: string;
}
