# Headless deployment gotchas

Notes captured during a production rollout of `ngdpbase` (with the `ve-geology` addon) to a k3s cluster on 2026-05-07. Each entry is a real symptom we hit, the root cause, and the fix — written so the next person doesn't have to rediscover them.

These all surface specifically under `HEADLESS_INSTALL=true` (Docker / Kubernetes / any non-wizard install). The interactive `/install` path doesn't have these gaps because the wizard creates the missing records by hand.

---

## 1. Anchor Organization — seeded automatically since #1027

> __Fixed in-app.__ You no longer need to pre-supply anything. `OrganizationManager.getInstallOrg()` resolves the anchor in three tiers: the configured `ngdpbase.application.organization.file`; failing that, the sole existing organization record; failing that, a minimal record seeded from `ngdpbase.application.base-url` and `ngdpbase.application-name`.
>
> Pre-supplying is now __optional__ — do it only to control the `@id` exactly, or to ship a richer record (address, contact points) from the start. Everything below is kept because it is still the fastest way to recognise this failure on an instance running an older version, and because the seeded record is deliberately minimal.
>
> One case still resolves to nothing on purpose: __several organization records with no `organization.file` key__. Picking one arbitrarily could bind every role to the wrong organization, so it warns and declines. Name the anchor explicitly there.

__Symptom__ (pre-#1027, or the several-records case above)__.__ Headless install creates the user and a Person record, but `/app/data/roles/` stays empty. Logged-in admin user resolves to `Anonymous|All` — no Edit button, no admin dashboard, ACL log shows `user=Anonymous` despite a successful login.

__Root cause.__ `UserManager.createDefaultAdmin` calls `applyRoleDiff(username, [], ['admin'])`, which calls `syncRoleAdd`. `syncRoleAdd`'s JSDoc:

> Best-effort under degraded init: skips silently when … the install has no anchor org.

`services/InstallService.ts` is explicit about this:

> Headless installs do NOT seed the anchor org from config. Operators wanting a pre-seeded anchor org pre-supply the JSON-LD file alongside their custom config.

__Fix.__ Drop a JSON-LD `Organization` record into `INSTANCE_DATA_FOLDER/organizations/<name>.json` BEFORE the first boot, and point at it from `app-custom-config.json`:

```json
// app-custom-config.json
"ngdpbase.application.organization.file": "geohazardwatch.json"
```

```json
// data/organizations/geohazardwatch.json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://geohazardwatch.com",
  "name": "GeoHazardWatch",
  "url": "https://geohazardwatch.com"
}
```

In Kubernetes, both files can ship as keys in the same ConfigMap, mounted via two `subPath` mounts (one to `data/config/app-custom-config.json`, one to `data/organizations/<name>.json`).

---

## 2. `createDefaultAdmin` only runs when `users.size === 0`

__Symptom.__ A previous failed boot left a `users.json` on the volume. Even after fixing the cause of the original failure (e.g., missing Organization, wrong base image), bringing the pod back up with the corrected config does NOT re-create the admin or its Person/Role records.

__Root cause.__ `UserManager.initialize()` only triggers `createDefaultAdmin` when the user provider returns zero users. Any pre-existing user blocks it.

__Fix.__ Scale to zero, delete `users.json` (and any orphaned Person records left over from the earlier boot), scale back up. New admin will be created cleanly.

```bash
kubectl -n <ns> scale deploy/<name> --replicas=0
kubectl -n <ns> wait --for=delete pod -l app=<name>
sudo rm /path/to/data/users/users.json
sudo rm /path/to/data/persons/<orphan-uuid>.json   # if applicable
kubectl -n <ns> scale deploy/<name> --replicas=1
```

The user is rebuilt as `admin` with the password from `NGDPBASE_ADMIN_PASSWORD`, so that variable must still be set when you do this. Pages, attachments, and search index survive — only the user account is rebuilt.

---

## 3. Theme, front-page, page-provider are not auto-set by addons

__Symptom.__ Site defaults to the bundled `default` theme, redirects `/` to `Welcome`, and uses `filesystemprovider` for page storage — even when an addon is installed and active. The addon can't override these.

__Root cause.__ These are operator-owned settings. Addons can register pages, plugins, routes, themes (the asset), but they do not (and intentionally cannot) override what the operator has chosen for theme, front page, or storage provider.

__Fix.__ Set them explicitly in `app-custom-config.json`:

```json
"ngdpbase.theme.active":   "volcano",
"ngdpbase.front-page":     "volcanoes-and-earthquakes",
"ngdpbase.page.provider":  "versioningfileprovider"
```

Notes:

- __`theme.active`__ — folder name under `/app/themes/`. Must exist in the image.
- __`front-page`__ — page slug to redirect `/` to. Must exist as a seeded page or the redirect 404s.
- __`page.provider`__ — `versioningfileprovider` is what the editing UI is built around (history, comments, diffs). The default `filesystemprovider` is more restricted; expect missing UI affordances. Switching providers triggers a one-time on-disk migration on first boot (you'll see `Migrated N/N pages` in the log).

---

## 4. `addons-path`: string replaces, array supplements

__Symptom.__ Setting `ngdpbase.managers.addons-manager.addons-path` to a single path (intending to add an external addon dir) silently kills the built-in addons. None of `calendar`, `forms`, `journal`, `elasticsearch` get discovered.

__Root cause.__ From `AddonsManager.ts`:

```ts
this.addonsPaths = Array.isArray(raw)
  ? (raw as string[]).map(String)
  : [String(raw)];
```

A string ends up as a single-entry array. `./addons` (the default) is replaced, not appended.

__Fix.__ Use the array form to scan multiple directories:

```json
"ngdpbase.managers.addons-manager.addons-path": [
  "/app/addons",
  "/opt/your-addon-repo/addons"
]
```

---

## 5. Alpine musl + k8s `ndots:5` breaks external DNS

__Symptom.__ Pods (e.g., a CronJob calling external APIs) fail to resolve external hostnames. `nslookup webservices.example.com` from inside the pod succeeds (it queries the cluster DNS server directly), but `curl https://webservices.example.com/` returns `Could not resolve host`. Node `fetch()` returns the bare `fetch failed` error.

__Root cause.__ The base image is Alpine, which ships musl libc. Kubernetes' default `/etc/resolv.conf` includes `options ndots:5`, telling libc to expand the search domain list before treating any name with fewer than 5 dots as absolute. musl's parallel A/AAAA queries to CoreDNS misfire on this expansion in some clusters.

__Confirmation test.__ A trailing-dot FQDN (`https://webservices.example.com./`) skips the search-list dance and works — that proves the diagnosis.

__Fix.__ Override `ndots` to `1` on the pod spec:

```yaml
spec:
  template:
    spec:
      dnsConfig:
        options:
          - name: ndots
            value: "1"
```

Apply to both the Deployment and any Job/CronJob that makes external HTTPS calls. Cluster-internal short names (`servicename`) still resolve via the search list because they have zero dots.

---

## 6. `npm ci --omit=dev` fails on `prepare` / husky

__Symptom.__ Image build fails at `RUN npm ci --omit=dev` with:

```
sh: husky: not found
npm error code 127
npm error command sh -c husky install
```

__Root cause.__ `package.json`'s `prepare` lifecycle script runs `husky install`. Under `--omit=dev`, husky (a devDependency) isn't installed, but the lifecycle script still fires.

__Fix.__ Add `--ignore-scripts` to the `npm ci` invocation. We don't need git hooks inside a runtime container.

```dockerfile
RUN npm ci --omit=dev --ignore-scripts
```

---

## 7. `AddonsManager` validates seed page UUIDs strictly

__Symptom.__ Boot logs show `[AddonsManager] Skipping <addon>/pages/<file>.md — missing or invalid uuid in frontmatter` for every seed page. Wiki has zero addon content.

__Root cause.__ `AddonsManager.ts` validates against a strict v4 regex:

```ts
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

Placeholder UUIDs containing non-hex characters (e.g. `a1b2c3d4-0001-4000-8000-veXgeologyXX`) pass the structural shape check by eye but fail the regex. The pages get silently skipped.

__Fix.__ Use real UUID v4 values in the `uuid` frontmatter on every seed page:

```bash
node -e "console.log(require('crypto').randomUUID())"
```

The destination filename in `data/pages/` is `{uuid}.md` — the source filename is ignored. Use a fresh UUID per page and never copy them between addons (cross-addon UUID collisions cause `[AddonsManager] Page conflict` warnings and silent skips).

See `docs/platform/addon-development-guide.md` UUID requirements section for the full rules.

---

## 8. Use a stable session secret

__Symptom.__ Logged-in users get bumped to anonymous after every pod restart. Browser still holds a session cookie, but the server treats them as Anonymous.

__Root cause.__ Without `NGDPBASE_SESSION_SECRET` set, `ngdpbase` generates a random secret on first boot and writes it to `<data volume>/.env` ([#1194](https://github.com/jwilleke/ngdpbase/issues/1194)). On a persistent volume that file survives and so do the sessions. On an ephemeral volume (`emptyDir`, or a fresh volume per pod) the file is gone at the next start, a new secret is generated, and existing cookies' HMAC signatures stop validating against it. (Before #1194 the fallback was worse: the literal shipped in `app-default-config.json`, the same on every install.)

The exact env-var name matters — `ConfigurationManager.ts` reads `process.env.NGDPBASE_SESSION_SECRET`. A misnamed `SESSION_SECRET` is silently ignored and looks like the bug above on every restart.

__Fix.__ Pass a stable secret via env var, sourced from a Kubernetes `Secret` (ideally SOPS-encrypted in your GitOps repo). Use `envFrom: secretRef:` so the Secret's keys map directly to env-var names (see §10):

```yaml
# In your Secret (stringData lets you paste raw, k8s base64-encodes on apply)
apiVersion: v1
kind: Secret
metadata:
  name: ngdpbase-secrets
type: Opaque
stringData:
  NGDPBASE_SESSION_SECRET: "<output of openssl rand -base64 32>"

# In your Deployment
spec:
  containers:
    - name: ngdpbase
      envFrom:
        - secretRef:
            name: ngdpbase-secrets
```

Generate once: `openssl rand -base64 32`. Rotate when needed; rotation invalidates all existing sessions.

---

## 9. `/contact` form is dormant until admin email or `contact.recipient` is set

__Symptom:__ A fresh deploy renders `GET /contact` as a "Contact form is not configured" page even with `ngdpbase.application.contact.enabled: true` (the default). Visitors who use the __Request access__ button (when `application.registration: false`) and then click `[Contact Us]` reach the contact page but cannot submit.

__Root cause:__ `processContact` resolves the recipient via `UserManager.getContactRecipient(override)`. When `ngdpbase.application.contact.recipient` is empty (default), the helper falls through to "first user with the `admin` role whose email is non-empty AND not the install-default sentinel `admin@localhost`." On a fresh deploy, the only admin user has the sentinel email — so the helper returns `null` and the form renders the not-configured branch instead of mailing into a black hole. (#658)

__Two fixes — operator chooses:__

1. __Set the admin email to a real address.__ Log in as admin → Profile → change email to a routable address (the corporate alias, the operator's mailbox, a dedicated `admin@<your-domain>`, etc.). The contact form activates on the next request.

2. __Set `ngdpbase.application.contact.recipient` explicitly__ in `app-custom-config.json` (or via ConfigMap):

   ```json
   "ngdpbase.application.contact.recipient": "support@your-domain.com"
   ```

   This wins over the admin-email lookup; takes a single email or a comma-separated list / distribution alias. Use this when you want the contact mailbox decoupled from the admin user identity.

__Also required for actual mail delivery:__ `ngdpbase.mail.*` must be configured (`enabled: true`, `provider: smtp`, valid `smtp.host` / `from` / credentials). With `provider: console` (default), submissions are accepted by `/contact` and the email is printed to the server log only — useful for testing, not production.

__Optional override:__ set `ngdpbase.application.contact.page` to a slug (e.g. `support`) and `/contact` 302-redirects to `/view/<slug>` instead of rendering the built-in form. Useful for pointing at your own support page or external service. Cannot equal `"contact"` — rejected at startup with a clear error.

__Rate limit:__ `/contact` POST is rate-limited to 5 submissions per IP per 15-minute window. Module-scope per pod — distributed deployments get per-replica counters, not a shared budget. For stronger protection across replicas, run a real rate-limit proxy (Cloudflare, Nginx, dedicated WAF) in front.

---

## 10. Three-surface config split (`envFrom` + JSON file mount)

__Symptom.__ Operators coming from docker-compose's `.env` pattern expect the same shape in k8s. The early `deployment.yaml` examples wired env vars one-by-one with inline `env:` entries — adding a new var meant editing the Deployment manifest, secrets and non-secrets sat in the same block, and the layout drifted from how every other GitOps workload at the same site was modelled.

__Root cause.__ ngdpbase has two distinct config surfaces with no shared shape:

1. __Operational env toggles__ — `HEADLESS_INSTALL`, `INSTANCE_DATA_FOLDER`, `INSTANCE_CONFIG_FILE`, `NGDPBASE_BASE_URL`, `NODE_ENV`, `NGDPBASE_SESSION_SECRET`. Flat key=value, naturally env-var-shaped.
2. __Structured app config__ — the `ngdpbase.*` dotted keys in `app-custom-config.json` (theme, addons-path arrays, page providers, nested objects). Doesn't fit flat env vars — would need shell-unfriendly value escaping and breaks for array-valued / nested keys.

The fix splits across three k8s resources so each surface uses the mechanism it fits.

__Fix.__ Three resources, mounted three different ways:

| Surface | Resource | Mount mechanism | Holds |
|---|---|---|---|
| Non-sensitive flat env | `ConfigMap` (e.g. `ngdpbase-env`) | `envFrom: configMapRef:` | `NODE_ENV`, `HEADLESS_INSTALL`, `INSTANCE_DATA_FOLDER`, `NGDPBASE_BASE_URL`, ... |
| Sensitive flat env | `Secret` (e.g. `ngdpbase-secrets`) | `envFrom: secretRef:` | `NGDPBASE_SESSION_SECRET`, OIDC client secrets, SMTP password, ES password, ... |
| Structured JSON | `ConfigMap` (e.g. `ngdpbase-config`) | `subPath` file mount | `app-custom-config.json` (the `ngdpbase.*` dotted keys) |

Deployment containers[0] then reads:

```yaml
envFrom:
  - configMapRef:
      name: ngdpbase-env
  - secretRef:
      name: ngdpbase-secrets
      optional: true
volumeMounts:
  - name: ngdpbase-config
    mountPath: /app/data/config/app-custom-config.json
    subPath: app-custom-config.json
    readOnly: true
```

__Two-ConfigMap split, not one.__ A single ConfigMap with both flat env keys AND an `app-custom-config.json` key, mounted via `envFrom:`, would inject the stringified JSON as an environment variable — wrong shape, wrong semantics. Keep them separate.

__Env-var names matter.__ The keys in the flat-env ConfigMap and Secret become `process.env.*` lookups verbatim — they must match what the code reads. The most common foot-gun is `SESSION_SECRET` (ignored) vs `NGDPBASE_SESSION_SECRET` (honored — see §8). When adding a new flat env var, grep `src/` for the `process.env.X` reference before naming the ConfigMap/Secret key.

__Env wins over envFrom.__ Per-pod overrides under `env:` (with `valueFrom: fieldRef:` or literal values) override anything injected by `envFrom:`. Useful for canary pods or one-off debug toggles without touching the shared ConfigMap.

__Why this matches the `.env` mental model.__ Each ConfigMap or Secret is a flat key=value bag — same shape as `.env`. Adding a new operational toggle is a one-line edit to `configmap-env.yaml`, then `kubectl apply` + roll the deployment. No Deployment edit, no `env:` block to keep alphabetized, no mixing of secrets and non-secrets. The split also mirrors how `transmission` and similar workloads are modelled in `jwilleke/mj-infra-flux`, so operators with multiple deployments converge on one pattern.

__Starter manifests.__ See `docker/k8s/configmap-env.yaml.example` and `docker/k8s/secrets.yaml.example` for the shapes; `docker/k8s/deployment.yaml` shows the wired-up consumer.

---

## Recommended deploy order

For a clean first deploy under HEADLESS_INSTALL=true:

1. Build/publish your image (with the Dockerfile fixes from §6).
2. Author the __three config surfaces__ per §10:
   - `ngdpbase-env` ConfigMap — flat non-sensitive env vars including `HEADLESS_INSTALL: "true"`.
   - `ngdpbase-secrets` Secret — flat `NGDPBASE_SESSION_SECRET` (§8).
   - `ngdpbase-config` ConfigMap — `app-custom-config.json` (theme, front-page, page provider, addons-path, organization.file) plus the Organization JSON-LD as a second key (§1).
3. Author the Deployment with `dnsConfig.options.ndots: "1"` (§5), `envFrom:` referencing both the env ConfigMap and the secrets Secret (§10), and the two `subPath` mounts for the JSON config + Organization file.
4. Apply, wait for first pod Ready. The boot log should show `OrganizationManager initialized (1 orgs)`, `Created Person record for admin`, `Created default admin user`, and an Add-on loaded line.
5. Verify `/app/data/roles/admin.json` exists and its `member` array references the same UUID as `/app/data/persons/<uuid>.json`.
6. Log in as `admin` with the password you set in `NGDPBASE_ADMIN_PASSWORD`, and change it immediately.

If steps 5-6 don't work, you've probably hit one of §1, §2, or §3 — re-check the ConfigMap and use the cleanup recipe from §2 to re-trigger `createDefaultAdmin`.
