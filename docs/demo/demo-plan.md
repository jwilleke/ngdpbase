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
| `admin-read` permission in core | **not started** |
| `demo-admin` role via `domainDefaults` | **not started** |
| `admindemo` account + credentials on the Welcome page | **not started** |
| Red warning on the Welcome page about visibility | **not started** |
| Enable the addon on the demo instance (mj-infra-flux) | **not started** |

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

Shipped via the addon's `domainDefaults`, so enabling the addon is the only step.

Deliberately absent:

- **`admin-system`** — every admin mutation refused. The read-only guarantee.
- **`user-read`** — `/admin/users` stays hidden. The one screen withheld, and for privacy rather than security: it lists every visitor's email address.
- **`admin-roles`** — the roles screen is viewable, but creating, editing and deleting roles still require this, so a demo account cannot grant itself anything.
- **`page-delete`** — author-lock covers `edit` only, so a delete permission would let a demo account remove a locked documentation page.

`/admin/configuration` is safe to expose: secret values are stripped server-side and the reveal endpoint requires `admin-system`, so a demo admin sees the screen fully populated with masked values and no reveal control.

## Open questions

- **Should the Welcome page publish the `admindemo` credentials, or should they be handed out on request?** Publishing is a better demo; it also means anyone can read `/admin/logs`, which carries visitor email addresses until the next pod restart. Leaning publish, with the warning.
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
