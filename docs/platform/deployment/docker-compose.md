# Docker Compose

The easiest way to try ngdpbase. Runs the wiki in a container on a single machine. Good for evaluation, homelab setups, and small single-host production deployments.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- A computer with Docker installed:
  - **Mac / Windows:** Docker Desktop.
  - **Linux:** Docker Engine + the `docker compose` plugin (most distros include it; on Debian/Ubuntu it's the `docker-compose-plugin` package).
- A few GB of free disk for the image, page data, and logs.
- A free network port to expose the wiki on.
- (Optional) A reverse proxy if you want HTTPS or a hostname instead of `localhost:3000`.

If you don't have Docker installed and don't want to install it, the **Direct install** mode is simpler — it only needs Node.js.

## Steps

> **TODO** — full walkthrough. The shape of the section will be:
>
> 1. Pull the published image (`docker pull ghcr.io/jwilleke/ngdpbase:latest`) — no build required for the platform itself.
> 2. Author a minimal `docker-compose.yml` with one service, one volume for the data directory, and one port mapping.
> 3. Author a minimal `app-custom-config.json` (or rely on defaults).
> 4. `docker compose up -d`.
> 5. Open `http://localhost:3000` and confirm the front page renders.
> 6. Optional: drop in a reverse-proxy service (Caddy or nginx) in the same compose file for HTTPS.

A reference `docker-compose.yml` will live in this doc so an operator can copy-paste-modify.

## Adding addons

> **TODO** — two patterns:
>
> - **Bake them in** by building your own image `FROM ghcr.io/jwilleke/ngdpbase:X.Y.Z` and `COPY`ing addon code in. This is what [GeoHazardWatch](https://github.com/jwilleke/geohazardwatch) does.
> - **Mount them at runtime** as a volume — simpler, no rebuild needed, but the addon directory must live somewhere the compose host can see.

## Updating

> **TODO** — `docker compose pull && docker compose up -d`. Or pin to a specific tag and bump it deliberately.

## Backup and restore

> **TODO** — the named volume mapped to the data directory holds everything stateful.

## Troubleshooting

> **TODO** — port conflicts, permission errors on the volume mount, image pull failures, addon-not-discovered.
