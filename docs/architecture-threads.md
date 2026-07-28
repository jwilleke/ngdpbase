---
title: Architecture Threads (in-flight, cross-cutting)
status: living document
lastModified: 2026-07-28T10:45:00Z
---

# Architecture Threads

> **What this is.** A snapshot of in-flight architectural threads — coherent designs that span multiple issues. Each entry maps the composing issues, the dependency graph between them, what's *shipped* vs *designed-but-not-built*, and where implementation may have drifted from design. Reduces the "where am I in this?" overhead when context-switching between sessions.
>
> **What this isn't.**
>
> - **TODO.md** is the issue-priority inbox (one row per open issue, judgment-curated).
> - **schemas.md** is the design surface (CreativeWork shape, render policy, ratified decisions).
> - **docs/architecture/** holds component docs for *shipped* architecture (Access-Control, Rendering-Pipeline, Save-Page-Pipeline).
> - This doc connects the dots between those: which issues belong to which thread, what's still in flight, where drift may have happened.

## How to read this doc

Each thread section has:

- **Status** — one of `design ratified` / `partial implementation` / `mostly shipped` / `in design`.
- **Composing issues** — table with #, title, state, role in this thread.
- **Dependency graph** — ASCII diagram of who's blocked on whom.
- **Drift risks** — where design (schemas.md / EPIC / decision) may have diverged from code. Each one should ideally be a tracking issue.
- **What "done" looks like** — concrete shipped-state description so the thread can eventually retire from this doc.

Update this doc when: a thread crosses a milestone, a new sub-issue is filed, an issue closes, OR drift is discovered. Bump `lastModified` on any change.

## Threads in flight

### 1. CatalogManager unification

**Status:** design ratified (#755 closed 2026-05-20); four producers registered (PageManager, MediaManager, AttachmentManager, plus per-feed sources from the feeds addon); admin visibility shipped via #780. Remaining: consumers (#786) and the undecided candidate producers tracked in #762.

**Driver:** the 2026-05-20 ratified decision (schemas.md) that asset sources unify at the Manager layer behind a `CatalogSource` interface hosted by CatalogManager. Each Manager (PageManager, MediaManager, AttachmentManager) implements `CatalogSource`; CatalogManager exposes `getCreativeWork`, `listCreativeWorks`, `checkSchemaVersions`, `registerSource`. Producers stay diverse (FileSystemMediaProvider vs Sist2 vs S3-backed); the CatalogSource layer makes them queryable uniformly.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #755 | [EPIC] Metadata schemas ratified — CreativeWork model + JSON-LD publishing | CLOSED 2026-05-20 | Parent design |
| #685 | Generic data-ingestion framework | CLOSED | **Shipped as the `feeds` addon** — `FeedManager.registerSources()` registers one CatalogSource per configured feed |
| #762 | CatalogSource producer roster | OPEN | Living inventory; reconciled 2026-07-28. Every candidate manager now exists — the open question is which should register |
| #780 | Admin dashboard: registered catalog sources at runtime | CLOSED | Surfaces the live registry — the right view for per-feed sources, which are deployment-specific and not statically enumerable |
| #786 | Auto-journal — digester | OPEN | Consumer of CatalogManager records |

**Dependency graph:**

```text
#755 (design ratified, CLOSED)
        │
        │   PageManager / MediaManager / AttachmentManager
        │   already implement CatalogSource.types
        │
        ├── #685 (data-ingestion framework, CLOSED — the `feeds` addon)
        │                                                  
        ├── #762 (producer roster) ◄── OPEN; living inventory
        │                                                  
        ├── #780 (admin runtime registry UI, CLOSED)
        │                                                  
        └── #786 (auto-journal consumer) ◄── OPEN
              │
              └── also gated on EPIC #790 (Journal reconcile)
```

**Drift risks:**

- `CatalogManager.list({ types: ['Article'] })` works today because PageManager declares `types: ['Article']`. If/when `types` grows to include subtypes (per #791 Decision D1 = B), the filter logic in #780 must follow.
- Per-feed CatalogSources are registered from instance config, so what is registered differs per deployment and cannot be enumerated in any document. #780's runtime view is the only accurate answer — treat #762 as the inventory of *what could*, never *what does*.
- No integration test exercises `CatalogManager.list → result conforms to CreativeWork shape`. Per-Manager unit tests pass; cross-Manager contract is untested.

**What "done" looks like:** #685 shipped, #780 shipped, #762's enumeration is now grounded in managers that exist. What remains is #786 consuming records reliably, and a decision on which candidate producers register. Closing this thread requires the unified pipeline to be the ONLY path (no per-Manager-direct callers in production code) — not yet true.

---

### 2. NCM pipeline (ngdp Compatible Markdown)

**Status:** spec ratified (#728 closed); normalizer in place; serializer (#501) deferred; phase-2 hardening (#737) deferred.

**Driver:** structured `kind` enum for content normalization, used by Importer + future serializers. Paired with #685 — when data-ingestion produces structured records, #501 serializes them to wiki content.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #728 | NCM spec + normalizer | CLOSED | Foundation |
| #738 | NCM/import conversion metrics | CLOSED v3.41.0 | Observability for conversion outcomes |
| #501 | JSON → ngdp Compatible Markdown serializer | OPEN, deferred | Renders catalog-source records to wiki content |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images | OPEN, deferred | Security + size hardening for image-bearing content |
| #685 | Generic data-ingestion framework | OPEN | Mandatory upstream consumer for #501 |

**Dependency graph:**

```text
#728 (spec, CLOSED)
        │
        ├── #738 (conversion metrics, CLOSED v3.41.0)
        │
        ├── #501 (JSON → NCM serializer) ◄── BLOCKED on driver
        │       │
        │       └── #685 (data-ingestion) ◄── BLOCKS (per #501 comments)
        │
        └── #737 (Phase-2 image hardening) ◄── adds sharp/libvips dep; do when real driver appears
```

**Drift risks:**

- #501 is deferred "no driver today" — but #685 will be the driver. When #685 starts, #501's design decisions (template DSL, fetch policy, template storage, ImportManager integration shape) need resolution. Currently parked; if #685 ramps without #501 being designed in parallel, #685 will hardcode rendering choices that #501 then has to retrofit.
- #737 adds `sharp`/`libvips` deps (already in tree from image thumbnails) — risk is low, but the question of *what* re-encoding policy to apply (quality, size cap, format) is an open design choice.

**What "done" looks like:** #501 ships alongside #685's first driver; #737 lands when a real fetched-image source is causing operator-visible problems (size, malformed content, security). All paths produce NCM-conformant output that the normalizer accepts unchanged.

---

### 3. JSON-LD render pipeline (Slice 6 of #755)

**Status:** **shipped 2026-05-25** — config-driven `@type` per system-category (#791) and SchemaGenerator dead-code cleanup (#792) both landed. JSON-LD render pipeline is the single live path; operator-controllable Article subtypes via `ngdpbase.schema-types` config block. Eligible to move to the archive section after one release cycle of stability.

**Driver:** the 2026-05-20 ratified decision (schemas.md) that structured-data emission is JSON-LD only (not microdata); `@id` URLs are real dereferenceable URLs; content-negotiation serves `application/ld+json`. Slice 6 of #755 (which is itself CLOSED) tracked the work; the implementation went live via #773 (composed pipeline) and #760/#766 (content-neg).

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #755 | [EPIC] Metadata schemas ratified (Slice 6 = JSON-LD render) | CLOSED 2026-05-20 | Parent design |
| #773 | `buildPageJsonLd` compose refactor | CLOSED | Unified `pageToArticle → articleToPageJsonLd → buildPageJsonLd` pipeline |
| #760 / #766 | Content-negotiation (`Accept: application/ld+json`) | CLOSED | Dereferenceable `@id` URLs serve JSON-LD on request |
| #791 | JSON-LD @type per system-category — config-driven schema.org subtypes | CLOSED 2026-05-25 | Operator-controllable `ngdpbase.schema-types` config block. Sparse defaults: documentation/developer → TechArticle, journal → BlogPosting (no-op until EPIC #790's "register journal" sub-issue ships). |
| #792 | Reconcile SchemaGenerator with pageToArticle pipeline | CLOSED 2026-05-25 | Phase 1 investigation confirmed dead code on page-render path; Phase 2+3 deleted the dead methods (815→58 LOC in SchemaGenerator.ts; -101 in WikiRoutes; -6 in header.ejs; 2 dead test files dropped) |

**Dependency graph:**

```text
#755 (Slice 6 design, CLOSED)
        │
        ├── #773 (compose refactor, CLOSED) ◄── pageToArticle → articleToPageJsonLd → buildPageJsonLd
        │
        ├── #760 / #766 (content-neg, CLOSED) ◄── /view/<page> + Accept: application/ld+json
        │
        └── #792 (SchemaGenerator reconciliation, CLOSED 2026-05-25) — was blocking #791; now resolved
                  │
                  ├── Phase 1 — investigated: dead code confirmed (template hooks never assigned)
                  ├── Phase 2 — deleted: WikiRoutes class methods + header.ejs template hooks
                  └── Phase 3 — scope-narrowed: SchemaGenerator.ts 814 → 58 LOC (Org/Person only)
```

**Drift risks:**

- ~~**Two JSON-LD render paths in the codebase.** `SchemaGenerator.generatePageSchema` at `WikiRoutes.ts:1589` AND `pageToArticle` at `WikiRoutes.ts:2135`.~~ **RESOLVED 2026-05-25 via #792**: SchemaGenerator's page/site-render methods deleted; `pageToArticle → buildPageJsonLd` is now the only path in code as well as at runtime. Kept as canonical drift example for the maintenance pattern (investigate → decide-per-call-site → delete).
- SchemaGenerator's defaults contradict schemas.md (`'WebPage'` default vs ratified `'Article'`); uses legacy title-cased category names that don't match today's lowercase `system-category` config.
- Once #791 ships: `journal → BlogPosting` mapping is a no-op until EPIC #790's "register journal as a system-category" sub-issue ships. Operators may set the config and not see the effect.

**What "done" looks like:** SchemaGenerator deleted or scope-narrowed to non-page renders only; one and only one path emits JSON-LD per page; `@type` config-driven; integration test asserts exactly one `<script type="application/ld+json">` per page with the expected `@type` per category.

---

### 4. Journal addon reconcile (EPIC #790)

**Status:** EPIC filed 2026-05-24; partial fix shipped (#789 title format); sub-issues #791 + #792 filed; substantive work not started.

**Driver:** the 2026-05-24 design conversation (operator-led) that journals are pages — `journal entry` schema.org-wise is a `BlogPosting` (an `Article` subtype), stored via `PageManager` like any other page. Today the journal addon has parallel implementations of editor, save, index, templates, tags, mood, date, storage-routing. EPIC #790 retires those parallels in favor of thin UI specialisations over generic page primitives.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #789 | [BUG] Can not open Journal Entries | partial fix shipped v3.41.0; deeper reconcile tracked in EPIC #790 | Surfaced the architectural problem |
| #790 | [EPIC] Journal addon reconcile | OPEN | Parent; checklist of sub-issues |
| #791 | JSON-LD @type per system-category | OPEN | Sub-issue — `journal → BlogPosting` config mapping |
| #792 | Reconcile SchemaGenerator with pageToArticle | CLOSED 2026-05-25 | Sub-issue — dead JSON-LD render code deleted; was blocking #791 |
| #786 | Auto-journal digester | OPEN, deferred | Downstream consumer; gated on this EPIC + #685 |

**Sub-issues filed 2026-05-25:**

- [#793](https://github.com/jwilleke/ngdpbase/issues/793) — Register `journal` as a core `system-category` (smallest; lights up #791's JSON-LD mapping in prod)
- [#794](https://github.com/jwilleke/ngdpbase/issues/794) — Refactor `views/edit.ejs` → `_basicEditor.ejs` partial with extension slots
- [#795](https://github.com/jwilleke/ngdpbase/issues/795) — Sister refactor: `views/view.ejs` → `_basicView.ejs`

**Pending sub-issues (in EPIC #790 body, not yet filed — file when scope sharpens):**

- Wire journal-editor.ejs to extend `_basicEditor.ejs` (depends on #794)
- Retire `addons/journal/managers/JournalDataManager` sidecar `journal-index.json` (replace with `page-index` queries filtered to `system-category: journal`)
- Implement Shape 3 (metadata-merge on generic save) at `WikiRoutes.ts:3088`
- Promote `journal-date` to generic page-level `datePublished` field
- Replace `journal-tags` writes with `user-keywords` writes
- Replace `JournalTemplateManager` with core `TemplateManager`
- Replace `system-location: 'private'` writes with canonical `private: true`
- Decide `mood` model (user-keyword vs registered-vocabulary)
- ProfilePage `@graph` rendering for `user-profile` pages (filed separately — Person extracted from User record)

**Dependency graph:**

```text
EPIC #790 (Journal reconcile)
        │
        ├── #791 (@type per system-category, CLOSED 2026-05-25)
        ├── #792 (SchemaGenerator reconciliation, CLOSED 2026-05-25)
        ├── #793 (register journal as system-category)    ◄── FILED 2026-05-25
        ├── #794 (refactor edit.ejs → _basicEditor)       ◄── FILED 2026-05-25
        ├── #795 (refactor view.ejs → _basicView)         ◄── FILED 2026-05-25
        ├── (retire JournalDataManager sidecar)           ◄── NOT FILED
        ├── (promote journal-date → datePublished)        ◄── NOT FILED
        └── (ProfilePage @graph for user-profile)         ◄── NOT FILED
        
        Downstream:
        └── #786 (auto-journal digester) — gated on this EPIC + #685
```

**Drift risks:**

- The EPIC's sub-issue list is in the EPIC body but not all filed as tracked issues. When the work picks up, sub-issues need to be filed or this thread becomes a vague "look at the EPIC body."
- `JournalDataManager` sidecar (`journal-index.json`) duplicates state PageManager already maintains. As long as it exists, two-place-to-update bugs are possible (the #789 origin pattern).
- Journal storage routing decisions (FAST_STORAGE vs SLOW_STORAGE) live in the addon today; the operator's 2026-05-24 framing wants storage to be a PageManager/system-category concern, not addon-specific.

**What "done" looks like:** Journal addon contains UI extensions only (`journal-edit.ejs` extending `_basicEditor.ejs`, journal-specific stats like streak/on-this-day); zero parallel implementations of save/index/storage. Generic `PageManager.savePageWithContext` handles journal saves; generic JSON-LD render emits `BlogPosting`. Operator can disable the addon and existing journal pages still work (rendered as plain Articles, lose only the mood-picker / streak UI).

---

### 5. ACL evaluator simplification

**Status:** mostly shipped — Tier 0/0.5/1/2/3/default ladder collapsed to 0/0.5/1/2/default after EPIC #714; legacy `[{ALLOW ...}]` markup retired on jimstest today (#778 Slices 1–3); Slice 4 (delete Tier 3 from `ACLManager._runEvaluator`) + satellite migration pending.

**Driver:** the 2026-05-22 operator decision "we will no longer support Page ACLs"; the 2026-05-24 migration script + jimstest apply; today's ratified shift to frontmatter `audience` / `access` as the sole Tier 1 surface.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #714 | [EPIC] ACL evaluator unification | CLOSED v3.37.0 | Parent — Tier 0/0.5/1/2/3/default ladder |
| #778 | Retire Tier 3 page-ACL markup — migrate to frontmatter | CLOSED 2026-05-25 | Slices 1 (script) + 2 (jimstest apply) + 3 (docs) shipped; Slice 4 deferred |
| *(not filed)* | Slice 4 — delete Tier 3 from `_runEvaluator` + parity test + satellite migration | NOT FILED | Final retirement step |

**Dependency graph:**

```text
#714 (Tier ladder unified, CLOSED v3.37.0)
        │
        └── #778 (Tier 3 retirement, CLOSED 2026-05-25)
                  ├── Slice 1 — migration script ✓ (commit b7199325)
                  ├── Slice 2 — apply on jimstest ✓ (13 pages migrated)
                  ├── Slice 3 — docs deprecation ✓ (commit dbc83255)
                  ├── (manual fix) 2 Trusted-view pages ✓ (via #689 edit-raw)
                  └── Slice 4 — Tier 3 evaluator deletion ◄── NOT FILED
                            │
                            ├── needs: parity test (every (user, action) decision matches pre-migration)
                            └── needs: satellite migration (fairways-base, ngdp-temp-builds)
```

**Drift risks:**

- Satellites still have Tier 3 markup in their content. If Slice 4 (delete Tier 3 from `_runEvaluator`) ships before satellites migrate, satellite pages silently lose their ACL semantics.
- `ACLManager.parsePageACL` + back-compat tests still exist in code. Until Slice 4 deletes them, anyone reading the codebase sees both paths as "valid" — confusion risk.
- No integration test asserts "page that previously denied access via Tier 3 markup, now denies via Tier 1 frontmatter — same decision."

**What "done" looks like:** `ACLManager._runEvaluator` ladder is 0/0.5/1/2/default; `parsePageACL` deleted; back-compat tests deleted; all 4 sister-site instances migrated. ACLManager.md evaluator table no longer mentions Tier 3.

---

### 6. System / service principal model (#631)

**Status:** in design — no implementation yet. Forward-compat hooks opportunistically landed during downstream feature work.

**Driver:** non-request code paths (scheduled imports, background jobs, addon-fired tasks) need a principal identity for audit + ACL purposes. Today they pass `actor='system'` strings or skip audit entirely. EPIC #631 proposes a canonical `WikiContext.system()` / `WikiContext.forUser(actor)` pattern.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #631 | Define system/service principal model for non-request code paths | OPEN | Parent design |
| #738 | NCM/import conversion metrics | CLOSED v3.41.0 | Carries `actor` + `isSystem` forward-compat fields in `ImportRunSummary` |
| #685 | Generic data-ingestion framework | OPEN | Will need this for scheduled feed pulls (no request context) |
| #649 | Cloudflare Access JWT (Phase 1) | CLOSED 2026-05-25 | Request-time identity — adjacent but different concern |

**Dependency graph:**

```text
#631 (design, OPEN — not started)
        │
        ├── #738 (CLOSED v3.41.0) ◄── opportunistically baked `actor` + `isSystem` into ImportRunSummary
        │                              schema for forward-compat
        │
        ├── #685 (data-ingestion) ◄── will require #631 to assign actor to scheduled fetches
        │
        └── #649 (CF Access Phase 1, CLOSED 2026-05-25) ◄── request-time identity model;
                                                            different concern but related auth surface
```

**Drift risks:**

- Forward-compat fields exist in `ImportRunSummary` (and potentially other places) referencing `#631`'s shape — but #631's design isn't finalised. Risk: when #631 lands, the shape differs and the forward-compat fields need migrating.
- No `WikiContext.system()` helper exists. Code that wants a system actor today fabricates one. When real callers materialise (#685's scheduled imports), each one will solve it differently absent the canonical helper.

**What "done" looks like:** `WikiContext.system()` + `WikiContext.forUser(actor)` exist; non-request code uses them uniformly; audit log captures who-fired-this consistently across request and non-request paths.

---

### 7. Addon platform maturation

**Status:** near-complete. Deploy + theme-auto-copy shipped via #674 + #443 + #682 (Levers 1+2); distribution shipped via #673 (`node_modules:<glob>` discovery in `AddonsManager`); scaffolding shipped via #675 (`npm run create:addon` + [`ngdpbase-addon-template`](https://github.com/jwilleke/ngdpbase-addon-template), 2026-07-28). **Non-default-path auto-discovery (#686) is the only piece still open.** Theme-policy decision (#444) closed 2026-05-25 as superseded-by-practice.

**Driver:** addon ecosystem maturation — moving from "ngdpbase-internal addons (calendar, forms, journal, elasticsearch)" to "third-party addons that operators can `npx create-ngdpbase-addon`, ship as `@scope/<slug>-addon`, `npm install`, and run." Each issue addresses a different step in the addon lifecycle (distribute → scaffold → discover → theme); all but discovery have now shipped.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #682 | [EPIC] Domain Addon Deployment — easy deploy path for satellites | CLOSED | Parent EPIC — Levers 1 + 2 shipped satellite-side |
| #674 | Canonical k8s manifest templates (Kustomize base + Flux + downstream-image layering) | CLOSED | **Deploy path** — Kustomize bases/overlays for downstream operators |
| #443 | Auto-deploy addon theme files on first load + admin dashboard | CLOSED | **Theme mechanism** — auto-copy from `addons/<name>/themes/` to instance `themes/` |
| #673 | Implement `packaged` addon distribution model (npm install) | CLOSED | **Distribution** — `node_modules:<glob>` entries in `addons-path` are discovered by `AddonsManager` |
| #675 | Scaffolder + reference template for new ngdpbase addons | CLOSED 2026-07-28 | **Scaffold** — `npm run create:addon` (`scripts/create-addon.ts`) + the `ngdpbase-addon-template` repo |
| #686 | AddonsManager auto-enable bundled addons discovered in non-default `addons-path` dirs | OPEN | **Discovery** — Lever 3 of #682; wrapper-image pattern (`/opt/<name>/`) defaults to `enabled: true` |
| #444 | Resolve addon themes: load directly vs copy (domain-addon special case) | CLOSED 2026-05-25 (superseded-by-practice) | **Theme policy resolved** — #443's auto-copy mechanism has operated ~1 year without complaint; the load-vs-copy question was answered de facto. Refile if a specific driver surfaces (domain addon with theme-size or write-frequency concern). |

**Dependency graph:**

```text
#682 (Domain Addon Deployment EPIC, CLOSED)
        │
        ├── Lever 1 + 2 (CLOSED, satellite-side)
        │
        └── Lever 3 = #686 (auto-enable in non-default paths)  ◄── OPEN

addon lifecycle steps:
        │
        ├── Distribute:  #673 (packaged npm-install loader, CLOSED)
        │                       │
        │                       └── companion: #675 (scaffolder, CLOSED 2026-07-28)
        │
        ├── Deploy:      #674 (Kustomize manifests, CLOSED)
        │
        ├── Theme:       #443 (auto-copy mechanism, CLOSED)
        │                       │
        │                       └── policy follow-up: #444 (CLOSED 2026-05-25 — superseded by ~1 year of in-prod use)
        │
        └── Discover:    #686 (auto-enable in non-default paths) ◄── OPEN
```

**Drift risks:**

- **#686 is the only open piece of EPIC #682**; design memory for Lever 3's exact semantics fades the longer it sits. If Levers 1+2 implementation deviated from the design, Lever 3 may need to follow that drift, not the original spec.
- **The template repo and the scaffolder can drift.** `ngdpbase-addon-template` was generated BY `npm run create:addon`, so today they agree by construction. Nothing enforces that: a change to the generator's templates does not update the repo. The template's CI catches the identity and page-UUID invariants, not divergence from the generator.

**What "done" looks like:** A third-party operator can run `npm run create:addon -- --id my-addon` → push to npm as `@scope/my-addon-addon` → `npm install` it on their deployment → ngdpbase discovers it from `node_modules/@scope/my-addon-addon/`, auto-enables it (because non-default `addons-path`), auto-deploys its themes, and runs it without further config.

Every step of that chain works today **except auto-enable**: the operator must still author `ngdpbase.addons.<slug>.enabled: true`. That is #686, and it is all that stands between this thread and retirement.

---

## Recently completed threads (archive)

Threads that fully shipped (all composing issues closed; design now documented in canonical specs). Listed here for ~1 release cycle, then removed.

- **CF Access JWT trust (#649 Phase 1)** — closed 2026-05-25. CloudflareAccessAuthProvider + middleware + config block + 12 unit tests shipped in c7b69c9f. Deferred follow-ups (external-id linkage, logout coordination, multi-AUD, JWT-exp session lifetime) are listed in the close comment.
- **Mobile UX (#784 + #785)** — closed 2026-05-24. Mobile offcanvas restructured + URL-based My Links. Shipped in v3.40.0.
- **Admin Session Manager + per-session revoke (#776 + #777 + #787)** — closed 2026-05-24. Shipped in v3.40.0.
- **NCM/import conversion metrics (#738)** — closed 2026-05-24. `recordImportConversion` counter + persisted per-run summaries + admin trend view. Shipped in v3.41.0.

## Maintenance notes

- **Add a thread when:** ≥3 issues form a coherent design cluster that's hard to scan from TODO.md (issues touch the same managers/concerns; one issue's design affects another's implementation).
- **Remove a thread when:** all composing issues closed AND the shipped design is documented in a canonical doc (schemas.md, the relevant manager doc under `docs/managers/`, etc.). Move to the archive section for one release cycle, then drop.
- **Drift risks should be tracking issues.** A drift risk noted here is a sign that an issue should be filed. The drift list is a temporary holding pen, not a backlog.
- **Bump `lastModified`** on any change so readers can tell at-a-glance if the doc is current.

## Related docs

- [`docs/schemas.md`](./schemas.md) — design surface (CreativeWork shape, render policy, ratified decisions).
- [`docs/managers/CatalogManager.md`](./managers/CatalogManager.md) — CatalogManager component doc.
- [`docs/architecture/Access-Control.md`](./architecture/Access-Control.md) — ACL evaluator shipped design.
- [`docs/architecture/Current-Rendering-Pipeline.md`](./architecture/Current-Rendering-Pipeline.md) — shipped render pipeline.
- [`docs/architecture/Current-Save-Page-Pipeline.md`](./architecture/Current-Save-Page-Pipeline.md) — shipped save pipeline.
- [`docs/project_log.md`](./project_log.md) — durable trail of per-session work.
- [`TODO.md`](../TODO.md) — issue-priority inbox (open work).
