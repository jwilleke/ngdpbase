# Docker Compose

The easiest way to try ngdpbase. Runs the wiki in a container on a single machine. Good for evaluation, homelab setups, and small single-host production deployments.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- A computer with Docker installed:
  - **Mac / Windows:** Docker Desktop.
  - **Linux:** Docker Engine + the `docker compose` plugin (most distros include it; on Debian/Ubuntu it's the `docker-compose-plugin` package).
- A few GB of free disk for the image, page data, and logs.
- A free network port to expose the wiki on.
- (Optional) A reverse proxy if you want HTTPS or a hostname instead of `localhost:3000`. The repo ships a Traefik variant that handles this in one file.

If you don't have Docker installed and don't want to install it, the **[Direct install](./direct-install.md)** mode is simpler — it only needs Node.js.

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

Then add `HEADLESS_INSTALL=true` to the environment (`.env`, or directly under `environment:` in the compose file), and set `NGDPBASE_ADMIN_PASSWORD` alongside it. Headless install creates the `admin` user with that password; with the variable unset it refuses to start, because ngdpbase ships no default admin password. Change the password on first login.

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

### 5. Open the wiki

- Plain variant: `http://localhost:${HOST_PORT}` (`http://localhost:3000` by default).
- Traefik variant: `https://${NGDPBASE_DOMAIN}` — DNS must resolve to the Traefik host.

If you skipped step 3 you'll land on the install wizard. Otherwise the front page renders directly and you can log in.

## Adding addons

Two patterns. Pick based on whether you want a single self-contained image (bake-in) or a faster iteration loop (mount-at-runtime).

### Pattern A — bake addons into a derivative image (recommended for production)

Build your own image `FROM ghcr.io/jwilleke/ngdpbase:X.Y.Z` and `COPY` addon code in. The image is self-contained, reproducible, and tagged independently from ngdpbase.

This is what [GeoHazardWatch](https://github.com/jwilleke/geohazardwatch) does — its `Dockerfile` is a working example you can read and adapt.

Skeleton:

```dockerfile
FROM ghcr.io/jwilleke/ngdpbase:3.13.2
USER root
COPY ./my-addons/ /app/addons-extra/
RUN chown -R node:node /app/addons-extra
USER node
ENV NGDPBASE_MANAGERS_ADDONS_MANAGER_ADDONS_PATH='["/app/addons","/app/addons-extra"]'
```

The `addons-path` env var is JSON-encoded because it's an array. See [Headless gotchas §4](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#4-addons-path-string-replaces-array-supplements) — using a bare string here silently kills the built-in addons because the string form *replaces* the default rather than *supplementing* it.

### Pattern B — mount addons as a volume

Simpler for local iteration, no rebuild needed. Mount the addon directory into the container and extend `addons-path`:

```yaml
services:
  ngdpbase:
    volumes:
      - ./data:/app/data
      - ./my-addons:/app/addons-extra:ro
    environment:
      NGDPBASE_MANAGERS_ADDONS_MANAGER_ADDONS_PATH: '["/app/addons","/app/addons-extra"]'
```

Trade-offs: the addon directory has to live somewhere the compose host can see, the image isn't self-contained for cross-host moves, and you have to remember to mount it on every host.

### Common gotchas for both patterns

- **UUIDs must be real v4** — placeholder UUIDs in seed-page frontmatter silently fail. See [§7](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#7-addonsmanager-validates-seed-page-uuids-strictly).
- **Theme / front-page / page-provider are operator settings** — addons can't override them. Set in `app-custom-config.json`. See [§3](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#3-theme-front-page-page-provider-are-not-auto-set-by-addons).
- **Tracked in [#673](https://github.com/jwilleke/ngdpbase/issues/673)** — a "packaged" addon distribution model (npm install) is under discussion as a third pattern. Not shipped yet.

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

You haven't set `SESSION_SECRET`. Without it, the server generates a fresh one on every restart and existing session cookies stop validating. See [§8](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#8-use-a-stable-session-secret) — pass via `environment:` in the compose file (or `.env`):

```yaml
environment:
  SESSION_SECRET: ${SESSION_SECRET}
```

Generate once with `openssl rand -base64 32`.

### Admin logs in but resolves as Anonymous (no Edit button)

The headless install created the user but couldn't bind the admin role because there was no anchor Organization. See [§1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization-json-ld-must-be-pre-supplied) and §2's cleanup recipe to re-trigger `createDefaultAdmin` cleanly.
