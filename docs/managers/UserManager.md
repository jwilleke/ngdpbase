---
name: UserManager
description: "User CRUD, sessions, authentication, profile-page binding, contact-recipient resolution"
dateModified: '2026-05-14'
category: managers
code: src/managers/UserManager.ts
---

# UserManager

**Module:** `src/managers/UserManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [UserManager-Complete-Guide.md](UserManager-Complete-Guide.md)

---

## Overview

UserManager handles user authentication, authorization, role management, and session management. It provides a centralized system for managing user accounts with policy-based permissions through integration with PolicyManager.

## Key Features

- **Policy-Based Permissions** - Permissions via PolicyManager, not hardcoded
- **Role-Based Access Control** - Roles defined in configuration
- **Session Management** - File-based sessions with expiration
- **External Authentication** - OAuth/JWT support for external users
- **Schema.org Integration** - Auto-syncs users to Person data
- **User Pages** - Automatic user page creation

## Quick Example

```javascript
const userManager = engine.getManager('UserManager');

// Authenticate
const user = await userManager.authenticateUser('admin', 'password');

// Check permission
const canEdit = await userManager.hasPermission('john', 'page:edit');

// Get user permissions
const permissions = userManager.getUserPermissions('john');

// Create user
const newUser = await userManager.createUser({
  username: 'john',
  email: 'john@example.com',
  password: 'secure123',
  roles: ['editor']
});

// Create session
const sessionId = await userManager.createSession('john');
```

## Authentication Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `authenticateUser(username, password)` | `User\|null` | Authenticate credentials |
| `createSession(username, data)` | `string` | Create session, return ID |
| `getSession(sessionId)` | `Object\|null` | Get session data |
| `deleteSession(sessionId)` | `void` | Delete session |
| `deleteUserSessions(username)` | `void` | Delete all user sessions |

## Authorization Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `hasPermission(username, action)` | `Promise<boolean>` | Check permission via policies |
| `getUserPermissions(username)` | `string[]` | Get all effective permissions |
| `getCurrentUser(req)` | `Object` | Get user context from request |

## User Management Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `createUser(userData)` | `User` | Create new user |
| `updateUser(username, updates)` | `User` | Update user info |
| `deleteUser(username)` | `void` | Delete user |
| `getUser(username)` | `User\|null` | Get user by username |
| `getAllUsers()` | `User[]` | Get all users |

## Role Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getRole(roleName)` | `Role\|null` | Get role metadata |
| `getRoles()` | `Role[]` | Get all role definitions |
| `assignRole(username, role)` | `void` | Assign role to user |
| `removeRole(username, role)` | `void` | Remove role from user |

## Built-in Roles

| Role | Added For | Purpose |
| ------ | ----------- | --------- |
| `All` | Everyone | Universal role (including anonymous) |
| `Authenticated` | Logged-in users | Any authenticated user |
| `Anonymous` | No session | Public access |

## Configuration

```json
{
  "ngdpbase.user.enabled": true,
  "ngdpbase.user.provider": "jsonuserprovider",
  "ngdpbase.user.provider.storagedir": "./users",
  "ngdpbase.user.security.passwordsalt": "ngdpbase-salt",
  "ngdpbase.user.security.sessionexpiration": 86400000,
  "ngdpbase.roles.definitions": {
    "admin": { "name": "admin", "displayname": "Administrator" },
    "editor": { "name": "editor", "displayname": "Editor" }
  }
}
```

## User Object Structure

```javascript
{
  username: "john",
  email: "john@example.com",
  displayName: "John Doe",
  roles: ["editor"],
  isActive: true,
  isExternal: false,  // true for OAuth users
  createdAt: "2025-10-11T12:00:00.000Z",
  lastLogin: "2025-10-11T14:30:00.000Z"
}
```

## Related Managers

- [PolicyManager](PolicyManager.md) - Policy definitions
- [PolicyEvaluator](PolicyEvaluator.md) - Permission evaluation
- [SchemaManager](SchemaManager.md) - Schema.org Person sync
- [PageManager](PageManager.md) - User page creation

## Developer Documentation

For complete API reference, authentication flows, and troubleshooting:

- [UserManager-Complete-Guide.md](UserManager-Complete-Guide.md)
