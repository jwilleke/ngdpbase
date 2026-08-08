# Direct install

Recommended for most operators. Runs ngdpbase as a regular Node.js process on a single machine.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- A computer you can shell into — Mac, Linux server, a Raspberry Pi 4+, or a small VPS.
- Node.js 24 or newer (`node --version`). The `engines` field in `package.json` requires `>=24.0.0`; older versions fail at `npm ci` with an `EBADENGINE` error.
- `git`.
- A few GB of free disk for code, addons, page data, and logs.
- A free network port (default 3000; configurable in `.env`).
- (Optional) `pm2` for process supervision so the wiki restarts after a crash or reboot. Installed via `npm install -g pm2`. `./server.sh start` uses pm2 under the hood when present.
- (Optional) A reverse proxy in front if you want HTTPS or a friendly hostname — Caddy, nginx, or Cloudflare Tunnel are all common choices.

If any of these is unfamiliar or unavailable, look at **[Docker Compose](./docker-compose.md)** — it bundles Node.js and the supervisor into a single container layer, so the requirements list is shorter (just Docker).

## Steps

### 1. Clone the repo

```bash
git clone https://github.com/jwilleke/ngdpbase.git
cd ngdpbase
```

### 2. Install dependencies and build

```bash
npm ci                     # reproducible install from package-lock.json
npm run build              # compiles TypeScript + bundles addons
```

### 3. (Optional) Configure `.env`

If you want non-default storage paths or per-instance overrides, create `.env` at the repo root:

```bash
# Operational data — sessions, users, logs, config, search index
FAST_STORAGE=/path/to/fast-storage/data

# Bulk content — pages, attachments (often the same disk as FAST_STORAGE for small sites)
SLOW_STORAGE=/path/to/slow-storage/data

# Optional port override (default 3000)
PORT=3000
```

Without `.env`, the server falls back to `./data` for everything and uses port 3000. `./server.sh` sources this file automatically on start.

### 4. (Optional) Pre-supply `app-custom-config.json` to skip the wizard

If you'd rather not click through the browser install wizard, drop a config at `${FAST_STORAGE:-./data}/config/app-custom-config.json` before first start:

```json
{
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.application-name": "My Wiki",
  "ngdpbase.theme.active": "default",
  "ngdpbase.page.provider": "versioningfileprovider"
}
```

Set `HEADLESS_INSTALL=true` in the environment (or `.env`) to also skip the wizard at runtime, and set `NGDPBASE_ADMIN_PASSWORD` alongside it. Headless mode creates the `admin` user with that password; with the variable unset it refuses to start, because ngdpbase ships no default admin password. Change the password immediately after first login.

If you go headless and want a pre-named Organization (rather than the wizard-driven seed), pre-supply the JSON-LD file too. See [Headless deployment gotchas §1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization-json-ld-must-be-pre-supplied) for the exact shape.

### 5. Start the server

```bash
./server.sh start          # production mode (default)
./server.sh start dev      # development mode (auto-reload, verbose logging)
./server.sh status         # show pm2 status if pm2 is installed
./server.sh stop
./server.sh restart
```

`./server.sh` is the supported entrypoint. Do not run `node dist/src/app.js` directly — it bypasses the `.env` sourcing, the FAST_STORAGE/SLOW_STORAGE resolution, and the pm2 lifecycle.

Open `http://localhost:3000` — if you skipped step 4 you'll see the install wizard; otherwise the front page.

### 6. (Optional) Reverse proxy + HTTPS

ngdpbase listens on plain HTTP. For HTTPS use any reverse proxy in front:

- **Caddy** — simplest TLS-by-default option; one-line Caddyfile.
- **nginx** — proxy_pass example in [`docker/DOCKER.md`](../../../docker/DOCKER.md#using-with-reverse-proxy).
- **Cloudflare Tunnel** — no public IP required; tunnel terminates TLS at the edge.

After wiring the proxy, update `app-custom-config.json`:

```json
{
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.session.secure": true
}
```

`session.secure: true` requires HTTPS — set it only after the proxy is verified working.

### 7. (Optional) Persist across reboots with pm2

If pm2 is installed and you used `./server.sh start`, pm2 holds the process. To make it survive a reboot:

```bash
pm2 save                   # snapshot the running process list
pm2 startup                # prints a one-liner to register the systemd / launchd unit; copy and run it
```

On macOS this registers a launchd plist; on Linux a systemd unit. Test with `sudo reboot` before declaring victory.

> See [`docker/HEADLESS-DEPLOYMENT-NOTES.md`](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md) for the deeper operational notes (anchor Organization, theme/front-page/page-provider config, session-secret rotation, addon UUID rules). Most of those notes apply to direct install too, since the underlying app behavior is the same.

## Verifying the install

After step 5:

```bash
# Front page returns 200
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:3000/

# Server is bound (look for the actual port if you changed it)
ss -ltnp 2>/dev/null | grep ':3000' || lsof -iTCP -sTCP:LISTEN -P | grep ':3000'

# Logs are clean (no startup errors)
tail -n 200 ${FAST_STORAGE:-./data}/logs/ngdpbase.log
```

Then in a browser:

1. Open `http://localhost:3000` — you should see the front page (or the install wizard if you skipped step 4).
2. Log in as `admin` (password: `NGDPBASE_ADMIN_PASSWORD` for headless, or whatever you set in the wizard).
3. Change the admin password immediately if the bootstrap value is shared with anyone.
4. Confirm the admin dashboard loads (`/admin`) and addons appear under **Add-ons**.

If the front page returns 200 but the admin user resolves as `Anonymous`, you've probably hit [Headless deployment gotchas §1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization-json-ld-must-be-pre-supplied) (missing anchor Organization). Stop the server, supply the JSON-LD, restart.

## Updating

```bash
git pull
npm ci
npm run build
./server.sh restart
```

That's the same sequence the [`/othersites`](../../../.claude/commands/othersites.md) automation runs across the project's own dev installs — if it works there it works for you.

When upgrading across a minor version (e.g., `3.12.x → 3.13.x`), check the [CHANGELOG](../../../CHANGELOG.md) for any operator-visible changes before pulling. Patch bumps are safe to apply unattended; minor and major bumps may add new config keys with defaults you might want to override.

## Backup and restore

The single thing worth backing up is the data directory:

- Default location: `./data` at the repo root.
- With `.env`: `FAST_STORAGE` plus `SLOW_STORAGE` if you split them.

That directory holds everything stateful — pages, users, sessions, config, addon data, logs, search index. The code in `dist/` and `node_modules/` can always be rebuilt from `git pull && npm ci && npm run build`.

```bash
# Stop the server first so file writes are quiesced
./server.sh stop

# Snapshot
tar -czf ngdpbase-data-$(date +%Y%m%d).tar.gz -C "${FAST_STORAGE:-./data}" .
# (If FAST and SLOW are separate, snapshot both)

./server.sh start
```

To restore: extract the tarball back into `${FAST_STORAGE:-./data}`, then `./server.sh start`. The first request rebuilds the in-memory caches.

For continuous backups consider `restic`, `borg`, `rsync` over SSH to a NAS, or a cloud-storage sync — anything that snapshots a directory works.

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::3000
```

Set `PORT=8080` in `.env` (or any other free port) and restart. Or find the process holding 3000: `lsof -iTCP:3000 -sTCP:LISTEN`.

### Permission errors on the data directory

`./server.sh` runs as your user. If `FAST_STORAGE` or `SLOW_STORAGE` points at a directory owned by a different user, expect EACCES. Fix:

```bash
sudo chown -R $(id -u):$(id -g) /path/to/storage
```

### Node version too old

```
SyntaxError: Unexpected token '?' / Unexpected token '?.'
```

You're on Node < 20. Upgrade via `nvm install 20` (or `nvm install 24` for the dev convention).

### Addon discovery failures

```
[AddonsManager] Skipping <addon>/pages/<file>.md — missing or invalid uuid in frontmatter
```

See [Headless deployment gotchas §7](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#7-addonsmanager-validates-seed-page-uuids-strictly) — the addon ships placeholder UUIDs that don't pass the strict v4 regex. Either fix the addon's seed pages, or accept that those pages won't seed.

If addons in a non-default directory aren't loading at all, you may have hit [§4](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#4-addons-path-string-replaces-array-supplements) — a string `addons-path` replaces the default `./addons` rather than supplementing it. Use the array form.

### Logged-in users get bumped to Anonymous after a restart

You're hitting [§8](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#8-use-a-stable-session-secret) — without `SESSION_SECRET`, the server generates a fresh one on every boot and existing session cookies stop validating. Set a stable one in `.env`:

```bash
SESSION_SECRET=$(openssl rand -base64 32)
```

### Anything else

Tail `${FAST_STORAGE:-./data}/logs/ngdpbase.log` while reproducing the problem — it's the single source of truth for what the server actually saw.
