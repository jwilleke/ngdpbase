# Implementation

The lead document for running ngdpbase. It names the four ways an instance is implemented, what each one inherits from this repository and what it does not, and where its environment, configuration and data live. Every other installation and deployment document is a detail page under one of these four; this page says which one you are reading about.

Read this first. If a question is "where does this value go so that instance X gets it", the answer starts with which method instance X is.

## The four methods

| Method | Code arrives by | Environment comes from | Configuration lives in | Upgrades arrive by | Examples |
|---|---|---|---|---|---|
| [1. Direct install](#1-direct-install) | `git clone` of this repo, built on the host | `.env` in the checkout, and `<FAST_STORAGE>/.env` | `<FAST_STORAGE>/config/app-custom-config.json` | `git pull`, `npm ci`, `npm run build`, `./server.sh restart` — by hand | jimstest, The Fairways, `ngdp-temp-builds` |
| [2. Container from the published image](#2-container-from-the-published-image) | `docker pull ghcr.io/jwilleke/ngdpbase:<tag>` | `ENV` baked in the image, plus the compose `environment:` block, plus an optional `.env` on the data volume | `/app/data/config/app-custom-config.json` on the mounted volume | pull the new tag and recreate the container | none of ours in production; the CI image smoke |
| [3. Kubernetes with the published image](#3-kubernetes-with-the-published-image) | the same image, pulled by the cluster | `ENV` baked in the image, plus a ConfigMap and a Secret injected with `envFrom:` | `app-custom-config.json` on the persistent volume | image tag bump in the manifest — Renovate, Flux image automation, or a PR | `ngdpbase-demo` on deby |
| [4. Downstream image](#4-downstream-image) | a second repository whose Dockerfile is `FROM ghcr.io/jwilleke/ngdpbase:<version>` and adds its own addons | everything method 3 has, inherited through `FROM` | on the persistent volume, as method 3 | Renovate bumps the `FROM` version, the downstream repo publishes its own image, the cluster deploys it | geohazardwatch |

Two of these are what this project calls an __implementation__ of ngdpbase — an instance that is ngdpbase plus domain addons, under its own name — and they are built two different ways. The Fairways is method 1 with an addons directory from a second repository. geohazardwatch is method 4 deployed by method 3. That difference decides which files reach them, so it is worth being exact about.

## Known implementations

| Implementation | Repository | Method | Shape |
|---|---|---|---|
| The Fairways | [jwilleke/fairways-gen2-website](https://github.com/jwilleke/fairways-gen2-website) | __1. Direct install__ | The repository holds only the `fairways` addon and the content-migration tools. ngdpbase itself is a separate clone, `fairways-base`, built on the host and run by PM2 on port 2121; its `app-custom-config.json` points `addons-path` at this repository's `addons/`. Environment is `fairways-base/.env`; nothing arrives from the ngdpbase image. Upgrades are a `git pull` and rebuild of the base clone, by hand. |
| geohazardwatch | [jwilleke/geohazardwatch](https://github.com/jwilleke/geohazardwatch) | __4. Downstream image__, deployed by __3. Kubernetes__ | The repository holds its addons and a Dockerfile `FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}`. Renovate bumps that version, `auto-tag.yml` and `publish-image.yml` publish `ghcr.io/jwilleke/geohazardwatch:<tag>`, and `mj-infra-flux` deploys it on deby. Environment is the ngdpbase image `ENV` plus the Deployment's `env:` block; configuration is `app-custom-config.json` on the persistent volume. Upgrades arrive without hands. |
| ngdpbase-demo | this repository, stock | __3. Kubernetes__ | The published ngdpbase image with no downstream layer, deployed on deby from `mj-infra-flux`. The reference for what method 3 looks like with nothing added. |
| jimstest | this repository | __1. Direct install__ | The development instance: this checkout, run by PM2 from `./server.sh`, with `FAST_STORAGE` and `SLOW_STORAGE` on separate drives. Every release is built and restarted here first. |

The two implementations differ in exactly the way the inheritance table below predicts. A required environment variable reaches geohazardwatch through the image on the next base bump; it reaches The Fairways only when someone adds the line to `fairways-base/.env`. Configuration is per instance in both.

## What each method inherits from this repository

| Reaches the instance | 1. Direct | 2. Container | 3. Kubernetes | 4. Downstream image |
|---|---|---|---|---|
| Code and `dist/` | on `git pull` and rebuild | in the image | in the image | in the image, through `FROM` |
| `config/app-default-config.json` | on `git pull` | in the image | in the image | in the image, through `FROM` |
| Bundled addons under `addons/` | on `git pull` | in the image | in the image | in the image, plus the downstream repo's own |
| `docker/Dockerfile` `ENV` values | __no__ — a direct install never sees them | yes | yes | yes, through `FROM` |
| `.env` and `.env.example` | `.env.example` is the template you copy; `.env` is yours | neither; the image has no `.env` | neither | neither |
| `app-custom-config.json` | never; it is the instance's own | never | never | never |

The row that matters most is the Dockerfile `ENV` row. A value the application requires at boot must reach every instance. In methods 2, 3 and 4 it rides in the image and arrives with the next release on its own. In method 1 nothing rides: every required variable is a line the operator writes in `.env`. The rule for which file a new variable belongs in is [bootstrap-methodology.md — Where a new variable goes](../bootstrap-methodology.md#where-a-new-variable-goes).

Everything below the environment is the same in all four. `bootstrap-env.ts` loads `.env` files, `ConfigurationManager` merges the shipped defaults with the instance's overrides and resolves `$VAR` references, and the install marker gates the wizard. That sequence, and the precedence rules inside it, are in [bootstrap-methodology.md](../bootstrap-methodology.md) and [startup-process.md](./startup-process.md).

## 1. Direct install

Also called a bare-metal or host install. This repository is cloned, dependencies installed, `dist/` built on the host, and the process run by `./server.sh`, which drives PM2. The instance is the checkout plus the two storage directories `FAST_STORAGE` and `SLOW_STORAGE` name in `.env`.

- __Environment.__ `server.sh` sources the checkout's `.env`, then `<FAST_STORAGE>/.env`; `bootstrap-env.ts` loads the same two files for any other entry point. The image's `ENV` values do not exist here. Every variable the application requires — today `NGDPBASE_SYSTEM_USER`, and `NGDPBASE_ADMIN_PASSWORD` on a fresh install — is a line in one of those two files, or the boot refuses.
- __Configuration.__ `<FAST_STORAGE>/config/app-custom-config.json`, written by the install wizard or by hand, edited through `/admin/configuration`.
- __Upgrades.__ By hand: `git pull`, `npm ci`, `npm run build`, then `./server.sh restart`. Building `dist/` does not cycle the running process; the restart is a separate, required step.
- __Addons from another repository.__ Point `ngdpbase.managers.addons-manager.addons-path` at that repository's `addons/` directory. This is how The Fairways is built: `fairways-base` is a clone of this repository run by PM2 on port 2121, and `fairways-gen2-website/addons` supplies the `fairways` addon. The instance is still a direct install of ngdpbase; only the addons directory is elsewhere.
- __Several instances on one machine.__ Each is its own clone with its own `.env`, `PORT`, `FAST_STORAGE` and `SLOW_STORAGE`. jimstest and The Fairways share this Mac that way.

Detail pages: [SETUP.md](../../SETUP.md) for the first-time walkthrough, [SERVER-MANAGEMENT.md](../SERVER-MANAGEMENT.md) for `server.sh` and PM2, [bootstrap-methodology.md](../bootstrap-methodology.md) for `.env` handling.

## 2. Container from the published image

Every tagged release publishes `ghcr.io/jwilleke/ngdpbase:<version>` from `docker/Dockerfile`; the tags and the smoke tests are in [DEPLOYMENT.md — Published Image](../../docker/DEPLOYMENT.md#published-image). A container from that image is run with `docker run` or with `docker/docker-compose.yml`, mounting a data directory at `/app/data`.

- __Environment.__ Four values are baked into the image as `ENV`: `NODE_ENV`, `INSTANCE_DATA_FOLDER`, `HEADLESS_INSTALL`, `NGDPBASE_SYSTEM_USER`. The compose file's `environment:` block adds or overrides per deployment. A `.env` placed on the mounted data volume is also read, because `bootstrap-env.ts` runs regardless of launcher.
- __Configuration.__ `/app/data/config/app-custom-config.json` on the volume. A headless container reads it on first boot instead of running the wizard.
- __Upgrades.__ Pull the new tag and recreate the container; the volume carries the data across.

Detail pages: [docker/README.md](../../docker/README.md), [DOCKER.md](../../docker/DOCKER.md), [DEPLOYMENT.md](../../docker/DEPLOYMENT.md), [TRAEFIK-DEPLOYMENT.md](../../docker/TRAEFIK-DEPLOYMENT.md) for the Traefik and Authelia variant.

## 3. Kubernetes with the published image

The same image, pulled by a cluster. `docker/k8s/` ships example manifests; `docker/HEADLESS-DEPLOYMENT-NOTES.md` records what a real rollout hit.

- __Environment.__ The image `ENV` values, plus two flat bags injected with `envFrom:` — `configmap-env.yaml` for non-secrets such as `NGDPBASE_BASE_URL`, and `secrets.yaml` for `NGDPBASE_SESSION_SECRET` and the like. An inline `env:` entry on the Deployment is a per-pod override, not the home; the reasoning is [HEADLESS-DEPLOYMENT-NOTES.md §10](../../docker/HEADLESS-DEPLOYMENT-NOTES.md).
- __Configuration.__ `app-custom-config.json` on the persistent volume, never in a ConfigMap: a subPath ConfigMap mount is read-only and every save from the admin UI fails on it.
- __Upgrades.__ The image tag in the manifest moves — by Renovate, by a Flux image-automation controller, or by a PR — and the pod restarts on the new image.

`ngdpbase-demo` on deby is this method, managed from `mj-infra-flux`. Detail pages: [docker/k8s/README.md](../../docker/k8s/README.md), [HEADLESS-DEPLOYMENT-NOTES.md](../../docker/HEADLESS-DEPLOYMENT-NOTES.md).

## 4. Downstream image

A second repository whose Dockerfile begins `FROM ghcr.io/jwilleke/ngdpbase:${NGDPBASE_VERSION}` and copies its own `addons/` into the image. That repository publishes its own image, and the cluster deploys it by method 3.

- __What it inherits.__ Everything the ngdpbase image carries: code, defaults, bundled addons, and every `ENV` line. A value added to `docker/Dockerfile` here is in the downstream image after its next base bump, with no change in the downstream repository.
- __How a release reaches it.__ Renovate in the downstream repository watches the base image and bumps the `ARG`; that commit triggers the downstream tag and image build; the cluster picks up the new image. No hands, and the steps that can miss are listed in [RELEASES.md — Consumer guidance](../../RELEASES.md#consumer-guidance-informational-not-promised).
- __What ngdpbase promises it.__ Only what [RELEASES.md](../../RELEASES.md) states: the tag, the image, the changelog. No notifications, no cross-repository pin updates, no redeploys.

geohazardwatch is this method. Detail pages: [RELEASES.md](../../RELEASES.md), [DEPLOYMENT.md — Published Image](../../docker/DEPLOYMENT.md#published-image), [addon-development-guide.md](../platform/addon-development-guide.md) for the Renovate recipe.

## Choosing

- One machine you administer by hand, or development: method 1.
- A single host with Docker and no orchestrator: method 2.
- A cluster, running stock ngdpbase: method 3.
- A cluster, running ngdpbase plus your own addons under your own name: method 4.

A domain implementation can be either 1 or 4. The Fairways and geohazardwatch show both. The choice decides one thing above all: whether the image's `ENV` reaches the instance on its own, or an operator has to write every required variable into `.env`.

## Related

- [bootstrap-methodology.md](../bootstrap-methodology.md) — the three boot layers, `.env` precedence, where a new variable goes
- [startup-process.md](./startup-process.md) — the startup sequence and the environment-variable override table
- [installation-system.md](./installation-system.md) — the install wizard and headless install
- [RELEASES.md](../../RELEASES.md) — what a release publishes, for methods 2 to 4
