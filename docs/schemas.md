---
title: ngdpbase Metadata Schemas
status: ratified — 2026-05-20
lastModified: 2026-05-24
epic: "#755"
---

# ngdpbase Metadata Schemas

> __Status:__ ratified (2026-05-20). All open questions are resolved and the field tables below are the agreed shape. Subsequent changes follow the Ratified-decisions append/strike-through convention rather than free edits.
>
> __Tracking EPIC:__ [#755](https://github.com/jwilleke/ngdpbase/issues/755) — Metadata schemas ratified — schema.org-shaped CreativeWork model + JSON-LD linked-data publishing (6 slices).
>
> __Schemas vs vocabularies (terminology note):__ This document defines *schemas* — the __shape__ of ngdp's metadata records (`CreativeWork`, `Article`, `ImageObject`, `VideoObject`, `AudioObject`, `DigitalDocument`) and how source fields map into them. *Vocabularies* — controlled term lists like categories and system-keywords — are a separate concern, hosted by CatalogManager via `CatalogProvider` (existing, #424) and emittable as SKOS `ConceptScheme` JSON-LD documents (per the 2026-05-20 SKOS-alignment decision). Both live under CatalogManager but address different layers: schemas define record shape; vocabularies populate term-valued fields.

## Ratified decisions

Decisions made during the brainstorm that the rest of the doc must respect. New decisions are appended with a date; if a later decision overrides an earlier one, mark the earlier one struck-through with the date.

- __2026-05-20 — Field names match schema.org first.__ Where schema.org has a matching concept and shape, use its exact name and casing. Where it has the concept but a different shape, mark `⚠️` and convert at JSON-LD render time. Where there's no match, use the `ngdp:` prefix or schema.org's `additionalProperty` slot.
- __2026-05-20 — `slug` is an `Article` extension only, not base.__ (Decision B from the brainstorm.) Pages author a slug today; image/video/audio/PDF/docx do not. We put `ngdp:slug` on `Article` only. If a real driver emerges for human-readable URLs on other types, we promote it to the base then.
- __2026-05-20 — schema.org-vocabulary as starting point, curated by ngdp use, not by completeness.__ Reject schema.org fields whose meaning doesn't survive the digital-content boundary (`numberOfPages` is the canonical reject). Reject fields that are computed/derived rather than authored/extracted (`wordCount`). Add a field only when a named ngdp consumer reads it.
- __2026-05-20 — `@id` is the canonical URL; UUID lives in schema.org's `identifier` field.__ (Option γ from the brainstorm.) `@id` = the dereferenceable URL (`/view/<slug>` for pages, `/media/file/<id>` for media). The rename-stable internal UUID maps to schema.org's standard `identifier` property — it's the blessed slot for opaque IDs, so the UUID drops the `ngdp:` prefix. `@id` changes when slug changes; `identifier` (UUID) never does. Both stable, at different layers.
- __2026-05-20 — Custom-field policy: `ngdp:` prefix internally; per-field JSON-LD render policy.__ (Option C + filter from the brainstorm.)
  Two-shape problem solved with one mapper: (1) Internal TS types + asset records use `ngdp:` prefixed keys for our custom fields — keeps the namespace marker visible in code.
  (2) JSON-LD render applies one of three policies per field — __map__ to a schema.org equivalent where one exists semantically (`ngdp:category` → `about`/`genre`), __omit__ when the field is an internal render hint / redundant with another field / no consumer meaning, __`additionalProperty` PropertyValue__ as the fallback for genuinely-custom externally-meaningful fields.
  (3) One render mapper (`src/utils/jsonld.ts` or similar) owns the per-field policy table — adding a new `ngdp:*` field requires declaring its render policy in that table.
  Consequence: no `https://ngdpbase.org/schema#` vocabulary URL to maintain; external JSON-LD output is fully schema.org-native; internal code stays short and named.
- __2026-05-20 — Each persisted index file carries a `schemaVersion` field.__
  Per-file, not per-record and not one global number. The value tracks the version of the slice of the schema that file's contents conform to; different files can be at different versions (`media-index.json.schemaVersion` is independent of the page-frontmatter slice's version).
  Each owning manager keeps a `CURRENT_SCHEMA_VERSION` constant in code; on startup the manager compares its constant against the loaded file's value.
  On mismatch (file < code): non-blocking — log a WARN line, surface an admin-dashboard banner, server still serves stale data, the existing rebuild jobs (`media.rebuild`, `pages.rebuild`, …) move the file forward.
  Bump rule: bump `schemaVersion` when the on-disk record shape changes; don't bump for render-time-only policy changes.
  Downstream caches (search providers) record which source versions they were built from and rebuild themselves when any upstream advances.
- __2026-05-20 — Asset sources unify at the Manager layer behind a `CatalogSource` interface, hosted by CatalogManager.__
  Providers stay diverse and pluggable per-deployment (FileSystemMediaProvider vs Sist2 vs S3-backed, etc.).
  Each Manager (PageManager, MediaManager, AttachmentManager) implements `CatalogSource`: declares `sourceId` + `types: SchemaType[]` + `currentSchemaVersion`, exposes `list(query)` returning `CatalogPage`, `get(identifier)` returning `CreativeWork | null`, `rebuild(opts)`.
  CatalogManager keeps a `Map<sourceId, CatalogSource>` next to its existing vocabulary `Map<id, CatalogProvider>` — same Manager, two parallel registries.
  CatalogManager gains `registerSource()`, `getCreativeWork(identifier, opts?)`, `listCreativeWorks(query)`, `checkSchemaVersions()`.
  AssetService stays as the URL-param translator and delegates to CatalogManager; AssetManager's cross-source coordination role moves into CatalogManager.
  ACL filtering happens at the source (each source knows its own permission model); `get()` returns `null` for not-found and throws for actual errors.
  `identifier` is the primary key (rename-stable UUID); a `getByUrl(@id)` convenience handles URL-only callers.
  The `filters: Record<string, unknown>` bag on `CatalogQuery` carries source-specific knobs; sources ignore keys they don't understand.
- __2026-05-20 — Vocabulary terms align with SKOS.__
  CatalogTerm gains SKOS-shaped optional fields: `altLabels` (synonyms) / `hiddenLabels` (typo + deprecated variants), `definition` / `scopeNote` / `historyNote` / `editorialNote` (annotations), `broader` / `narrower` / `related` (hierarchy and lateral relations), and typed cross-vocab matching `exactMatch` / `closeMatch` / `broadMatch` / `narrowMatch` / `relatedMatch` replacing the flat `uri` field (which stays as deprecated legacy and, when present, is treated as a single `exactMatch` entry).
  Existing ngdp-specific fields (`source`, `category`, `default`, `enabled`) stay — they're outside SKOS but useful internally.
  Vocabularies are emittable as SKOS `ConceptScheme` JSON-LD documents at a stable URL (e.g. `/api/catalog/vocabulary/<scheme-id>`), making them dereferenceable by federated linked-data consumers.
  Per-page `ngdp:category` JSON-LD render uses the term's `exactMatch[0]` as the `about: { @type: Thing, sameAs }` value when available.
  Z39.19 stays as design guidance for vocabulary maturity (level 1 list → 2 synonym ring → 3 taxonomy → 4 thesaurus); we sit at level 1 today and only climb when a real vocabulary needs it.
  OGC Vocabulary Service is parked as a future Provider opportunity for geoscience deployments (a `OGCCatalogProvider` that fetches OGC-published vocabularies and exposes them as SKOS-shaped CatalogTerms via the existing provider interface).
- __2026-05-20 — Structured-data emission is JSON-LD only, not HTML microdata.__ (Closes the #149 question.)
  ngdpbase emits `<script type="application/ld+json">` on every page view and asset detail page; we do NOT also embed `itemscope`/`itemtype`/`itemprop`/`itemid` HTML5 microdata attributes.
  Two formats are redundant — both express the same schema.org vocabulary — and JSON-LD is the preferred path per Google's structured-data docs.
  #149 (filed when microdata was the default choice) is superseded; its intent is delivered via Slice 6 of the schema-rollout plan.
  __Impact on #405:__ that EPIC's Phase 2 originally planned to add `itemscope`/`itemprop` microdata attributes to the asset picker template. That plan is superseded — Phase 2's structured-data goal lands via Slice 6's JSON-LD render instead.
- __2026-05-20 — `author` is the immutable original creator; `editor` is the mutable last-saver. (Aligned with `docs/GLOSSARY.md`; supersedes the earlier-this-day misread.)__
  Per the existing glossary: ngdp's "author" concept is the __immutable__ original creator of a page, stored as `page-creator` in frontmatter and `creator` in the page-index. Both storage names refer to the same concept. ACL Tier-0 private-page checks read this (and #711 was a bug where code read a different field by mistake — corrected by aligning on the page-index `creator` as the authoritative source).
  ngdp's "editor" concept is the __mutable__ user who last saved the page, stored as `lastModifiedBy` in frontmatter. Updated on every save.
  Schemas.md maps both to their schema.org-native names with no `ngdp:` prefix: schema field `author` = immutable original (sourced from page-index `creator` / frontmatter `page-creator` / EXIF Artist / PDF Author depending on type); schema field `editor` = mutable last-saver (sourced from frontmatter `lastModifiedBy` for pages; not populated for media/attachments today since they aren't edited through ngdp).
  `author` lives in the common base (every type has an authoritative original creator). `editor` is an `Article` extension today (page-specific; media/attachment items aren't edited through ngdp). If a real consumer for editor materializes on other types, promote to base then.
  JSON-LD render emits both when present. Closes the semantic drift #711 documented and replaces the earlier-this-day "creator is separate from author" decision (that decision was a misread; the glossary already had the canonical terminology).
- __2026-05-20 — `AssetRecord` (internal API) and `CreativeWork` (JSON-LD render shape) coexist; the render mapper converts.__ (Reconciles existing #405 Phase 1 work with the schemas.md design.)
  `AssetRecord` is the internal API type (already defined in `src/types/Asset.ts` per #405 Phase 1, commit `08010a4d` — already schema.org-aligned at the field-name level).
  Internal consumers (search index, picker UI, plugin renderers, CatalogManager fan-out) read `AssetRecord`.
  `CreativeWork` (and its subtypes `Article` / `ImageObject` / `VideoObject` / `AudioObject` / `DigitalDocument`) is the JSON-LD render output shape — a curated subset of `AssetRecord` fields plus schema.org `@context` / `@type` / `@id` keys.
  The render mapper at `src/utils/jsonld.ts` (or similar) converts `AssetRecord` → `CreativeWork` JSON-LD, applying the per-field render policy (map / omit / additionalProperty).
  This matches the Decision-5 ("two-shape problem solved with one mapper") pattern: internal type is ergonomic; external JSON-LD is compliant.
- __2026-05-20 — GPS coordinates are surfaced when the source file carries them; no opt-out at the platform layer.__
  If a media file has EXIF/QuickTime GPS tags, those coordinates appear in `contentLocation: { geo: { latitude, longitude } }` on the asset record and in the corresponding JSON-LD output.
  No per-user / per-image / per-page / system-wide toggle to suppress them.
  Rationale: ngdp publishes what's in the source. Stripping at the platform layer would add real complexity (UI toggle, default debate, per-asset state, audit) for a problem that's better solved upstream — if you don't want GPS coords leaked, strip them from the source file before it's scanned (exiftool or similar).
  The platform's job is to faithfully represent what's there; curating *what's there* is the operator's responsibility.
- __2026-05-20 — Framing: linked-data middle ground.__ (Closes Q8.)
  ngdpbase commits to being a __linked-data publisher__ of schema.org-shaped content — not a "just emit a `<script>` tag" cleanup, and not (yet) a federated semantic platform with SPARQL.
  __In scope (ratified by this and prior 2026-05-20 decisions):__
  - JSON-LD emission on every page view and asset detail page (Slice 6).
  - `@id` URLs are *real dereferenceable URLs* — a consumer can `GET` an `@id` and receive the CreativeWork record. Content-negotiation (`Accept: application/ld+json` returns JSON-LD; default returns HTML with embedded `<script>`) is part of Slice 6's scope.
  - SKOS `ConceptScheme` JSON-LD endpoint at `/api/catalog/vocabulary/<scheme-id>` actually exists and serves SKOS-shaped vocabulary documents (per the 2026-05-20 SKOS decision — this resolution ratifies that those endpoints *will be implemented*, not just designed).
  - `schemaVersion` markers on persisted index files (per the 2026-05-20 schemaVersion decision) make the published data graph self-describing for downstream re-indexers.
  __Out of scope (separate future epic if/when a real driver emerges):__
  - SPARQL endpoint or GraphQL-with-schema-org shape — no queryable structured-search surface beyond what Lunr/ES already expose.
  - Cross-instance federation (one ngdpbase deployment querying another's graph live).
  - OGC Vocabulary Service `Provider` implementation — stays parked per the SKOS decision.
  - Dereferenceable identifiers for *every* sub-entity (e.g. an individual `mentions` target, an `author` Person record) — Slice 6 dereferences the top-level CreativeWork; sub-entities can be `@id`-tagged but don't need their own routes yet.
  Rationale: the existing decisions (canonical-URL `@id`, SKOS-shaped vocabularies, JSON-LD-only emission) already lean toward this middle ground; making it explicit prevents Slice 6 from either underdelivering ("we emit a tag but the URLs are fake") or scope-creeping into a federation platform. Slice 6 grows by ~1 content-negotiation handler and the SKOS endpoint — bounded, shippable.
- __2026-05-20 — Embedded image/attachment metadata is linked, not duplicated.__ (Closes Q5.)
  When a page references an attachment via `[{Image src='…'}]`, `[{ATTACH src='…'}]`, or `[{Media src='…'}]`, the page's JSON-LD render emits schema.org-native pointers — `associatedMedia: [{ "@id": "/media/file/<id>" }]` for general attachments and `image: { "@id": "…" }` for primary-image cases — referencing the attachment's own `CreativeWork` record. The page record itself stays page-text-only; image keywords / GPS / EXIF do __not__ bleed into the page's search-index entry.
  Rationale: keeps the data model simple and reuses what already exists. `AttachmentManager.syncPageMentions()` (`src/managers/AttachmentManager.ts:639`) already maintains the reverse-direction `mentions[]` array on each attachment on every page save, and `getAttachmentsForPage()` (line 418) reads the forward direction by computing from the page body at query time. Render-time `resolveAttachmentSrc()` (lines 549–596) handles missing-attachment cases for the HTML side; JSON-LD follows the same path — if the target is gone, the link 404s, exactly like a normal `<img src>` to a deleted file. No new persistence and no cascade-refresh subsystem needed.
  __Parked (revisit on operator pain):__ the (C) "hybrid" alternative — copying a narrow allowlist (`keywords`, `contentLocation`) from each referenced attachment into the embedding page's search-only document, so a search for "lava" surfaces both the image and the trip-report page — would buy real search-UX value but requires new hooks for "image keywords changed" and "image deleted" to re-index every page in `mentions[]`. That cascade-refresh subsystem doesn't exist today and isn't worth building speculatively. Reopen if/when an operator reports "I searched X, the image came back, but the page that uses it didn't." Markdown `![alt](src)` images are also currently outside the extraction regex — same revisit trigger.
- __2026-05-20 — `dateModified` is always the latest revision's timestamp; revisions are snapshots of one CreativeWork.__
  The page itself is the CreativeWork (the schema.org node); individual revisions are *snapshots* of that same node, not separate CreativeWorks.
  So `dateModified` is "when the page was last edited" regardless of which revision is currently being viewed.
  Matches schema.org's intent (`dateModified` = "the date on which the CreativeWork was most recently modified") and matches operator expectation across every other versioned-content platform (Wikipedia, GitHub blob view, Confluence).
  __Note for revision-specific views:__ if a future consumer needs "when was *this specific revision* created" (e.g. on `/view/Foo?revision=42`), that's a separate field — call it `ngdp:revisionDate` or use schema.org's `datePublished` *on a revision sub-object* if we ever surface revision as its own node. Not in scope today.
- __2026-05-24 — JSON-LD `@type` per category is config-driven via a sibling `ngdpbase.schema-types` block.__ (Per [#791](https://github.com/jwilleke/ngdpbase/issues/791), sub-issue of [EPIC #790](https://github.com/jwilleke/ngdpbase/issues/790).)
  `pageToArticle` selects `@type` by looking up the page's `system-category` in a new top-level config block `ngdpbase.schema-types` (operator-controllable per deployment via `app-custom-config.json`). Fallback when no entry: `Article` — matches today's hardcoded behavior. Shipped sparse defaults: `documentation → TechArticle`, `developer → TechArticle`, `journal → BlogPosting` (no-op until `journal` becomes a registered system-category per EPIC #790).
  __Sibling block, not a nested field.__ `ngdpbase.schema-types` is its own top-level key, NOT a `schema-type` field on each `ngdpbase.system-category` entry. Rationale: `system-category` already carries seven concerns (storage routing, ACL, search filtering, search relevance boosting, page-badge rendering, required-pages dir routing, default-category fallback); JSON-LD `@type` is a *semantic* concern (what kind of thing is this?) distinct from those *deployment* concerns (where/how is it persisted and shown?). Keeping each concern in its own config surface stops the drift and composes cleanly with future "what is this for X subsystem?" config (Open Graph, RSS, sitemap priority).
  __Article subtypes only in shipped defaults.__ Every ngdp page carries Article-shaped fields (`articleBody`, `editor`, `mentions`, `version`, `slug`); refining to schema.org Article subtypes (`BlogPosting`, `TechArticle`, `NewsArticle`, `ScholarlyArticle`, `MedicalScholarlyArticle`, `Report`, `SatiricalArticle`, `APIReference`, `SocialMediaPosting`, `DiscussionForumPosting`, `AdvertiserContentArticle`) is field-compatible. Refining to WebPage subtypes (`AboutPage`, `ProfilePage`, `ContactPage`, `FAQPage`, `ItemPage`) would break that field-shape match (WebPage subtypes don't carry `articleBody`/`editor`). The lookup itself is __permissive__ — operators can configure any schema.org type string per deployment if they want — but shipped defaults stay on the Article branch.
  __`user-profile` deferred.__ Proper schema.org modeling for a profile page is a multi-node `@graph` (`ProfilePage` wrapper + `Person` as `mainEntity` + `BlogPosting`/`Article` as content), where the `Person` is extracted from the User record (`User.profilePage` field at `src/types/User.ts:127` points to a wiki page name). Different render path, different driver — keyed off the User→Page pointer, not the page's `system-category`. Deferred to a separate sub-issue; `user-profile` pages keep rendering as plain `Article` (today's behavior) until then.
  __`DigitalDocument` unaffected.__ Pages render as Article subtypes (or fall through to `Article`); PDFs/docx still render as `DigitalDocument` via their own AttachmentManager render path. The two type families remain separate per their separate storage pipelines.

## Framing

The first thing to nail down — because it changes every other decision:

> __This document is about what ngdp uses, not what is in the origin file.__
>
> — operator, 2026-05-20

EXIF has ~400 tags. PDF metadata has Title/Author/Subject/Keywords/Producer/Creator/CreationDate/ModDate/Trapped and a dozen XMP extensions. docx core.xml has ~15 properties. We are not going to mirror any of that surface area. We pull a field from the source __only when ngdp has a named consumer for it__ — a search index, a picker tile, a page header, JSON-LD output, a filter facet, an admin display.

The schema is __derived from ngdp's needs__, then we __map sources into it__ (lossy-by-design — anything we don't need stays in the raw source file and doesn't enter the index).

## Field-name policy: schema.org first

A second framing rule that fell out of the discussion:

> __Match the Field name to schema.org wherever possible.__

Concretely:

- __Field names match schema.org casing exactly__ — `dateCreated`, not `date_created` or `dateCaptured`.
- __JSON-LD identifiers use the JSON-LD spec__: `@id`, `@type`, `@context`.
- __When schema.org has the concept but a different shape__ (e.g. `exifData` is a `Property` array, not a nested object), we mark it `⚠️` in the tables and convert at JSON-LD render time — internal storage can stay in whatever shape is convenient.
- __When schema.org has no match__, we use an `ngdp:` prefix (`ngdp:category`, `ngdp:videoCodec`) or move the field into `additionalProperty` (schema.org's bag-of-properties slot for things outside its vocabulary).

This means the field names we type in code are the same field names a downstream JSON-LD consumer sees — no translation step, no two-vocabulary problem.

Tables below mark each row with a schema.org column:

- ✅ exact name + exact shape match
- ⚠️ schema.org has the concept but a different shape (conversion at render time)
- ✗ ngdp custom (use `ngdp:` prefix or `additionalProperty`)

## ngdp's metadata-consuming surfaces

Where, today and planned, does ngdp actually use metadata? Each row here is a justification slot for a field to exist in the schema.

| Surface | What it reads |
|---|---|
| Search index (Lunr default; ES addon) | `name`, `description`, `keywords`, `articleBody`, `author`, `dateCreated`, `dateModified` |
| Asset picker tiles | `name`, `dateCreated`, `thumbnailUrl`, type-specific summary (image dimensions, video duration, page snippet) |
| Asset picker filters | `dateCreated` range, `keywords`, `author`, type, mime category |
| Page header / breadcrumbs | `name`, `dateModified`, `author`, `keywords`, page category |
| Page footer "metadata" block | `dateCreated`, `dateModified`, `author`, page UUID, contributors |
| ATTACH / Image / Media plugins (render-time) | `name`, `description` (alt-text), `width`/`height` (image), `duration` (AV) |
| JSON-LD `<script>` embed (planned, big SEO/LLM win) | the whole CreativeWork subtype |
| `$VARIABLE` plugin substitutions (`[{$dateModified}]` etc.) | top-level fields by name |
| Admin / contributor views | `author`, `dateCreated`, `dateModified`, permissions, page revision history |

Anything that doesn't feed at least one of these doesn't go in the schema. New surfaces add fields when they need them.

## The common base (CreativeWork-ish)

These fields apply to every asset type because every consumer above reads them.

| Field | schema.org | Type | Req? | Notes |
|---|---|---|---|---|
| `@id` | ✅ JSON-LD `@id` | IRI (string) | yes | __Canonical URL__ (Decision γ, 2026-05-20). Pages: `/view/<slug>`. Media: `/media/file/<id>`. Dereferenceable — a consumer can `GET` it and retrieve the resource. __Not the same as the page's UUID__ — the rename-stable internal UUID is the separate `identifier` field below. `@id` changes when slug changes; `identifier` never does |
| `identifier` | ✅ `identifier` | string | yes for pages; optional otherwise | Opaque rename-stable internal ID. For pages this is the frontmatter `uuid`. For media this is the sha256-derived item id (same value as appears in the `@id` URL fragment). schema.org's blessed slot for "internal ID" — preferred over a custom `ngdp:uuid` |
| `@type` | ✅ JSON-LD `@type` | `Article` (+ subtypes, see [Per-category JSON-LD `@type`](#per-category-json-ld-type-config-driven)) \| `ImageObject` \| `VideoObject` \| `AudioObject` \| `DigitalDocument` | yes | Drives which extensions apply. Article subtype is operator-configurable per `system-category` (per 2026-05-24 decision) |
| `name` | ✅ `name` | string | yes | Display title |
| `description` | ✅ `description` | string | optional | Caption / abstract / image alt-text |
| `dateCreated` | ✅ `dateCreated` | ISO 8601 | optional | When the original was authored / captured |
| `dateModified` | ✅ `dateModified` | ISO 8601 | optional | Last edit / file mtime. __Always the latest revision__ even when viewing an older one (Decision 2026-05-20). The page is the CreativeWork; revisions are snapshots |
| `author` | ✅ `author` | string \| Person | optional | schema.org accepts a string OR a Person object; we accept both. __Immutable original creator__ (per `docs/GLOSSARY.md`). For pages: sourced from page-index `creator` / frontmatter `page-creator` — set once at first save, never changes thereafter. For media: EXIF Artist / IPTC By-line. For PDFs/docx: doc Author tag. Distinct from `editor` (mutable last-saver, Article extension) |
| `keywords` | ✅ `keywords` | string[] | optional | schema.org allows string or string[]; we use string[] |
| `url` | ✅ `url` | string | yes | Canonical landing URL within ngdp |
| `contentUrl` | ✅ `contentUrl` | string | optional | Binary URL for media assets (distinct from the landing `url`) |
| `thumbnailUrl` | ✅ `thumbnailUrl` | string | optional | When the type has a visual representation |
| `encodingFormat` | ✅ `encodingFormat` | string | optional | MIME type |

Deliberately omitted at the base, with rationale:

- __`numberOfPages`__ — print-era artifact; depends on printer settings, not on the content. Rejected per operator.
- __`wordCount`__ — trivially derived from `articleBody`. Computed on demand if needed, not stored.
- __`isAccessibleForFree`__ — almost always true here; not worth a column per asset.
- __`inLanguage` at base__ — single-language assumption is fine today; punt to `Article` and `DigitalDocument` extensions where it has source mapping.
- __`identifier`__ — schema.org's free-form id; `@id` already covers our need.

## Per-type extensions

Type-specific fields are added only when (a) a named ngdp consumer above needs them and (b) the meaning survives the type boundary.

### Per-category JSON-LD `@type` (config-driven)

How a page's `@type` is selected at render time. Per the [2026-05-24 ratified decision](#ratified-decisions).

Schema.org type-tree relevant to ngdp pages:

```text
Thing → CreativeWork
         ├── Article ────► BlogPosting, TechArticle, NewsArticle,
         │                  ScholarlyArticle, MedicalScholarlyArticle,
         │                  Report, SatiricalArticle, APIReference,
         │                  SocialMediaPosting, DiscussionForumPosting,
         │                  AdvertiserContentArticle
         └── WebPage ────► AboutPage, ProfilePage, ContactPage,
                            FAQPage, ItemPage
```

ngdp pages map to __Article subtypes__ (field-compatible — every page carries `articleBody` / `editor` / `mentions` / `version` / `slug`). WebPage subtypes have a different field shape and aren't shipped as defaults, though the lookup is permissive (operators can configure them per deployment).

__Config block__ in `config/app-default-config.json`:

```json
"ngdpbase.schema-types": {
  "documentation": "TechArticle",
  "developer":     "TechArticle",
  "journal":       "BlogPosting"
}
```

__Lookup__: `pageToArticle` reads the page's `system-category` and looks it up in `ngdpbase.schema-types`. Fallback when no entry (or unknown category): `Article`. Operators override per deployment via `app-custom-config.json` — same precedence as every other config key.

__Sparse by design.__ Only categories that diverge from the `Article` default appear in the block. `general`, `system`, `addon`, `user-profile`, and unknown categories all fall through to `Article` — same JSON-LD as today's hardcoded behavior, no migration needed.

__Available Article subtypes__ (operators can pick any for their categories; non-Article types work too but field-shape match isn't guaranteed):

| If a category looks like… | Article subtype | schema.org link |
|---|---|---|
| Tutorials, manuals, code walkthroughs | `TechArticle` | <https://schema.org/TechArticle> |
| API endpoint documentation | `APIReference` (TechArticle subtype) | <https://schema.org/APIReference> |
| News / time-sensitive posts | `NewsArticle` | <https://schema.org/NewsArticle> |
| Personal blog / journal entries | `BlogPosting` | <https://schema.org/BlogPosting> |
| Peer-reviewed / research papers | `ScholarlyArticle` | <https://schema.org/ScholarlyArticle> |
| Medical / clinical research | `MedicalScholarlyArticle` | <https://schema.org/MedicalScholarlyArticle> |
| Compliance / policy / whitepapers | `Report` | <https://schema.org/Report> |
| Satire / parody | `SatiricalArticle` | <https://schema.org/SatiricalArticle> |
| Generic page (default) | `Article` | <https://schema.org/Article> |

__Why a sibling block, not a `schema-type` field on `ngdpbase.system-category` entries?__

`ngdpbase.system-category` already carries seven concerns (storage routing, ACL, search filtering, search relevance boosting, page-badge, required-pages dir routing, default-category fallback). JSON-LD `@type` is a *semantic* concern distinct from those *deployment* concerns. A sibling block keeps each concern in its own config surface and composes cleanly with future per-subsystem-type config (Open Graph, RSS, sitemap priority).

__Why is `user-profile` not in the shipped defaults?__

Proper schema.org modeling for a profile page is a multi-node `@graph`: `ProfilePage` (page wrapper) + `Person` (`mainEntity` — the human the profile is about) + `BlogPosting` or `Article` (the body content). The `Person` data lives on the User record (`User.profilePage` pointer at `src/types/User.ts:127`), not on the page itself. That render path is a separate sub-issue keyed off the User→Page pointer, not the page's `system-category`. Until that lands, `user-profile` pages render as plain `Article` — same as today.

__`DigitalDocument` is not affected.__ Per [#791](https://github.com/jwilleke/ngdpbase/issues/791): pages always render as Article (or an Article subtype); PDFs/docx attachments still render as `DigitalDocument` via AttachmentManager's own render path. The two type families stay separate per their separate storage pipelines.

### `Article` (pages)

| Field | schema.org | Source | Consumer |
|---|---|---|---|
| `articleBody` | ✅ `articleBody` | Markdown body | Search index |
| `mentions` | ✅ `mentions` | Wiki-link extraction | Backlinks; related-pages panel |
| `version` | ✅ `version` | Page provider | Admin / revision history |
| `inLanguage` | ✅ `inLanguage` | Frontmatter or default | Future multi-language |
| `editor` | ✅ `editor` | Frontmatter `lastModifiedBy` | __Mutable__ — the user who most recently saved the page. Updated on every save, unlike `author` (immutable, in base). Per `docs/GLOSSARY.md`. Paired with `dateModified` (latest revision's timestamp + user) |
| `ngdp:category` | ✗ custom — JSON-LD: __map to `about` / `genre`__ | Frontmatter `category` | Page list filters; picker source=Pages |
| `ngdp:slug` | ✗ custom — JSON-LD: __omit__ (redundant with `@id`) | Frontmatter `slug` | URL fragment; stable short reference for `[Page Name]` link resolution. __Decision (2026-05-20): kept on `Article` only, not promoted to base — only pages author slugs today.__ |

Pages do __not__ get `duration`, `width`, `height`, `exifData`, `bitrate`, `contentLocation`, `contentUrl`.

`dateCreated` for pages depends on __#754__ (page-model created timestamp). Until that lands, omit `dateCreated` for pages rather than fake it from mtime.

### `ImageObject`

| Field | schema.org | Source | Consumer |
|---|---|---|---|
| `width` | ✅ `width` | EXIF ImageWidth | Picker tile sizing; render hint |
| `height` | ✅ `height` | EXIF ImageHeight | Picker tile sizing; render hint |
| `contentLocation` | ✅ `contentLocation` (Place with `geo` GeoCoordinates) | EXIF GPS | Map view (future); location facet |
| `exifData` | ⚠️ schema.org has it as a `Property` array; we store structured camera object internally and convert at render | EXIF camera/lens subset | Image detail page |
| `ngdp:orientation` | ✗ custom — JSON-LD: __omit__ (internal render hint) | EXIF Orientation | Thumbnail render-rotation hint |

### `VideoObject`

| Field | schema.org | Source | Consumer |
|---|---|---|---|
| `width` | ✅ `width` | ExifTool frame width | Picker tile sizing |
| `height` | ✅ `height` | ExifTool frame height | Picker tile sizing |
| `duration` | ✅ `duration` (ISO 8601 `PT1M30S`) | ExifTool MediaDuration / Duration | Picker tile badge ("1:30"); media player UI |
| `bitrate` | ✅ `bitrate` | ExifTool AvgBitrate | Admin / debug |
| `contentLocation` | ✅ `contentLocation` | ExifTool GPS (modern phones) | Same as images |
| `ngdp:videoCodec` | ✗ custom — JSON-LD: __omit__ (internal compatibility detail) | ExifTool VideoCodec | Compatibility hint; future transcoding decisions |
| `ngdp:audioCodec` | ✗ custom — JSON-LD: __omit__ (internal compatibility detail) | ExifTool AudioFormat | Same |

`frameRate` could be added if a consumer materializes — none today, so park it.

### `AudioObject`

| Field | schema.org | Source | Consumer |
|---|---|---|---|
| `duration` | ✅ `duration` | ExifTool Duration | Picker tile / player |
| `bitrate` | ✅ `bitrate` | ExifTool AvgBitrate | Admin / debug |
| `ngdp:audioCodec` | ✗ custom — JSON-LD: __omit__ (internal compatibility detail) | ExifTool AudioFormat | Compatibility |

### `DigitalDocument` (PDF, docx, generic attachments)

| Field | schema.org | Source | Consumer |
|---|---|---|---|
| `articleBody` | ✅ `articleBody` (inherited from CreativeWork) | PDF text extraction / docx body | Search index — the whole point of attachments being findable |
| `inLanguage` | ✅ `inLanguage` | docx `core.language` when present | Future |

PDFs do __not__ get `numberOfPages` (rejected at the base). They do get `dateCreated`/`dateModified` from the doc metadata, like everything else.

## Per-source mapping

How each source's native vocabulary maps into the schema above. Anything not listed here is __not pulled into the schema__ — it stays in the raw file.

### Page frontmatter → `Article`

| Frontmatter | Schema field |
|---|---|
| `title` | `name` |
| `description` | `description` |
| `uuid` | `identifier` (Decision γ — schema.org's blessed slot, distinct from `@id`) |
| `page-creator` (frontmatter) / `creator` (page-index) | `author` — immutable original (per `docs/GLOSSARY.md`) |
| `lastModifiedBy` (frontmatter) | `editor` — mutable last-saver (per `docs/GLOSSARY.md`) |
| `lastModified` | `dateModified` |
| `slug` | informs `url` |
| `category` | `ngdp:category` |
| `user-keywords` + `system-keywords` | `keywords` (merged, deduplicated) |
| Markdown body | `articleBody` |
| Wiki links (`[Page Name]`) | `mentions` |

### Media files → `ImageObject` / `VideoObject` / `AudioObject`

| ExifTool tag | Schema field | Note |
|---|---|---|
| `DateTimeOriginal` / `CreateDate` / `MediaCreateDate` / `CreationDate` | `dateCreated` | The #750 fallback chain |
| `ModifyDate` or file mtime | `dateModified` | Mtime if the tag is absent |
| `Artist` / `Creator` / `By-line` | `author` | First match wins |
| `Title` | `name` | Falls back to filename if absent |
| `ImageDescription` / `Description` / `Caption-Abstract` | `description` | First match wins |
| `Keywords` (EXIF/IPTC) | `keywords` | Array; deduplicated |
| `ImageWidth` / `ImageHeight` | `width` / `height` | |
| `GPSLatitude` / `GPSLongitude` | `contentLocation.geo` | Only when both present |
| `Make` / `Model` / `LensModel` / `FocalLength` / `FNumber` / `ExposureTime` / `ISO` | `exifData` (Property array at render time) | Images only; videos populate make/model only |
| `MediaDuration` / `Duration` | `duration` | AV only; format as ISO 8601 (`PT1M30S`) |
| `AvgBitrate` | `bitrate` | AV only |
| `VideoCodec` / `AudioFormat` | `ngdp:videoCodec` / `ngdp:audioCodec` | AV only |
| `Orientation` | `ngdp:orientation` | Images only |

Everything else ExifTool extracts (color profiles, white balance, metering mode, software version, ...) __stays in the raw file__ and does not enter the index.

### PDF / docx → `DigitalDocument`

| PDF / docx | Schema field |
|---|---|
| `Title` / `dc:title` | `name` |
| `Author` / `dc:creator` | `author` |
| `Subject` / `dc:description` | `description` |
| `Keywords` / `dc:subject` | `keywords` |
| `CreationDate` / `dcterms:created` | `dateCreated` |
| `ModDate` / `dcterms:modified` | `dateModified` |
| `dc:language` / `core.language` | `inLanguage` |
| Extracted text body | `articleBody` |

Producer, Trapped, font lists, embedded thumbnails, etc. → __stay in the raw file__.

## CatalogManager's role

Per the 2026-05-20 Manager-layer unification decision, CatalogManager hosts __two parallel registries__, one already existing and one new:

- __Vocabulary providers (existing, #424)__ — `registerProvider(CatalogProvider)` for controlled-vocabulary contributions. Today contains a `DefaultCatalogProvider` (reads the 13 default `ngdpbase.system-keywords` from config) and an `AICatalogProvider` stub (Phase 4 hook for LLM-driven term suggestion).
- __Asset sources (new)__ — `registerSource(CatalogSource)` for Manager-level CreativeWork producers. PageManager / MediaManager / AttachmentManager each implement `CatalogSource` and register themselves during their own `initialize()`, after CatalogManager is already up (the engine bootstraps CatalogManager right after ConfigurationManager so all later Managers can find it).

Same Manager, two registries that don't interact with each other beyond living together. CatalogManager fans out queries to asset sources (`getCreativeWork`, `listCreativeWorks`, `checkSchemaVersions`) the same way it fans out vocabulary calls (`getTerms`, `resolveUri`, `suggestTerms`). Providers (the storage layer) stay diverse and pluggable per-deployment underneath their owning Manager — that layer is unaffected.

The __JSON-LD render__ lives in a small renderer (`src/utils/jsonld.ts` or similar) that consumes the CreativeWork shape produced by CatalogManager and serializes it as `@context: https://schema.org` JSON-LD, applying the per-field render policy (Decision 5). CatalogManager produces; the renderer serializes.

__Historical-context note:__ there used to be a `SchemaManager` in ngdpbase that owned a heterogeneous set of CRUD responsibilities (notably organization records).
It was decomposed in __#617__ — record-ownership moved to specialized Managers (e.g. `OrganizationManager`), and the residual coordination role had no single successor.
The 2026-05-20 design chooses CatalogManager as that successor for *asset-schema coordination* specifically — it's already a coordinator (vocabulary fan-out), so adding asset-source fan-out is a natural extension rather than reviving the over-broad SchemaManager pattern.
Record-ownership stays with the domain Managers; CatalogManager only normalizes and routes.
(See also #624, the bug that uncovered the residual phantom-SchemaManager references after #617 — corrected by routing through `OrganizationManager`.)

## schema.org alignment notes

The shipped output (asset records, JSON-LD blocks) should validate against the schema.org JSON-LD vocabulary. We use a curated subset:

- __`@type` is always set__ so consumers (Google, LLM ingestion, browser extensions) recognize the subtype.
- __`@context: "https://schema.org"`__ when we emit JSON-LD.
- __Field names match schema.org casing exactly__ (camelCase, lowercase-leading: `dateCreated`, `thumbnailUrl`).
- __Custom fields__ (anything outside schema.org) use the `ngdp:` prefix or move into `additionalProperty`. For `additionalProperty`, the rendered shape is `{ "@type": "PropertyValue", "name": "ngdp:orientation", "value": 1 }`.
- __Date fields are ISO 8601 strings__ — `2024-06-15T14:30:45Z` for instants, `PT1M30S` for durations.

## Slice plan (proposed)

Once direction is set, work breaks into shippable slices:

| Slice | Output | Visible value |
|---|---|---|
| __0. This doc → ratified__ | This file, edited and committed | Anchor exists; nothing else can move without it |
| __1. CatalogManager audit__ | `docs/managers/CatalogManager.md` + a recommendation paragraph | Clarity on the name + minimum API |
| __2. `src/types/Schema.ts`__ | TypeScript types for `CreativeWork` + subtypes + per-source mappers' signatures | Type-safety for slices 3–6 |
| __3. Media-source mapper + asset response__ | `FileSystemMediaProvider` emits via the new schema; `toAssetRecord` re-derived from it; video tiles now show `duration` | Videos in the picker get useful info |
| __4. Page-frontmatter mapper__ | PageManager produces an `Article` shape; search index consumes it; `dateModified` etc. exposed uniformly | Cross-type search uniformity; sets up `dateField=created` once #754 lands |
| __5. PDF/docx mapper__ | Attachment provider extracts schema-shaped metadata for PDFs and docx; search finds attachment author / title | Attachments become findable beyond filename |
| __6. JSON-LD render__ | Page render emits `<script type="application/ld+json">` with the appropriate CreativeWork subtype | SEO + LLM ingestion win, mostly free at this point |

Each slice is independently shippable and reverts to the previous behavior if held.

## Open questions to brainstorm together

These don't have an answer yet — they're the points we should regroup on after this doc settles.

1. ~~`additionalProperty` vs `ngdp:` namespace.~~ __Resolved 2026-05-20: Option C + per-field filter.__ Captured in the Ratified decisions section.
2. ~~`@id` shape — α / β / γ.~~ __Resolved 2026-05-20: Option γ.__ Captured in the Ratified decisions section.
3. ~~How do search providers re-index when the schema evolves?~~ __Resolved 2026-05-20: per-file `schemaVersion` field + compare-on-startup + non-blocking warning.__ Captured in the Ratified decisions section.
4. ~~Do attachment-vs-media-vs-page stay as separate AssetProvider concrete types, or do they unify behind a common interface that CatalogManager fans out to?~~ __Resolved 2026-05-20: both — Providers stay diverse per-deployment; Managers unify behind `CatalogSource` and CatalogManager fans out to them.__ Captured in the Ratified decisions section (2026-05-20 Manager-layer unification entry).
5. ~~Embedded image metadata in pages — when a page has an image in its frontmatter or body, do we duplicate-index the image's metadata under the page, or just link?~~ __Resolved 2026-05-20: link only.__ JSON-LD emits `associatedMedia` / `image` referencing the attachment's `@id`; the page record itself stays page-text-only. Captured in the Ratified decisions section.
6. ~~GPS privacy — opt-out at the platform layer?~~ __Resolved 2026-05-20: no opt-out. If the source has it, we surface it; curating what's in the source is the operator's responsibility.__ Captured in the Ratified decisions section.
7. ~~Versioning — `dateModified` on versioned pages.~~ __Resolved 2026-05-20: always latest.__ Captured in the Ratified decisions section.
8. ~~Big honest one: does this make ngdpbase a federated semantic platform (schema.org/JSON-LD wiki content + queryable structured search), or are we just cleaning up the asset metadata blob? The slice plan covers either, but the framing affects how big slice 6 (JSON-LD) gets.~~ __Resolved 2026-05-20: linked-data middle ground.__ `@id` URLs are real and dereferenceable; SKOS `ConceptScheme` endpoints actually exist; we stop short of SPARQL / federated query / cross-instance federation. Captured in the Ratified decisions section.

## Next step

Regroup on the framing + the open questions, then ratify or revise this doc. Once the doc is ratified, file the EPIC and start with Slice 1 (CatalogManager audit) or Slice 2 (`src/types/Schema.ts`) per priority.
