# ngdpbase Kubernetes Deployment

Deploy ngdpbase to Kubernetes.

> **Before you deploy:** read [`../HEADLESS-DEPLOYMENT-NOTES.md`](../HEADLESS-DEPLOYMENT-NOTES.md) — it captures real gotchas hit during a production rollout (anchor Organization, theme/front-page/page-provider config, Alpine `ndots:5` DNS, husky `prepare` script, addon UUID validation). The "Recommended deploy order" at the bottom is the short version of this README plus those gotchas.

## Quick Start

```bash
# Create namespace (optional)
kubectl create namespace ngdpbase

# Create flat-env Secret (must use the NGDPBASE_SESSION_SECRET key — that's what
# ConfigurationManager reads via process.env.NGDPBASE_SESSION_SECRET)
kubectl create secret generic ngdpbase-secrets \
  --from-literal=NGDPBASE_SESSION_SECRET=$(openssl rand -base64 32) \
  -n ngdpbase

# Copy + edit the env ConfigMap (NODE_ENV, HEADLESS_INSTALL, NGDPBASE_BASE_URL, ...)
cp configmap-env.yaml.example configmap-env.yaml
$EDITOR configmap-env.yaml

# Deploy all manifests
kubectl apply -f pvc.yaml -n ngdpbase
kubectl apply -f configmap-env.yaml -n ngdpbase
kubectl apply -f configmap.yaml -n ngdpbase      # structured ngdpbase.* JSON config
kubectl apply -f deployment.yaml -n ngdpbase
kubectl apply -f service.yaml -n ngdpbase

# Optional: Deploy ingress
kubectl apply -f ingress.yaml -n ngdpbase
```

See [`../HEADLESS-DEPLOYMENT-NOTES.md` §10](../HEADLESS-DEPLOYMENT-NOTES.md) for the rationale behind the three-surface config split (flat env ConfigMap + flat-env Secret + structured JSON ConfigMap).

## Container Image

The pre-built image is available from GitHub Container Registry. Update `deployment.yaml` to use it:

```yaml
image: ghcr.io/jwilleke/ngdpbase:latest
```

See [DOCKER.md - Pre-built Image from GHCR](../DOCKER.md#pre-built-image-from-ghcr) for all available tags.

## Manifest Files

| File | Purpose |
| --- | --- |
| `deployment.yaml` | Pod deployment with health checks and resource limits |
| `service.yaml` | ClusterIP service (port 80 -> 3000) |
| `configmap-env.yaml.example` | Flat NON-SENSITIVE env vars (`NODE_ENV`, `HEADLESS_INSTALL`, `NGDPBASE_BASE_URL`, ...) — `envFrom: configMapRef:` |
| `secrets.yaml.example` | Flat SENSITIVE env vars (`NGDPBASE_SESSION_SECRET`, OIDC client secrets, ...) — `envFrom: secretRef:` |
| `configmap.yaml` | Structured `ngdpbase.*` JSON config (`app-custom-config.json`) — `subPath` file mount |
| `pvc.yaml` | Persistent storage (10Gi default) |
| `ingress.yaml` | NGINX Ingress with optional TLS |

## Headless Installation

For automated Kubernetes deployments that skip the interactive installation wizard, enable headless installation mode.

### ConfigMap with Headless Mode

Add `HEADLESS_INSTALL: "true"` to your ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ngdpbase-env
  namespace: ngdpbase
data:
  HEADLESS_INSTALL: "true"
  NGDPBASE_HOST: "0.0.0.0"
  NGDPBASE_PORT: "3000"
  NGDPBASE_APP_NAME: "My Company Wiki"
  NGDPBASE_BASE_URL: "https://wiki.example.com"
```

### Deployment with Headless Install

Reference the ConfigMap in your deployment:

```yaml
spec:
  containers:
  - name: ngdpbase
    image: ngdpbase:latest
    envFrom:
    - configMapRef:
        name: ngdpbase-env
    - secretRef:
        name: ngdpbase-secrets
```

### What Headless Install Does

When `HEADLESS_INSTALL=true`:

- Copies required startup pages to `data/pages/`
- Copies example configs to `data/config/`
- Creates `.install-complete` marker
- Creates the `admin` account with the password from `NGDPBASE_ADMIN_PASSWORD`
- App is immediately ready - no wizard required

### First Login

After deployment, login with default credentials:

- **Username:** `admin`
- **Password:** the value of `NGDPBASE_ADMIN_PASSWORD` — supply it from a Secret; there is no default

**Important:** Change the admin password immediately after first login. The wiki displays a security warning until you do.

### Session Secret

For production, always set a secure session secret via Kubernetes Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ngdpbase-secrets
  namespace: ngdpbase
type: Opaque
stringData:
  NGDPBASE_SESSION_SECRET: "your-secure-random-secret-here"
```

Generate a secure secret:

```bash
openssl rand -base64 32
```

## Configuration

Edit `configmap.yaml` to customize:

```json
{
  "ngdpbase.server.host": "0.0.0.0",
  "ngdpbase.base-url": "https://wiki.example.com",
  "ngdpbase.application-name": "My Wiki",
  "ngdpbase.session.secure": true
}
```

## Storage

Default: 10Gi PVC with ReadWriteOnce access.

For multi-replica scaling, use ReadWriteMany (RWX) with shared storage (NFS, EFS, etc.):

```yaml
spec:
  accessModes:
    - ReadWriteMany
```

## Secrets

Create from command line:

```bash
kubectl create secret generic ngdpbase-secrets \
  --from-literal=NGDPBASE_SESSION_SECRET=$(openssl rand -base64 32)
```

Or copy and edit the example:

```bash
cp secrets.yaml.example secrets.yaml
# secrets.yaml uses stringData — paste raw values; k8s base64-encodes them on apply
kubectl apply -f secrets.yaml
```

## Ingress

The ingress manifest requires:

- NGINX Ingress Controller (or similar)
- Optional: cert-manager for TLS

Install NGINX Ingress:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

## Monitoring

Check pod status:

```bash
kubectl get pods -l app=ngdpbase -n ngdpbase
kubectl logs -l app=ngdpbase -n ngdpbase
kubectl describe pod -l app=ngdpbase -n ngdpbase
```

## Scaling

For single-instance (default):

```yaml
spec:
  replicas: 1
```

For multi-instance (requires RWX storage):

```yaml
spec:
  replicas: 3
```

## Troubleshooting

**Pod not starting:**

```bash
kubectl describe pod -l app=ngdpbase
kubectl logs -l app=ngdpbase --previous
```

**PVC not binding:**

```bash
kubectl get pvc
kubectl describe pvc ngdpbase-data-pvc
```

**Ingress not working:**

```bash
kubectl get ingress
kubectl describe ingress ngdpbase
```
