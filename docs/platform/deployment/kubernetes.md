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

ngdpbase ships:

- The container image and the configuration contract.
- **Plain starter manifests** under [`docker/k8s/`](../../../docker/k8s/) — `configmap.yaml`, `deployment.yaml`, `ingress.yaml`, `pvc.yaml`, `service.yaml`, and `secrets.yaml.example`. They're `kubectl apply`-able as-is for a minimal install, but they're starters — expect to edit them for your namespace, storage class, ingress class, and TLS source.

ngdpbase does **not** ship:

- A Helm chart.
- Kustomize bases or overlays.
- A reference GitOps repo.
- An operator / CRD.
- Image-update automation manifests.

The deployment is yours to author on top of those starters. The project's own reference cluster uses [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) (Flux + Kustomize), but that repo is a working example, not a template anyone is expected to copy. Use the tools your organization already knows.

## Steps

> **Strongly recommended first read:** [`docker/HEADLESS-DEPLOYMENT-NOTES.md`](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md). It captures nine production-gotcha entries from a real k3s rollout — anchor Organization, theme/front-page/page-provider config, `ndots:5` DNS, husky `prepare` script, addon UUID validation, session secret, contact-form recipient. The Steps below are the short version; the gotchas doc has the *why*.

### 1. Pick an image

- **Direct upstream**: `ghcr.io/jwilleke/ngdpbase:X.Y.Z` (pin a version; avoid `:latest` in production manifests). See [available tags](https://github.com/jwilleke/ngdpbase/pkgs/container/ngdpbase).
- **Wrapper image**: build your own `FROM ghcr.io/jwilleke/ngdpbase:X.Y.Z` with addons baked in. Push to whatever registry the cluster can pull from. [GeoHazardWatch](https://github.com/jwilleke/geohazardwatch) is the reference example.

If your wrapper Dockerfile uses `npm ci --omit=dev`, also add `--ignore-scripts` to bypass the husky `prepare` lifecycle. See [Headless §6](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#6-npm-ci---omitdev-fails-on-prepare--husky).

### 2. Copy and adapt the starter manifests

```bash
mkdir -p my-ngdpbase-k8s && cd my-ngdpbase-k8s
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/configmap.yaml -o configmap.yaml
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/deployment.yaml -o deployment.yaml
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/ingress.yaml -o ingress.yaml
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/pvc.yaml -o pvc.yaml
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/service.yaml -o service.yaml
curl -fsSL https://raw.githubusercontent.com/jwilleke/ngdpbase/master/docker/k8s/secrets.yaml.example -o secrets.yaml.example
```

Edit each for:

- **Namespace** — the starters assume `ngdpbase`; change it.
- **`storageClassName`** in `pvc.yaml` — match your cluster's available storage classes (`kubectl get sc`).
- **`ingressClassName`** + host + TLS in `ingress.yaml` — match your ingress controller and TLS source (cert-manager Issuer, manual Secret, upstream-proxy passthrough).
- **`image:`** in `deployment.yaml` — point at your chosen tag from step 1.
- **`resources:`** — the starters set conservative requests/limits; tune for your cluster.

### 3. Anchor Organization — optional (#1027)

**You can skip this.** The instance seeds its own anchor Organization from `ngdpbase.application.base-url` and `ngdpbase.application-name` when none exists, and adopts an existing record when there is exactly one. This used to be the single most common failure mode; it is now handled in-app. See [Headless §1](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#1-anchor-organization--seeded-automatically-since-1027).

Pre-supply one only when you want to control the `@id` exactly, or ship a richer record (address, contact points) from first boot. The pattern below still works and takes precedence over seeding.

> **Trade-off worth knowing.** A ConfigMap key mounted via `subPath` is **read-only**, so `/admin/organizations` cannot save edits to it — correcting the org then needs a redeploy. If you want the org editable in the UI, let the instance seed it instead, or write the file onto the data volume rather than mounting it. Deployment manifests are the wrong home for something an operator edits.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ngdpbase-config
data:
  app-custom-config.json: |
    {
      "ngdpbase.application.organization.file": "myorg.json",
      "ngdpbase.theme.active": "default",
      "ngdpbase.front-page": "Welcome",
      "ngdpbase.page.provider": "versioningfileprovider"
    }
  myorg.json: |
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://wiki.example.com",
      "name": "My Org",
      "url": "https://wiki.example.com"
    }
```

Mount both with `subPath` in the Deployment:

```yaml
volumeMounts:
  - name: config
    mountPath: /app/data/config/app-custom-config.json
    subPath: app-custom-config.json
  - name: config
    mountPath: /app/data/organizations/myorg.json
    subPath: myorg.json
volumes:
  - name: config
    configMap:
      name: ngdpbase-config
```

### 4. Override `ndots` (critical on most clusters)

The image is Alpine (musl libc). Kubernetes' default `/etc/resolv.conf` has `options ndots:5`, which makes musl's parallel A/AAAA queries to CoreDNS misfire when pods resolve external hostnames. Symptom: `curl https://api.example.com/` returns `Could not resolve host` even though `nslookup` works.

Add to the Deployment pod spec:

```yaml
spec:
  template:
    spec:
      dnsConfig:
        options:
          - name: ndots
            value: "1"
```

Apply this to **every** workload that makes external HTTPS calls (the main Deployment, plus any CronJobs running addons that call external APIs). See [§5](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#5-alpine-musl--k8s-ndots5-breaks-external-dns) for the full diagnosis. A trailing-dot FQDN bypass test confirms the issue if you want to verify before applying the fix.

### 5. Set `SESSION_SECRET` from a Secret

Without `SESSION_SECRET`, every pod restart invalidates all existing session cookies — users get bumped to anonymous. See [§8](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#8-use-a-stable-session-secret).

```bash
kubectl create secret generic ngdpbase-secrets \
  --from-literal=session-secret="$(openssl rand -base64 32)" \
  -n <your-namespace>
```

In the Deployment:

```yaml
env:
  - name: SESSION_SECRET
    valueFrom:
      secretKeyRef:
        name: ngdpbase-secrets
        key: session-secret
  - name: HEADLESS_INSTALL
    value: "true"
```

For GitOps repos, SOPS-encrypt the Secret before committing — see [mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) for a working example.

### 6. Apply

```bash
kubectl create namespace <your-namespace>          # if not yet created
kubectl apply -n <your-namespace> -f secrets.yaml  # or `kubectl create secret` above
kubectl apply -n <your-namespace> -f pvc.yaml
kubectl apply -n <your-namespace> -f configmap.yaml
kubectl apply -n <your-namespace> -f deployment.yaml
kubectl apply -n <your-namespace> -f service.yaml
kubectl apply -n <your-namespace> -f ingress.yaml  # if applicable
```

Wait for pod Ready:

```bash
kubectl rollout status -n <your-namespace> deploy/ngdpbase
kubectl logs -n <your-namespace> -l app=ngdpbase -f
```

### 7. Verify

A clean boot log shows, in order:

1. `OrganizationManager initialized (1 orgs)` — anchor org loaded.
2. `Created Person record for admin` — Person/Role records seeded.
3. `Created default admin user` — admin user created.
4. `Add-on loaded: <name>` — each addon discovered.

Then inside the pod:

```bash
kubectl exec -n <your-namespace> deploy/ngdpbase -- ls /app/data/roles/
# admin.json should exist

kubectl exec -n <your-namespace> deploy/ngdpbase -- cat /app/data/roles/admin.json | head -20
# `member` array should reference a UUID that matches a file in /app/data/persons/
```

Log in via the ingress hostname as `admin`, using the password supplied in `NGDPBASE_ADMIN_PASSWORD`, and change it immediately.

If the boot log is missing one of those lines, you've probably hit §1, §2, or §3 from the gotchas doc. The cleanup recipe in §2 re-triggers `createDefaultAdmin` cleanly without destroying pages or attachments.

## GitOps and image automation

ngdpbase doesn't ship GitOps manifests, but the project's own reference cluster uses these patterns successfully. They're documented here as "this worked for us," not as a blessed recipe.

### Flux pattern (used by the reference cluster)

- **`ImageRepository`** scans the registry for new tags.
- **`ImagePolicy`** picks the highest matching semver (e.g. `>=3.13.0 <4.0.0`).
- **`ImageUpdateAutomation`** commits the new tag to the GitOps repo, which Flux then reconciles into the cluster.

[mj-infra-flux](https://github.com/jwilleke/mj-infra-flux) is the working example. Read it as one operator's solution, not a template.

### Auto-rebuild from satellite (subscriber pattern)

For derivative images (the wrapper-image pattern from step 1), the satellite repo can watch ngdpbase's GHCR tags via Renovate and auto-rebuild its own image when ngdpbase ships a patch. See [#680](https://github.com/jwilleke/ngdpbase/issues/680) for the design and [`jwilleke/geohazardwatch`](https://github.com/jwilleke/geohazardwatch) for a working `renovate.json` + GitHub Action that self-hosts Renovate. The satellite repo, not ngdpbase, owns the rebuild trigger — keeps the loop fully under the operator's control.

### Wrapper image vs. runtime-mounted addons

Currently the wrapper-image pattern (bake addons into a derivative `FROM ngdpbase` image) is the supported approach for production. Runtime-mounted addons via `addons-path` work but the operational surface (volume mount + env var + UUID rules + version drift) is heavier than baking them in.

A third "packaged" pattern — addons as npm-installable packages — is tracked in [#673](https://github.com/jwilleke/ngdpbase/issues/673) but not shipped yet.

## Updating

Two paths depending on whether GitOps is in play.

### `kubectl set image` (manual)

```bash
kubectl set image -n <your-namespace> deploy/ngdpbase \
  ngdpbase=ghcr.io/jwilleke/ngdpbase:3.13.3
kubectl rollout status -n <your-namespace> deploy/ngdpbase
```

The data PVC persists across the rollout; only the image changes.

### Flux ImageUpdateAutomation (pull-based)

If you wired in the Flux pattern above, the GitOps repo gets a commit when a new matching tag lands and Flux reconciles. No `kubectl` from your laptop.

### Before a minor or major bump

- Read the [CHANGELOG](../../../CHANGELOG.md) for operator-visible changes.
- Back up the PVC (see below).
- Patch bumps are safe to apply unattended.

## Backup and restore

The single thing worth backing up is the contents of the data PVC — pages, users, sessions, config, addon data, logs, search index. Everything else (manifests, ConfigMaps, Secrets) is reproducible from the GitOps repo (if you have one) or by re-running step 2.

### Velero (cluster-wide solution)

If your cluster already has [Velero](https://velero.io/) installed, register the namespace + PVC as a backup target. Velero snapshots the underlying storage and stores it in S3-compatible object storage.

### CronJob to object storage (DIY)

If Velero is overkill, run a CronJob that tars the PVC contents and uploads to S3:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ngdpbase-backup
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: amazon/aws-cli:latest
              command: ["/bin/sh","-c"]
              args:
                - |
                  cd /data && tar -czf /tmp/backup.tar.gz . && \
                  aws s3 cp /tmp/backup.tar.gz s3://my-backups/ngdpbase-$(date +%Y%m%d).tar.gz
              volumeMounts:
                - name: data
                  mountPath: /data
                  readOnly: true
          volumes:
            - name: data
              persistentVolumeClaim:
                claimName: ngdpbase-data
          restartPolicy: OnFailure
```

(Bring your own credentials; the snippet above assumes IRSA/Workload Identity is handling AWS auth.)

### Restore

Provision a fresh PVC, extract the tar into it, then `kubectl apply` the rest of the manifests pointing at the new PVC. The wiki rebuilds in-memory caches on the next request.

## Troubleshooting

The boot log is the single source of truth:

```bash
kubectl logs -n <your-namespace> -l app=ngdpbase --tail=200
kubectl logs -n <your-namespace> -l app=ngdpbase --previous   # if crashlooping
kubectl describe pod -n <your-namespace> -l app=ngdpbase      # for events
```

### Pod CrashLoopBackOff

Most often one of:

- **§1 missing anchor Organization** — boot log will mention `applyRoleDiff` skipping silently, or admin login resolves as Anonymous.
- **§3 page provider misconfigured** — `filesystemprovider` works but lacks editing UI affordances; switch to `versioningfileprovider`.
- **§6 husky `prepare` script** if you're building a wrapper image without `--ignore-scripts`.
- **`/app/data` permission errors** — the image runs as a non-root user; the PVC's `fsGroup` / `runAsUser` must let it write.

The cleanup recipe in [§2](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#2-createdefaultadmin-only-runs-when-userssize--0) re-triggers `createDefaultAdmin` cleanly without destroying pages.

### Addon not discovered

Same diagnoses as the docker-compose mode — see [§4 array vs string](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#4-addons-path-string-replaces-array-supplements) and [§7 UUIDs](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#7-addonsmanager-validates-seed-page-uuids-strictly). Verify mounts:

```bash
kubectl exec -n <your-namespace> deploy/ngdpbase -- ls /app/addons /app/addons-extra
```

### Ingress 404

- `kubectl get ingress -n <your-namespace>` — confirm host rule matches the request hostname exactly.
- `kubectl describe ingress -n <your-namespace> <name>` — events surface TLS issues, missing backend service, etc.
- Check the ingress controller's logs (`kubectl logs -n ingress-nginx ...` or equivalent).

### PV permission errors

The container runs as a non-root user (typically `node` / UID 1000). The PVC needs to let that UID write. Add `securityContext` to the pod spec:

```yaml
spec:
  template:
    spec:
      securityContext:
        runAsUser: 1000
        fsGroup: 1000
```

`fsGroup` triggers a recursive `chown` of the mounted volume on attach — slow on large volumes, but it's a one-time cost on first attach.

### External DNS fails inside pods

You haven't applied the `ndots: 1` fix from step 4. See [§5](../../../docker/HEADLESS-DEPLOYMENT-NOTES.md#5-alpine-musl--k8s-ndots5-breaks-external-dns).

### Multi-replica scaling

The deployment defaults to one replica. Scaling beyond one requires:

- **RWX storage** (e.g. NFS, EFS, Azure Files) so multiple pods share the data directory. Pages and attachments tolerate this; sessions and search index may not, depending on provider.
- **Awareness of per-pod state**: the `/contact` route's rate limit is per-pod (module-scope counter), so a 3-replica deployment gives 3× the per-IP budget. For stronger protection across replicas, terminate at an upstream rate limiter (Cloudflare, nginx, dedicated WAF).
- **A shared session store** if you want sessions to survive being routed to a different pod. The default file-backed session store doesn't work across replicas — even with RWX you'll see intermittent logouts as the file-store cache lags behind. Switching to a Redis-backed store is out of scope here; single replica is the simpler answer for most operators.

Single replica is the recommended starting point. Scale up only after auditing the points above for your specific workload.
