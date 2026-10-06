---
name: GoogleOIDCProvider
description: OIDC authentication via Google as the identity provider
dateModified: '2026-10-06'
category: providers
code: src/providers/GoogleOIDCProvider.ts
---

# GoogleOIDCProvider

Authenticates users via Google's OpenID Connect endpoint. `POST /auth/oauth/google` starts the flow and sends the browser to Google; `GET /auth/oauth/google/callback` exchanges the returned code for an ID token and maps the email to an ngdpbase user.

## What each sign-in checks

- The callback comes back to the browser that started it. The `state` value is single-use and expires in 10 minutes, and an HTTP-only `ngdp_oauth_state` cookie set at the start must match at the callback, so an attacker's own sign-in cannot be finished in someone else's browser (login CSRF, #1630).
- PKCE (S256): only the challenge leaves the server; the code is exchanged with the verifier, as well as the client secret.
- The ID token's signature and audience are verified, and its `nonce` must be the one this sign-in sent.
- The email must be one Google reports as verified (`email_verified`).
- A Google sign-in never takes over an existing password account; only accounts created through an external provider match.

## Configuration

- `ngdpbase.auth.google-oidc.enabled` = `true`
- `ngdpbase.auth.google-oidc.client-id` — Google OAuth 2.0 client ID
- `ngdpbase.auth.google-oidc.client-secret` — client secret
- `ngdpbase.auth.google-oidc.callback-url` — the redirect URI registered with Google, ending in `/auth/oauth/google/callback`
- `ngdpbase.auth.google-oidc.hd` — restrict to one Google Workspace domain (optional)
- `ngdpbase.auth.google-oidc.auto-provision` — create an account on first sign-in (still refused when `ngdpbase.application.registration` is false)
- `ngdpbase.auth.google-oidc.default-roles` — roles for an auto-provisioned account
- `ngdpbase.auth.google-oidc.deny-redirect` — where a refused sign-in is sent

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [PasswordAuthProvider](PasswordAuthProvider.md), [MagicLinkAuthProvider](MagicLinkAuthProvider.md), [CloudflareAccessAuthProvider](CloudflareAccessAuthProvider.md) — sibling providers
