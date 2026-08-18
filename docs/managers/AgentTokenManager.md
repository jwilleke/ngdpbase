---
name: AgentTokenManager
description: 'Mints, verifies and revokes user-delegated agent API tokens'
dateModified: '2026-07-25'
category: managers
code: src/managers/AgentTokenManager.ts
---

# AgentTokenManager

Owns the store for __user-delegated agent API tokens__ (#946). A user mints a short-lived bearer credential for themselves and hands it to an agent; the token delegates that user's own authority and can never exceed it.

Verification is exposed through [AgentTokenAuthProvider](../providers/AgentTokenAuthProvider.md) — routes call `AuthManager`, never this manager directly, for authentication.

## Store

`<FAST_STORAGE>/tokens/agent-tokens.json` — a map keyed by token id, matching the map-not-array convention of `users.json`, with `agent-tokens.json.backup-<timestamp>` siblings written on each change.

`FAST_STORAGE` is correct per the deployment split (sessions, logs, users, config) rather than `SLOW_STORAGE` (pages, attachments, backups). On deployments where those are separate volumes, tokens belong with sessions and users.

A record:

```jsonc
{
  "tok_a1b2c3d4": {
    "id": "tok_a1b2c3d4",
    "owner": "jim",                 // joined to the user record at lookup time
    "name": "claude-laptop",
    "hash": "sha256:9f4f5f76…",     // never the cleartext
    "prefix": "ngdp_at_7Kq2",       // display handle for listings
    "scopes": ["page-ingest"],
    "createdAt": "2026-07-25T14:32:11Z",
    "expiresAt": "2026-07-26T14:32:11Z",
    "lastUsedAt": "2026-07-25T18:04:02Z",
    "revokedAt": null,
    "revokedBy": null
  }
}
```

`owner` is a __reference, not a copy of the user's roles.__ That is what makes permissions resolve live — demoting or disabling a user immediately weakens every token they hold.

## Design decisions

- __Opaque, not JWT.__ A 24-hour credential must be revocable *before* it expires; a self-signed JWT cannot be withdrawn.
- __SHA-256, not bcrypt/argon2.__ The token is 256 bits of uniform randomness, so there is no dictionary to attack and no work factor is warranted. bcrypt would only add per-request latency on an endpoint agents hammer. (Password hashing is a different problem — low-entropy human input.)
- __Persisted, not in-memory.__ [MagicLinkAuthProvider](../providers/MagicLinkAuthProvider.md)'s in-memory map suits its 15-minute TTL; at 24 hours a restart would silently invalidate every live token mid-run.
- __`ngdp_at_` prefix__ makes a leaked token greppable and lets secret scanners pattern-match it.
- __A corrupt store throws rather than starting empty__ — silently becoming an empty map would revoke every live token with no signal.

## API

| Method | Purpose |
|---|---|
| `mint(owner, name, scopes, ttlHours?)` | Returns `{ token, record }`. The cleartext is returned __once__ and never persisted. |
| `verify(token)` | Returns the record, or `null` for unknown/expired/revoked. Stamps `lastUsedAt`. |
| `listForOwner(owner)` | That owner's live tokens, without hashes. |
| `listAll()` | Every live token — admin oversight. |
| `revoke(id, byUsername)` | Effective immediately; `verify()` reads the store per request, so there is no cache to wait out. |
| `purgeExpired()` | Drops dead records past `retention-days`. Audit records are unaffected. |

### Mint-time rules

- An __unscoped token is rejected__, never treated as unrestricted.
- __`admin-*` scopes are refused outright__ — a token can never carry them, however privileged its owner. This is a refusal, not a warning: warnings get clicked through.
- TTL above `max-ttl-hours` is rejected; the max defaults equal to the default so nothing longer-lived can be minted without an operator raising the ceiling.
- The per-user cap counts __live__ tokens only — revoking one frees a slot.

## HTTP surface

- `GET /api/tokens` — the caller's tokens; `?all=true` lists everyone's (admin only)
- `POST /api/tokens` — mint __for the caller__; an admin cannot mint on another user's behalf, so a token always traces to someone who chose to delegate
- `DELETE /api/tokens/:id` — owner or admin. A non-owner without admin gets `404`, not `403`, so the existence of another user's token is not confirmed.

## See also

- [AgentTokenAuthProvider](../providers/AgentTokenAuthProvider.md) — verification and scope enforcement
- [Agent Ingest API](../Agent-Ingest-API.md) — the endpoint these tokens were built for
