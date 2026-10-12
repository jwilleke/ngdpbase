---
name: PasswordAuthProvider
description: Username + password authentication with scrypt-hashed passwords stored in the user record
dateModified: '2026-05-28'
category: providers
code: src/providers/PasswordAuthProvider.ts
---

# PasswordAuthProvider

Classic username + password authentication. Passwords are stored as scrypt hashes with a per-account random salt (`scrypt$N$r$p$salt$hash`) on the user record (handled by [UserManager](../managers/UserManager.md) + [BaseUserProvider](BaseUserProvider.md)). Always registered with [AuthManager](../managers/AuthManager.md) as the first / fallback provider.

## Configuration

- Always enabled

## Flow

1. __Initiate__ — caller passes `{username, password}`. Provider:
   - Loads the user record
   - Verifies the candidate password against the stored hash (scrypt, or a pre-#1042 SHA-256 hash, which is upgraded to scrypt on the first successful check)
   - Returns success → AuthManager creates the session, or failure with a generic "invalid credentials" message

The flow is single-step (no challenge state) — `initiate` resolves to a completed result; `verify` is unused.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [BaseUserProvider](BaseUserProvider.md) — where the hash is stored
