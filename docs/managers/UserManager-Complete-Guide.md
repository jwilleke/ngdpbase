# UserManager Complete Guide

__Module:__ `src/managers/UserManager.js`
__Quick Reference:__ [UserManager.md](UserManager.md)
__Version:__ 1.3.2
__Last Updated:__ 2025-12-20

---

## Overview

The __UserManager__ handles user authentication, authorization, role management, and session management in ngdpbase. It provides a centralized system for managing user accounts, authenticating credentials, and determining user permissions through integration with the policy system.

### Key Features

- ✅ __Config-Driven:__ All settings loaded from ConfigurationManager (lowercase keys)
- ✅ __Role-Based Access Control (RBAC):__ Roles defined in config, permissions via policies
- ✅ __Policy Integration:__ Queries PolicyManager for actual permissions
- ✅ __Session Management:__ File-based session storage with expiration
- ✅ __External Authentication:__ Supports OAuth/JWT external users
- ✅ __Schema.org Integration:__ Auto-syncs users to Schema.org Person data
- ✅ __User Pages:__ Automatically creates user pages for new accounts

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
│ 4. Create Bootstrap Admin (only if no users exist)     │
│    - Reads ngdpbase.user.security.defaultpassword HERE, │
│      not at step 2: it is a bare env-ref and throws     │
│      when unset, which would stop every existing        │
│      install from booting                               │
│    - Username: admin                                    │
│    - Password: NGDPBASE_ADMIN_PASSWORD (no default)     │
│    - Role: admin                                        │
└─────────────────────────────────────────────────────────┘
```

### Permission Resolution Flow

`UserManager` takes no part in an access decision ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431)). A door asks its context (`ctx.hasPermission(action)`, or `ctx.canAccess(action, page)` for one page); the context asks the [PolicyDecisionPoint](../../src/security/PolicyDecisionPoint.ts), which runs the agent-token and share ceilings and then the access policies. A subject's current roles come from [PolicyInformationPoint](PolicyInformationPoint.md), which reads the account here and the membership from [RoleManager](RoleManager.md). See [Manager-SOT.md](Manager-SOT.md).

---

## Configuration

### User Storage Configuration

__Location:__ `config/app-default-config.json`

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
  "ngdpbase.user.security.defaultpassword": "$NGDPBASE_ADMIN_PASSWORD",
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

__Note:__ Custom roles can be added in `app-custom-config.json` and will be merged automatically by ConfigurationManager.

---

## Key Methods

### Authentication

#### `authenticateUser(username, password)`

Authenticates a user with username/password credentials.

__Parameters:__

- `username` (string) - Username
- `password` (string) - Plain text password

__Returns:__ User object with `isAuthenticated: true`, or `null` if invalid

__Example:__

```javascript
const user = await userManager.authenticateUser('admin', process.env.NGDPBASE_ADMIN_PASSWORD);
if (user) {
  console.log(`Authenticated: ${user.displayName}`);
}
```

__Features:__

- Verifies password using SHA-256 hash + salt
- Updates `lastLogin` and `loginCount`
- Returns user without password field
- Checks if user is active

---

### Authorization

None. `hasPermission`, `getUserPermissions`, `userHoldsPermission`, `requirePermissions` and `ensureAuthenticated` are gone (#1431 step 14). The decisions are `PolicyDecisionPoint.permits(subject, action)`, `getUserPermissions(username)` and `userHoldsPermission(username, action)`; a door asks its context instead.

### User Management

#### `createUser(userData)`

Creates a new user account.

__Parameters:__

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

__Returns:__ User object (without password)

__Example:__

```javascript
const newUser = await userManager.createUser({
  username: 'john',
  email: 'john@example.com',
  displayName: 'John Doe',
  password: 'secure123',
  roles: ['editor']
});
```

__Features:__

- Hashes password with configurable salt
- Checks for username/display name conflicts
- Auto-detects user locale from Accept-Language header
- Creates user page automatically
- Syncs to Schema.org Person data

---

#### `updateUser(username, updates)`

Updates user information.

__Parameters:__

- `username` (string) - Username to update
- `updates` (object) - Fields to update

__Example:__

```javascript
await userManager.updateUser('john', {
  displayName: 'John Smith',
  roles: ['editor', 'admin']
});
```

__Features:__

- Cannot change password for external OAuth users
- Syncs changes to Schema.org data
- Auto-hashes password if updated

---

#### `deleteUser(username)`

Deletes a user account.

__Parameters:__

- `username` (string) - Username to delete

__Example:__

```javascript
await userManager.deleteUser('olduser');
```

__Features:__

- Cannot delete system users
- Syncs deletion to Schema.org data
- Removes from users.json

---

### Role Management

The role and permission catalogues are not read through `UserManager` ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 11). They are declarations, owned by `ConfigurationManager`:

```javascript
const configManager = engine.getManager('ConfigurationManager');
const roles = configManager.getProperty('ngdpbase.roles.definitions', {});
const permissions = configManager.getProperty('ngdpbase.permissions.definitions', {});
```

---

Who holds which role is [RoleManager](RoleManager.md)'s ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 12): `resolveUserRoles`, `hasRole`, `assignRole` and `removeRole` live there.

```javascript
const roleManager = engine.getManager('RoleManager');
await roleManager.assignRole('john', 'editor', ctx);
```

---

### Session Management

#### `createSession(username, additionalData)`

Creates a new session for a user.

__Parameters:__

- `username` (string) - Username
- `additionalData` (object, optional) - Extra session data

__Returns:__ Session ID (string)

__Example:__

```javascript
const sessionId = await userManager.createSession('john', {
  ip: '192.168.1.100',
  userAgent: 'Mozilla/5.0...'
});
```

__Features:__

- Generates cryptographically random session ID
- Default expiration: 24 hours (configurable)
- Stored in sessions.json

---

#### `getSession(sessionId)`

Retrieves session data by ID.

__Parameters:__

- `sessionId` (string) - Session ID

__Returns:__ Session object or null

---

#### `deleteSession(sessionId)`

Deletes a session.

__Parameters:__

- `sessionId` (string) - Session ID to delete

---

#### `deleteUserSessions(username)`

Deletes all sessions for a user.

__Parameters:__

- `username` (string) - Username

---

### Helper Methods

The request's subject is built by [PolicyInformationPoint](PolicyInformationPoint.md) (`currentSubject(req)`, `anonymousSubject()`, `systemSubject()`), not by `UserManager` ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 13).

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

`roles` is __not__ part of the record. It was removed in #617 iteration 3b — role membership is owned by `RoleManager` as `OrganizationRole` records. Call `resolveUserRoles(username)`.

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

__Location:__ `./users/users.json` (configurable)

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

__Location:__ `./users/sessions.json` (configurable)

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

### PolicyDecisionPoint and PolicyInformationPoint

`UserManager` supplies the account (`getUser`) that the PIP builds a subject from; it asks neither for a decision. `PolicyManager` no longer exists — the policies are read live through `ConfigurationManager` ([PolicyManager.md](PolicyManager.md)).

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

#### Removed role methods

`createRole()`, `deleteRole()` and `updateRolePermissions()` are gone ([#1216](https://github.com/jwilleke/ngdpbase/issues/1216)); they only ever threw. There is no API to change a role: roles are edited in Configuration, as `ngdpbase.roles.definitions`, and what a role may do in `ngdpbase.access.policies`. Both are read live, so a change applies at once. `/admin/roles` is read-only.

#### ✅ New Behavior

- All configuration keys are now __lowercase__ (`ngdpbase.user.provider.storagedir`)
- Roles loaded from `ngdpbase.roles.definitions` in config
- Permissions derived from the access policies (not hardcoded in roles)
- Custom roles added via `app-custom-config.json` (auto-merged by ConfigurationManager)

---

## Best Practices

### 1. Use Policy-Based Permissions

❌ __Don't__ hardcode permissions in roles:

```javascript
// Old way - NO LONGER SUPPORTED
role.permissions = ['page:read', 'page:edit'];
```

✅ __Do__ define permissions via policies:

```json
{
  "id": "editor-permissions",
  "effect": "allow",
  "subjects": [{"type": "role", "value": "editor"}],
  "actions": ["page:read", "page:edit", "page:create"]
}
```

### 2. Add Custom Roles in Config

There is no role API. Add the role to `app-custom-config.json` (or in Configuration):

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

### 3. Ask the context, never UserManager

```javascript
if (await ctx.hasPermission('page-edit')) {
  // Allow edit
}
```

For a UI listing of what a user's roles give them, the PDP's `getUserPermissions(username)`.

### 4. Handle External Users

✅ __Create OAuth users properly:__

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

__Cause:__ ConfigurationManager not initialized before UserManager

__Solution:__ Ensure ConfigurationManager is registered first in WikiEngine

---

### Issue: User can't perform expected action

__Cause:__ No matching policy for user's roles

__Solution:__

1. Check the user's roles: `engine.getManager('RoleManager').resolveUserRoles(username)`
2. Check the policies in force: `ngdpbase.access.policies` in Configuration (and `ngdpbase.access.policies.enabled`)
3. Verify policy subjects match the user's roles
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

__Maintained By:__ Development Team
__Status:__ Active Development
