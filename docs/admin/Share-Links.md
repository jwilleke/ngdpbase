# Share Links — Admin Reference

Share links (epic #842) grant anonymous, time-limited, revocable read-only access to keyword-scoped content via unguessable capability tokens. User-facing guide: the `share-links` required page (`/view/Share Links`). Design + signed-off decisions: `docs/planning/keyword-share-links.md`. Manager internals: `docs/managers/ShareManager.md`.

## Configuration keys

| Key | Default | Purpose |
| --- | --- | --- |
| `ngdpbase.share.enabled` | `true` | Master switch. When `false`, all `/share/*` and `/shares` routes 404, the Share button disappears, and ShareManager refuses to issue. The feature is inert until a privileged user actually creates a share, so the enabled default exposes nothing by itself. |
| `ngdpbase.share.storagedir` | `${FAST_STORAGE}/shares` | One JSON file per share (`<id>.json`). Small operational records — same storage tier as sessions/users. Revoked shares keep their file for the audit trail. |

Both keys live in `config/app-default-config.json`; override per instance in `app-custom-config.json` as usual.

## Absolute links and base-url

Share links shown on `/shares` are built from `ngdpbase.application.base-url` (falling back to the request origin when unset). __The configured base-url must actually resolve and route for recipients__ — a dead hostname means every minted link is dead (see closed issue #860, where the fix was a path-filtered Cloudflare Tunnel exposing only `/share/*` publicly).

## Who can do what

| Action | Who | Route |
| --- | --- | --- |
| Create a share | policy grants `share-manage` (shipped to `admin` and `editor`; #1224) | `POST /shares/create` (CSRF-protected) |
| List shares | `share-manage`: own. `admin-system`: all. | `GET /shares` |
| Revoke | Creator (`share-manage`) or `admin-system` | `POST /shares/:id/revoke` (CSRF-protected) |
| View shared content | Anyone holding the token, evaluated as the share subject — a signed-in visitor's own session is __not__ consulted on `/share/*` ([#1223](https://github.com/jwilleke/ngdpbase/issues/1223)) | `GET /share/:token[...]` (anonymous) |

## How a share visit is evaluated

A share is a delegation by the user who issued it, not a copy of their authority ([#1222](https://github.com/jwilleke/ngdpbase/issues/1222), epic [#1225](https://github.com/jwilleke/ngdpbase/issues/1225)). A request presenting a token resolves through `ShareManager.subjectFor(token)` to an anonymous subject carrying `viaShare` — the share id, the issuer, the delegated `actions` and `resources`, and the expiry — the same way an agent-token request carries `viaToken`. There is no second evaluator: `UserManager.hasPermission` and `ACLManager` read `viaShare` as a ceiling applied before every other rule, and refuse when any of these fails, in this order:

1. The action is not one the share delegates.
2. The share has expired (re-read at every decision, not trusted from resolution).
3. The page is not covered by the share's resources — its user-keywords do not match, it carries `owner-only`, or its metadata cannot be read.
4. The issuer no longer holds the action, resolved live. Removing the issuer's role, deactivating or deleting them stops every share they issued on the next request.

What passes the ceiling is then subject to the page's own rules exactly as any anonymous visitor is: `private: true`, a restricted `audience`, or a per-action `access` list refuses. Only after that does the share stand in for global policy, which is what lets a share work on an instance whose policy gives anonymous nothing.

Media items go through the same evaluator: `ACLManager.canUserAccessMediaItem` applies the share ceiling to the item (`asset-read` delegated, unexpired, the item's EXIF/XMP keywords covered, not private, issuer live) and then the linked page's own rules. The `/share/*` routes contain no access decision of their own ([#1223](https://github.com/jwilleke/ngdpbase/issues/1223)): a resolver turns the token into the share subject, and every handler hands off to the door the content's own URL uses — the page read gate, `/media/file/:id`, `/media/thumb/:id`. The album lists the keyword's candidates filtered by those doors.

Every denial a share visit produces is an `authorization-deny` record with `viaShareId` and `viaShareIssuer` in its metadata, so the trail reads "anonymous via share, issued by".

## Hard exclusions (safe by construction)

Never exposed through any share, regardless of keyword (decisions 1 and 3): content tagged with the reserved `owner-only` keyword (media EXIF/XMP and page user-keywords alike); pages with `private: true` plus media linked to them (media whose linked page cannot be resolved is excluded conservatively); pages carrying `audience` or per-action `access` frontmatter.

## Abuse controls and audit

- Unknown, expired, and revoked tokens return byte-identical 404s — share existence never leaks. A page or item the evaluator refuses the share subject is also a 404.
- All `/share/*` responses carry `X-Robots-Tag: noindex`; share templates also set the `robots` meta tag.
- Rate limit: 600 requests per token+IP per 10 minutes, applied before token validation so probing burns the same budget. Currently a hardcoded constant in `WikiRoutes` (`shareRateLimiter`); one album view costs one request per thumbnail, so large albums consume budget quickly. Behind a reverse proxy or tunnel, all visitors currently share one bucket per token until the trust-proxy work lands (#861).
- Audit events via AuditManager: `share-create`, `share-revoke`, and aggregated `share-access` rows (one per share per 5-minute window — never per-view rows, decision 5).

## Operational notes

- Scope is resolved live on every request — revocation and tag changes take effect immediately; nothing is cached per token.
- Shares are per-instance by design: a token minted on one instance scopes that instance's content only.
- Deleting a share's JSON file by hand removes it entirely (including from the audit-visible list); prefer revocation, which preserves the record.
