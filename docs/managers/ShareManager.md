---
name: ShareManager
description: Share-link capability tokens (#842) — issue/validate/revoke/list + live keyword-scope resolution
dateModified: '2026-07-16'
category: managers
code: src/managers/ShareManager.ts
---

# ShareManager

Issues, validates, revokes, and lists __share links__ — unguessable capability tokens granting anonymous access to a defined scope of content (epic #842, slice 1 #852). The token *is* the grant: whoever holds it may view the scoped content until expiry or revocation. Shares carry no identity; they exist precisely so anonymous visitors need no account.

__The source of truth for all sharing is [sharing.md](../sharing.md)__: the model, the one path every link takes, the two kinds of link (keyword and vault), abuse controls and configuration. This page is the manager's interface reference.

## Interface (decision 6 — extraction seam)

Routes consume ONLY this narrow interface, never the storage:

- `issue(scope, ttl, issuer, { actions?, resources? })` — mint a share as a delegation by `issuer` ([#1221](https://github.com/jwilleke/ngdpbase/issues/1221)); every action is checked against the issuer's live authority and an unheld one refuses the share. `ttl` is `'24h' | '7d' | '30d' | null` (null = until cancelled)
- `validate(token)` — returns the typed scope for a live share, else `null`; unknown, expired, and revoked tokens are indistinguishable so share existence never leaks (routes render an identical 404)
- `subjectFor(token)` — resolves a live token into the `PermissionSubject` the ordinary evaluator understands: anonymous, carrying `viaShare` ([#1222](https://github.com/jwilleke/ngdpbase/issues/1222)). Same `null` cases as `validate`. How the evaluator applies it: [sharing.md](../sharing.md#one-path)
- `revoke(id, revokedBy)` — immediate; record retained with `revokedAt` for audit
- `list(owner?)` — all shares (admin view) or one owner's
- `resolveScope(scope, ctx)` — live content set at request time, never snapshotted; a vault scope is listed as the link's subject `ctx`
- `issueVaultShare(scope, lifetimeHours, issuer)` — a link to chosen pages of a vault, or the whole vault ([#1388](https://github.com/jwilleke/ngdpbase/issues/1388)): the vault's owner only, lifetime up to `maxShareDays(vault)`
- `extend(id, hours, by)` — the issuer adds up to 24 hours to a live link, audited as `share-extend`
- `recordVaultVisit(token, what, ip)` — one `share-access` record per page, file or list opened through a vault link

Role gating (decision 2: `admin` + `editor` may create) is the route layer's job — slice 3.

## Scope

Two kinds, `keyword` and `vault`; the vault kind is described in [sharing.md](../sharing.md#vault-links). The keyword kind:

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

Since [#1223](https://github.com/jwilleke/ngdpbase/issues/1223) the handlers decide nothing. One resolver middleware on `/share/:token` turns the token into the share subject (`subjectFor`) and sets it as the request's identity — replacing any session the visitor had, since the token is the credential presented on this path — and each handler hands off to the ordinary door, which asks the evaluator as it does for a session ([how the evaluator applies the share](../sharing.md#one-path)):

- `GET /share/:token` — album: `resolveScope` enumerates the candidates (everything carrying the keyword); each page is kept only if the page read gate allows it, each media item only if `MediaManager.getItem` returns it (chrome-free standalone template)
- `GET /share/:token/file/:id`, `GET /share/:token/thumb/:id` — the `/media/file/:id` and `/media/thumb/:id` doors, reached as the share subject; the thumbnail door answers `Cache-Control: private` to a share subject
- `GET /share/:token/page/:name` — the same read gate as `/view` and export, then a read-only render; known v1 caveat: links inside the rendered HTML point at normal `/view/` URLs

`WikiRoutes.shareDoors.test.ts` holds statically that no handler contains an access decision.

Requests are rate-limited per `token:ip` (600 / 10 min, `shareRateLimiter` in WikiRoutes) *before* resolution, so invalid-token probing burns the same budget.

## Audit (decision 5)

`share-create` and `share-revoke` events go to [AuditManager](AuditManager.md); audit failure never blocks share operations. Anonymous access hits are recorded via `recordAccess(token)` and flushed as aggregated `share-access` counts (one row per share per 5-minute window, plus a best-effort flush on shutdown) — never per-view rows.

## See Also

- [sharing.md](../sharing.md) — the source of truth for all sharing
- Epic #842; slices: #852 (this manager), #853 (public routes), #854 (management UI), #855 (tests), #856 (docs)
- `src/providers/MagicLinkAuthProvider.ts` — token-lifecycle prior art
