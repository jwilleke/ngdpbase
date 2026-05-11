# Direct install

Recommended for most operators. Runs ngdpbase as a regular Node.js process on a single machine.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- A computer you can shell into — Mac, Linux server, a Raspberry Pi 4+, or a small VPS.
- Node.js 20 or newer (`node --version`).
- `git`.
- A few GB of free disk for code, addons, page data, and logs.
- A free network port (default 3000; configurable in `.env`).
- (Optional) `pm2` for process supervision so the wiki restarts after a crash or reboot. Installed via `npm install -g pm2`.
- (Optional) A reverse proxy in front if you want HTTPS or a friendly hostname — Caddy, nginx, or Cloudflare Tunnel are all common choices.

If any of these is unfamiliar or unavailable, look at **Docker Compose** — it bundles Node.js and the supervisor into a single container layer, so the requirements list is shorter (just Docker).

## Steps

> **TODO** — full walkthrough. The shape of the section will be:
>
> 1. Clone the repo.
> 2. Install dependencies.
> 3. Build.
> 4. Configure `.env` and `app-custom-config.json`.
> 5. Start the server.
> 6. Optional: wire up a reverse proxy + HTTPS.
> 7. Optional: install pm2 and persist across reboots.
>
> See [`docker/HEADLESS-DEPLOYMENT-NOTES.md`](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md) for the operationally-detailed notes that exist today; this doc will distill them into a small-org-friendly tutorial.

## Verifying the install

> **TODO** — `curl http://localhost:3000/` returns 200, admin login works, addon discovery logs are clean.

## Updating

> **TODO** — `git pull`, `npm ci`, `npm run build`, `./server.sh restart`. (This is what the [`/othersites`](../../../.claude/commands/othersites.md) skill automates for the project's own dev installs.)

## Backup and restore

> **TODO** — the data directory (`./data` by default, or `FAST_STORAGE`) holds everything stateful: pages, users, sessions, config, addon data, logs. Back up that directory and you can rebuild anywhere.

## Troubleshooting

> **TODO** — port already in use, permission errors on the data directory, Node version too old, addon discovery failures.
