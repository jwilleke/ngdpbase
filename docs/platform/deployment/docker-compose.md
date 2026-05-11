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
> 1. Copy [`docker/docker-compose.yml`](../../../docker/docker-compose.yml) from the repo (or `docker-compose-traefik.yml` if you want HTTPS via Traefik baked in).
> 2. Author a minimal `app-custom-config.json` (or rely on defaults).
> 3. Adjust port mapping, volume host paths, and any env-var overrides for your machine.
> 4. `docker compose up -d`.
> 5. Open the configured host port and confirm the front page renders.
> 6. Optional: replace Traefik with Caddy or nginx if you prefer a different reverse-proxy.

See also [`docker/DOCKER.md`](../../../docker/DOCKER.md) and [`docker/TRAEFIK-DEPLOYMENT.md`](../../../docker/TRAEFIK-DEPLOYMENT.md) for the operational notes that exist today; this doc will distill them into a small-org-friendly tutorial.

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
