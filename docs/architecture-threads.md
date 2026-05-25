---
title: Architecture Threads (in-flight, cross-cutting)
status: living document
lastModified: 2026-05-25
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

**Status:** design ratified (#755 closed 2026-05-20); implementation dispersed across multiple sub-issues; admin visibility absent.

**Driver:** the 2026-05-20 ratified decision (schemas.md) that asset sources unify at the Manager layer behind a `CatalogSource` interface hosted by CatalogManager. Each Manager (PageManager, MediaManager, AttachmentManager) implements `CatalogSource`; CatalogManager exposes `getCreativeWork`, `listCreativeWorks`, `checkSchemaVersions`, `registerSource`. Producers stay diverse (FileSystemMediaProvider vs Sist2 vs S3-backed); the CatalogSource layer makes them queryable uniformly.

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #755 | [EPIC] Metadata schemas ratified — CreativeWork model + JSON-LD publishing | CLOSED 2026-05-20 | Parent design |
| #685 | Generic data-ingestion framework | OPEN | **Bottleneck** — fetch/schedule plumbing; produces external-source CatalogSources |
| #762 | CatalogSource producer roster | OPEN | Enumerates what #685 + Managers + addons should register |
| #780 | Admin dashboard: registered catalog sources at runtime | OPEN | Surfaces `CatalogManager.getSourceInfo()` + `checkSchemaVersions()` in admin UI |
| #786 | Auto-journal — digester | OPEN | Consumer of CatalogManager records |

**Dependency graph:**

```text
#755 (design ratified, CLOSED)
        │
        │   PageManager / MediaManager / AttachmentManager
        │   already implement CatalogSource.types
        │
        ├── #685 (data-ingestion framework) ◄────── BLOCKS ┐
        │                                                  │
        ├── #762 (producer roster)             enumerates ─┤
        │                                                  │
        ├── #780 (admin runtime registry UI)               │
        │                                                  │
        └── #786 (auto-journal consumer)        BLOCKS ────┘
              │
              └── also gated on EPIC #790 (Journal reconcile)
```

**Drift risks:**

- `CatalogManager.list({ types: ['Article'] })` works today because PageManager declares `types: ['Article']`. If/when `types` grows to include subtypes (per #791 Decision D1 = B), the filter logic in #780 must follow.
- Operators can't see what's registered at runtime; tribal-knowledge problem. #780 ships visibility — until then, drift is invisible.
- No integration test exercises `CatalogManager.list → result conforms to CreativeWork shape`. Per-Manager unit tests pass; cross-Manager contract is untested.

**What "done" looks like:** #685 ships → #762's enumeration is real (not aspirational) → #780 surfaces it in admin UI → #786 consumes records reliably. Closing this thread requires the unified pipeline to be the ONLY path (no per-Manager-direct callers in production code).

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

**Status:** mostly shipped (live since #773's compose refactor). Config-driven `@type` per system-category in design (#791); parallel-path drift in legacy code (#792).

**Driver:** the 2026-05-20 ratified decision (schemas.md) that structured-data emission is JSON-LD only (not microdata); `@id` URLs are real dereferenceable URLs; content-negotiation serves `application/ld+json`. Slice 6 of #755 (which is itself CLOSED) tracked the work; the implementation went live via #773 (composed pipeline) and #760/#766 (content-neg).

**Composing issues:**

| # | Title | State | Role |
|---|---|---|---|
| #755 | [EPIC] Metadata schemas ratified (Slice 6 = JSON-LD render) | CLOSED 2026-05-20 | Parent design |
| #773 | `buildPageJsonLd` compose refactor | CLOSED | Unified `pageToArticle → articleToPageJsonLd → buildPageJsonLd` pipeline |
| #760 / #766 | Content-negotiation (`Accept: application/ld+json`) | CLOSED | Dereferenceable `@id` URLs serve JSON-LD on request |
| #791 | JSON-LD @type per system-category — config-driven schema.org subtypes | OPEN, **soft-blocked on #792** | Operator-controllable `ngdpbase.schema-types` config block; replaces hardcoded `@type: Article` |
| #792 | Reconcile SchemaGenerator with pageToArticle pipeline | OPEN | **Blocks #791** — `SchemaGenerator` (legacy) coexists with the unified pipeline; one is dead code, neither is provably authoritative until Phase 1 investigates |

**Dependency graph:**

```text
#755 (Slice 6 design, CLOSED)
        │
        ├── #773 (compose refactor, CLOSED) ◄── pageToArticle → articleToPageJsonLd → buildPageJsonLd
        │
        ├── #760 / #766 (content-neg, CLOSED) ◄── /view/<page> + Accept: application/ld+json
        │
        └── #792 (SchemaGenerator reconciliation) ──BLOCKS── #791 (@type per system-category)
                  │
                  └── Phase 1 = investigate (grep + curl); Phase 2 = decide per call site; Phase 3 = delete
```

**Drift risks:**

- **Two JSON-LD render paths in the codebase.** `SchemaGenerator.generatePageSchema` at `WikiRoutes.ts:1589` AND `pageToArticle` at `WikiRoutes.ts:2135`. Either both run (conflicting `@type` per page) or one is dead. #792 will find out. **This is the canonical example of drift between schemas.md and code.**
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
| #792 | Reconcile SchemaGenerator with pageToArticle | OPEN | Sub-issue — blocks #791 |
| #786 | Auto-journal digester | OPEN, deferred | Downstream consumer; gated on this EPIC + #685 |

**Pending sub-issues (in EPIC body, not yet filed):**

- Register `journal` as a core `system-category` in `app-default-config.json`
- Retire `addons/journal/managers/JournalDataManager` sidecar `journal-index.json` (replace with `PageManager.listCreativeWorks` filtered to BlogPosting)
- Merge `journal-editor.ejs` into `_basicEditor.ejs` + extension slot pattern
- Merge `journal-view.ejs` into `_basicView.ejs` + extension slot pattern
- Promote `journal-date` to generic page-level `datePublished` field
- ProfilePage `@graph` rendering for `user-profile` pages (filed separately — Person extracted from User record)

**Dependency graph:**

```text
EPIC #790 (Journal reconcile)
        │
        ├── #791 (@type per system-category) ◄── BLOCKED by #792
        ├── #792 (SchemaGenerator reconciliation)
        ├── (register journal as system-category)         ◄── NOT FILED
        ├── (retire JournalDataManager sidecar)           ◄── NOT FILED
        ├── (merge journal editor/view into _basic*)      ◄── NOT FILED
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
                            └── needs: satellite migration (fairways-base, ngdpbase-veg, ngdp-temp-builds)
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
