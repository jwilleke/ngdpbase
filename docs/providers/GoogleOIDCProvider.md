---
name: GoogleOIDCProvider
description: OIDC authentication via Google as the identity provider
dateModified: '2026-05-28'
category: providers
code: src/providers/GoogleOIDCProvider.ts
---

# GoogleOIDCProvider

Authenticates users via Google's OpenID Connect endpoint. Handles the standard OIDC redirect flow: initiate sends the user to Google with a state nonce; verify exchanges the returned code for an ID token and maps the email to an ngdpbase user.

## Configuration

- `ngdpbase.auth.google-oidc.enabled` = `true`
- `ngdpbase.auth.google-oidc.client-id` — Google OAuth 2.0 client ID
- `ngdpbase.auth.google-oidc.client-secret` — client secret
- `ngdpbase.auth.google-oidc.allowed-domains` — restrict to specific Google Workspace domains (CSV, optional)
- `ngdpbase.auth.google-oidc.auto-provision` — create user records on first sign-in

The callback URL is derived from `ngdpbase.canonical-url` + `/auth/google/callback` (#642 Iteration 3).

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [PasswordAuthProvider](PasswordAuthProvider.md), [MagicLinkAuthProvider](MagicLinkAuthProvider.md), [CloudflareAccessAuthProvider](CloudflareAccessAuthProvider.md) — sibling providers
