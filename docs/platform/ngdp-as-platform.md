# ngdpbase Platform Guide

> See also: [`platform-core-capabilities.md`](./platform-core-capabilities.md) (what core provides)
> and [`addon-development-guide.md`](./addon-development-guide.md) (how to build an add-on).

---

## What is ngdpbase?

ngdpbase is a **clone-and-extend wiki platform** built on Node.js / Express / TypeScript.
You clone the repo, configure it, and add domain-specific logic through its extension system — without modifying core.

Two deployments, both live:

| Project | Where | Description |
|---------|-------|-------------|
| The Fairways | [operator guide](../demo/the-fairways-operator.md) | Condo/HOA community site — role-per-unit, private pages, contact data |
| GeoHazardWatch | [jwilleke/geohazardwatch](https://github.com/jwilleke/geohazardwatch) | Volcano and earthquake data — the project's reference deployment (see [`Deployment.md`](./Deployment.md)). Formerly "Volcano Wiki" / `ve-geology` |

Neither lives in this repo. Both are **satellite** deployments that consume ngdpbase as a base image or npm dependency — the model described in [`deployment/addon-packaged.md`](./deployment/addon-packaged.md). The original plan put each domain in an `addons/<name>/` directory here; that was superseded once domain addons started shipping on their own release cadence.

The key insight: **ngdpbase provides horizontal infrastructure; add-ons provide vertical domain logic.**

```
┌──────────────────────────────────────────────────────┐
│  Domain Layer (Add-ons)                               │
│  geohazardwatch   the-fairways   your-addon           │
├──────────────────────────────────────────────────────┤
│  Presentation Layer (Plugins + Themes)                │
│  VolcanoInfobox   EmbedPlugin   fairways-theme        │
├──────────────────────────────────────────────────────┤
│  Platform Layer (ngdpbase Core)                       │
│  Pages · Users · ACL · Search · Versioning · Admin   │
└──────────────────────────────────────────────────────┘
```

---

## What the Core Provides

See [`platform-core-capabilities.md`](./platform-core-capabilities.md) for the full inventory.
Summary: pages, versioning, users, ACL, search, markup rendering, plugins, theming, admin panel, export/import, backup/restore, background jobs, audit logging.

---

## Extension Architecture

Four ways to extend ngdpbase without touching core:

```
┌────────────────────────────────────────────────────────┐
│  THEMES        Visual: colors, logo, favicon            │
│  themes/        One CSS variable file per theme         │
├────────────────────────────────────────────────────────┤
│  PLUGINS       Markup-level: [{PluginName}] directives  │
│  plugins/       Returns HTML fragment during page load  │
├────────────────────────────────────────────────────────┤
│  ADD-ONS       Application-level: routes, managers,     │
│  (external)     databases, background jobs, hooks       │
├────────────────────────────────────────────────────────┤
│  PROVIDERS     Swappable implementations                │
│  src/providers/ PageProvider, SearchProvider, etc.     │
└────────────────────────────────────────────────────────┘
```

| Need | Use |
|------|-----|
| Custom markup display in a page body | Plugin |
| Business logic, data store, API routes | Add-on |
| Swap page/user/search storage backend | Provider |
| Visual branding | Theme |

---

## Use Case Analysis

### Fairways Gen2 — Condo Association Website

| Need | ngdpbase Mechanism | Notes |
|------|------------------|-------|
| Dynamic wiki pages | Core (PageManager) | Markdown + versioning included |
| Role per unit (unit-01..unit-99) | Core (UserManager + ACL roles) | Per-page ACL already supported |
| Multiple logins per unit | Core (UserManager) | Multiple users can share a role |
| Private unit folders | Core ACL | Namespace pages under `unit-01/...` |
| Unit contact/address data | Add-on (UnitDataManager) | Lightweight add-on: JSON or SQLite |
| Google Forms/Sheets embeds | Plugin (`[{Embed url='...'}]`) | ~20-line plugin |
| Content migration | ImportManager | Markdown conversion from static HTML |

Minimal custom code: `addons/fairways/` + `plugins/EmbedPlugin.ts` + `themes/fairways/`.

---

### Volcano Wiki — Scientific Data + Community Wiki

| Need | ngdpbase Mechanism | Notes |
|------|------------------|-------|
| 2,661 structured volcano pages | Core (PageManager) | YAML frontmatter links to GVP ID |
| Structured data queries | Add-on (VolcanoDataManager) | Loads `volcanoes.json` into memory |
| Infobox display | Plugin (VolcanoInfoboxPlugin) | Renders fields from frontmatter |
| Map view | Plugin (VolcanoMapPlugin) | Extends existing LocationPlugin |
| Faceted search UI | Plugin (VolcanoSearchPlugin) | Calls `/api/volcano/search` |
| API routes (/api/volcano/*) | Add-on routes | Via `engine.app` |
| Bulk importer (2,661 pages) | Add-on import script | `npm run import:volcano` |
| Community editing | Core (UserManager + ACL) | Standard wiki editing |
| Photo/gallery | Core (AttachmentManager + MediaPlugin) | Already functional |

**Add-on structure:**

```
addons/volcano-wiki/
├── index.ts
├── managers/
│   └── VolcanoDataManager.ts
├── routes/
│   └── api.ts
├── import/
│   └── import-api.ts
├── data/
│   ├── volcanoes.json
│   └── eruptions.json
└── plugins/
    ├── VolcanoInfoboxPlugin.ts
    ├── VolcanoSearchPlugin.ts
    ├── VolcanoListPlugin.ts
    └── VolcanoMapPlugin.ts
```

---

## Add-on Development Model

### Separate Repos

Each add-on lives in its own GitHub repository. Wire it into a running ngdpbase instance:

```json
// $FAST_STORAGE/config/app-custom-config.json
{
  "ngdpbase.managers.addons-manager.addons-path": "/path/to/my-addon-repo/addons",
  "ngdpbase.addons.my-addon.enabled": true
}
```

**Local dev layout:**

```
/workspaces/github/
├── ngdpbase/              ← core, always running
├── volcano-wiki/          ← addon repo under development
│   └── addons/
│       └── volcano-wiki/
└── fairways-gen2/
    └── addons/
        └── fairways/
```

### Contributing Core Improvements Upstream

During add-on development you may find gaps in core. Fix them in the `ngdpbase` repo, commit, then continue add-on development. Core PRs must be self-contained — no add-on-specific code in the core repo.

---

## Optional Capability Framework

Implemented in [#394](https://github.com/jwilleke/ngdpbase/issues/394).

Optional features register themselves at startup so admin UI panels can gate on them — disabled features are invisible rather than broken.

```javascript
// In register():
engine.setCapability('my-addon', true);
```

```ejs
<%# In an admin EJS template: %>
<% if (capabilities && capabilities['my-addon']) { %>
  <!-- my-addon admin section -->
<% } %>
```

See `views/admin-dashboard.ejs:268` for the MediaManager example.

---

## Add-on Admin Panel Pattern

Tracked in [#397](https://github.com/jwilleke/ngdpbase/issues/397).

1. Call `engine.setCapability('my-addon', true)` in `register()`
2. Mount your admin route: `app.get('/admin/my-addon', requireAdmin, handler)`
3. Guard your EJS section with `<% if (capabilities && capabilities['my-addon']) { %>`

---

## Platform Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Done | `registerPlugin()` [#358](https://github.com/jwilleke/ngdpbase/issues/358), `engine.expressApp` [#359](https://github.com/jwilleke/ngdpbase/issues/359) |
| Phase 1 | ✅ Done | Addon development guide + `addons/calendar/` — event calendar with FullCalendar UI |
| Phase 2 | ✅ Done | The Fairways — shipped as a satellite deployment, not an in-repo addon |
| Phase 3 | ✅ Done | GeoHazardWatch — satellite repo, wrapper image, its own release cadence |
| Phase 4 | ✅ Done | Distribution + deploy: `packaged` npm model [#673](https://github.com/jwilleke/ngdpbase/issues/673), canonical k8s base [#674](https://github.com/jwilleke/ngdpbase/issues/674), canonical addon identity [#927](https://github.com/jwilleke/ngdpbase/issues/927) |
| Phase 5 | ✅ Done | Authoring: `npm run create:addon` scaffolder + [`ngdpbase-addon-template`](https://github.com/jwilleke/ngdpbase-addon-template) [#675](https://github.com/jwilleke/ngdpbase/issues/675) |
| Phase 6 | Open | Discovery: auto-enable addons found in non-default `addons-path` dirs [#686](https://github.com/jwilleke/ngdpbase/issues/686) |

Phases 2 and 3 completed in a different shape than planned: both domains ship as satellites rather than `addons/<name>/` directories here. See [`architecture-threads.md` § Addon platform maturation](../architecture-threads.md) for the thread that tracks what is still open.

---

## Current Gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| No add-on hot-reload | Low | Restart required to enable/disable |
| No add-on marketplace or registry | Low | Out of scope until ecosystem has traffic |
| No sandboxing — add-ons run in-process | Low | Trusted-source install only |
| SearchProvider only supports Lunr at scale | Medium | 3GB memory spike for 14K docs |

---

## Related

| Document | Contents |
|----------|----------|
| [`platform-core-capabilities.md`](./platform-core-capabilities.md) | Full inventory of what core provides |
| [`addon-development-guide.md`](./addon-development-guide.md) | How to build an add-on (code patterns, checklist) |
| [`addons/calendar/`](../../addons/calendar/) | Event calendar with FullCalendar UI — reference implementation |

| Issue | Description |
|-------|-------------|
| [#394](https://github.com/jwilleke/ngdpbase/issues/394) | Optional-capability framework (done) |
| [#397](https://github.com/jwilleke/ngdpbase/issues/397) | Add-on admin panel pattern |
| [#398](https://github.com/jwilleke/ngdpbase/issues/398) | This document |
| [#405](https://github.com/jwilleke/ngdpbase/issues/405) | DAM Epic — unified AssetProvider |
| [#673](https://github.com/jwilleke/ngdpbase/issues/673) | `packaged` addon distribution (npm) — how satellites consume the platform |
| [#675](https://github.com/jwilleke/ngdpbase/issues/675) | Addon scaffolder + reference template — done; see [`ngdpbase-addon-template`](https://github.com/jwilleke/ngdpbase-addon-template) |
| [#686](https://github.com/jwilleke/ngdpbase/issues/686) | Auto-enable addons discovered in non-default `addons-path` dirs — **open** |

---

Last updated: 2026-07-28 | Repo: [jwilleke/ngdpbase](https://github.com/jwilleke/ngdpbase)
