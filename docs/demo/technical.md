# ngdpbase — Technical Demo Guide

__Audience:__ Developers, architects, technical evaluators
__Duration:__ 25–35 minutes
__Servers needed:__ ngdpbase (port 3000), fairways-base (port 2121)

---

## Before You Start

Verify both instances are running:

```bash
curl -s http://localhost:3000/api/health | jq .status
curl -s http://localhost:2121/api/health | jq .status
```

Sign in to each instance as an admin user. Have a second browser tab open to the source repo.

### Kiosk demo URL

Use this URL to run the kiosk through the curated demo page sequence:

[kiodk Mode](http://jminim4:3000/kiosk?pages=Why+Use+This+Platform,Platform+Variables,Syntax+Highlighting,Using+Emoji,ConfigAccessorPlugin,My+Links,Kiosk+Mode,Search+Documentation,Markdown+Cheat+Sheet,Plugin,User+Roles+and+Permissions&interval=12)
`

Open it in a separate browser window at the start of the session and leave it running as ambient background during breaks.

Demo Sites

- <http://jminim4:3000/view/Welcome>
- <http://localhost:2121/view/home>

---

## Act 1 — Architecture Overview (5 min)

__Goal:__ Orient the audience before touching the UI.

### What it is

ngdpbase is a TypeScript/Node.js content platform built around a plugin-driven markup parser and a more than 30-manager engine. It is not a wrapper around an existing wiki engine — the JSPWiki-compatible markup parser is a clean-room implementation. The full codebase — core engine and all four domain addons — is TypeScript compiled to native ESM.

### Core concepts to name-drop

| Concept | What to say |
| --- | --- |
| __No database__ | All content is Markdown files on disk. Swap storage providers without changing application code. |
| __Manager pattern__ | 30 managers (`PageManager`, `PluginManager`, `CacheManager`, …) each own one concern and are initialized in dependency order. |
| __Plugin auto-discovery__ | Drop a `.ts` file into `src/plugins/` — it is loaded and registered automatically on next build. |
| __Domain addons__ | A single codebase runs multiple sites. Each addon (calendar, forms, journal, elasticsearch) contributes pages, routes, themes, and nav items independently. All addons are TypeScript/ESM packages. |
| __Required pages__ | System UI pages (LeftMenu, Header, About You, …) are Markdown files versioned in the repo and seeded on first boot. |
| __Rendered HTML cache__ | Parsed and rendered page HTML is cached in `CacheManager` per page per role-set. Cache is invalidated on save, rename, or delete — zero stale reads. |

### Show the project structure briefly

```
src/
  engine/        — WikiEngine bootstrap, manager registry
  managers/      — 30 managers (PageManager, PluginManager, CacheManager, …)
  plugins/       — auto-discovered plugin modules
  parsers/       — MarkupParser (7-phase pipeline)
  routes/        — Express route handlers
  types/         — shared TypeScript interfaces
addons/          — domain addon packages (calendar, forms, journal, elasticsearch)
required-pages/  — system UI pages as Markdown + frontmatter
views/           — EJS templates (header, footer, page layouts)
```

Point to [docs/architecture/MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md) for deeper reading.

---

## Act 2 — The Rendering Pipeline (7 min)

__Goal:__ Show the technical heart of the system — the 7-phase MarkupParser.

### Diagram to draw / show

```
Raw Markup
  → Phase 1: Preprocessing (normalise, encode)
  → Phase 2: Syntax Recognition (headings, lists, tables, links)
  → Phase 3: Context Resolution (variables, page refs)
  → Phase 4: Content Transformation (plugins execute here)
  → Phase 5: Filter Pipeline (ACL, content filters)
  → Phase 6: Markdown Conversion (CommonMark)
  → Phase 7: Post-processing (sanitise, highlight.js, IDs)
  → Final HTML
```

### Live demonstration

1. __Open any page → Edit__
2. Add this markup and save:

   ```
   Server has been up for: [{UptimePlugin}]

   Total pages in this instance: [{TotalPagesPlugin}]

   [{ConfigAccessor key='ngdpbase.server.*'}]
   ```

3. View the rendered page. Point out:
   - `[{UptimePlugin}]` executed at Phase 4 — the value is live, not cached
   - `[{ConfigAccessor key='ngdpbase.server.*'}]` renders a live table from the running config — no separate API call from the browser
   - The config table is rendered server-side and included in the page HTML

4. __Show the cache__ (talk track):

   > "Rendered HTML is cached in `CacheManager` under the key `rendered-pages:<pageName>:<sortedRoles>`. The role-set in the key ensures users with different access levels never see each other's cached output. On a cache hit the entire rendering pipeline — textToHTML, tab sections, all plugin execution — is skipped entirely. Cache is invalidated automatically on every save, rename, or delete."

   Point to [`src/routes/WikiRoutes.ts`](../../src/routes/WikiRoutes.ts) → `viewPage()` for the read-through, and to `CacheManager` regions for the storage layer.

### Plugin execution

Show [`src/plugins/UptimePlugin.ts`](../../src/plugins/UptimePlugin.ts) in the editor:

- It's a plain TypeScript object implementing `SimplePlugin`
- `execute(context, params)` returns a string — that string is spliced into the HTML stream at Phase 4
- No framework glue, no decorator magic

```typescript
const UptimePlugin: SimplePlugin = {
  name: 'UptimePlugin',
  execute(context, _params): string {
    // returns formatted uptime string
  }
};
export default UptimePlugin;
```

> "Any developer can write a plugin in 15 minutes. Drop it in `src/plugins/`, rebuild, it's live."

---

## Act 3 — Domain Addons (5 min)

__Goal:__ Show that one codebase powers multiple sites with zero code duplication.

### Side-by-side

Open port 3000 and port 2121 side by side.

- Same engine version, same manager stack
- Different theme, different addon pages, different domain config
- fairways-base contributes its own addon pages, routes, and left-menu nav items

### How it works

```
WikiEngine.initialize()
  → AddonsManager.loadAddons()
  → for each addon directory:
      seedAddonPages()     — inject addon content pages
      registerRoutes()     — attach Express routes
      registerNavItems()   — contribute sidebar links
```

Point to [`addons/`](../../addons/) directory — each addon is its own TypeScript/ESM npm package with a `tsconfig.json`.

The four current addons and what each contributes:

| Addon | What it adds |
| --- | --- |
| __calendar__ | Reservation system with admin view, conflict detection, email confirmations |
| __forms__ | Schema-driven forms: JSON field definitions, multi-type fields (text, dropdown, section/fieldset, hidden), proxy submission (on-behalf-of), handler hooks, email confirmation, submission store |
| __journal__ | Timestamped log entries with per-page journals and admin management |
| __elasticsearch__ | Full-text + sist2 asset search via Elasticsearch, admin status dashboard |

> "The host engine never knows what addons are installed. Addons register themselves. Adding a new vertical is a new directory and a new JSON form definition — not a fork."

### My Links — a concrete addon-aware feature

Navigate to any page on fairways-base → More menu → __Add to My Links__.

> "My Links is per-user and renders directly in the EJS template — not inside a LeftMenu wiki page — so it works regardless of which LeftMenu variant an addon installs. The pinned pages are in `nav.pinnedPages` inside the user preferences JSON and are included in the MarkupParser cache key so the sidebar always reflects the current state."

---

## Act 4 — Storage & Data Model (5 min)

__Goal:__ Explain why there is no database and why that is a feature, not a gap.

### Page storage

Every page is a Markdown file with YAML frontmatter:

```markdown
---
title: Example Page
uuid: 3f2a1b4c-...
slug: example-page
lastModified: '2026-04-19T10:00:00.000Z'
author: jim
user-keywords:
  - example
---
Page content here.
```

- UUID is the stable identity; slug is the human URL
- `lastModified` drives versioning and cache invalidation
- No ORM, no migrations — `git diff` shows all content changes

### Storage providers

`PageManager` delegates to a provider interface:

```typescript
interface PageProvider {
  getPage(pageName: string): Promise<WikiDocument>;
  savePage(doc: WikiDocument): Promise<void>;
  listPages(): Promise<string[]>;
}
```

Current provider: `FileSystemProvider`. Future providers (S3, database) implement the same interface — zero application-layer changes.

### User data

Each user is a JSON file in `data/users/`. Preferences (including `nav.pinnedPages`) are a nested object — no schema migrations when new preference keys are added.

---

## Act 5 — Auth, ACL & Policy (5 min)

__Goal:__ Show the security model is real and layered.

### Authentication

- Session-based (file-backed sessions, configurable to Redis)
- Role system: `admin`, `editor`, `viewer`, `anonymous`
- Each user JSON stores hashed credentials and role assignments

### ACL

Pages carry optional `acl` frontmatter:

```yaml
acl:
  view: [editor, admin]
  edit: [admin]
```

`ACLManager` evaluates this at request time. Anonymous users are denied before the rendering pipeline runs.

### Policy layer

Separate from ACL — `PolicyManager` loads JSON policy files that express broader rules:

```json
{ "rule": "deny", "action": "edit", "subject": "anonymous" }
```

`PolicyEvaluator` runs policies before ACL checks. `AuditManager` logs every access decision to `logs/audit.log`.

> "Three independent layers: policies (coarse), ACL (per-page), session (identity). Each is independently configurable and audited."

---

## Act 6 — Developer Experience (5 min)

__Goal:__ Show the system is easy to extend.

### Write a plugin live (or walk through the steps)

```typescript
// src/plugins/HelloPlugin.ts
import type { SimplePlugin, PluginContext, PluginParams } from './types';

const HelloPlugin: SimplePlugin = {
  name: 'HelloPlugin',
  execute(_context: PluginContext, params: PluginParams): string {
    const name = params.name ?? 'World';
    return `<strong>Hello, ${name}!</strong>`;
  }
};

export default HelloPlugin;
```

```bash
npm run build
```

Then on any page:

```
[{Hello name='Audience'}]
```

Result: __Hello, Audience!__ — rendered live on page load.

### Emoji shortcodes

Type `:rocket:` in the editor — show the inline autocomplete dropdown, accept with Enter or Tab, see 🚀 rendered in the saved page.

> "The shortcode list ships with the engine. The autocomplete is a vanilla JS overlay with no framework dependency."

### Syntax highlighting

Paste any fenced code block with a language specifier:

````
```typescript
const x: number = 42;
```
````

highlight.js runs in Phase 7 (post-processing) — no client-side JS needed to apply highlighting. The coloured HTML is in the initial page response.

---

## Talking Points for Q&A

| Question | Answer |
| --- | --- |
| Why not use Confluence / Notion? | Those are hosted SaaS. ngdpbase runs on your infrastructure, all data in files you own, no vendor lock-in. |
| Why no database? | Files are inspectable, versionable with git, trivially backed up, and portable. The FileSystemProvider abstraction allows a database backend without changing application code. |
| How does search work? | Lunr.js full-text index built in-memory on startup and incrementally updated on page save. Index lives on fast storage (SSD path configurable). Elasticsearch addon available for larger deployments. |
| What is the plugin security model? | Plugins execute server-side in the Node.js process. There is no sandbox — plugin authors are trusted developers. User-provided markup cannot inject arbitrary plugins; only registered plugin names are dispatched. |
| How fast is page rendering? | Rendered HTML is cached in `CacheManager` per page per role-set. On a cache hit the rendering pipeline is bypassed entirely — response time drops to file I/O + template render. Cache is automatically invalidated on save, rename, or delete. |
| Can it scale horizontally? | Currently single-process. FileSystemProvider requires a shared mount or provider swap (S3/database) for multi-node. Session store is already configurable. |
| What is the multi-site story? | Domain addons share one process and one engine. For fully isolated tenants, run separate processes — `server.sh` makes this a one-liner per instance. |

---

## Reference Links

- Architecture: [docs/architecture/](../architecture/)
- Rendering pipeline: [docs/rendering-pipeline.md](../rendering-pipeline.md)
- Plugin authoring: [docs/plugins/](../plugins/)
- Manager overview: [docs/architecture/MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md)
- API routes: [docs/api/](../api/)
- Proper documentation pages standard: [docs/proper-documentation-pages.md](../proper-documentation-pages.md)

## Other stuff

- [Elescticsearch](http://192.168.68.71:4090/#/?i=69e22067&i=69e814ef)
