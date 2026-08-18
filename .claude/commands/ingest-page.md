# Ingest Page

Send a Markdown document to ngdpbase's `POST /api/page/ingest` endpoint so it becomes an __NCM__ page authored by the operator. Creates the page if new, updates it in place if it already exists (upsert keyed on page name).

Use this to push docs (e.g. files authored in GitHub) into an ngdpbase instance without copy/paste. Full reference: [`docs/Agent-Ingest-API.md`](../../docs/Agent-Ingest-API.md).

## Inputs

`$ARGUMENTS` may contain a file path and/or an explicit page name. Resolve as:

- __Markdown source__ — the file path in `$ARGUMENTS`; else the file the user is currently viewing; else ask.
- __Page name__ — explicit arg if given; else the document's first H1 (`# Title`) or frontmatter `title`; else the filename (without extension). This is the upsert key — reuse the exact same name to update.
- __category / keywords__ — optional; pull from the doc's frontmatter if present (`category`, `keywords`/`user-keywords`, max 5), otherwise omit.

## Configuration (environment — never hardcode secrets)

Read these from the environment. The `client_secret` is sensitive: do __not__ print it, write it to a file, or embed it in the skill.

| Var | Default | Notes |
| --- | --- | --- |
| `NGDPBASE_INGEST_URL` | `http://localhost:3000/api/page/ingest` | target instance endpoint |
| `AUTHENTIK_TOKEN_URL` | `https://auth.nerdsbythehour.com/application/o/token/` | OAuth token endpoint |
| `NGDPBASE_CLIENT_ID` | — (required) | Authentik provider client_id (= JWT audience) |
| `NGDPBASE_CLIENT_SECRET` | — (required) | service-account credential |

If `NGDPBASE_CLIENT_ID` / `NGDPBASE_CLIENT_SECRET` are unset, stop and tell the operator to export them. They live in the SOPS secret `apps/production/jimsmcp/ngdpbase-ingest-creds.sops.yaml` (mj-infra-flux), decryptable on the host holding `home-infra-private.agekey`:

```zsh
export NGDPBASE_CLIENT_ID=$(sops decrypt apps/production/jimsmcp/ngdpbase-ingest-creds.sops.yaml | sed -n 's/.*client-id: //p')
export NGDPBASE_CLIENT_SECRET=$(sops decrypt apps/production/jimsmcp/ngdpbase-ingest-creds.sops.yaml | sed -n 's/.*client-secret: //p')
```

## Steps

### Step 1: Mint a token

```zsh
TOKEN=$(curl -s -X POST "${AUTHENTIK_TOKEN_URL:-https://auth.nerdsbythehour.com/application/o/token/}" \
  -d grant_type=client_credentials \
  -d client_id="$NGDPBASE_CLIENT_ID" \
  -d client_secret="$NGDPBASE_CLIENT_SECRET" \
  -d 'scope=openid email profile' | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
```

If `TOKEN` is empty, the credentials/scope are wrong — report and stop.

### Step 2: Build the request body and POST

Build the JSON with a tool (avoid shell-escaping the Markdown by hand) — e.g. `python3 -c` or `jq` — with keys `pageName`, `markdown`, and optional `category` / `keywords`. Then:

```zsh
curl -s -X POST "${NGDPBASE_INGEST_URL:-http://localhost:3000/api/page/ingest}" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BODY" -w '\nHTTP %{http_code}\n'
```

### Step 3: Report the result

On success, surface from the JSON: `action` (created/updated), `title`, `author`, `url`, `ncmVersion`, and any `ncmWarnings`.

Handle failures specifically:

- __400__ — bad `pageName` (invalid chars `/ \ # ? % " < > | *`), missing markdown, bad category, or >5 keywords.
- __401__ — token missing/invalid (re-mint).
- __403__ — authenticated but lacks `page-create`/`page-edit`, __or__ a CSRF rejection meaning the bearer token wasn't accepted (often a JWKS-reachability problem — check the server log for `[AuthentikBearerAuthProvider] JWT verification failed`).
- __500__ — server-side save error; check the server log.

## Notes

- The endpoint goes through the __live__ server, so the page is immediately viewable and searchable (unlike the stdio MCP `create_page` tool, which writes the data dir directly).
- Author is taken from the token's identity and is __immutable across edits__ — re-ingesting only updates content/editor.
- Do not echo `NGDPBASE_CLIENT_SECRET` or the minted `TOKEN` into logs or committed files.
