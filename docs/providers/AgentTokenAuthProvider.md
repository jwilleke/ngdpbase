---
name: AgentTokenAuthProvider
description: 'Verifies a user-delegated agent API token presented on the Authorization header (Bearer scheme)'
dateModified: '2026-07-25'
category: providers
code: src/providers/AgentTokenAuthProvider.ts
---

# AgentTokenAuthProvider

Authenticates non-browser/API requests by verifying a __user-delegated agent token__ presented on the `Authorization: Bearer <token>` header (#946). Counterpart to [AuthentikBearerAuthProvider](AuthentikBearerAuthProvider.md), but with __no external identity provider__: the credential is minted in-app by the user it belongs to.

A token is a delegation of its owner's own authority — __it can never do anything its owner could not already do.__

## Configuration

- `ngdpbase.auth.agent-token.enabled` = `true` (default `false`)
- `ngdpbase.auth.agent-token.default-ttl-hours` — default lifetime (default `24`)
- `ngdpbase.auth.agent-token.max-ttl-hours` — ceiling a user may request (default `24`)
- `ngdpbase.auth.agent-token.max-per-user` — cap on live tokens per user (default `10`)
- `ngdpbase.auth.agent-token.retention-days` — how long dead records are kept before purge (default `30`)
- `ngdpbase.auth.agent-token.directory` — store location (default `./data/tokens`, resolved under `FAST_STORAGE`)

No further configuration is required — unlike `authentik-bearer`, there is no issuer, JWKS URL, or audience to set.

## Behaviour

- Hashes the presented token (SHA-256) and looks it up in [AgentTokenManager](../managers/AgentTokenManager.md)'s store. Rejects unknown, expired, and revoked tokens.
- Returns the token's __owner__ and its __scopes__. It deliberately returns no roles: permissions are resolved live from the owner's user record by the middleware, so a token never carries a snapshot of authority. Demoting or disabling the owner immediately weakens or kills every token they hold, with no revocation step.
- Wired by the stateless bearer middleware in `src/app.ts`: a valid token sets `req.userContext` (no session is created) and flags the request so CSRF is skipped — bearer auth is not cookie-based.
- Scopes ride on `req.userContext.viaToken`, which flows into every `WikiContext` the route handler builds, reaching both the ACL scope ceiling and the save path.

## Scope enforcement

`ACLManager.checkPagePermissionWithContext` applies the token's scopes as a __hard ceiling before every tier__:

```text
scope gate  → deny if action ∉ token scopes   ← this provider's contribution
tier 0      → private
tier 0.5    → author-lock
tier 1      → frontmatter audience/access
tier 2      → global policies
```

The ordering is load-bearing. Tier 1 overrides global policies and returns directly, so a scope check placed at tier 2 would never run on a page whose frontmatter grants the action.

`admin-*` scopes are refused at mint time — a token can never carry them, however privileged its owner.

## Coexistence with Authentik

The bearer middleware tries __each registered bearer-capable provider in turn__ and takes the first success. `agent-token` and `authentik-bearer` may both be enabled, either alone, or neither. Before #946 the middleware hardcoded `authentik-bearer` and would never have consulted a second provider.

## See also

- [AgentTokenManager](../managers/AgentTokenManager.md) — the store, minting, and revocation
- [AuthentikBearerAuthProvider](AuthentikBearerAuthProvider.md) — the external-IdP alternative
- [Agent Ingest API](../Agent-Ingest-API.md) — the endpoint these tokens were built for
