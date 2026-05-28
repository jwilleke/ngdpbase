---
name: PasswordAuthProvider
description: Username + password authentication with bcrypt-hashed passwords stored in the user record
dateModified: '2026-05-28'
category: providers
code: src/providers/PasswordAuthProvider.ts
---

# PasswordAuthProvider

Classic username + password authentication. Passwords are stored as bcrypt hashes on the user record (handled by [UserManager](../managers/UserManager.md) + [BaseUserProvider](BaseUserProvider.md)). Always registered with [AuthManager](../managers/AuthManager.md) as the first / fallback provider.

## Configuration

- Always enabled
- `ngdpbase.auth.password.bcrypt-cost` — hash cost (default 12)

## Flow

1. **Initiate** — caller passes `{username, password}`. Provider:
   - Loads the user record
   - Verifies the candidate password against the stored bcrypt hash
   - Returns success → AuthManager creates the session, or failure with a generic "invalid credentials" message

The flow is single-step (no challenge state) — `initiate` resolves to a completed result; `verify` is unused.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [BaseUserProvider](BaseUserProvider.md) — where the hash is stored
