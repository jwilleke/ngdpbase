---
name: CloudflareAccessAuthProvider
description: Trusts the `cf-access-jwt-assertion` header when the instance sits behind Cloudflare Access
dateModified: '2026-05-28'
category: providers
code: src/providers/CloudflareAccessAuthProvider.ts
---

# CloudflareAccessAuthProvider

Authenticates requests by verifying the `cf-access-jwt-assertion` header set by Cloudflare Access (Zero Trust). Use when ngdpbase sits behind a Cloudflare Access policy and the operator wants to trust that gating as the identity source.

## Configuration

- `ngdpbase.auth.cloudflare-access.enabled` = `true`
- `ngdpbase.auth.cloudflare-access.team-domain` — the team's `.cloudflareaccess.com` subdomain
- `ngdpbase.auth.cloudflare-access.audience` — the AUD tag from the Cloudflare Access application

## Behaviour

- Verifies the JWT signature against Cloudflare's public keys (refreshed per Cloudflare's recommendations).
- Maps the JWT's `email` / `identity` claim to an ngdpbase user.
- Auto-creates a user record on first login if `ngdpbase.auth.cloudflare-access.auto-provision` is enabled.

## See Also

- [BaseAuthProvider](BaseAuthProvider.md) — the contract
- [AuthManager](../managers/AuthManager.md) — dispatcher
- Cloudflare Access documentation
