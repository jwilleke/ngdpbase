# Docker Compose

> __Run-as user (required):__ `docker/.env` sets `PUID` / `PGID` (standard `1000` / `1000`), which `docker-compose.yml` passes in. The container starts as root, gives the data folder to that user and switches to it; it refuses to start without them and never runs as root — see [Run-as user](../../guides/bootstrap-developer-guide.md#run-as-user-puidpgid) ([#1693](https://github.com/jwilleke/ngdpbase/issues/1693)).

The easiest way to try ngdpbase. Runs the wiki in a container on a single machine. Good for evaluation, homelab setups, and small single-host production deployments.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- A computer with Docker installed:
  - __Mac / Windows:__ Docker Desktop.
  - __Linux:__ Docker Engine + the `docker compose` plugin (most distros include it; on Debian/Ubuntu it's the `docker-compose-plugin` package).
- A few GB of free disk for the image, page data, and logs.
- A free network port to expose the wiki on.
- (Optional) A reverse proxy if you want HTTPS or a hostname instead of `localhost:3000`. The repo ships a Traefik variant that handles this in one file.

If you don't have Docker installed and don't want to install it, the __[Direct install](./direct-install.md)__ mode is simpler — it only needs Node.js.

## Steps

### 1. Pick a compose file

The repo ships two starter compose files. Pick the one that matches your situation:

| File | Use when |
|---|---|
| [`docker/docker-compose.yml`](../../../docker/docker-compose.yml) | You're evaluating, running on a homelab, or behind an existing reverse proxy. Plain `:3000` exposed on the host. |
| [`docker/docker-compose-traefik.yml`](../../../docker/docker-compose-traefik.yml) | You want HTTPS via Traefik + Let's Encrypt baked in. Requires an existing Traefik instance + the `traefik_net` external network. See [`docker/TRAEFIK-DEPLOYMENT.md`](../../../docker/TRAEFIK-DEPLOYMENT.md) for the full Traefik + Authelia walkthrough. |

Copy whichever fits to your deployment host:

```bash
# Example: plain variant
mkdir -p ~/ngdpbase && cd ~/ngdpbase
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/docker-compose.yml -o docker-compose.yml
```

You can also just `git clone` the repo and `cd docker` — either is fine.

### 2. Configure `.env`

The compose files read host port and UID/GID from a sibling `.env`:

```bash
cp .env.example .env   # if you cloned the repo
# or create one by hand:
cat > .env <<'EOF'
HOST_PORT=3000
UID=1000
GID=1000
EOF
```

- `HOST_PORT` — the port the wiki is exposed on. Change if `3000` is in use.
- `UID` / `GID` — match your host user so files created in the volume aren't owned by root. `id -u` and `id -g` print yours.

For the Traefik variant also set `NGDPBASE_DOMAIN=wiki.example.com` plus DNS pointing at your Traefik host. See [`TRAEFIK-DEPLOYMENT.md`](../../../docker/TRAEFIK-DEPLOYMENT.md) for the full label set.

### 3. (Optional) Pre-supply a custom config to skip the wizard

If you'd rather not click through the browser install wizard, drop a config at `./data/config/app-custom-config.json` before first start:

```json
{
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.application-name": "My Wiki",
  "ngdpbase.theme.active": "default",
  "ngdpbase.front-page": "Welcome",
  "ngdpbase.page.provider": "versioningfileprovider"
}
```

Then add `HEADLESS_INSTALL=true` to the environment (`.env`, or directly under `environment:` in the compose file). Headless install creates the `admin` user with the default password `admin123` — change it on first login. To supply your own instead, point `ngdpbase.user.security.defaultpassword` at `"$NGDPBASE_ADMIN_PASSWORD"` and set that variable.

If you set `HEADLESS_INSTALL=true` and also want a pre-named Organization (avoiding the wizard's seed step), pre-supply the JSON-LD file at `./data/organizations/<name>.json` and point at it from the custom config. See [Headless deployment gotchas §1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization-json-ld-must-be-pre-supplied) for the exact shape — skipping this leaves the admin user with no role bindings and they resolve as Anonymous despite a successful login.

### 4. Start the container

```bash
docker compose up -d              # plain variant
# or, for the Traefik variant:
docker compose -f docker-compose-traefik.yml up -d
```

First boot pulls `ghcr.io/jwilleke/ngdpbase:latest` (or whatever tag the compose file pins), creates the data volume, and starts. Tail logs:

```bash
docker compose logs -f
```

Then wait until it is ready to serve:

```bash
until curl -fs http://localhost:${HOST_PORT:-3000}/health/readiness; do sleep 3; done
```

`/health/readiness` answers `503` while the engine is still starting — the first boot seeds and indexes pages, which can take minutes on a large page set — and `200` once it can serve, with a body such as `{"status":"ok","checks":{"pageProvider":true,"dataDirWritable":true}}`.

The image `HEALTHCHECK` probes `/health/liveness`, which answers `200` whenever the process can answer, including during startup. So `docker ps` showing __healthy__ means "running", not "ready". Point anything that decides whether to send traffic — a reverse proxy, a load balancer, an uptime monitor, a deploy script — at `/health/readiness`. Leave the `HEALTHCHECK` on liveness: on readiness, a long first boot would be marked unhealthy and could be restarted mid-index.

### 5. Open the wiki

- Plain variant: `http://localhost:${HOST_PORT}` (`http://localhost:3000` by default).
- Traefik variant: `https://${NGDPBASE_DOMAIN}` — DNS must resolve to the Traefik host.

If you skipped step 3 you'll land on the install wizard. Otherwise the front page renders directly and you can log in.

## Adding addons

Bundled add-ons are in the image; enable them in config. To add a published add-on, name it in the site's `app-custom-config.json` under `ngdpbase.addons.install`; core installs and verifies it into the data volume at start, and the stock image is used unmodified ([`domain-site.md`](./domain-site.md)). There is no image of your own to build.

### Mount an add-on from a local folder (development only)

For iterating on an add-on you are writing, mount its folder and extend `addons-path`. This is a development setup, not a way to deploy:

```yaml
services:
  ngdpbase:
    volumes:
      - ./data:/app/data
      - ./my-addons:/app/addons-extra:ro
    environment:
      NGDPBASE_MANAGERS_ADDONS_MANAGER_ADDONS_PATH: '["/app/addons","/app/addons-extra"]'
```

The `addons-path` env var is JSON-encoded because it's an array. See [Headless gotchas §4](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#4-addons-path-string-replaces-array-supplements) — using a bare string here silently kills the built-in addons because the string form *replaces* the default rather than *supplementing* it.

### Common gotchas

- __UUIDs must be real v4__ — placeholder UUIDs in seed-page frontmatter silently fail. See [§7](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#7-addonsmanager-validates-seed-page-uuids-strictly).
- __Theme / front-page / page-provider are operator settings__ — addons can't override them. Set in `app-custom-config.json`. See [§3](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#3-theme-front-page-page-provider-are-not-auto-set-by-addons).

## Updating

```bash
docker compose pull
docker compose up -d
```

That pulls whatever tag the compose file pins (typically `:latest`) and recreates the container. The data volume persists across the recreation; pages, users, sessions, addons all survive.

For predictable updates pin to a specific tag in the compose file:

```yaml
image: ghcr.io/jwilleke/ngdpbase:3.13.2   # explicit version
# image: ghcr.io/jwilleke/ngdpbase:3.13    # latest patch in 3.13.x
# image: ghcr.io/jwilleke/ngdpbase:3       # latest minor in 3.x
# image: ghcr.io/jwilleke/ngdpbase:latest  # rolling
```

Before a minor/major bump, check the [CHANGELOG](../../../CHANGELOG.md) and back up the data volume (see below). Patch bumps are safe to apply unattended.

## Backup and restore

The compose files map a host directory (`./data`) or a named volume to `/app/data` inside the container. That directory holds everything stateful — pages, users, sessions, config, addon data, logs, search index. Back it up and you can rebuild anywhere.

### Bind-mount backup (default `./data` setup)

```bash
docker compose stop
tar -czf ngdpbase-data-$(date +%Y%m%d).tar.gz -C ./data .
docker compose start
```

### Named-volume backup

If you switched to a named volume (e.g., `ngdpbase_data`):

```bash
docker run --rm \
  -v ngdpbase_data:/data \
  -v $(pwd):/backup \
  alpine tar -czf /backup/ngdpbase-data-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

Extract back into the same location (bind mount path or named volume) before `docker compose up -d`. The wiki rebuilds in-memory caches from the restored state on the next request.

## Troubleshooting

### Port conflict on the host

```
Error response from daemon: driver failed programming external connectivity ... 0.0.0.0:3000: address already in use
```

Change `HOST_PORT` in `.env` and `docker compose up -d` again.

### Permission errors on the data volume

Files in `./data` are owned by root (or some random UID), and the host user can't `ls` them or edit `app-custom-config.json`. Set `UID` / `GID` in `.env` to match your host user (`id -u` / `id -g`), then:

```bash
sudo chown -R $(id -u):$(id -g) ./data
docker compose restart
```

See [`DOCKER.md` — User Permissions](../../../docker/DOCKER.md#user-permissions-uidgid) for the long version.

### Image pull fails

```
Error response from daemon: Head "https://ghcr.io/...": denied
```

GHCR images for this project are public — no auth needed. Most causes:

- Network: check `docker pull alpine` works.
- Tag doesn't exist: see the [available tags](https://github.com/jwilleke/ngdpbase/pkgs/container/ngdpbase).
- Rate limit on anonymous pulls: rare for GHCR, but `docker login ghcr.io` with a personal access token fixes it.

### Addon not discovered

The boot log is the single source of truth:

```bash
docker compose logs ngdpbase | grep -i 'addon\|skip'
```

Likely causes (in order):

1. `addons-path` set as a string instead of a JSON array → see [§4](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#4-addons-path-string-replaces-array-supplements).
2. Seed-page UUIDs aren't real v4 → see [§7](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#7-addonsmanager-validates-seed-page-uuids-strictly).
3. Volume mount didn't actually attach — `docker compose exec ngdpbase ls /app/addons-extra` to verify.

### Logged-in users get bumped to Anonymous after a restart

The session secret changed. Without `NGDPBASE_SESSION_SECRET`, ngdpbase generates one on first boot and saves it to the data volume's `.env`, so it changes only when that volume does not persist. Mount a persistent volume at `/app/data`, or pass a stable secret via `environment:` in the compose file. See [§8](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#8-use-a-stable-session-secret).

```yaml
environment:
  NGDPBASE_SESSION_SECRET: ${NGDPBASE_SESSION_SECRET}
```

The name must be exactly `NGDPBASE_SESSION_SECRET`; `SESSION_SECRET` is silently ignored.

Generate once with `openssl rand -base64 32`.

### Admin logs in but resolves as Anonymous (no Edit button)

The headless install created the user but couldn't bind the admin role because there was no anchor Organization. See [§1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization-json-ld-must-be-pre-supplied) and §2's cleanup recipe to re-trigger `createDefaultAdmin` cleanly.
