# Agent Markdown → NCM Ingest API

`POST /api/page/ingest` lets an AI agent (or any HTTP client) send Markdown and have ngdpbase store it as an [NCM](NGDP-Compatible-Markdown.md) page, authored by the authenticated user, creating or updating in place. It is the HTTP counterpart to the MCP server's `ngdpbase_create_page` tool.

## When to use this vs the MCP server

| | `POST /api/page/ingest` (this doc) | MCP `ngdpbase_create_page` ([MCP-SERVER.md](MCP-SERVER.md)) |
| --- | --- | --- |
| Transport | HTTP — reachable from anywhere | stdio — local child process |
| Runs through the live server | __Yes__ — in-band index update, immediately viewable + searchable | No — writes the data dir directly; a running server won't see it until reindex/restart |
| Author | the authenticated caller (per-user) | hardcoded `mcp-server` |
| Auth | Authentik OAuth bearer token, or a logged-in session | none (local trust) |

Prefer the HTTP endpoint for a __running__ instance and for remote/automated agents. Use the stdio MCP path for local/offline batch authoring against a stopped instance.

## Request

```
POST /api/page/ingest
Authorization: Bearer <token>
Content-Type: application/json
```

```jsonc
{
  "pageName": "My Doc Title",     // required — also the upsert key
  "markdown": "# My Doc\n\n...",  // required — raw Markdown (normalized to NCM)
  "category": "documentation",    // optional — must be an enabled system category
  "keywords": ["api", "ingest"]   // optional — max 5
}
```

- __Upsert:__ `pageName` is the key. Re-sending an edited doc __updates the page in place__ (it does not create a duplicate).
- __Author:__ set from the authenticated identity on create and __immutable across edits__ (later edits bump `editor`, not `author`).
- __NCM:__ the Markdown is normalized to NGDP-Compatible Markdown — link normalization, GFM-table up-conversion, frontmatter sort, and an `ncmVersion` stamp.

## Response

```jsonc
{
  "success": true,
  "action": "created",            // or "updated"
  "title": "My Doc Title",
  "uuid": "…",
  "slug": "my-doc-title",
  "author": "jim",                // the resolved user (displayName renders, e.g. "Jim Willeke")
  "category": "documentation",
  "keywords": ["api", "ingest"],
  "url": "https://<host>/view/My%20Doc%20Title",
  "ncmVersion": 2,
  "ncmWarnings": []
}
```

HTTP status: `201` on create, `200` on update.

### Errors

| Status | Cause |
| --- | --- |
| `400` | missing `pageName`/`markdown`, invalid characters in `pageName` (`/ \ # ? % " < > \| *`), bad `category`, or >5 keywords |
| `401` | not authenticated |
| `403` | authenticated but lacks `page-create` (new) / `page-edit` (existing), or the agent token was refused by the edge gate — see [What an agent token may reach](#what-an-agent-token-may-reach) |
| `500` | save/normalization failure |

## Authentication (Authentik OAuth bearer)

ngdpbase verifies an Authentik-issued RS256 JWT against Authentik's JWKS — see [AuthentikBearerAuthProvider](providers/AuthentikBearerAuthProvider.md). No client secret lives on the ngdpbase side; it only verifies. The agent holds the credential.

### 1. Mint a token (client-credentials grant)

```bash
TOKEN=$(curl -s -X POST https://auth.nerdsbythehour.com/application/o/token/ \
  -d grant_type=client_credentials \
  -d client_id="$AUTHENTIK_CLIENT_ID" \
  -d client_secret="$AUTHENTIK_CLIENT_SECRET" \
  -d scope="openid email profile" | jq -r .access_token)
```

The service account (`svc-ingest-jim`) and a custom scope mapping stamp a stable `name` / `email` onto the token, so the page is authored under that identity (decision A — the token's `email` resolves to the matching ngdpbase user; the UI renders their display name, e.g. "Jim Willeke").

### 2. Ingest

```bash
curl -s -X POST https://<host>/api/page/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageName":"My Doc Title","markdown":"# My Doc\n\nHello world.","category":"documentation","keywords":["api"]}'
```

Re-run the same command with edited `markdown` to update the page in place.

> Bearer-authenticated requests are exempt from CSRF (bearer auth is not cookie-based). A logged-in __session__ can also call this endpoint, but must include the CSRF token like any other state-changing request.

## Enabling on a deployment

Set these config keys (instance custom config or env). The provider is registered only when `enabled` is true __and__ issuer + jwks-url + audience are all present. No secret is stored server-side.

ngdpbase config files use __flat dotted keys__, not nested objects — a nested `{"ngdpbase": {"auth": ...}}` block is silently ignored by `ConfigurationManager.getProperty()`:

```jsonc
{
  "ngdpbase.auth.authentik-bearer.enabled": true,
  "ngdpbase.auth.authentik-bearer.issuer": "https://auth.nerdsbythehour.com/application/o/ngdpbase/",
  "ngdpbase.auth.authentik-bearer.jwks-url": "https://auth.nerdsbythehour.com/application/o/ngdpbase/jwks/",
  "ngdpbase.auth.authentik-bearer.audience": "<the Authentik provider client_id>",
  "ngdpbase.auth.authentik-bearer.default-role": "occupant",
  "ngdpbase.auth.authentik-bearer.group-map": {}
}
```

Successful registration logs `[AuthManager] Registered provider: authentik-bearer (issuer=…)` at startup; if that line is missing, the keys were not picked up.

| Key | Meaning |
| --- | --- |
| `enabled` | turn the bearer provider on |
| `issuer` | OIDC issuer (per-provider) — checked as the JWT `iss` |
| `jwks-url` | where to fetch the RS256 public keys |
| `audience` | the provider's client_id — checked as the JWT `aud` |
| `default-role` | role granted to a JIT-provisioned user |
| `group-map` | optional Authentik group → ngdpbase role map |

The matching Authentik provider/application/service-account are provisioned by `setup-ngdpbase.mjs` in the infra repo (it prints the `audience` and the client-credentials secret).

## Slash command: `/ingest-page`

For agent-driven use there's a repo command at `.claude/commands/ingest-page.md`. It mints a token and posts a Markdown file in one step, resolving the page name from the doc's H1/frontmatter/filename and pulling optional `category`/`keywords` from frontmatter.

It reads config from the environment (never hardcoded): `NGDPBASE_INGEST_URL`, `AUTHENTIK_TOKEN_URL`, `NGDPBASE_CLIENT_ID`, `NGDPBASE_CLIENT_SECRET`. The credentials live in the SOPS secret `apps/production/jimsmcp/ngdpbase-ingest-creds.sops.yaml` (mj-infra-flux) — see the command file for the export snippet.

## What an agent token may reach

An agent token is refused at the edge unless the surface it is calling is named as token-reachable. This is separate from, and runs before, the permission check the handler makes (#1173).

__Reachable today:__

| Method | Path | Scope required (any one) |
| --- | --- | --- |
| `POST` | `/api/page/ingest` | `page-create`, `page-edit` |
| `GET` | `/api/page-source/:page` | `page-read` |
| `GET` | `/api/page-metadata/:page` | `page-read` |

Everything else in the API is refused to a token, including `/api/tokens`, every `/api/admin/*` surface, sessions, comments, and footnotes. __Absence is the default, not a judgement__ — a route is unreachable by a token until someone names it in `src/security/tokenRouteMap.ts`, so a route added later cannot become token-reachable by being forgotten about.

A refusal names which kind it is, because the two need different fixes:

```json
{ "success": false, "error": "Forbidden", "reason": "out-of-scope",
  "message": "POST /api/page/ingest requires one of [page-create, page-edit]" }
```

- `out-of-scope` — the surface is open to tokens; __this__ token lacks the scope. Mint one with the right scope.
- `unmapped` — the surface is not open to tokens at all. No token will reach it; use a session, or open an issue asking for it to be mapped.
- `malformed-path` — the request path could not be normalized safely (traversal, an encoded separator, a control character). Not a scope problem.

__Session requests are unaffected.__ The gate applies only where a token is present, so a browser never encounters it.

__Both checks still run.__ Passing the gate does not authorize the request — the handler still asks whether the token's owner holds the permission, and the token is still capped at its own scopes. The gate limits *reach*; the permission check decides *action*.

## See also

- [AuthentikBearerAuthProvider](providers/AuthentikBearerAuthProvider.md) — token verification
- [NGDP-Compatible Markdown](NGDP-Compatible-Markdown.md) — the stored format
- [MCP Server](MCP-SERVER.md) — the stdio alternative
- `src/security/tokenRouteMap.ts` — the reachable-surface map and its matcher
