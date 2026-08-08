# Demo addon — plan

Tracking issue: [#1029](https://github.com/jwilleke/ngdpbase/issues/1029). Live instance: `https://ngdpbase-demo.nerdsbythehour.com`.

## Why an addon

The demo pages were originally added to core `required-pages/`, which ships them to **every** instance. The Fairways and the temp build both carry `Demo Welcome`, `Demo Sandbox` and `Demo Feature Tour` on disk today, listed as **New** in their required-pages sync screens — one click from putting demo content on a production site. They were never live anywhere, which was luck rather than design.

Demo content belongs to the demo. An addon is how this project scopes content to the instances that ask for it, and it carries the role definition and config alongside the pages instead of scattering them across deployment manifests.

## What the demo is for

Showing the software to someone who has not installed it. That means:

- **Anonymous visitors read everything.** No account needed to look around.
- **Signing up is easy and passwordless** — magic link only, no password form.
- **A signed-in visitor can edit** and create pages, and edit other visitors' pages.
- **The documentation cannot be defaced.** Seeded pages are author-locked; `Demo Sandbox` is deliberately not.
- **The admin dashboard is demonstrable** — the trash view from #969, required-pages sync, configuration, logs — without letting a stranger change anything.

## Status

| Piece | State |
|---|---|
| Addon skeleton — `package.json`, `index.ts`, `tsconfig.json` | done |
| Pages moved from core `required-pages/` into `addons/demo/pages/` | done |
| `author-lock: true` on Welcome and Feature Tour, Sandbox left open | done |
| `ngdpbase.addons.demo.enabled` in the config catalog (default `false`) | done |
| `admin-read` permission in core | done |
| 25 admin read paths accept it; 50 mutating routes untouched | done |
| `demo-admin` role registered by the addon | done |
| Red warning on the Welcome page about visibility | done |
| Demo `app-custom-config.json` moved onto the volume, editable | done |
| Enable the addon — **after** the release, see ordering below | done |
| `admindemo` seeded by the addon, profile locked, credentials on the Welcome page | done |

### Ordering — the addon flag cannot be set early

`ngdpbase.addons.<id>.enabled = true` naming an addon that is not in the image is a **hard startup refusal** (#672), not a no-op. Setting it before the release put the demo into CrashLoopBackOff:

```text
[ConfigurationManager] Refusing to start: 'ngdpbase.addons.<id>.enabled = true'
references unknown addon(s): "demo".
```

The guard is correct — a key naming a non-existent addon is far more often a typo than intent. So the order is strict:

1. Release ngdpbase (minor — new permission surface)
2. Flux bumps the demo to that image
3. Set `ngdpbase.addons.demo.enabled: true` in `app-custom-config.json` **on the volume** — one line, over SSH or through `/admin/configuration`, no manifest edit and no PR
4. Put the demo password in `<FAST_STORAGE>/.env` on the volume, then restart — the addon seeds `admindemo` and the Welcome page publishes it automatically

```bash
NGDPBASE_DEMO_ADMIN_PASSWORD=whatever-you-publish
```

`.env` works here because the app loads it itself at startup (`src/bootstrap-env.ts`), not only through `./server.sh`. That was not true before: the image runs `node dist/src/app.js` directly and `server.sh` is not even in it, so a `.env` on the volume used to be silently inert and the value could only come from a Secret plus an `env:` block in the deployment — a manifest edit and a mj-infra-flux PR, for something that is plainly application configuration. Now it sits on the volume next to `app-custom-config.json`, needing neither.

The Welcome page carries `[{DemoLogin}]`, which reads the same key the account is seeded from. Rotate the password and the page follows; there is no copy to keep in step.

Step 4 used to be "create the `admindemo` account and publish its credentials", by hand, on each instance. The addon now does it in `register()`, which is what makes enabling the addon the *whole* setup: the account cannot drift from the credentials printed on the Welcome page, and anyone running their own demo gets a working dashboard login with no manual step. Seeding is idempotent — an account that already exists is left exactly as it is, so an operator who rotates the password keeps that across restarts.

Step 3 is a config edit rather than a deployment change because the demo's `app-custom-config.json` now lives on the persistent volume, matching geohazardwatch (`840b87c`). A `subPath` ConfigMap mount is read-only, so app settings supplied that way cannot be changed without a redeploy — which is the wrong home for anything an operator edits.

## The read-only dashboard

The interesting part, and the reason the addon needs a core change first.

The admin surface is gated by two coarse permissions, `admin-system` and `admin-roles`. `admin-system` grants viewing **and** mutating, so there is no way today to hand someone a look-but-don't-touch dashboard.

The split maps cleanly onto HTTP method — 26 `GET /admin*` against 45 mutating routes — so:

- **New `admin-read` permission.** The 26 GET handlers accept `admin-read` **or** `admin-system`. `GET /admin/roles` accepts it too; its three mutations keep requiring `admin-roles`, so viewing the permission model is separated from editing it with no escalation path.
- **The 45 mutating routes are untouched.** They keep requiring `admin-system`. That is the entire read-only guarantee — not a new check anywhere, just the absence of a permission. Nothing to remember and nothing to miss.

### Why not a `demomode` flag

It was the obvious first idea and it is the wrong tool. It would be instance-global, so it would make the operator's own `admin` read-only too — or need an admin exemption, at which point it has re-implemented per-role permissions, worse. It would also be a second authorization system to keep in sync with the first, and nothing would help find the gaps across 45 mutating routes.

Roles are collections of permissions. A read/write distinction belongs *in* that model, not beside it.

### The `demo-admin` role

```json
"demo-admin": {
  "permissions": [
    "page-read", "page-edit", "page-create", "page-export",
    "asset-read", "asset-upload", "search-page",
    "admin-read"
  ]
}
```

Registered by the addon's `register()`, **not** `domainDefaults`. That distinction is load-bearing: `applyDomainDefaults` uses `setRuntimeProperty`, which is whole-key replacement. Declaring `ngdpbase.access.policies` there would replace all eight shipped policies — including `admin-full-access` — and lock the operator out of their own instance. The addon reads the current roles and policies, appends its own if absent, and writes back.

Both halves are needed. A role's inline `permissions[]` is what `ConfigAccessorPlugin` renders on the Roles page; `PolicyEvaluator` decides real access from `ngdpbase.access.policies`. The addon adds a `demo-admin-access` policy at priority 90 — below `admin-full-access` at 100, so it can never widen what an admin already has.

Deliberately absent:

- **`admin-system`** — every admin mutation refused. The read-only guarantee.
- **`user-read`** — `/admin/users` stays hidden. The one screen withheld, and for privacy rather than security: it lists every visitor's email address.
- **`admin-roles`** — the roles screen is viewable, but creating, editing and deleting roles still require this, so a demo account cannot grant itself anything.
- **`page-delete`** — author-lock covers `edit` only, so a delete permission would let a demo account remove a locked documentation page.

`/admin/configuration` is safe to expose: secret values are stripped server-side and the reveal endpoint requires `admin-system`, so a demo admin sees the screen fully populated with masked values and no reveal control.

## Open questions

- ~~**Should the Welcome page publish the `admindemo` credentials, or should they be handed out on request?**~~ **Resolved: publish.** `admindemo`, with the password the operator sets in `NGDPBASE_DEMO_ADMIN_PASSWORD`, printed on the Welcome page. No default ships — the addon seeds no account at all rather than one with a guessable password, and says so in the log. Handing them out on request is not a demo. The `/admin/logs` exposure stands — anyone signed in can read visitor email addresses until the next pod restart — and the red warning on the Welcome page covers it.

  Publishing a shared password only works if the holder cannot take the account over, so it is seeded with `profileLocked`: password, email and display name are refused on `/profile`. **Email is the reason the lock covers more than the password.** Magic-link login resolves an account by address, so a visitor who repointed `admindemo`'s email at their own inbox would have permanent exclusive access and the published password would stop working for everyone else. A password-only lock looks right and leaves that open. An administrator can still change all three through `/admin/users/admindemo/edit`, which needs `user-edit`.

  `profileLocked` is deliberately not `isSystem`. `isSystem` means "cannot be deleted" and is set on `admin` — an account that must keep self-service password change.
- **Does the demo still need its mounted anchor Organization** now that #1027 seeds one? It is redundant but harmless, and the mount survives a volume reset. Left as-is deliberately.

## Verification

Locally, with the addon enabled and a user holding only `demo-admin`:

| Check | Expected |
|---|---|
| All admin screens except `/admin/users` | render, fully populated |
| Any admin mutation — purge, restore, sync, save config, edit role | refused |
| `/admin/configuration` | secrets masked, no reveal control |
| Edit a seeded doc page | refused — author-locked |
| Edit another visitor's page | allowed |
| Edit `Demo Sandbox` | allowed |
| `admin`, all of the above | unchanged |

With the addon **disabled** — the default, i.e. The Fairways and the temp build — no demo pages are seeded, no `demo-admin` role exists, and `/admin/required-pages` shows no demo entries. That last one is the regression this addon exists to fix, so it is worth checking explicitly.
