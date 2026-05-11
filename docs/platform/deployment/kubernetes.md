# Kubernetes

For ops teams already running a Kubernetes cluster. Appropriate when your organization already has the K8s tooling, monitoring, and habits to support another workload there.

**Most small organizations do not need this.** If you're reading this page and the requirements feel like a stretch, [Direct install](./direct-install.md) or [Docker Compose](./docker-compose.md) are almost always simpler and cheaper. You can always move to Kubernetes later once the rest of your stack lives there.

See [../Deployment.md](../Deployment.md) for project-scope context and how this mode compares to the other two.

## Requirements

- An existing Kubernetes cluster. Could be managed (EKS, GKE, AKS, DigitalOcean Kubernetes, etc.) or self-hosted (k3s, RKE2, kubeadm).
- `kubectl` configured against the cluster and the operational habit of applying manifests.
- A container registry the cluster can pull from. The upstream `ghcr.io/jwilleke/ngdpbase` is public; if you build a wrapper image with your own addons, you'll need somewhere to push it.
- A persistent-volume storage class for the data directory. ngdpbase keeps pages, users, sessions, and addon data on disk — a stateless deployment will lose everything on a pod restart.
- An ingress controller (Traefik, nginx-ingress, the cloud provider's load balancer) and a way to provision TLS — cert-manager + Let's Encrypt, a Cloudflare Tunnel, or terminating TLS at an upstream proxy.
- (Optional) GitOps tooling like **Flux** or **ArgoCD** if you want pull-based deploys instead of `kubectl apply`-from-laptop.
- (Optional) Image-update automation if you want satellite-image bumps to roll automatically when a new tag lands in your registry.

If any line above is a question rather than a yes, look at the easier modes first.

## What ngdpbase does and doesn't give you here

ngdpbase ships the container image and the configuration contract. It does **not** ship:

- A Helm chart.
- Kustomize bases.
- A reference GitOps repo.
- An operator/CRD.

The deployment is yours to author. The project's own reference cluster uses [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) (Flux + Kustomize), but that repo is a working example, not a template anyone is expected to copy. Use the tools your organization already knows.

## Steps

> **TODO** — sketch of the section structure:
>
> 1. Pick image: `ghcr.io/jwilleke/ngdpbase:X.Y.Z` directly, or a wrapper image you build with your addons baked in.
> 2. Author the workload — Deployment + Service + Ingress + PersistentVolumeClaim + ConfigMap for `app-custom-config.json`.
> 3. Mount the persistent volume at the configured data directory (`/app/data` by default, or wherever your `INSTANCE_DATA_FOLDER` env var points).
> 4. Configure ingress + TLS.
> 5. Apply via your usual tool — `kubectl apply`, `flux reconcile`, ArgoCD sync, etc.
>
> A minimal annotated example manifest set will live in this doc as a starting point — not a template to deploy as-is.

## GitOps and image automation

> **TODO** — short notes on patterns that have worked in the reference deployment:
>
> - Flux `ImageRepository` + `ImagePolicy` + `ImageUpdateAutomation` for pull-based image bumps.
> - SOPS-encrypted Secrets for credentials in the repo.
> - Wrapping ngdpbase's image with a downstream image (the GeoHazardWatch pattern) vs. pulling ngdpbase directly and mounting addons at runtime (TBD; tracked in [#673](https://github.com/jwilleke/ngdpbase/issues/673)).

## Updating

> **TODO** — depends on your GitOps choice; both `kubectl set image` and a Flux `ImageUpdateAutomation` are documented patterns.

## Backup and restore

> **TODO** — back up the PersistentVolume that holds the data directory; everything else can be reapplied from manifests.

## Troubleshooting

> **TODO** — pod CrashLoopBackOff, addon-not-discovered, ingress 404, persistent-volume permission errors.
