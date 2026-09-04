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

`<FAST_STORAGE>/tokens/agent-tokens.json` — a map keyed by token id, matching the map-not-array convention of `users.json`. Writes are atomic (`writeFileAtomic`, temp-then-rename) and serialised behind a write queue; a failed write does not poison that queue, so a transient disk error does not stop every later write ([#1110](https://github.com/jwilleke/ngdpbase/issues/1110)).

Nothing else is written to that directory. The store is __never copied aside__. An earlier version snapshotted it before each write — originally on every `verify()`, which meant authenticating wrote an unbounded pile of hash-bearing files ([#1108](https://github.com/jwilleke/ngdpbase/issues/1108)), and later bounded to a few. Both were removed in [#1110](https://github.com/jwilleke/ngdpbase/issues/1110), because a copy of a credential store is a liability whichever path writes it: restoring one un-revokes tokens somebody deliberately killed, tokens are short-lived so a wrongly purged one is re-minted in a minute, and `backup()` excludes hashes precisely because a backup must not carry material checkable against a presented token.

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

## Audit events

Mint and revoke emit audit events through `AuditManager` ([#1111](https://github.com/jwilleke/ngdpbase/issues/1111)):

| Event | `action` | Carries |
|---|---|---|
| `token-mint` | `token-mint` | `id`, `owner`, `name`, `scopes`, `expiresAt` |
| `token-revoke` | `token-revoke` | `id`, `owner`, `name`, `revokedBy` |

Both also carry `viaTokenId` / `viaTokenName`, as explicit nulls for a human action so a query can filter on the field existing rather than treating "absent" and "not a token" as the same thing.

Severity is `medium` for a human action and `high` when a token was minted or revoked __by another token__ — delegation widening unattended is the case a reader of the log is looking for.

__Emitted from the manager, not the route.__ `page.*` events are built in `WikiRoutes`, so only the HTTP path is audited and an internal caller produces nothing. Survivable for a page edit; not for a credential, where an unaudited mint is a token nobody knows exists. The manager is the one door, so the record is written at the door.

The emit is fire-and-forget with a caught error: losing the log is bad, but refusing to mint because the log failed is worse.

Because the lifecycle is audited, `retention-days` no longer has to keep dead records as a stand-in audit trail. The default is __1 day__, not 30: long enough for the admin token list to show what happened to a token yesterday, short enough that hash-bearing records do not linger. `0` purges as soon as a record is dead.

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
| `verify(token)` | Returns a __copy__ of the record without its hash, or `null` for unknown/expired/revoked. Buffers `lastUsedAt` in memory — no disk IO on the request path. |
| `listForOwner(owner)` | That owner's live tokens, without hashes. |
| `listAll()` | Every live token — admin oversight. |
| `revoke(id, byUsername)` | Effective immediately; `verify()` reads the store per request, so there is no cache to wait out. |
| `purgeExpired()` | Drops dead records past `retention-days`. Audit records are unaffected. Also runs on the maintenance timer, not only at boot. |
| `flushLastUsed()` | Writes buffered `lastUsedAt` stamps to disk. Runs on the maintenance timer and on `shutdown()`; public so a caller can force it. |
| `backup()` | Public records only — __no hashes, and so not restorable__. It preserves the audit trail of what existed, not working credentials. |

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

## Invariants ([#1108](https://github.com/jwilleke/ngdpbase/issues/1108))

A review found seven defects here, each tracing back to a rule that was implied but never written down. They are recorded in the class header and enforced by tests in `src/managers/__tests__/AgentTokenManager.test.ts`:

1. __The read path does no disk IO.__ `verify()` runs on every agent request; it buffers `lastUsedAt` and the maintenance timer flushes it.
2. __An unreadable date means expired, everywhere.__ `Date.parse` gives `NaN` for a malformed value, and `NaN <= now` and `NaN > now` are *both* false — which previously made `verify()` read a broken `expiresAt` as valid while `isLive()` read it as not-live, producing a token that authenticated forever and appeared in no listing. All expiry comparisons go through `expiryOf()`, which collapses unparseable to `-Infinity`.
3. __Nothing hands out a live reference to a stored record.__ Every exit is a copy via `toPublic()`, including the `scopes` array — which becomes the permission ceiling in `req.userContext.viaToken`.

Malformed records found at load are __quarantined__: excluded from the live map so they authenticate nothing, and written back untouched so a later save cannot destroy evidence of corruption.

Numeric configuration is validated on read. `Number('24h')` is `NaN` and `ttl > NaN` is false, so a single typo previously removed the TTL ceiling silently; a non-positive or non-finite value now falls back to the default and logs a warning.

## Extraction note

`CONFIG_PREFIX` and `TOKEN_PREFIX` are the only host-bound values in the class. When this manager moves into the shared framework package, those are the two parameters a derivative supplies.
