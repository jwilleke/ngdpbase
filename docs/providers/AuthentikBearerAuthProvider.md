---
name: AuthentikBearerAuthProvider
description: 'Trusts an Authentik-issued OAuth/OIDC bearer JWT on the Authorization header (Bearer scheme)'
dateModified: '2026-06-16'
category: providers
code: src/providers/AuthentikBearerAuthProvider.ts
---

# AuthentikBearerAuthProvider

Authenticates non-browser/API requests by verifying an [Authentik](https://goauthentik.io/)-issued OAuth/OIDC bearer JWT presented on the `Authorization: Bearer <token>` header. Use when a headless client — e.g. an AI agent driving `POST /api/page/ingest` (#819) — must authenticate without an interactive login.

Unlike the interactive [GoogleOIDCProvider](GoogleOIDCProvider.md) code-exchange flow, this provider trusts a token the client already holds (typically minted via the `client_credentials` grant against a per-person Authentik service account). It is verification-only — ngdpbase stores __no__ client secret; only the issuer, JWKS URL, and audience are needed. The pattern mirrors [CloudflareAccessAuthProvider](CloudflareAccessAuthProvider.md).

## Configuration

- `ngdpbase.auth.authentik-bearer.enabled` = `true`
- `ngdpbase.auth.authentik-bearer.issuer` — OIDC issuer, e.g. `https://auth.nerdsbythehour.com/application/o/ngdpbase/`
- `ngdpbase.auth.authentik-bearer.jwks-url` — JWKS URI, e.g. `<issuer>jwks/`
- `ngdpbase.auth.authentik-bearer.audience` — expected audience (the Authentik provider's client-id)
- `ngdpbase.auth.authentik-bearer.default-role` — role for JIT-provisioned users (default `occupant`)
- `ngdpbase.auth.authentik-bearer.group-map` — map of Authentik group name → ngdpbase role

All of issuer, jwks-url, and audience must be set or the provider is not registered.

## Behaviour

- Verifies the JWT signature against the configured JWKS (`jose.createRemoteJWKSet`), and checks `iss` + `aud`.
- Coordinates the token's `email` claim to an existing ngdpbase user (so pages are authored under that account); JIT-provisions an external user on first use, mapping `groups[]` to roles.
- Wired by stateless request-time middleware in `src/app.ts`: a valid token sets `req.userContext` directly (no session is created) and flags the request so CSRF is skipped (bearer auth is not cookie-based).

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- [CloudflareAccessAuthProvider](CloudflareAccessAuthProvider.md) — the sibling header-JWT-trust provider
