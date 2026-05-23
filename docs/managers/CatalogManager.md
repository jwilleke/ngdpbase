---
name: CatalogManager
description: "Two-registry coordinator — controlled-vocabulary providers (#424) + asset-source providers (#755). Fans out term lookup and asset queries across registered providers."
dateModified: '2026-05-23'
category: managers
code: src/managers/CatalogManager.ts
---

# CatalogManager

**Module:** `src/managers/CatalogManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Source of truth for shapes:** [`docs/schemas.md`](../schemas.md)

---

## Overview

CatalogManager is a **coordinator** — it owns no records itself but routes queries across two parallel registries:

| Registry | What it holds | Status | Filed under |
|---|---|---|---|
| **Vocabulary providers** | Controlled-vocabulary term lists (categories, system-keywords, SKOS concept schemes) | **Shipped** | #424 |
| **Asset sources** | CreativeWork producers — `MediaManager`, `AttachmentManager`, `PageManager` all implement `CatalogSource`; addons can register their own | **Shipped** — Slices 3 / 4 / 5 of #755 | #755 |

Both registries live on the same Manager because they share the same shape (`Map<id, Provider>`) and the same fan-out pattern (walk providers, merge or first-match). They do not interact beyond living together.

Per the 2026-05-20 design (see `docs/schemas.md`), this two-registry layout is the natural successor to the residual coordination role left over when the legacy `SchemaManager` was decomposed in #617 — without reviving the over-broad SchemaManager pattern. Record-ownership stays with the domain Managers; CatalogManager only normalizes and routes.

## Key Features

### Shipped today (vocabulary registry, #424)

- **Pluggable provider model** — `registerProvider()` lets addons contribute domain vocabularies in their `register()` hook.
- **Config-driven default provider** — `DefaultCatalogProvider` reads `ngdpbase.system-keywords` from config and exposes its 13 default terms.
- **AI provider scaffold** — `AICatalogProvider` stub; an LLM-backed addon replaces it by calling `registerProvider()` with a real implementation.
- **Domain filtering** — `getTerms(domain?)` includes only providers matching the requested domain, with un-domained providers always included.
- **Linked-Data URI resolution** — `resolveUri(term)` walks providers in registration order and returns the first non-null hit (currently used for page-keyword sameAs links in `WikiRoutes.ts:1791`).
- **Term suggestion fan-out** — `suggestTerms(content, title)` delegates to any provider that implements it (currently only the AI stub; returns `[]` until an LLM addon is wired).

### Asset-source registry and Linked-Data emission

The 2026-05-20 schema-ratification roadmap is largely shipped. Status:

- **Asset-source registry** — **shipped** (Slices 3 / 4 / 5 of #755). A second `Map<sourceId, CatalogSource>` for CreativeWork producers, fanned out via `registerSource()` / `getCreativeWork()` / `listCreativeWorks()` / `checkSchemaVersions()` / `getSourceInfo()`. Currently registered core sources: `MediaManager` (Slice 3, #758), `AttachmentManager` (Slice 5, #759), `PageManager` (Slice 4, #772). Addons register additional sources from their `register()` hook — the registry is fully dynamic and per-deployment.
- **JSON-LD embedded on page renders** — **shipped** (Slice 6a, #765). `<script type="application/ld+json">` embedded on `/view/:page`.
- **JSON-LD content negotiation on `@id` URLs** — **shipped** (Slice 6b, #766). `Accept: application/ld+json` on any `@id` URL returns the JSON-LD document.
- **SKOS `ConceptScheme` JSON-LD emission** — **shipped** (Slice 6c, #767). Endpoint at `/api/catalog/vocabulary/<scheme-id>` renders each vocabulary as a dereferenceable SKOS ConceptScheme document. Emitter at `src/utils/buildConceptSchemeJsonLd.ts`.
- **SKOS-shaped vocabulary terms** — **not yet implemented**. `CatalogTerm` will gain optional fields aligned with W3C SKOS (`altLabels`, `broader`, `narrower`, `exactMatch`, `closeMatch`, `definition`, `scopeNote`, etc.). The existing flat `uri` field stays as deprecated legacy, treated as a single `exactMatch` entry when present.
- **Runtime visibility of registered sources** — diagnostics methods `getSourceInfo()` and `checkSchemaVersions()` exist but have no admin-UI surface yet. Tracked in **#780**.

## Bootstrapping order

CatalogManager initializes **immediately after ConfigurationManager** (`src/WikiEngine.ts:176–180`):

```text
1.  ConfigurationManager
1b. CatalogManager          ← here
2.  CacheManager
2b. MetricsManager
2c. OrganizationManager, PersonManager
3+. (the rest — UserManager, PageManager, MediaManager, AttachmentManager, SearchManager, ...)
```

This ordering matters: every later manager (and every addon's `register()` hook) can call `engine.getManager('CatalogManager')` and find an initialized instance. PageManager / MediaManager / AttachmentManager will register themselves as `CatalogSource`s during their own `initialize()` (Slices 3–5).

## Quick example

```typescript
// Addon registers a domain vocabulary
const catalog = engine.getManager<CatalogManager>('CatalogManager');
if (catalog) {
  catalog.registerProvider(new GeoscienceCatalogProvider());
}

// Page-keyword sameAs lookup (existing — WikiRoutes.ts:1791)
const uri = await catalog.resolveUri('volcanic-eruption');
// → 'https://www.wikidata.org/wiki/Q7944' (if a provider knows it)

// (Designed for Slice 2+ of #755 — not implemented yet)
const work = await catalog.getCreativeWork('uuid:abc123');
// → { '@type': 'Article', '@id': '/view/Foo', identifier: 'uuid:abc123', ... }

const page = await catalog.listCreativeWorks({
  types: ['ImageObject', 'VideoObject'],
  limit: 50
});
// → { items: CreativeWork[], cursor?: string }
```

## Core methods (shipped today)

| Method | Returns | Description |
|---|---|---|
| `registerProvider(provider)` | `void` | Register a vocabulary provider. Calling with an id that already exists replaces the prior one. |
| `getTerms(domain?)` | `Promise<CatalogTerm[]>` | Merge terms across providers (optionally filtered by domain). Failures in one provider are logged and skipped. |
| `resolveUri(term)` | `Promise<string \| null>` | Walk providers in registration order; return first non-null URI for the term. |
| `suggestTerms(content, title)` | `Promise<CatalogTerm[]>` | Fan out to any provider implementing `suggestTerms()` (currently the AI stub only). |
| `getProviderInfo()` | `Array<{id, displayName, domain?}>` | Diagnostics — list registered providers for admin UIs. |

## Core methods (asset-source registry — shipped in Slice 3 / #758)

The following surface is codified in `src/types/Schema.ts` (Slice 2 / #757) and implemented on CatalogManager in Slice 3 (#758). `MediaManager` is the first registered source; PageManager (Slice 4) and AttachmentManager (Slice 5) follow.

| Method | Returns | Description |
|---|---|---|
| `registerSource(source)` | `void` | Register a `CatalogSource` (PageManager, MediaManager, AttachmentManager, or an addon-contributed source). Replaces by `sourceId`. |
| `getCreativeWork(identifier, opts?)` | `Promise<CreativeWork \| null>` | Look up a single record across all sources by stable identifier (the rename-stable UUID per `docs/schemas.md` Decision 4). Returns `null` for not-found; throws only for actual errors. Optional `sourceId` opt restricts the lookup to one source. |
| `listCreativeWorks(query)` | `Promise<CatalogPage>` | Fan out a query across all sources matching the requested `types`. Cursor scoped to a single source in the initial slice — callers paginating across multiple sources receive items in registration order. |
| `checkSchemaVersions()` | `SchemaVersionReport` | Per-source comparison of `currentSchemaVersion` vs on-disk version (initial slice: all sources report `isStale: false`; per-file `schemaVersion` machinery wires in as each source persists the marker). |
| `getSourceInfo()` | `Array<{sourceId, types, currentSchemaVersion}>` | Diagnostics symmetric with `getProviderInfo()`. |

### `CatalogSource` interface

To be defined precisely in `src/types/Schema.ts` (Slice 2 / #757). Sketch:

```typescript
interface CatalogSource {
  readonly sourceId: string;                  // e.g. 'pages', 'media', 'attachments'
  readonly types: SchemaType[];               // which @type values this source produces
  readonly currentSchemaVersion: number;      // bumped when on-disk record shape changes

  list(query: CatalogQuery): Promise<CatalogPage>;
  get(identifier: string): Promise<CreativeWork | null>;
  rebuild(opts?: RebuildOpts): Promise<void>;
}
```

### `CatalogQuery` shape (sketch)

```typescript
interface CatalogQuery {
  types?: SchemaType[];                       // filter to specific @types
  text?: string;                              // free-text query (delegated to the source's search)
  dateRange?: { from?: string; to?: string };
  keywords?: string[];
  limit?: number;
  cursor?: string;
  filters?: Record<string, unknown>;          // source-specific knobs; sources ignore keys they don't understand
}
```

The `filters` bag (per `docs/schemas.md` Decision 7) is intentionally untyped — it carries source-specific extensions (e.g. media-only EXIF filters) without bloating the cross-source contract.

### `SchemaVersionReport` shape (sketch)

```typescript
type SchemaVersionReport = Array<{
  sourceId: string;
  currentSchemaVersion: number;       // from the manager's CURRENT_SCHEMA_VERSION constant
  onDiskSchemaVersion: number;        // from the loaded index file
  isStale: boolean;                   // true when onDisk < current
}>;
```

## Relationships to other components

| Component | Relationship |
|---|---|
| `AssetService` | URL-param translator (`asset-picker?source=…&type=…&limit=…`) — stays as-is, delegates to CatalogManager via `listCreativeWorks()`. Per Decision 7. |
| `AssetManager` | Cross-source coordination role **moves into CatalogManager** as part of Slice 3+. AssetManager keeps its existing per-source duties but no longer fans out across types. |
| `PageManager` | Will implement `CatalogSource` in Slice 4 (#755); currently still its own thing. |
| `MediaManager` | Will implement `CatalogSource` in Slice 3 (#755); currently still its own thing. |
| `AttachmentManager` | Will implement `CatalogSource` in Slice 5 (#755); currently still its own thing. Its existing `mentions[]` reverse-index (#384) stays unchanged — used by the Q5 link-only decision. |
| `TaggingService` | Existing consumer of `getTerms()` — uses the vocabulary registry to score page content against the controlled-term list (#507). No change. |
| Render mapper (`src/utils/jsonld.ts`, planned) | Consumes `CreativeWork` shapes produced by CatalogManager and serializes to JSON-LD applying the per-field render policy (Decision 5). CatalogManager produces; the renderer serializes. |

## ACL and access control

Each source applies its own permission model — CatalogManager itself does not gatekeep. PageManager knows about page ACLs, AttachmentManager knows about attachment privacy, MediaManager knows about media tier rules. `get()` returns `null` when an item is filtered out by ACL (same as not-found); `list()` filters before returning. This matches the "ACL filtering happens at the source" line in Decision 7.

CatalogManager does not synthesize cross-source access checks — those live in `wikiContext.canAccess` (the still-unwritten unified evaluator tracked by #714).

## Configuration

CatalogManager reads only two config keys today:

| Key | Default | Purpose |
|---|---|---|
| `ngdpbase.system-keywords` | `{}` | The 13 (or more) default vocabulary terms loaded by `DefaultCatalogProvider`. |
| `ngdpbase.catalog.ai.enabled` | `false` | When true, `AICatalogProvider.suggestTerms()` calls through to a registered LLM provider (no such provider ships today). |
| `ngdpbase.catalog.ai.threshold` | `0.7` | Confidence cutoff for AI-suggested terms (reserved). |

No additional config is anticipated for the asset-source registry — `CatalogSource` implementations carry their own per-source config (PageManager already reads `ngdpbase.page-provider.*`, MediaManager reads `ngdpbase.media-providers.*`, etc.).

## Naming recommendation

**Keep the name.** The current `CatalogManager` came from the vocabulary work (#424). Adding the asset-source registry is a strict extension of the same coordinator pattern — same Manager, second `Map<id, Provider>`, same fan-out semantics. Renaming would mean migration churn for the existing call sites (`WikiRoutes.ts:1791`, `TaggingService.ts`, `WikiEngine.ts:176`, `ElasticsearchSearchProvider.ts`, all addon `register()` hooks across the satellite instances) without adding meaning.

Alternatives considered and rejected:

- **`SchemaManager`** — confusing collision with the *decomposed* manager whose removal is still echoing through #624; reusing the name would re-introduce the over-broad pattern that #617 fixed.
- **`CreativeWorkManager`** — accurate for the asset-source side but silent about the vocabulary side; would imply a rename of the vocabulary methods or a split into two managers (which the design explicitly rejects per Decision 7's "same Manager, two parallel registries").
- **`MetadataCoordinator`** — generic to the point of meaning nothing; same problem as the original `SchemaManager`.

The word "Catalog" already maps cleanly to both senses in linked-data vocabulary: catalogs hold *both* term lists (controlled vocabularies) *and* item descriptions (CreativeWorks). The library-science overlap is intentional.

## Minimum-API recommendation

Slice 2 (#757) should land **exactly** the surface listed in the "designed for #755" table above — no more, no less. Specifically:

- The five new public methods: `registerSource`, `getCreativeWork`, `listCreativeWorks`, `checkSchemaVersions`, `getSourceInfo`.
- The three interface shapes: `CatalogSource`, `CatalogQuery`, `CatalogPage`, plus the `SchemaVersionReport` array.
- Two-direction look-up: stable identifier (`get`) and URL-based convenience (`getByUrl(@id)`) — both routes to the same record.
- No `update()` or `write()` on `CatalogSource` — writes stay with the owning Manager's existing API (`PageManager.savePage`, `MediaManager.indexFile`, `AttachmentManager.upload`). CatalogManager is read-side coordination only.
- `rebuild()` on `CatalogSource` so the admin "rebuild index" jobs can fan out uniformly. Per Decision 6, this is what moves a stale `schemaVersion` forward.

What Slice 2 should **not** include:

- A unified write API — writes remain per-Manager.
- A unified delete API — same reason.
- Any actual provider implementations (those are Slices 3–5).
- The JSON-LD render mapper (Slice 6).

This minimum API leaves CatalogManager as a pure read-side coordinator, which keeps it small, testable, and aligned with the "Catalog produces; the renderer serializes" line above.

## Related issues

- **#424** — Original CatalogManager + vocabulary-provider registry. Shipped.
- **#507** — Auto-tagging (uses `getTerms()` via `TaggingService`). Shipped.
- **#617** — Person/Organization refactor; decomposed the legacy SchemaManager. Context for why CatalogManager (not SchemaManager-reborn) is the asset-coordinator successor.
- **#624** — Phantom-SchemaManager admin-routes bug; corollary of #617.
- **#711** — ACL Tier-0 author/creator read mismatch; drove the `author`/`editor` terminology in `docs/schemas.md` Decision 10.
- **#755** — EPIC: metadata schemas ratified. This doc is **Slice 1** of that EPIC.
- **#757** — Slice 2: `src/types/Schema.ts` — codifies the interfaces sketched here.
- **#714** — Unified access-control evaluator (`wikiContext.canAccess`). Adjacent; CatalogManager defers ACL to its sources rather than calling this directly.
- **#660** — Docs-coverage check. This file closes the warning for `src/managers/CatalogManager.ts`.

## Source of truth

[`docs/schemas.md`](../schemas.md) — ratified 2026-05-20. All field shapes, render policies, version-management rules, and the CatalogSource decision live there. This doc is the *Manager* view; schemas.md is the *data shape* view. When they conflict, schemas.md wins and this doc gets updated.
