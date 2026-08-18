# Post Markdown → NCM Page (agent ingest)

Status of the "an AI agent (or any HTTP client) posts Markdown and ngdpbase stores it as an NCM page, authored by the caller" capability. Full usage reference: [`../Agent-Ingest-API.md`](../Agent-Ingest-API.md).

## Summary

Send Markdown over HTTP → ngdpbase verifies an Authentik OAuth bearer token → normalizes the Markdown to [NCM](../NGDP-Compatible-Markdown.md) → upserts a page authored by the token's user (immutable across edits) → immediately viewable and searchable (the request goes through the live server, so its in-memory indexes stay correct — unlike the stdio MCP `create_page` path).

__Status: built, tested, and live-verified on jimstest__ with a real Authentik token (create `201` / update `200`, `author=jim`, NCM table up-conversion applied). Production deployment wiring is the only open item — see [Not yet in place](#not-yet-in-place).

## Tracking issues

| Issue | Scope | State |
| --- | --- | --- |
| [ngdpbase#822](https://github.com/jwilleke/ngdpbase/issues/822) | __EPIC__ — agent Markdown → NCM ingest via Authentik OAuth | __open__ (umbrella) |
| [ngdpbase#817](https://github.com/jwilleke/ngdpbase/issues/817) | Phase 0 — Authentik OIDC provider + service account | closed |
| [ngdpbase#818](https://github.com/jwilleke/ngdpbase/issues/818) | `AuthentikBearerAuthProvider` (JWT verification) | closed |
| [ngdpbase#819](https://github.com/jwilleke/ngdpbase/issues/819) | `POST /api/page/ingest` (Markdown→NCM upsert) | closed |
| [ngdpbase#821](https://github.com/jwilleke/ngdpbase/issues/821) | Tests + docs + `/ingest-page` skill | closed |
| [ngdpbase#820](https://github.com/jwilleke/ngdpbase/issues/820) | Phase 3 — GitOps wiring (moved to infra repo) | closed |
| [mj-infra-flux#123](https://github.com/jwilleke/mj-infra-flux/issues/123) | Authentik provider/app/service-account provisioning | closed |
| [mj-infra-flux#124](https://github.com/jwilleke/mj-infra-flux/issues/124) | Mount ingest creds into the prod (geohazardwatch) deployment | __open — premise under review__ |

## What is in place

### Server (ngdpbase)

- __`src/providers/AuthentikBearerAuthProvider.ts`__ ([#818]) — verifies an Authentik RS256 JWT (`Authorization: Bearer`) against the configured JWKS (`jose`), checks `iss`/`aud`, resolves the user by `email`, JIT-provisions unknowns. Verification-only: __no client secret on the server side__. Commit `c81e38d1`.
- __Registration__ in `src/managers/AuthManager.ts` ([#818]) — registered when `ngdpbase.auth.authentik-bearer.enabled` and issuer + jwks-url + audience are all set.
- __Request middleware__ in `src/app.ts` ([#818]) — on a valid bearer token sets `req.userContext` (stateless, no session) and flags `req.bearerAuth`; `src/middleware/csrf.ts` exempts bearer-authenticated requests.
- __Endpoint__ `POST /api/page/ingest` in `src/routes/WikiRoutes.ts` (`ingestPageMarkdown`) ([#819]) — validates `{pageName, markdown, category?, keywords?}`, gates on `page-create`/`page-edit`, normalizes via `normalizeExistingPageToNcm`, upserts with author from the token (decision A), updates the search index in-band. Returns `{action, title, uuid, slug, author, url, ncmVersion, ncmWarnings}`.
- __Cause logging__ ([#818]) — JWKS-fetch failures log the underlying cause (e.g. `EHOSTUNREACH`). Commit `9e483581`.

Config keys (instance custom config / env; __no secret server-side__):

```
ngdpbase.auth.authentik-bearer.enabled    = true
ngdpbase.auth.authentik-bearer.issuer     = https://auth.nerdsbythehour.com/application/o/ngdpbase/
ngdpbase.auth.authentik-bearer.jwks-url   = https://auth.nerdsbythehour.com/application/o/ngdpbase/jwks/
ngdpbase.auth.authentik-bearer.audience   = <provider client_id>
ngdpbase.auth.authentik-bearer.default-role = occupant
ngdpbase.auth.authentik-bearer.group-map  = {}
```

### Tests & docs ([#821])

- 13 provider unit tests (`src/providers/__tests__/AuthentikBearerAuthProvider.test.ts`) + 7 handler tests (`src/routes/__tests__/WikiRoutes.ingest.test.ts`).
- API guide: [`docs/Agent-Ingest-API.md`](../Agent-Ingest-API.md) (commit `6a2e9313`).
- Provider page: [`docs/providers/AuthentikBearerAuthProvider.md`](../providers/AuthentikBearerAuthProvider.md).

### Tooling — `/ingest-page` skill ([#821])

`.claude/commands/ingest-page.md` (commit `491bed3a`) — mints an Authentik `client_credentials` token and POSTs a Markdown file in one step; resolves page name from H1/frontmatter/filename. Reads `NGDPBASE_INGEST_URL`, `AUTHENTIK_TOKEN_URL`, `NGDPBASE_CLIENT_ID`, `NGDPBASE_CLIENT_SECRET` from the environment (never hardcoded).

### Authentik (infra) ([mj-infra-flux#123])

- OAuth2/OIDC provider + application `ngdpbase` (RS256, per-provider issuer).
- Service account `svc-ingest-jim` with a custom scope mapping that stamps `name=Jim Willeke` / `email=jim@willeke.com` onto the client-credentials token (decision A).
- Credentials stored SOPS-encrypted at `apps/production/jimsmcp/ngdpbase-ingest-creds.sops.yaml`; provisioned by `apps/production/jimsmcp/setup-ngdpbase.mjs`.

## Verified

Live end-to-end on __jimstest__ with a real Authentik token: token claims confirmed (`sub/email=jim@willeke.com`, `name=Jim Willeke`); `POST /api/page/ingest` → create `201` / update `200`, `author=jim`, `ncmVersion 2`, GFM table up-converted, page viewable `200`.

> Note: on the jimstest __macOS__ host this required clearing the macOS "Local Network" privacy gate (the LAN-hosted Authentik was unreachable from the daemon process). This is a macOS-host quirk only; the Linux in-cluster deployment has no such gate.

## Not yet in place

- __Production deployment wiring__ — [mj-infra-flux#124] (open). Its premise (mounting *client* credentials into the geohazardwatch *server* deployment so it can call ingest) is __under review__ — geohazardwatch is the ngdpbase server that *receives* ingest, so it is not obviously the right place for client credentials. Resolve the intended agent/runtime before wiring.
- __Optional hardening__ — re-ingesting a page whose index is inconsistent (title indexed but `getPage` returns null) currently 500s on the uniqueness check instead of updating; could catch "title already in use" and fall through to update.

## How to use (quick)

```zsh
TOKEN=$(curl -s -X POST https://auth.nerdsbythehour.com/application/o/token/ \
  -d grant_type=client_credentials -d client_id="$NGDPBASE_CLIENT_ID" \
  -d client_secret="$NGDPBASE_CLIENT_SECRET" -d 'scope=openid email profile' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -X POST "$NGDPBASE_INGEST_URL" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"pageName":"My Doc","markdown":"# My Doc\n\n...","category":"documentation"}'
```

Or run the `/ingest-page <file>` skill. See [`../Agent-Ingest-API.md`](../Agent-Ingest-API.md) for the full reference.
