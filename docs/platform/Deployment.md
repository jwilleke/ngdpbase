# ngdpbase Deployments

## What this document is

A statement of where ngdpbase ends and where the operator's work begins, plus a small-org-friendly map of the three supported deployment shapes. It exists to clarify project scope — what ngdpbase does and does not take responsibility for — and to give a new operator enough orientation to pick the right shape at a glance.

This is **not** a step-by-step deployment manual. Each shape links to its own deeper document (still being built) for the actual run-the-commands instructions.

## What ngdpbase ships

ngdpbase's responsibility ends at the **build container step**:

- A versioned source release on GitHub (`vX.Y.Z` tag + release notes).
- A container image published to GHCR (`ghcr.io/jwilleke/ngdpbase:X.Y.Z`).
- The documented addon API and config keys.
- This deployments doc, plus the deeper guides linked below.

## What ngdpbase does not ship

ngdpbase deliberately does **not** publish:

- Kubernetes manifests, Helm charts, or Kustomize bases.
- A reference GitOps repository.
- Docker Compose files for production setups.
- Reusable GitHub Actions workflows for deployment.
- Image registries other than GHCR.

These are operator concerns. The goal is to keep ngdpbase flexible — any operator can wire it into the tools and patterns their organization already uses, without inheriting an opinion from the platform.

## The reference demo: GeoHazardWatch

[GeoHazardWatch](https://github.com/jwilleke/geohazardwatch) is the project's reference deployment. It exists to show what the platform can do — volcano and earthquake data, the addon API, themes, the contact form, image automation. It is **not** a template anyone is expected to copy.

Forking GeoHazardWatch to build a different vertical (a hiking site, a club roster, a seismology research portal — anything) is supported and encouraged. Operators are free to choose any addon set, any Docker layering pattern, any deployment pipeline.

## Three deployment shapes

Listed in increasing complexity. **Most small-org operators want Direct install.** Docker Compose is the easiest way to try ngdpbase. Kubernetes is for ops teams already running a cluster — most small organizations don't need it.

### Direct install — recommended for most operators

Run ngdpbase as a regular Node.js process on a Mac, a Linux server, a Raspberry Pi, or any machine you can shell into.

#### Requirements

- A computer you can shell into (Mac, Linux, a Pi, a small VPS).
- Node.js 20 or newer.
- A few GB of free disk.
- A free network port (default 3000).
- (Optional) A process supervisor like `pm2` so the wiki survives reboots.
- (Optional) A reverse proxy in front for HTTPS (Caddy, nginx, Cloudflare Tunnel).

If you have these, you're ready. See [direct install →](./deployment/direct-install.md).

### Docker Compose — easiest way to try ngdpbase

Run ngdpbase in a container on a single machine with `docker compose up`. Good for evaluating the platform, homelab setups, and small single-host production deployments.

#### Requirements

- A computer with Docker installed (Docker Desktop on Mac/Windows, Docker Engine on Linux).
- A few GB of free disk.
- A free network port.
- (Optional) A reverse proxy for HTTPS.

If you don't have Docker installed (or don't want to install it), look at **Direct install** instead. It's simpler.

See [docker compose →](./deployment/docker-compose.md).

### Kubernetes — for ops teams running clusters

Run ngdpbase as a workload on an existing Kubernetes cluster. Appropriate when you're already running other services on K8s and have the operational tooling and habits to support it. **Most small organizations don't need this** — Direct install or Docker Compose is almost always simpler and cheaper.

#### Requirements

- An existing Kubernetes cluster (managed like EKS / GKE / AKS, or self-hosted like k3s).
- `kubectl` access and familiarity with applying manifests.
- A container registry the cluster can pull from.
- A persistent-volume storage class for the data directory.
- An ingress controller + a way to provision TLS (cert-manager + Let's Encrypt, or a cloud load balancer, or Cloudflare Tunnel).
- (Optional) GitOps tooling like Flux or ArgoCD if you want pull-based deploys.

If you're reading the requirements and any line is a question rather than a yes, look at **Docker Compose** or **Direct install** — both are easier on-ramps to ngdpbase. You can always move to Kubernetes later once the rest of your stack lives there.

See [kubernetes →](./deployment/kubernetes.md).

## Related issues

- [#671](https://github.com/jwilleke/ngdpbase/issues/671) — Auto-deployments to Docker from Instances
- [#673](https://github.com/jwilleke/ngdpbase/issues/673) — Packaged addon distribution model
- [#674](https://github.com/jwilleke/ngdpbase/issues/674) — Canonical k8s manifest templates
- [#680](https://github.com/jwilleke/ngdpbase/issues/680) — Auto-rebuild satellite images when ngdpbase ships a release
