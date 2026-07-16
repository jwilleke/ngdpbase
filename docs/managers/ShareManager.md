---
name: ShareManager
description: Share-link capability tokens (#842) — issue/validate/revoke/list + live keyword-scope resolution
dateModified: '2026-07-16'
category: managers
code: src/managers/ShareManager.ts
---

# ShareManager

Issues, validates, revokes, and lists **share links** — unguessable capability tokens granting anonymous access to a defined scope of content (epic #842, slice 1 #852). The token *is* the grant: whoever holds it may view the scoped content until expiry or revocation. Shares carry no identity; they exist precisely so anonymous visitors need no account.

Design + signed-off decisions: `docs/planning/keyword-share-links.md`.

## Interface (decision 6 — extraction seam)

Routes consume ONLY this narrow interface, never the storage:

- `issue(scope, ttl, createdBy)` — mint a share; `ttl` is `'24h' | '7d' | '30d' | null` (null = until cancelled)
- `validate(token)` — returns the typed scope for a live share, else `null`; unknown, expired, and revoked tokens are indistinguishable so share existence never leaks (routes render an identical 404)
- `revoke(id, revokedBy)` — immediate; record retained with `revokedAt` for audit
- `list(owner?)` — all shares (admin view) or one owner's
- `resolveScope(scope)` — live content set at request time, never snapshotted

Role gating (decision 2: `admin` + `editor` may create) is the route layer's job — slice 3.

## Scope (v1: keyword)

Scope is a typed object `{ kind: 'keyword', keyword }` (`src/types/Share.ts`); future kinds add a discriminant + evaluator without touching the token model. Resolution returns media whose EXIF/XMP keywords match plus pages whose `user-keywords` match, **excluding** (safe by construction):

- content carrying the reserved `owner-only` keyword — media and pages alike (decision 1)
- pages with `private: true`, and media linked to them; unresolvable linked-page metadata excludes the item (conservative-on-security, #714 convention)
- pages with `audience` or per-action `access` frontmatter — a share must not silently widen an author's chosen audience (decision 3)

## Storage

- Directory: one JSON file per share, `{id}.json`, under `ngdpbase.share.storagedir` (default `${FAST_STORAGE}/shares`); CommentManager pattern.
- Record: `id` (management handle), `token` (64-char crypto-random hex — never in management URLs), `scope`, `createdBy`, `createdAt`, `expiresAt`, `revokedAt?`.
- Enabled flag: `ngdpbase.share.enabled` (default `true`); degrades to disabled on path-preflight failure.

## Audit (decision 5)

`share_create` and `share_revoke` events go to [AuditManager](AuditManager.md); audit failure never blocks share operations.

## See Also

- `docs/planning/keyword-share-links.md` — design, decisions, scope-kinds roadmap
- Epic #842; slices: #852 (this manager), #853 (public routes), #854 (management UI), #855 (tests), #856 (docs)
- `src/providers/MagicLinkAuthProvider.ts` — token-lifecycle prior art
