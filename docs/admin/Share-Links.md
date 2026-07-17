# Share Links — Admin Reference

Share links (epic #842) grant anonymous, time-limited, revocable read-only access to keyword-scoped content via unguessable capability tokens. User-facing guide: the `share-links` required page (`/view/Share Links`). Design + signed-off decisions: `docs/planning/keyword-share-links.md`. Manager internals: `docs/managers/ShareManager.md`.

## Configuration keys

| Key | Default | Purpose |
| --- | --- | --- |
| `ngdpbase.share.enabled` | `true` | Master switch. When `false`, all `/share/*` and `/shares` routes 404, the Share button disappears, and ShareManager refuses to issue. The feature is inert until a privileged user actually creates a share, so the enabled default exposes nothing by itself. |
| `ngdpbase.share.storagedir` | `${FAST_STORAGE}/shares` | One JSON file per share (`<id>.json`). Small operational records — same storage tier as sessions/users. Revoked shares keep their file for the audit trail. |

Both keys live in `config/app-default-config.json`; override per instance in `app-custom-config.json` as usual.

## Absolute links and base-url

Share links shown on `/shares` are built from `ngdpbase.application.base-url` (falling back to the request origin when unset). **The configured base-url must actually resolve and route for recipients** — a dead hostname means every minted link is dead (see closed issue #860, where the fix was a path-filtered Cloudflare Tunnel exposing only `/share/*` publicly).

## Who can do what

| Action | Who | Route |
| --- | --- | --- |
| Create a share | `admin`, `editor` roles (decision 2) | `POST /shares/create` (CSRF-protected) |
| List shares | Editors: own. Admins: all. | `GET /shares` |
| Revoke | Creator or admin | `POST /shares/:id/revoke` (CSRF-protected) |
| View shared content | Anyone holding the token | `GET /share/:token[...]` (anonymous) |

## Hard exclusions (safe by construction)

Never exposed through any share, regardless of keyword (decisions 1 and 3): content tagged with the reserved `owner-only` keyword (media EXIF/XMP and page user-keywords alike); pages with `private: true` plus media linked to them (media whose linked page cannot be resolved is excluded conservatively); pages carrying `audience` or per-action `access` frontmatter.

## Abuse controls and audit

- Unknown, expired, and revoked tokens return byte-identical 404s — share existence never leaks.
- All `/share/*` responses carry `X-Robots-Tag: noindex`; share templates also set the `robots` meta tag.
- Rate limit: 600 requests per token+IP per 10 minutes, applied before token validation so probing burns the same budget. Currently a hardcoded constant in `WikiRoutes` (`shareRateLimiter`); one album view costs one request per thumbnail, so large albums consume budget quickly. Behind a reverse proxy or tunnel, all visitors currently share one bucket per token until the trust-proxy work lands (#861).
- Audit events via AuditManager: `share_create`, `share_revoke`, and aggregated `share_access` rows (one per share per 5-minute window — never per-view rows, decision 5).

## Operational notes

- Scope is resolved live on every request — revocation and tag changes take effect immediately; nothing is cached per token.
- Shares are per-instance by design: a token minted on one instance scopes that instance's content only.
- Deleting a share's JSON file by hand removes it entirely (including from the audit-visible list); prefer revocation, which preserves the record.
