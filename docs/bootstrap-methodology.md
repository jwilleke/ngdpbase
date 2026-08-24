# Bootstrap Methodology

How an ngdpbase instance comes up: how environment variables are found, how configuration is layered on top of them, and how a fresh install completes. Written 2026-08-24 against v4.11.1 and revised the same day as #1088/#1089/#1090 landed, describing __what the code does now__ — where a comment in the source disagrees, this document follows the code and links the issue.

## The short version

Three layers, in the order they run:

1. __Environment__ — `src/bootstrap-env.ts` loads `.env` files into `process.env` before anything else evaluates.
2. __Configuration__ — `ConfigurationManager` merges shipped defaults with instance overrides, then resolves `$VAR` references against that environment at every lookup.
3. __Install__ — a `.install-complete` marker gates the setup wizard; `HEADLESS_INSTALL=true` skips it.

Nothing in the codebase ever __writes__ a `.env`. You create it by hand from `.env.example`.

## Layer 1 — environment

### Where `.env` files are read from

`src/bootstrap-env.ts` is imported __first__ in `src/app.ts`. That placement is load-bearing, not stylistic: ES module imports are hoisted and evaluated in order, so a side-effecting module imported first is the only reliable way to populate the environment ahead of every other module's top-level code. Calling `dotenv.config()` inline in `app.ts` would run *after* all of its imports had already been evaluated.

Precedence, highest first:

| # | Source | Notes |
|---|---|---|
| 1 | Ambient environment | Kubernetes `env:`, `PORT=x node …`, shell exports |
| 2 | `<FAST_STORAGE>/.env` | Per-instance, lives on the data volume |
| 3 | `<cwd>/.env` | Repo root |

The ambient environment wins so an explicitly-set variable is never silently overridden by a file.

There is a chicken-and-egg step worth knowing about: `FAST_STORAGE` may itself be declared in the root `.env`. So that file is __parsed but not applied__ first, purely to discover where the per-instance file lives (`bootstrap-env.ts:47-59`). Then the per-instance file is applied, then the root file. Because `dotenv` does not overwrite an existing value, first-applied wins — which is why the instance file takes precedence over the root one.

### Why this module exists

`server.sh` has always sourced `.env`, so direct installs were fine. __Containers never did__ — the image runs `node dist/src/app.js` directly and `server.sh` is not even `COPY`ed in, so a `.env` on the data volume was silently inert. Env-ref config values such as `"$NGDPBASE_ADMIN_PASSWORD"` could then only be satisfied by a Secret plus an `env:` block in the deployment manifest: the wrong home for application configuration, and a GitOps change to alter. `bootstrap-env.ts` makes `.env` behave the same however the process is launched.

### The shell path

`server.sh` reaches the same precedence by the opposite route (`server.sh:17-31`):

```bash
# root first
if [ -f "$SCRIPT_DIR/.env" ]; then set -a; source "$SCRIPT_DIR/.env"; set +a; fi
# then per-instance — shell assignment overwrites, so this one wins
_FAST="${FAST_STORAGE:-${INSTANCE_DATA_FOLDER:-./data}}"
if [ -f "$_FAST/.env" ]; then set -a; source "$_FAST/.env"; set +a; fi
```

Sourcing order is reversed relative to `bootstrap-env.ts`, but the __precedence is identical__: shell assignment overwrites (so last wins), `dotenv` does not (so first wins). Both end with the instance file beating the root file, and both are then beaten by anything already exported.

When launched via `server.sh`, both files are already in the ambient environment by the time node starts, so `bootstrap-env.ts` finds nothing to conflict with and is effectively a no-op. It earns its keep in containers.

### Every entry point loads it

`bootstrap-env.ts` is the __single__ mechanism, and every entry point that touches instance data imports it: `src/app.ts`, `mcp-server.ts`, and the scripts under `scripts/` that read pages, attachments, or config.

That was not always true, and the ways it failed are worth knowing:

- `npm run mcp` loaded no `.env` at all. It builds a `WikiEngine` whose `ConfigurationManager` falls back to `./data`, so launched from an MCP client — which has no reason to export `FAST_STORAGE` — it operated on the wrong instance entirely.
- Eight npm scripts used `tsx --env-file-if-exists=.env`, which reads only the root file and silently ignores `<FAST_STORAGE>/.env`.
- `app.ts` carried a second hand-rolled parser that duplicated `bootstrap-env` and could never fire.

All three were consolidated in `3d8ef679` ([#1088](https://github.com/jwilleke/ngdpbase/issues/1088)). The four repo-only tools — `check-csrf-fetch`, `check-docs-coverage`, `generate-docs-index`, `version` — deliberately load nothing; they read the tree they are run in.

__If you add an entry point that reads instance data, import `bootstrap-env` first.__ Without it the process silently operates on `./data`.

## Layer 2 — configuration

### Merge order

1. `config/app-default-config.json` — shipped defaults, read-only, in the image
2. `<FAST_STORAGE>/config/<INSTANCE_CONFIG_FILE>` — instance overrides; the filename defaults to `app-custom-config.json` and is overridable via `INSTANCE_CONFIG_FILE` (`ConfigurationManager.ts:87-89`)
3. Environment-owned keys, checked before the merged config on every `getProperty` call

### Environment-owned keys

Six keys are __owned by the environment__, declared in `ngdpbase.config.env-keys` and existing for Docker/Traefik/k8s deployments where editing a config file is awkward — or impossible, as in a fresh headless boot onto an empty volume:

| Env var | Config key |
|---|---|
| `NGDPBASE_BASE_URL` | `ngdpbase.application.base-url` |
| `NGDPBASE_HOSTNAME` | `ngdpbase.hostname` |
| `NGDPBASE_HOST` | `ngdpbase.server.host` |
| `NGDPBASE_PORT` | `ngdpbase.server.port` |
| `NGDPBASE_SESSION_SECRET` | `ngdpbase.session.secret` |
| `NGDPBASE_APP_NAME` | `ngdpbase.application-name` |

The governing rule is __a key is owned by exactly one layer, never both__. These six are the environment's, so:

- They are __always read-only__ on `/admin/configuration`, whether or not the variable is currently set — shown with an `Environment` badge naming the variable. A write is refused with a `409`.
- The value shipped in `app-default-config.json` for such a key is a __boot fallback__, not a setting. It exists so a fresh install comes up.
- To change one: set the variable in `.env` and restart. Nothing here writes `.env`, by design.

`ngdpbase.application.base-url` is the one asymmetry: it may equally be set in `app-custom-config.json` — the install wizard writes it there — so its UI copy names both routes. It is listed because `docker-compose-traefik.yml` composes it at deploy time and `InstallService` names the variable as the alternative for headless installs, so the environment must remain a valid source.

This replaced a hardcoded map inside `getProperty` that nothing outside could see, which is how the admin screen came to accept and persist edits that could never take effect ([#1089](https://github.com/jwilleke/ngdpbase/issues/1089), `a1c0d38c`).

### Env references inside config values

Any config value may reference an environment variable. Resolution happens __at lookup time__, per `getProperty()` call — not at config load — so a test that mutates `process.env` mid-run sees the new value on the next read (`ConfigurationManager.ts:710-756`).

There are three forms, with deliberately different failure modes:

| Form | Example | On unset variable |
|---|---|---|
| Bare, whole-value | `"$NGDPBASE_ADMIN_PASSWORD"` | __Throws__, naming the variable and the config key that referenced it |
| Brace, embedded | `"${SLOW_STORAGE}/pages"` | __Silent__ — leaves the placeholder intact |
| Escape | `"$$literal"` | Resolves to `"$literal"` |

The asymmetry is intentional. A bare whole-value ref is how a __secret__ is supplied, and a missing secret should stop the boot with an actionable message rather than fall back to something. The error is written for the operator:

```text
Config secret `NGDPBASE_ADMIN_PASSWORD` referenced by
`ngdpbase.user.security.defaultpassword` but env var is unset.
Add `NGDPBASE_ADMIN_PASSWORD=...` to your .env (or k8s Secret) and restart.
```

The brace form is legacy behaviour preserved for __path templates__, where an unresolved placeholder surfaces loudly at filesystem use-time anyway (`"${UNSET}/sessions"` throws `ENOENT` when something tries to use it). Both forms increment audit counters used for a boot-time summary log.

### The listen port

`app.listen` binds at boot step 3, before `engine.initialize()` at step 4 — deliberately, so the process accepts connections and serves the maintenance page while the engine indexes. There is therefore no `ConfigurationManager` to ask when the socket is bound, which is why the port has its own small resolver (`src/utils/resolveListenPort.ts`):

`PORT` → `NGDPBASE_PORT` → `ngdpbase.server.port` → `3000`

`PORT` wins because containers set it. The config key is consulted by reading the two config files directly — no `${VAR}` resolution and no override handling, since duplicating those would be a second config implementation rather than a bridge.

A value that is not a valid port is skipped rather than fatal, and resolution continues to the next source: refusing to boot over a typo would be worse than ignoring it, and a bad `PORT` must not discard a good configured value.

Until `a47f6932` ([#1090](https://github.com/jwilleke/ngdpbase/issues/1090)) `app.listen` read `PORT` alone and never consulted the key at all, while a separate expression resolved a "port" through the config layer for the startup banner — so the two could disagree, and the config screen could report a port the server was not listening on.

## Layer 3 — install

Installation state is a `.install-complete` marker file in `FAST_STORAGE` (`InstallService.ts:181-211`). Its absence means the setup wizard at `/install` is required.

### Interactive

A fresh instance with no marker serves the wizard. `WikiEngine` creates the bootstrap `admin` account on the boot that finds an empty user store.

### Headless

`HEADLESS_INSTALL=true` skips the wizard entirely (`app.ts:262`, `InstallService.ts:620-660`): copies required pages into the pages directory, writes the marker, done. The operator supplies `<FAST_STORAGE>/config/app-custom-config.json` beforehand — via volume mount or ConfigMap — or relies on the env-var overrides above. __No template config is seeded__; there is no `*.example` file to copy.

### Fresh-clone helper

```bash
./server.sh setup --config /path/to/app-custom-config.json
```

Installs dependencies, builds, copies the supplied config into `<FAST_STORAGE>/config/app-custom-config.json`, exports `HEADLESS_INSTALL=true`, and starts the server (`server.sh:540-568`). Without `--config` it is just install + build + start, and the wizard is reachable.

### The bootstrap admin password

`ngdpbase.user.security.defaultpassword` ships as the literal `"admin123"`. It is applied __only__ on the boot that finds an empty user store, and is read inside `createDefaultAdmin()` rather than at startup — so an instance that already has an admin never resolves it. That indirection is deliberate: if the key were read on every boot, an install whose operator points it at an env-ref would refuse to start once the variable was removed, even though the value would never be used.

To supply it from the environment instead, set the key to `"$NGDPBASE_ADMIN_PASSWORD"` in `app-custom-config.json` and put the value in `.env`. Because that is a bare ref, an unset variable then stops the boot rather than quietly falling back.

`isAdminUsingDefaultPassword()` drives a startup warning banner that persists until the password is changed.

> __Known defect:__ `InstallService.ts:606-609` states that a headless install "refuses to start" when `NGDPBASE_ADMIN_PASSWORD` is unset. __It does not.__ The env-ref is opt-in, not shipped, so a headless deploy with that variable unset comes up with `admin` / `admin123` — failing open to a well-known credential where the doc says it fails closed. `UserManager.ts:247` carries the same wrong claim while `UserManager.ts:430` states it correctly. Tracked in [#1087](https://github.com/jwilleke/ngdpbase/issues/1087).

## Setting `.env` values

__By hand.__ Nothing in `src/`, `scripts/`, `server.sh`, or `docker/` writes a `.env` file; the only writes anywhere in the tree are test fixtures in `src/__tests__/bootstrap-env.test.ts`.

`.env` is gitignored (`.gitignore:68-71` ignores `.env` and `.env.*` while keeping `!.env.example`). Copy the template and fill it in:

```bash
cp .env.example .env
```

### The intended split

- __`.env`__ — secrets and machine-specific paths. Never committed.
- __`app-custom-config.json`__ — instance settings. May *reference* a secret with `"$VAR"` rather than containing it.

That split is what lets an instance config be committed or managed by GitOps while the secrets stay out of it.

### Keys worth knowing

| Variable | Purpose |
|---|---|
| `FAST_STORAGE` | Operational data: sessions, logs, users, search index, config, and the per-instance `.env` |
| `SLOW_STORAGE` | Bulk content: pages, attachments, backups. May be a NAS or cold-storage mount |
| `INSTANCE_DATA_FOLDER` | Legacy alias for `FAST_STORAGE`, still honoured as a fallback |
| `INSTANCE_CONFIG_FILE` | Overrides the instance config filename |
| `PORT` | Listen port, default 3000 |
| `NODE_ENV` | `production` turns on secure session cookies by default |
| `NGDPBASE_ADMIN_PASSWORD` | Only used when the config key points at it (see above) |
| `HEADLESS_INSTALL` | `true` skips the setup wizard |

Both storage variables default to `./data`, so a single-drive setup can leave them alone or point both at the same path.

### Multiple instances on one machine

Instance separation is environment-driven rather than first-class: give each instance its own `FAST_STORAGE`, `SLOW_STORAGE`, `PORT`, and optionally `INSTANCE_CONFIG_FILE`. `server.sh` refuses to start a second instance on an occupied port, and a single `.ngdpbase.pid` lock guards against two processes sharing one checkout.

## Container deployments

`docker/docker-compose.yml` passes `NODE_ENV`, `INSTANCE_DATA_FOLDER`, `INSTANCE_CONFIG_FILE`, and `EXTERNAL_PORT` through the `environment:` block, mounts `../data` at `/app/data`, and mounts `../required-pages` read-only. Because `bootstrap-env.ts` runs regardless of launcher, a `.env` placed on the mounted data volume is picked up — which is the whole reason that module exists.

## Related

- [`SETUP.md`](../SETUP.md) — first-time setup walkthrough
- [`docs/SEMVER.md`](./SEMVER.md) — release and version bumping
- `config/app-default-config.json` — every shipped key, with `_comment_*` entries explaining the non-obvious ones
- `.env.example` — annotated template
- [#1087](https://github.com/jwilleke/ngdpbase/issues/1087) — __open__: headless install admin-password documentation defect
- [#1088](https://github.com/jwilleke/ngdpbase/issues/1088) — resolved in `3d8ef679`: `bootstrap-env` consolidated across every entry point
- [#1089](https://github.com/jwilleke/ngdpbase/issues/1089) — resolved in `a1c0d38c`: environment-owned keys declared and read-only in the admin UI
- [#1090](https://github.com/jwilleke/ngdpbase/issues/1090) — resolved in `a47f6932`: `ngdpbase.server.port` now binds the port
