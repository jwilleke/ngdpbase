# Keyword Share Links — Planning (Epic #842)

Status: planning. Tracks [epic #842](https://github.com/jwilleke/ngdpbase/issues/842). Purpose of this document: state what the feature provides, settle the decisions blocking implementation, and answer the architecture question "could this be a token service shared across other apps?"

## What it provides

A privileged user shares everything carrying a chosen keyword — media items (EXIF/XMP keywords) and pages (`user-keywords`) — with anonymous visitors who hold an unguessable link.

- **Share by keyword, not by item.** One link exposes the live set of content tagged e.g. `2026 Trip west`. Tagging or untagging content immediately changes what the link exposes (scope is resolved at request time, never snapshotted).
- **Time-limited or until cancelled.** Every share has an expiry or lives until explicitly revoked. Revocation is immediate.
- **Safe by construction.** Content marked owner-only is never exposed through a share. Pages with `private: true` (and media linked to them) are always excluded. Unknown, expired, and revoked tokens return an identical 404 so share existence never leaks. Share pages are served with `X-Robots-Tag: noindex`.
- **Auditable.** Creation and revocation are recorded; who shared what, when, and until when is always answerable.

### Example flows

- Family trip: tag photos and the trip page with `2026 Trip west`, press Share on the keyword album, pick "30 days", send the link to family. No accounts needed on their side.
- Contractor docs: share pages keyword-tagged `deck-project` until cancelled; revoke when the work is done.

## Current state (from the epic's 2026-07-03 research)

- `GET /media/keyword/:keyword` already renders keyword albums, but the whole `/media/*` surface is anonymous-readable and the keyword URL is a filter, not an access grant. No share-token or unlisted-link mechanism exists anywhere in the codebase.
- Pages carry `user-keywords` / `system-keywords`, queryable via `SearchManager.searchByUserKeywords()`.
- Page privacy exists (`private: true`, `PageManager.checkPrivatePageAccess`, ACLManager Tier 0; `MediaManager.filterPrivateItems` for linked media). An owner-only marker does not exist yet — this epic defines it.
- Reusable in-repo prior art: token lifecycle with TTL and cleanup (`MagicLinkAuthProvider`), JSON-per-record persistence (`CommentManager`), CSRF middleware, `AuditManager`.

Correction to the epic text: the "known v1 caveat" refers to rendered links pointing at `/wiki/...` — canonical page URLs have been `/view/...` since #364. The caveat itself stands (links inside a shared page target normal view URLs that an anonymous visitor may not be able to open); only the path spelling is stale.

## Design outline (per the epic, unchanged)

- **ShareManager** — one JSON file per share under `ngdpbase.share.storagedir` (default `./data/shares`); fields: `token` (64-char crypto-random hex), `keyword`, `createdBy`, `createdAt`, `expiresAt` (null = until cancelled), `revokedAt` (kept for audit).
- **Public routes** (anonymous, token-gated, re-validated per request): `GET /share/:token` (album), `GET /share/:token/file/:id`, `GET /share/:token/thumb/:id`, `GET /share/:token/page/:name`.
- **Management routes** (authenticated, CSRF-protected): `GET /shares`, `POST /shares/create`, `POST /shares/:id/revoke`; Share button on the keyword album view.
- Config: `ngdpbase.share.enabled`, `ngdpbase.share.storagedir` (additions to `config/app-default-config.json` need explicit operator approval per repo policy).

## Decisions — SIGNED OFF 2026-07-15

All six decided by the operator (recommendations accepted):

| # | Decision | Decided |
| --- | --- | --- |
| 1 | Owner-only marker | Reserved keyword `owner-only`, honored identically in media EXIF/XMP keywords and page `user-keywords`; `private: true` pages always excluded as well |
| 2 | Who may create shares | `admin` and `editor` roles |
| 3 | Pages with `audience` frontmatter | Always excluded from shares — a link must not silently widen an author's chosen audience |
| 4 | Expiry granularity | v1 fixed choices: 24 h / 7 d / 30 d / until cancelled |
| 5 | Audit logging | Log create and revoke via `AuditManager`; anonymous access hits are rate-limited per token+IP and logged as aggregated counts, not per-view rows |
| 6 | Architecture | In-app ShareManager behind a narrow `issue/validate/revoke/list` interface with typed scope objects (extraction seam); shared service only when a second real consumer exists — see next section |

## Could this be a token service shared across other apps?

Yes in principle — but it should not start that way. Analysis:

### What kind of tokens these are

Share tokens are **capability tokens**: an unguessable string that *is* the grant ("whoever holds this may view content tagged X until date Y"). They are not identity tokens. That distinction drives the architecture:

- **Identity (who are you)** is owned by the app's own `AuthManager` with pluggable providers — local users, magic links, and optional external providers such as Cloudflare Access or Authentik (`AuthentikBearerAuthProvider`, config-gated, used by the agent-ingest epic #822 on deployments that enable it). Authentik is an option, not a dependency. Either way, nothing in this epic should duplicate identity — shares are for *anonymous* visitors precisely so no identity is involved.
- **Capability (what does this link grant)** is inherently coupled to the resource model of the app that owns the content — a share's *scope* is "ngdpbase media + pages with keyword K, minus private/owner-only". Another app (e.g. geohazardwatch) would have entirely different scope semantics. A generic service can own token issue/validate/revoke, but scope evaluation always stays app-side.

### Options

| Option | Shape | Pros | Cons |
| --- | --- | --- | --- |
| A. In-app ShareManager (epic draft) | Tokens stored and validated inside ngdpbase | Smallest slice; no new deployment; revocation is a local lookup; works offline (local-first principle) | Other apps can't reuse it directly |
| B. Standalone capability-token service | Separate service with issue/validate/revoke API; apps call it per request (or cache) | One implementation, many consumers; central audit | New deployment + availability dependency for every share view; auth between apps; scope logic still lives per-app, so the shared part is only the token CRUD — the *thin* part |
| C. Signed stateless tokens (JWT + shared JWKS) | Shares minted as signed JWTs; any app validates offline against a published JWKS | No runtime dependency for validation; natural multi-app story | Instant revocation impossible without a revocation list or introspection endpoint — which reintroduces option B; token contents (keyword, expiry) become client-visible |

### Recommendation

**Option A now, with a deliberate extraction seam.** Concretely:

- ShareManager exposes a narrow internal interface — `issue(scope, ttl)`, `validate(token) → scope | null`, `revoke(id)`, `list(owner)` — and the routes consume only that interface, never the storage.
- The share record keeps scope as a typed object (`{ kind: 'keyword', keyword: '...' }`) rather than bare fields, so future scope kinds (or future apps' kinds) don't change the token model.
- If a second consumer materializes (another app genuinely needing unlisted shares — not hypothetically), the interface lifts into a small service or a shared library, and the decision between B and C gets made against a real requirement. Per the project's value-over-architecture rule, building the service before a second consumer exists is parked.

### Multi-instance note (ngdpbase satellites)

Shares are per-instance by design — a token minted on jimstest scopes jimstest content. Cross-instance shares are out of scope for v1; the JSON-per-share store and the interface above do not preclude them later.

## Planned sub-issues (after decisions land)

1. ShareManager: persistence, token lifecycle, expiry, revocation, owner-only scope filtering (interface per decision 6)
2. Public share routes and album/page views
3. Share management UI and routes for privileged users
4. Tests: ShareManager unit tests; route tests for public access and management
5. Documentation: user guide and admin config reference

## References

- [Epic #842](https://github.com/jwilleke/ngdpbase/issues/842) — design draft and research
- `src/providers/MagicLinkAuthProvider.ts` — in-repo token-lifecycle prior art
- [Epic #822](https://github.com/jwilleke/ngdpbase/issues/822) — agent ingest via the optional Authentik bearer provider (identity side, not duplicated here)
