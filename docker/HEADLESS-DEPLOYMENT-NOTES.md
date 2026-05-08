# Headless deployment gotchas

Notes captured during a production rollout of `ngdpbase` (with the `ve-geology` addon) to a k3s cluster on 2026-05-07. Each entry is a real symptom we hit, the root cause, and the fix — written so the next person doesn't have to rediscover them.

These all surface specifically under `HEADLESS_INSTALL=true` (Docker / Kubernetes / any non-wizard install). The interactive `/install` path doesn't have these gaps because the wizard creates the missing records by hand.

---

## 1. Anchor Organization JSON-LD must be pre-supplied

**Symptom.** Headless install creates the user and a Person record, but `/app/data/roles/` stays empty. Logged-in admin user resolves to `Anonymous|All` — no Edit button, no admin dashboard, ACL log shows `user=Anonymous` despite a successful login.

**Root cause.** `UserManager.createDefaultAdmin` calls `applyRoleDiff(username, [], ['admin'])`, which calls `syncRoleAdd`. `syncRoleAdd`'s JSDoc:

> Best-effort under degraded init: skips silently when … the install has no anchor org.

`services/InstallService.ts` is explicit about this:

> Headless installs do NOT seed the anchor org from config. Operators wanting a pre-seeded anchor org pre-supply the JSON-LD file alongside their custom config.

**Fix.** Drop a JSON-LD `Organization` record into `INSTANCE_DATA_FOLDER/organizations/<name>.json` BEFORE the first boot, and point at it from `app-custom-config.json`:

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

**Symptom.** A previous failed boot left a `users.json` on the volume. Even after fixing the cause of the original failure (e.g., missing Organization, wrong base image), bringing the pod back up with the corrected config does NOT re-create the admin or its Person/Role records.

**Root cause.** `UserManager.initialize()` only triggers `createDefaultAdmin` when the user provider returns zero users. Any pre-existing user blocks it.

**Fix.** Scale to zero, delete `users.json` (and any orphaned Person records left over from the earlier boot), scale back up. New admin will be created cleanly.

```bash
kubectl -n <ns> scale deploy/<name> --replicas=0
kubectl -n <ns> wait --for=delete pod -l app=<name>
sudo rm /path/to/data/users/users.json
sudo rm /path/to/data/persons/<orphan-uuid>.json   # if applicable
kubectl -n <ns> scale deploy/<name> --replicas=1
```

The user will be reset to `admin` / `admin123` for the first login. Pages, attachments, and search index survive — only the user account is rebuilt.

---

## 3. Theme, front-page, page-provider are not auto-set by addons

**Symptom.** Site defaults to the bundled `default` theme, redirects `/` to `Welcome`, and uses `filesystemprovider` for page storage — even when an addon is installed and active. The addon can't override these.

**Root cause.** These are operator-owned settings. Addons can register pages, plugins, routes, themes (the asset), but they do not (and intentionally cannot) override what the operator has chosen for theme, front page, or storage provider.

**Fix.** Set them explicitly in `app-custom-config.json`:

```json
"ngdpbase.theme.active":   "volcano",
"ngdpbase.front-page":     "volcanoes-and-earthquakes",
"ngdpbase.page.provider":  "versioningfileprovider"
```

Notes:

- **`theme.active`** — folder name under `/app/themes/`. Must exist in the image.
- **`front-page`** — page slug to redirect `/` to. Must exist as a seeded page or the redirect 404s.
- **`page.provider`** — `versioningfileprovider` is what the editing UI is built around (history, comments, diffs). The default `filesystemprovider` is more restricted; expect missing UI affordances. Switching providers triggers a one-time on-disk migration on first boot (you'll see `Migrated N/N pages` in the log).

---

## 4. `addons-path`: string replaces, array supplements

**Symptom.** Setting `ngdpbase.managers.addons-manager.addons-path` to a single path (intending to add an external addon dir) silently kills the built-in addons. None of `calendar`, `forms`, `journal`, `elasticsearch` get discovered.

**Root cause.** From `AddonsManager.ts`:

```ts
this.addonsPaths = Array.isArray(raw)
  ? (raw as string[]).map(String)
  : [String(raw)];
```

A string ends up as a single-entry array. `./addons` (the default) is replaced, not appended.

**Fix.** Use the array form to scan multiple directories:

```json
"ngdpbase.managers.addons-manager.addons-path": [
  "/app/addons",
  "/opt/your-addon-repo/addons"
]
```

---

## 5. Alpine musl + k8s `ndots:5` breaks external DNS

**Symptom.** Pods (e.g., a CronJob calling external APIs) fail to resolve external hostnames. `nslookup webservices.example.com` from inside the pod succeeds (it queries the cluster DNS server directly), but `curl https://webservices.example.com/` returns `Could not resolve host`. Node `fetch()` returns the bare `fetch failed` error.

**Root cause.** The base image is Alpine, which ships musl libc. Kubernetes' default `/etc/resolv.conf` includes `options ndots:5`, telling libc to expand the search domain list before treating any name with fewer than 5 dots as absolute. musl's parallel A/AAAA queries to CoreDNS misfire on this expansion in some clusters.

**Confirmation test.** A trailing-dot FQDN (`https://webservices.example.com./`) skips the search-list dance and works — that proves the diagnosis.

**Fix.** Override `ndots` to `1` on the pod spec:

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

**Symptom.** Image build fails at `RUN npm ci --omit=dev` with:

```
sh: husky: not found
npm error code 127
npm error command sh -c husky install
```

**Root cause.** `package.json`'s `prepare` lifecycle script runs `husky install`. Under `--omit=dev`, husky (a devDependency) isn't installed, but the lifecycle script still fires.

**Fix.** Add `--ignore-scripts` to the `npm ci` invocation. We don't need git hooks inside a runtime container.

```dockerfile
RUN npm ci --omit=dev --ignore-scripts
```

---

## 7. `AddonsManager` validates seed page UUIDs strictly

**Symptom.** Boot logs show `[AddonsManager] Skipping <addon>/pages/<file>.md — missing or invalid uuid in frontmatter` for every seed page. Wiki has zero addon content.

**Root cause.** `AddonsManager.ts` validates against a strict v4 regex:

```ts
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

Placeholder UUIDs containing non-hex characters (e.g. `a1b2c3d4-0001-4000-8000-veXgeologyXX`) pass the structural shape check by eye but fail the regex. The pages get silently skipped.

**Fix.** Use real UUID v4 values in the `uuid` frontmatter on every seed page:

```bash
node -e "console.log(require('crypto').randomUUID())"
```

The destination filename in `data/pages/` is `{uuid}.md` — the source filename is ignored. Use a fresh UUID per page and never copy them between addons (cross-addon UUID collisions cause `[AddonsManager] Page conflict` warnings and silent skips).

See `docs/platform/addon-development-guide.md` UUID requirements section for the full rules.

---

## 8. Use a stable session secret

**Symptom.** Logged-in users get bumped to anonymous after every pod restart. Browser still holds a session cookie, but the server treats them as Anonymous.

**Root cause.** Without `SESSION_SECRET` set, `ngdpbase` generates a random secret on each pod start. Existing cookies' HMAC signatures stop validating against the new secret.

**Fix.** Pass a stable secret via env var, sourced from a Kubernetes `Secret` (ideally SOPS-encrypted in your GitOps repo):

```yaml
env:
  - name: SESSION_SECRET
    valueFrom:
      secretKeyRef:
        name: <name>-secrets
        key: session-secret
```

Generate once: `openssl rand -base64 32`. Rotate when needed; rotation invalidates all existing sessions.

---

## 9. `/contact` form is dormant until admin email or `contact.recipient` is set

**Symptom:** A fresh deploy renders `GET /contact` as a "Contact form is not configured" page even with `ngdpbase.application.contact.enabled: true` (the default). Visitors who use the **Request access** button (when `application.registration: false`) and then click `[Contact Us]` reach the contact page but cannot submit.

**Root cause:** `processContact` resolves the recipient via `UserManager.getContactRecipient(override)`. When `ngdpbase.application.contact.recipient` is empty (default), the helper falls through to "first user with the `admin` role whose email is non-empty AND not the install-default sentinel `admin@localhost`." On a fresh deploy, the only admin user has the sentinel email — so the helper returns `null` and the form renders the not-configured branch instead of mailing into a black hole. (#658)

**Two fixes — operator chooses:**

1. **Set the admin email to a real address.** Log in as admin → Profile → change email to a routable address (the corporate alias, the operator's mailbox, a dedicated `admin@<your-domain>`, etc.). The contact form activates on the next request.

2. **Set `ngdpbase.application.contact.recipient` explicitly** in `app-custom-config.json` (or via ConfigMap):

   ```json
   "ngdpbase.application.contact.recipient": "support@your-domain.com"
   ```

   This wins over the admin-email lookup; takes a single email or a comma-separated list / distribution alias. Use this when you want the contact mailbox decoupled from the admin user identity.

**Also required for actual mail delivery:** `ngdpbase.mail.*` must be configured (`enabled: true`, `provider: smtp`, valid `smtp.host` / `from` / credentials). With `provider: console` (default), submissions are accepted by `/contact` and the email is printed to the server log only — useful for testing, not production.

**Optional override:** set `ngdpbase.application.contact.page` to a slug (e.g. `support`) and `/contact` 302-redirects to `/view/<slug>` instead of rendering the built-in form. Useful for pointing at your own support page or external service. Cannot equal `"contact"` — rejected at startup with a clear error.

**Rate limit:** `/contact` POST is rate-limited to 5 submissions per IP per 15-minute window. Module-scope per pod — distributed deployments get per-replica counters, not a shared budget. For stronger protection across replicas, run a real rate-limit proxy (Cloudflare, Nginx, dedicated WAF) in front.

---

## Recommended deploy order

For a clean first deploy under HEADLESS_INSTALL=true:

1. Build/publish your image (with the Dockerfile fixes from §6).
2. Author the `ConfigMap` containing both `app-custom-config.json` (with theme, front-page, page provider, addons-path, organization.file) AND the Organization JSON-LD (§1).
3. Author the Deployment with `dnsConfig.options.ndots: "1"` (§5), the SESSION_SECRET reference (§8), and the two ConfigMap subPath mounts.
4. Apply, wait for first pod Ready. The boot log should show `OrganizationManager initialized (1 orgs)`, `Created Person record for admin`, `Created default admin user`, and an Add-on loaded line.
5. Verify `/app/data/roles/admin.json` exists and its `member` array references the same UUID as `/app/data/persons/<uuid>.json`.
6. Log in as `admin` / `admin123` and change the password immediately.

If steps 5-6 don't work, you've probably hit one of §1, §2, or §3 — re-check the ConfigMap and use the cleanup recipe from §2 to re-trigger `createDefaultAdmin`.
