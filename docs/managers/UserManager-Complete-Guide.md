# UserManager Complete Guide

**Module:** `src/managers/UserManager.js`
**Quick Reference:** [UserManager.md](UserManager.md)
**Version:** 1.3.2
**Last Updated:** 2025-12-20

---

## Overview

The **UserManager** handles user authentication, authorization, role management, and session management in ngdpbase. It provides a centralized system for managing user accounts, authenticating credentials, and determining user permissions through integration with the policy system.

### Key Features

- ✅ **Config-Driven:** All settings loaded from ConfigurationManager (lowercase keys)
- ✅ **Role-Based Access Control (RBAC):** Roles defined in config, permissions via policies
- ✅ **Policy Integration:** Queries PolicyManager for actual permissions
- ✅ **Session Management:** File-based session storage with expiration
- ✅ **External Authentication:** Supports OAuth/JWT external users
- ✅ **Schema.org Integration:** Auto-syncs users to Schema.org Person data
- ✅ **User Pages:** Automatically creates user pages for new accounts

---

## Architecture

### Initialization Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. UserManager.initialize()                             │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Load Configuration (ALL LOWERCASE)                   │
│    - ConfigurationManager.getProperty()                 │
│    - ngdpbase.user.provider.storagedir                   │
│    - ngdpbase.user.security.passwordsalt                 │
│    - ngdpbase.user.security.defaultpassword              │
│    - ngdpbase.user.defaults.timezone                     │
│    - ngdpbase.roles.definitions (role metadata)          │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Load Data                                            │
│    - loadUsers() from users.json                        │
│    - loadSessions() from sessions.json                  │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Create Default Admin (if no users exist)            │
│    - Username: admin                                    │
│    - Password: from config (default: admin123)          │
│    - Role: admin                                        │
└─────────────────────────────────────────────────────────┘
```

### Permission Resolution Flow

```
┌────────────────────────────────────────────────────────┐
│ User requests action (e.g., "edit page")               │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ UserManager.hasPermission(username, action)            │
│ - Builds userContext with roles                        │
│ - Adds built-in roles: All, Authenticated              │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ PolicyEvaluator.evaluateAccess(context)                │
│ - Gets policies from PolicyManager                     │
│ - Matches user roles against policy subjects           │
│ - Returns allow/deny decision                          │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ Return true/false to caller                            │
└────────────────────────────────────────────────────────┘
```

---

## Configuration

### User Storage Configuration

**Location:** `config/app-default-config.json`

```json
{
  "_comment_user_storage": "User authentication and storage configuration (ALL LOWERCASE)",
  "ngdpbase.user.enabled": true,
  "ngdpbase.user.provider.default": "jsonuserprovider",
  "ngdpbase.user.provider": "jsonuserprovider",
  "ngdpbase.user.provider.storagedir": "./users",
  "ngdpbase.user.provider.files.users": "users.json",
  "ngdpbase.user.provider.files.sessions": "sessions.json"
}
```

### Security Configuration

```json
{
  "_comment_user_security": "User security settings (ALL LOWERCASE)",
  "ngdpbase.user.security.passwordsalt": "ngdpbase-salt",
  "ngdpbase.user.security.defaultpassword": "admin123",
  "ngdpbase.user.security.sessionexpiration": 86400000
}
```

### Default User Settings

```json
{
  "_comment_user_defaults": "Default user settings (ALL LOWERCASE)",
  "ngdpbase.user.defaults.timezone": "utc",
  "ngdpbase.user.defaults.locale": "en-us",
  "ngdpbase.user.defaults.theme": "light"
}
```

### Role Definitions

```json
{
  "_comment_roles": "Role definitions - metadata only, permissions defined via policies",
  "ngdpbase.roles.definitions": {
    "admin": {
      "name": "admin",
      "displayname": "Administrator",
      "description": "Full system access to all features",
      "issystem": true,
      "icon": "shield-alt",
      "color": "#dc3545"
    },
    "editor": {
      "name": "editor",
      "displayname": "Editor",
      "description": "Can create, edit, delete, and rename pages",
      "issystem": true,
      "icon": "edit",
      "color": "#007bff"
    }
  }
}
```

**Note:** Custom roles can be added in `app-custom-config.json` and will be merged automatically by ConfigurationManager.

---

## Key Methods

### Authentication

#### `authenticateUser(username, password)`

Authenticates a user with username/password credentials.

**Parameters:**

- `username` (string) - Username
- `password` (string) - Plain text password

**Returns:** User object with `isAuthenticated: true`, or `null` if invalid

**Example:**

```javascript
const user = await userManager.authenticateUser('admin', 'admin123');
if (user) {
  console.log(`Authenticated: ${user.displayName}`);
}
```

**Features:**

- Verifies password using SHA-256 hash + salt
- Updates `lastLogin` and `loginCount`
- Returns user without password field
- Checks if user is active

---

### Authorization

#### `hasPermission(username, action)`

Checks if user has permission to perform an action using policy-based access control.

**Parameters:**

- `username` (string) - Username (null for anonymous)
- `action` (string) - Action to check (e.g., 'page:create', 'admin:users')

**Returns:** `Promise<boolean>` - True if user has permission

**Example:**

```javascript
const canEdit = await userManager.hasPermission('editor', 'page:edit');
if (canEdit) {
  console.log('User can edit pages');
}
```

**User Context:**

- Anonymous: `roles: ['anonymous', 'All']`
- Asserted: `roles: ['reader', 'All']`
- Authenticated: `roles: [user.roles, 'Authenticated', 'All']`

---

#### `getUserPermissions(username)`

Gets all effective permissions for a user by querying PolicyManager.

**Parameters:**

- `username` (string) - Username (null for anonymous)

**Returns:** `Array<string>` - Array of permission strings

**Example:**

```javascript
const permissions = userManager.getUserPermissions('admin');
// Returns: ['page:read', 'page:edit', 'page:create', 'admin:users', ...]
```

**How It Works:**

1. Queries PolicyManager for all policies
2. Builds user's role list (including built-in roles)
3. Collects all actions from matching 'allow' policies
4. Returns unique set of permissions

---

### User Management

#### `createUser(userData)`

Creates a new user account.

**Parameters:**

- `userData` (object):
  - `username` (string, required) - Unique username
  - `email` (string, required) - Email address
  - `displayName` (string, optional) - Display name
  - `password` (string, required for local users)
  - `roles` (array, default: ['reader']) - Initial roles, applied through `RoleManager`
  - `isActive` (boolean, default: true) - Whether the account may sign in
  - `isExternal` (boolean, default: false) - Identity owned by an external provider; the stored hash is empty and no password will ever match
  - `profileLocked` (boolean, default: false) - Freeze password, email and display name against self-service change; for shared accounts whose credentials are published (#1029)
  - `acceptLanguage` (string, optional) - Browser language

**Returns:** User object (without password)

**Example:**

```javascript
const newUser = await userManager.createUser({
  username: 'john',
  email: 'john@example.com',
  displayName: 'John Doe',
  password: 'secure123',
  roles: ['editor']
});
```

**Features:**

- Hashes password with configurable salt
- Checks for username/display name conflicts
- Auto-detects user locale from Accept-Language header
- Creates user page automatically
- Syncs to Schema.org Person data

---

#### `updateUser(username, updates)`

Updates user information.

**Parameters:**

- `username` (string) - Username to update
- `updates` (object) - Fields to update

**Example:**

```javascript
await userManager.updateUser('john', {
  displayName: 'John Smith',
  roles: ['editor', 'admin']
});
```

**Features:**

- Cannot change password for external OAuth users
- Syncs changes to Schema.org data
- Auto-hashes password if updated

---

#### `deleteUser(username)`

Deletes a user account.

**Parameters:**

- `username` (string) - Username to delete

**Example:**

```javascript
await userManager.deleteUser('olduser');
```

**Features:**

- Cannot delete system users
- Syncs deletion to Schema.org data
- Removes from users.json

---

### Role Management

#### `getRole(roleName)`

Gets role metadata by name.

**Parameters:**

- `roleName` (string) - Role name

**Returns:** Role object or null

**Example:**

```javascript
const adminRole = userManager.getRole('admin');
console.log(adminRole.displayname); // "Administrator"
```

---

#### `getRoles()`

Gets all role definitions.

**Returns:** Array of role objects

**Example:**

```javascript
const roles = userManager.getRoles();
// Returns: [{ name: 'admin', displayname: 'Administrator', ... }, ...]
```

---

#### `assignRole(username, roleName)`

Assigns a role to a user.

**Parameters:**

- `username` (string) - Username
- `roleName` (string) - Role name to assign

**Example:**

```javascript
await userManager.assignRole('john', 'editor');
```

---

#### `removeRole(username, roleName)`

Removes a role from a user.

**Parameters:**

- `username` (string) - Username
- `roleName` (string) - Role name to remove

**Example:**

```javascript
await userManager.removeRole('john', 'contributor');
```

---

### Session Management

#### `createSession(username, additionalData)`

Creates a new session for a user.

**Parameters:**

- `username` (string) - Username
- `additionalData` (object, optional) - Extra session data

**Returns:** Session ID (string)

**Example:**

```javascript
const sessionId = await userManager.createSession('john', {
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0...'
});
```

**Features:**

- Generates cryptographically random session ID
- Default expiration: 24 hours (configurable)
- Stored in sessions.json

---

#### `getSession(sessionId)`

Retrieves session data by ID.

**Parameters:**

- `sessionId` (string) - Session ID

**Returns:** Session object or null

---

#### `deleteSession(sessionId)`

Deletes a session.

**Parameters:**

- `sessionId` (string) - Session ID to delete

---

#### `deleteUserSessions(username)`

Deletes all sessions for a user.

**Parameters:**

- `username` (string) - Username

---

### Helper Methods

#### `getCurrentUser(req)`

Gets the current user context from the request session.

**Parameters:**

- `req` (object) - Express request object

**Returns:** User context object with roles and authentication status

**Example:**

```javascript
const currentUser = await userManager.getCurrentUser(req);
console.log(currentUser.username); // "john"
console.log(currentUser.roles); // ["editor", "Authenticated", "All"]
```

---

## Data Structures

### User record

The `User` interface in `src/types/User.ts` is authoritative; this is an illustration.

```javascript
{
  username: "john",
  email: "john@example.com",
  displayName: "John Doe",
  password: "hashed_password", // SHA-256 of password + salt; "" when isExternal
  isActive: true,
  isSystem: false,
  isExternal: false,
  profileLocked: undefined,    // omitted unless the account is locked
  profilePage: "John Doe",
  allowedAuthMethods: undefined, // e.g. ["password"] to pin an emergency fallback
  createdAt: "2025-10-11T12:00:00.000Z",
  lastLogin: "2025-10-11T14:30:00.000Z",
  loginCount: 15,
  preferences: {
    locale: "en-US",
    dateFormat: "MM/DD/YYYY",
    timeFormat: "12h",
    timezone: "UTC"
  }
}
```

`roles` is **not** part of the record. It was removed in #617 iteration 3b — role membership is owned by `RoleManager` as `OrganizationRole` records. Call `resolveUserRoles(username)`.

#### Account flags

| Flag | Meaning | Enforced at |
|---|---|---|
| `isActive` | Account may sign in | Authentication |
| `isSystem` | Account cannot be deleted — nothing more | `deleteUser` |
| `isExternal` | Identity owned by an external provider; empty hash, no password can match | Password paths |
| `profileLocked` | Password, email and display name frozen against self-service change (#1029) | `POST /profile` |

Independent by design — none implies another, and none restricts an administrator. `isSystem` in particular is set on `admin`, which must keep self-service password change, so it can never come to mean "immutable". `profileLocked` covers email specifically because magic-link login resolves accounts by address: a shared account without it can be taken over by repointing the email, whatever its password.

See [UserManager.md](UserManager.md#account-flags) for the fuller rationale.

### Role Object

```json
{
  "name": "editor",
  "displayname": "Editor",
  "description": "Can create, edit, delete, and rename pages",
  "issystem": true,
  "icon": "edit",
  "color": "#007bff"
}
```

### Session Object

```javascript
{
  id: "a1b2c3d4e5f6...",
  username: "john",
  expiresAt: "2025-10-12T12:00:00.000Z",
  // Additional custom data
}
```

---

## Built-in Roles

UserManager automatically adds built-in roles to user contexts:

| Role | Added For | Purpose |
| ------ | ----------- | --------- |
| `All` | Everyone | Universal role for all users (including anonymous) |
| `Authenticated` | Logged-in users | Role for any authenticated user |
| `Anonymous` | No session | Public access without authentication |

These roles are added dynamically and never stored in user data.

---

## File Storage

### users.json

**Location:** `./users/users.json` (configurable)

```json
{
  "admin": {
    "username": "admin",
    "email": "admin@localhost",
    "displayName": "Administrator",
    "password": "hashed...",
    "roles": ["admin"],
    "isActive": true,
    "isSystem": true,
    "isExternal": false,
    "createdAt": "2025-10-11T12:00:00.000Z",
    "lastLogin": null,
    "loginCount": 0,
    "preferences": {}
  }
}
```

### sessions.json

**Location:** `./users/sessions.json` (configurable)

```json
{
  "session-id-here": {
    "id": "session-id-here",
    "username": "john",
    "expiresAt": "2025-10-12T12:00:00.000Z"
  }
}
```

---

## Integration with Other Managers

### PolicyManager

UserManager queries PolicyManager to get role permissions:

```javascript
const policyManager = this.engine.getManager('PolicyManager');
const policies = policyManager.getAllPolicies();
// Match user roles against policy subjects
```

### PolicyEvaluator

UserManager uses PolicyEvaluator for access decisions:

```javascript
const policyEvaluator = this.engine.getManager('PolicyEvaluator');
const result = await policyEvaluator.evaluateAccess({
  pageName: '*',
  action: 'page:create',
  userContext: {
    username: 'john',
    roles: ['editor', 'Authenticated', 'All'],
    isAuthenticated: true
  }
});
```

### SchemaManager

UserManager syncs user data to Schema.org:

```javascript
const schemaManager = this.engine.getManager('SchemaManager');
await schemaManager.createPerson(personData);
await schemaManager.updatePerson(username, updateData);
await schemaManager.deletePerson(username);
```

### PageManager

UserManager creates user pages for new accounts:

```javascript
const pageManager = this.engine.getManager('PageManager');
await pageManager.savePage(user.displayName, populatedContent, metadata, user);
```

---

## Migration Notes

### Changes from v1.3.1 to v1.3.2

#### ✅ Removed Methods (Now Config-Driven)

- `initializeDefaultPermissions()` - Permissions now defined in policies
- `initializeDefaultRoles()` - Roles now loaded from config
- `loadRoles()` - Roles loaded in initialize() from config
- `saveRoles()` - Roles managed in config files

#### ⚠️ Deprecated Methods

These methods now throw errors with migration instructions:

- `createRole(roleData)` - Add roles to `app-custom-config.json` instead
- `deleteRole(roleName)` - Remove from config files instead
- `updateRolePermissions(roleName, updates)` - Use policies in config instead

#### ✅ New Behavior

- All configuration keys are now **lowercase** (`ngdpbase.user.provider.storagedir`)
- Roles loaded from `ngdpbase.roles.definitions` in config
- Permissions queried from PolicyManager (not hardcoded in roles)
- Custom roles added via `app-custom-config.json` (auto-merged by ConfigurationManager)

---

## Best Practices

### 1. Use Policy-Based Permissions

❌ **Don't** hardcode permissions in roles:

```javascript
// Old way - NO LONGER SUPPORTED
role.permissions = ['page:read', 'page:edit'];
```

✅ **Do** define permissions via policies:

```json
{
  "id": "editor-permissions",
  "effect": "allow",
  "subjects": [{"type": "role", "value": "editor"}],
  "actions": ["page:read", "page:edit", "page:create"]
}
```

### 2. Add Custom Roles in Config

❌ **Don't** use `createRole()`:

```javascript
// Deprecated - throws error
await userManager.createRole({ name: 'moderator', ... });
```

✅ **Do** add to `app-custom-config.json`:

```json
{
  "ngdpbase.roles.definitions": {
    "moderator": {
      "name": "moderator",
      "displayname": "Moderator",
      "description": "Reviews content",
      "issystem": false
    }
  }
}
```

### 3. Check Permissions with Policy System

✅ **Use `hasPermission()` for access control:**

```javascript
if (await userManager.hasPermission(username, 'page:edit')) {
  // Allow edit
}
```

✅ **Use `getUserPermissions()` for UI rendering:**

```javascript
const permissions = userManager.getUserPermissions(username);
if (permissions.includes('admin:users')) {
  // Show admin menu
}
```

### 4. Handle External Users

✅ **Create OAuth users properly:**

```javascript
const user = await userManager.createOrUpdateExternalUser({
  username: 'john.google',
  email: 'john@gmail.com',
  displayName: 'John Doe',
  roles: ['reader'],
  provider: 'google'
});
```

---

## Security Considerations

### Password Hashing

- Uses SHA-256 with configurable salt
- Salt configured in `ngdpbase.user.security.passwordsalt`
- Never stores plain text passwords
- External OAuth users have `password: null`

### Session Security

- Sessions stored in file system (not in-memory)
- Configurable expiration (`ngdpbase.user.security.sessionexpiration`)
- Expired sessions auto-cleaned on load
- Cryptographically random session IDs (16 bytes)

### Permission Checks

- All permissions checked through PolicyEvaluator
- No hardcoded permission lists
- Policy priority system prevents conflicts
- Default deny policy when no match

---

## Troubleshooting

### Issue: "UserManager requires ConfigurationManager"

**Cause:** ConfigurationManager not initialized before UserManager

**Solution:** Ensure ConfigurationManager is registered first in WikiEngine

---

### Issue: "PolicyManager not available, returning empty permissions"

**Cause:** PolicyManager not initialized or disabled

**Solution:** Check `ngdpbase.access.policies.enabled` is `true` in config

---

### Issue: User can't perform expected action

**Cause:** No matching policy for user's roles

**Solution:**

1. Check user's roles: `userManager.getUser(username).roles`
2. Check available policies: `policyManager.getAllPolicies()`
3. Verify policy subjects match user's roles
4. Check policy priority order

---

## Related Documentation

- [PolicyManager Documentation](./PolicyManager-Documentation.md)
- [PolicyEvaluator Documentation](./PolicyEvaluator-Documentation.md)
- [PolicyValidator Documentation](./PolicyValidator-Documentation.md)
- [ConfigurationManager Documentation](./ConfigurationManager-Documentation.md)
- [Configuration Refactoring Plan](../architecture/Configuration-Refactoring-Plan.md)
- [Policies, Roles & Permissions](../architecture/Policies-Roles-Permissions.md)

---

## Changelog

### v1.3.2 (2025-10-11)

- ✅ Refactored to use ConfigurationManager for all settings
- ✅ All configuration keys now lowercase
- ✅ Roles loaded from config (`ngdpbase.roles.definitions`)
- ✅ Permissions queried from PolicyManager
- ❌ Removed hardcoded role/permission initialization
- ⚠️ Deprecated `createRole()`, `deleteRole()`, `updateRolePermissions()`
- ✅ Added `_getPermissionsFromPolicies()` helper method
- ✅ Updated `getUserPermissions()` to query PolicyManager

### v1.3.1 (2025-09-xx)

- Added Schema.org integration
- Added user page auto-creation
- Added external OAuth user support

---

**Maintained By:** Development Team
**Status:** Active Development
