---
name: ShareManager
description: Share-link capability tokens (#842) — issue/validate/revoke/list + live keyword-scope resolution
dateModified: '2026-07-16'
category: managers
code: src/managers/ShareManager.ts
---

# ShareManager

Issues, validates, revokes, and lists __share links__ — unguessable capability tokens granting anonymous access to a defined scope of content (epic #842, slice 1 #852). The token *is* the grant: whoever holds it may view the scoped content until expiry or revocation. Shares carry no identity; they exist precisely so anonymous visitors need no account.

Design + signed-off decisions: `docs/planning/keyword-share-links.md`.

## Interface (decision 6 — extraction seam)

Routes consume ONLY this narrow interface, never the storage:

- `issue(scope, ttl, issuer, { actions?, resources? })` — mint a share as a delegation by `issuer` ([#1221](https://github.com/jwilleke/ngdpbase/issues/1221)); every action is checked against the issuer's live authority and an unheld one refuses the share. `ttl` is `'24h' | '7d' | '30d' | null` (null = until cancelled)
- `validate(token)` — returns the typed scope for a live share, else `null`; unknown, expired, and revoked tokens are indistinguishable so share existence never leaks (routes render an identical 404)
- `subjectFor(token)` — resolves a live token into the `PermissionSubject` the ordinary evaluator understands: anonymous, carrying `viaShare` ([#1222](https://github.com/jwilleke/ngdpbase/issues/1222)). Same `null` cases as `validate`. How the evaluator applies it: [Share Links admin reference](../admin/Share-Links.md#how-a-share-visit-is-evaluated)
- `revoke(id, revokedBy)` — immediate; record retained with `revokedAt` for audit
- `list(owner?)` — all shares (admin view) or one owner's
- `resolveScope(scope)` — live content set at request time, never snapshotted

Role gating (decision 2: `admin` + `editor` may create) is the route layer's job — slice 3.

## Scope (v1: keyword)

Scope is a typed object `{ kind: 'keyword', keyword }` (`src/types/Share.ts`); future kinds add a discriminant + evaluator without touching the token model. Resolution returns media whose EXIF/XMP keywords match plus pages whose `user-keywords` match, __excluding__ (safe by construction):

- content carrying the reserved `owner-only` keyword — media and pages alike (decision 1)
- pages with `private: true`, and media linked to them; unresolvable linked-page metadata excludes the item (conservative-on-security, #714 convention)
- pages with `audience` or per-action `access` frontmatter — a share must not silently widen an author's chosen audience (decision 3)

## Storage

- Directory: one JSON file per share, `{id}.json`, under `ngdpbase.share.storagedir` (default `${FAST_STORAGE}/shares`); CommentManager pattern.
- Record: `id` (management handle), `token` (64-char crypto-random hex — never in management URLs), `scope`, `createdBy`, `createdAt`, `expiresAt`, `revokedAt?`.
- Enabled flag: `ngdpbase.share.enabled` (default `true`); degrades to disabled on path-preflight failure.

## Public routes (#853, slice 2)

Anonymous, token-gated, re-validated per request (never cached per token); all set `X-Robots-Tag: noindex`.

Since [#1223](https://github.com/jwilleke/ngdpbase/issues/1223) the handlers decide nothing. One resolver middleware on `/share/:token` turns the token into the share subject (`subjectFor`) and sets it as the request's identity — replacing any session the visitor had, since the token is the credential presented on this path — and each handler hands off to the ordinary door, which asks the evaluator as it does for a session ([how the evaluator applies the share](../admin/Share-Links.md#how-a-share-visit-is-evaluated)):

- `GET /share/:token` — album: `resolveScope` enumerates the candidates (everything carrying the keyword); each page is kept only if the page read gate allows it, each media item only if `MediaManager.getItem` returns it (chrome-free standalone template)
- `GET /share/:token/file/:id`, `GET /share/:token/thumb/:id` — the `/media/file/:id` and `/media/thumb/:id` doors, reached as the share subject; the thumbnail door answers `Cache-Control: private` to a share subject
- `GET /share/:token/page/:name` — the same read gate as `/view` and export, then a read-only render; known v1 caveat: links inside the rendered HTML point at normal `/view/` URLs

`WikiRoutes.shareDoors.test.ts` holds statically that no handler contains an access decision.

Requests are rate-limited per `token:ip` (600 / 10 min, `shareRateLimiter` in WikiRoutes) *before* resolution, so invalid-token probing burns the same budget.

## Audit (decision 5)

`share_create` and `share_revoke` events go to [AuditManager](AuditManager.md); audit failure never blocks share operations. Anonymous access hits are recorded via `recordAccess(token)` and flushed as aggregated `share_access` counts (one row per share per 5-minute window, plus a best-effort flush on shutdown) — never per-view rows.

## See Also

- `docs/planning/keyword-share-links.md` — design, decisions, scope-kinds roadmap
- Epic #842; slices: #852 (this manager), #853 (public routes), #854 (management UI), #855 (tests), #856 (docs)
- `src/providers/MagicLinkAuthProvider.ts` — token-lifecycle prior art
