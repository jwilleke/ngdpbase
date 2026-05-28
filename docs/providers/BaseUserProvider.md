---
name: BaseUserProvider
description: Abstract user/session storage provider — extension surface for user backends (file, LDAP, IdP, etc.)
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseUserProvider.ts
---

# BaseUserProvider

Abstract contract for storing + retrieving user accounts and session state. `UserManager` delegates user CRUD + session management to the configured provider.

Authentication and user storage are deliberately separate: this provider holds the user records (username, email, preferences, role assignments, password hash); the auth provider chain ([BaseAuthProvider](BaseAuthProvider.md)) handles the credential challenge/verify.

## Implementations

- [FileUserProvider](FileUserProvider.md) — JSON file on local disk (default)

## Contract (high level)

| Method | Purpose |
|---|---|
| `getUser(username)` | Load full user record |
| `getAllUsers()` | Enumerate |
| `createUser(user)` / `updateUser(username, patch)` / `deleteUser(username)` | CRUD |
| `getSession(sessionId)` / `createSession(...)` / `destroySession(sessionId)` | Session storage |
| `backup()` / `restore(data)` | Bulk export/import for backup workflows |
| `getProviderInfo()` | Diagnostics + feature flags |

## See Also

- `src/managers/UserManager.ts` — consumer
- [BaseAuthProvider](BaseAuthProvider.md) — credential-side counterpart
- `src/types/index.ts` — `User`, `UserUpdateData`, `UserSession`
