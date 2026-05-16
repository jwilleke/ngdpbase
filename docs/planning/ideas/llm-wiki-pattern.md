# LLM-Wiki Pattern for ngdpbase

Working brainstorm — *not yet a build commitment.* The platform already has most of the substrate; this captures the proposed conventions and small composition layer that would tie the existing managers into a coherent knowledge-graph pattern. Useful for users who want LLM-maintained knowledge bases on top of ngdpbase, but the structural pieces improve the platform for everyone.

**Status:** ideas / planning. No tracked issues yet. Specific build slices can be lifted out into `[FEATURE]` / `[EPIC]` issues once a decision is made.

**Origin:** Andrej Karpathy's [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) plus a brainstorm session 2026-05-12 mapping the pattern onto ngdpbase's existing managers and plugins.

---

## Why this is worth thinking about

ngdpbase has 36 managers and dozens of plugins. The platform's pitch has been "self-hostable wiki engine with extensible addons" — a feature list rather than a story. The long-standing operator goal has been to *tie the parts together* so users can navigate "how does this data relate to that data" at scale.

Karpathy's LLM-wiki pattern gives the platform an organizing concept that ties existing parts together without inventing new ones. More importantly, the **structural pieces underneath the pattern are good wiki engineering regardless of whether an LLM is ever in the loop** — cleaner classification, typed references between pages, lint surfaces over the existing data. Those structural pieces would compound for users who never touch an LLM.

The LLM-driven workflow on top (ingest, lint with contradiction detection, automated cross-reference maintenance) is more speculative. It's a bet on a use case where validation is thin — Karpathy uses it personally; it isn't proven for teams or institutions. The plan below stages the foundational structural work first and leaves the LLM-specific composition for "build when a real user asks."

---

## The pattern at a glance

Karpathy describes three layers of content and three operations on them.

**Three content layers:**

- **Sources** — immutable raw material (papers, articles, transcripts, screenshots). Never edited.
- **Citations** — interpretive claims about source material. Each cites one or more sources.
- **Concepts** — synthesized knowledge that draws on multiple citations.

**Three operations:**

- **Ingest** — a new source is added; the system fans content out into 10-15 affected pages (the source page itself, related citations, concept pages that need updating, the index, the activity log).
- **Query** — the user asks a question against the compiled wiki; the system synthesizes an answer with citations and can file the answer back as a new page so the wiki compounds.
- **Lint** — periodic audits flag orphan pages, missing entity pages, contradictions, stale claims.

The human curates sources and asks questions. The LLM (or, less efficiently, a disciplined human) handles the bookkeeping — cross-references, multi-page updates, audits.

---

## What ngdpbase already has

The platform substrate matches the pattern more than was obvious before this analysis. Managers and features that already line up:

| Karpathy element | ngdpbase implementation |
|---|---|
| Page substrate | `PageManager` + `VersioningFileProvider` |
| Wiki-links | `[Page Name]` syntax via `RenderingManager` |
| Backlinks | `[{ReferringPagesPlugin}]` |
| Multi-valued topics | `user-keywords` frontmatter array |
| Discipline tagging (flat) | `system-keywords` config + frontmatter |
| Footnotes | `FootnoteManager` + `[{FootnotesPlugin}]` |
| Audit trail | `AuditManager` + per-page version history |
| Async job execution | `BackgroundJobManager` (for long-running ingest) |
| Schema enforcement | `SchemaManager` (JSON Schema validation) |
| Controlled vocabulary | `CatalogManager` with pluggable providers (#424) — already scaffolded for an `AICatalogProvider` |
| External content import | `ImportManager` with extensible converter registry |
| Search | `SearchManager` (Lunr + Elasticsearch addon) |
| LLM-friendly API surface | `/api/assets/search`, page CRUD via REST — already structured |

The platform was already being built in this direction. The Karpathy pattern is consistent with where it was heading; this isn't bolting on something foreign.

## What's partially there

The substrate exists, but the composition on top is missing.

| Capability | What exists | What's still needed |
|---|---|---|
| Curated index | `[{IndexPlugin}]` (alphabetical) | A curated-by-human-or-LLM topic-index format that's distinct from alphabetical listing |
| Topic-scoped audit log | `AuditManager` logs everything | A filtered view scoped to a topic-keyword |
| Inline citation with provenance | Footnotes work as free text | A typed footnote that hard-links to a source page or attachment |
| Ingest pipeline | `ImportManager` + `BackgroundJobManager` | An LLM-driven converter, analogous to JSPWiki / MediaWiki converters, that emits a structured multi-page plan from a raw source |
| Discipline taxonomy | `CatalogManager` + flat `system-keywords` | Prerequisite relationships between disciplines (Biology presupposes Chemistry) |
| Atomic multi-page write | `VersioningFileProvider` versions per page | A transaction API: "write these N pages or fail all" so an interrupted ingest doesn't leave the wiki half-updated |
| AI-suggestion hooks | `AICatalogProvider` scaffolded only | The same scaffolding pattern extended to citation-suggestion, contradiction-detection, lint |
| Page-role distinction | `system-category` (6 values today) | A separate `knowledge-role` axis distinguishing `source` / `citation` / `concept` |

## What's fully missing

These pieces aren't anywhere in the platform yet:

- **Source / citation / concept** as a first-class role axis on pages
- **Discipline prerequisite graph** in `CatalogManager`
- **Deterministic lint surfaces** — orphan pages, stale claims, missing entity pages — all are pure graph or text operations over data the platform already has, but no plugin or admin view renders them
- **Contradiction-detection lint** — LLM-required; no admin surface or API hook exists
- **Curated topic index page format** — the convention for hand-curated topic indexes
- **LLM-friendly ingest contract** — the structured plan an LLM hands to `ImportManager`
- **Source ↔ citation hard-links** — footnotes today are free text; nothing enforces a link to a real source page

---

## Vocabulary — Karpathy ↔ ngdpbase

The platform already has canonical terms for most of what Karpathy describes. Use the ngdpbase term where one exists; introduce new terms only where there's a real gap. The "no wiki word" convention from `#364` applies — say "pages" and "page link," not "wiki pages" or "wiki-links."

| Karpathy term | ngdpbase canonical term | Implementation |
|---|---|---|
| `raw/` immutable sources | **sources** *(new page role)* | New `knowledge-role` frontmatter value |
| `wiki/` derived content | **pages** | `PageManager` + `VersioningFileProvider` |
| `[[wiki-link]]` | **page link** `[Page Name]` | Existing renderer syntax |
| backlinks | (same) | `[{ReferringPagesPlugin}]` |
| `index.md` curated TOC | **curated index page** | New page-format convention (distinct from `[{IndexPlugin}]` which is alphabetical) |
| `log.md` append-only audit | **audit log** | `AuditManager` (system-wide; topic-scoped view is the gap) |
| schema (CLAUDE.md) | **`CatalogManager` rules + page Schema** | `CatalogManager` + `SchemaManager` |
| ingest | **import** | `ImportManager` extensible converter registry |
| query | **search** | `SearchManager` |
| lint | **wiki health audit** | Plugin / admin surface (not yet built) |
| citation (factual claim → source) | **footnote** | `FootnoteManager` + `[{FootnotesPlugin}]` |
| concept | **concept** *(new page role)* | New `knowledge-role` frontmatter value |
| topic | **user-keyword** | Existing multi-valued frontmatter |
| discipline | **system-keyword** | Existing flat list; structured taxonomy with prerequisites is the proposed upgrade |
| role | **knowledge-role** *(new optional frontmatter field)* | Distinct from `system-category` (page-type); opt-in for pages participating in the knowledge graph |

---

## Classification model — four axes

Pages on ngdpbase are classified along **four** independent axes. This is a refinement of earlier brainstorm versions — the page-type and knowledge-graph-role aren't the same thing and shouldn't share a field.

| Axis | Field | Cardinality | Meaning | Who curates |
|---|---|---|---|---|
| **Page-type** | `system-category` *(existing)* | exactly one | What KIND of platform page — system / documentation / addon / user-profile / general / developer | Operator |
| **Knowledge-role** | `knowledge-role` *(new, optional)* | zero-or-one | Position in the knowledge graph — source / citation / concept | LLM enforces; user opts in |
| **Topic** | `user-keywords` *(existing)* | zero-or-more | What the page is ABOUT — free-form tags | Human (page author) |
| **Discipline** | `system-keywords` *(existing)* | one-or-more | What FIELD the page lives in — operator-curated taxonomy | Operator |

**Knowledge-role is opt-in.** Most pages will have no role and stay outside the knowledge graph. That keeps the platform useful for the casual use cases — recipes, team SOPs, profile pages — that don't belong to any structured knowledge body. Only pages that opt into the source/citation/concept model carry a role.

The actor-mapping in the rightmost column matters. It tells you which fields stay editable in the UI, which are config-only, and which an LLM is allowed to rewrite without human review.

---

## How `knowledge-role` is actually used

The classification table above introduces `knowledge-role` as a new frontmatter field. This section walks through what setting it does, how it flows through the platform, and what behaviors it triggers.

### The default is absent

Most pages on most instances will never set `knowledge-role`. That's deliberate. A page without the field is just a normal page — it doesn't participate in the knowledge graph, doesn't get lint-flagged for missing citations, doesn't appear in source/concept reports. The casual use cases (recipes, team SOPs, user profiles, community forums) stay completely unaffected.

The field only comes into play when a user — or an external agent acting on the user's behalf — decides a page belongs to a structured knowledge body. They opt in by setting the field; everything else follows from that single choice.

### What changes when a role is set

Setting `knowledge-role` to one of the three values changes platform behavior in four places. Each is documented under the build plan above; collected here for one-screen visibility:

- **At save time** (`ValidationManager`) — citation and concept pages must satisfy reference constraints (at least one source-ref for citations, at least one citation-ref for concepts). Violations are warnings, not hard rejections.
- **At render time** (`header.ejs` badge system shipped in v3.14.0) — a "Source" / "Citation" / "Concept" badge appears in the page-title area, driven by the same config-driven mechanism that renders the `(System)` / `(Documentation)` badges.
- **In the editor** — for source pages, the body editor opens read-only with a banner explaining the source-role immutability contract. Metadata still editable.
- **In the reference index** — the `knowledge-graph-index.json` records the page's edges by role, so the lint and any external agent can ask "what are the sources for this citation" or "what citations are orphaned" in one lookup.

### Setting and changing the role

Users set the role through the regular page-edit flow — a new dropdown in the metadata sidebar with four choices: "(none)", "Source", "Citation", "Concept". External agents set it through the same `POST /api/pages/<name>` endpoint that updates other frontmatter.

Role transitions are allowed but constrained:

| From | To | Allowed? | Notes |
|---|---|---|---|
| (none) | source / citation / concept | yes | The opt-in path. Sets up the page for graph participation. |
| citation | concept | yes | Common — a claim grows into a synthesis. |
| concept | citation | yes | Less common — a synthesis is stripped back to a single claim. |
| source | anything | warn + require force | Sources are supposed to be immutable; changing their role retroactively rewrites the meaning of every citation that referenced them. Allowed but flagged. |
| any | (none) | warn | Removing a page from the graph orphans any references to it from other graph pages. Lint surfaces the resulting orphan edges. |
| citation / concept | source | rejected | A page that interprets material isn't itself raw material. The user must create a new source page and re-cite. |

The transitions matter because the reference index has to stay consistent. Each change emits an index-update event; the lint catches the dangling-reference cases.

### What the role guarantees

A reader looking at a page with `knowledge-role: source` can assume:

- The body content is locked. Anything they read is the original material as it was committed.
- Versioning still applies for metadata, so title and description edits show up in history, but the body line-for-line matches what was first saved.
- Citations that reference this source point at a specific version (UUID + version number), so even if the source is later replaced by a newer one, existing citations stay anchored.

A reader looking at a page with `knowledge-role: citation` can assume:

- At least one typed footnote points at a source page (or the lint has flagged the omission as a "free-floating opinion").
- The body content represents the page author's interpretation of those sources, not a reproduction. Confidence is the author's, not the source's.

A reader looking at a page with `knowledge-role: concept` can assume:

- The body draws on multiple citations (typically several; one is allowed but lint may flag as "narrow").
- The content is synthesis, not source material — claims should be attributed to the citations they rest on.

These read-time guarantees are what make the structure trustworthy. They depend on the platform enforcing the role contract at write time, which is what steps 1-4 of the build plan deliver.

### How external agents (LLMs) use it

An external agent ingesting a new source goes through a predictable sequence:

1. Create the source page itself with `knowledge-role: source` (immutability kicks in immediately).
2. For each major claim in the source, create or update a citation page with `knowledge-role: citation` and typed footnotes pointing at the source page.
3. For each broader idea touched by the new source, update the relevant concept page — `knowledge-role: concept` — adding wiki-links to the new citations.
4. Update the curated index page with one-line entries for any new citation or concept pages.
5. Append an entry to the topic-scoped activity log.

The agent reads the existing knowledge graph by querying the reference index (which pages cite which sources, which concepts draw on which citations). It writes through the existing `POST /api/pages/<name>` endpoint. The platform doesn't need any LLM-specific code — the role field is the contract, the reference index is the data, and the existing API is the surface. Different agents (Claude Code, MCP servers, future tooling) can all interoperate against the same shape.

### Examples

| Scenario | How role gets set |
|---|---|
| A user uploads a scientific paper PDF as an attachment and creates a page summarizing it | The summary page is a `citation` if it stays close to what the paper says, or a `concept` if it synthesizes the paper with other prior knowledge. The paper itself is the source — could be an attachment, or could be a page with `knowledge-role: source` linking to the attached PDF. |
| A team writes a runbook for handling a specific incident | No `knowledge-role`. It's operational content, not a knowledge graph node. |
| A historian builds a wiki of primary documents and analysis | Primary documents → `source` pages (immutable). Each analysis → `citation` or `concept` depending on depth. The wiki naturally organizes itself around the role distinction. |
| A user-profile page | `system-category: user-profile` (existing); no `knowledge-role`. The two axes are orthogonal — a user profile isn't in any knowledge graph. |
| A documentation page in `docs/` that surveys a body of research | `system-category: documentation` AND `knowledge-role: concept`. Both axes apply independently. |

The last row is the most interesting one. It shows the axes really are orthogonal: a page can be `documentation` (platform-page-type for storage and badge purposes) and a `concept` (knowledge-graph position for lint and reference purposes) at the same time, without the two fields fighting each other.

## Relationships — references across pages

The role axis describes what a page **is**, not what it **has**. Pages also point at each other through reference links — that's a separate, many-to-many relationship, not a classification.

```
sources       (immutable raw material — these ARE the originals)
   ↑   footnote / provenance link (one citation → many sources)
citations     (interpretive claims about source material)
   ↑   wiki-link / inclusion         (one concept → many citations)
concepts      (synthesized knowledge that draws on citations)
```

A few clarifications that follow:

- A `source` page **is** the source. It does not have a source — that would be redundant.
- A `citation` page has zero-or-more sources it cites. Most have at least one; a citation with none is a free-floating opinion, and the lint should flag it.
- A `concept` page draws on zero-or-more citations. Most have several; a concept with no citations is a thought, not a synthesis.
- The role is exactly one. The references are many-to-many. A concept page is *only* a concept — but it can draw on dozens of citations, each of which in turn cites dozens of sources.

The reference graph between pages is the **data** the lint and the future LLM ingest both consume. Building it as a first-class index — separate from the existing `page-index.json` and `page-assets-index.json` — is the only new infrastructure the build plan needs.

---

## Sources are heterogeneous — the asset-graph view

Karpathy's pattern assumes a single filesystem split: `raw/` immutable, `wiki/` LLM-maintained. ngdpbase doesn't have that filesystem layout, and the operator's actual setup is more layered anyway. Sources don't live in one place — they live across five tiers of control, and the platform needs to be able to cite all of them with appropriate fidelity per tier.

The unifying abstraction is the **AssetManager / AssetProvider registry**, which already runs the fan-out across attachments and the media library. Adding new tiers means adding new providers; the citation contract doesn't change.

### The five source tiers

| Tier | Storage | Control | Immutability | Citation mechanism |
|---|---|---|---|---|
| **Source pages** | ngdpbase page store | Full | Platform-enforced via `knowledge-role: source` contract | Page UUID |
| **Attachments** | ngdpbase attachment store (`BasicAttachmentProvider`) | Full | Operator can enforce write-once policy | Attachment UUID via `AssetManager` |
| **Media library** | External directory, indexed by `FileSystemMediaProvider` | Read-only index — files owned by the OS | Filesystem-level (operator's discipline) | Asset ID resolved through `MediaManager` |
| **External-indexed (sist2 / NAS)** | External NAS, indexed by [sist2](https://github.com/simon987/sist2) or similar | Read-only index | Filesystem-level | NEW: a `Sist2AssetProvider` plugged into `AssetManager` |
| **Internet URLs** | Outside everything | None | Not immutable — pages change, vanish, redirect | URL string; weakest tier — see "URL handling" below |

The first four tiers all return AssetRecord-shaped data through `AssetManager`. The reference index — `knowledge-graph-index.json` from step 3 of the build plan — records citation → asset edges, not citation → page edges. An asset can be a source page, an attachment, a media-library file, or a sist2-indexed file. Citations don't care which tier; the platform resolves the address through the existing `AssetManager.getById(providerId, id)` path.

### sist2 as a new AssetProvider

[sist2](https://github.com/simon987/sist2) is an Elasticsearch-backed file/document indexer that's already running on the operator's NAS at `http://192.168.68.71:4090` indexing personal data outside ngdpbase. Wiring it up as an `AssetProvider`:

- Implements the `search()` interface — returns AssetRecord-shaped results mapped from sist2's document model.
- Returns `getById()` to resolve a sist2 document ID to file metadata + a URL the user can click through to view it.
- Shows up in the asset-picker UI as a fifth source-type alongside Attachments / Media / Pages / Users — fully consistent with the source-types unification shipped in v3.14.0 (EPIC #693).

The user's existing sist2 install becomes a first-class source layer for citations without sist2 itself changing. The provider is a small adapter — a few hundred lines, similar in size to `FileSystemMediaProvider`.

Worth filing as a `[FEATURE]` issue once the foundation pieces in steps 1-4 of the build plan are in place. The asset-picker is already shaped for this; the provider is the missing piece.

### URL handling — the awkward tier

URLs violate the immutability contract. The page at `https://example.com/article` can change tomorrow, vanish, or redirect to a different topic. A citation that points only at a URL has weak provenance.

Three plausible policies for citations pointing at URLs:

- **A. Weaker-tier source-ref.** Citation has both `source: <asset-id>` and an optional `url: <fallback>` field. Lint flags citations with only a URL as "unstable provenance."
- **B. Force capture.** When a user wants to cite a URL, the platform fetches it once and stores the snapshot as an attachment. The citation points at the snapshot (which IS immutable); the URL is metadata on the snapshot for click-through. This mirrors how the Internet Archive's "save page now" model works.
- **C. Refuse URLs as primary source-refs.** Karpathy-pure. The user must capture, transcribe, or screenshot before citing.

Option B is the natural fit for the operator's "Owned digital Data" framing — you want a snapshot you control, not a live URL. ngdpbase already has the attachment storage; the missing piece is a small "capture this URL" admin action that fetches + uploads + creates a source-roled page wrapping the attachment.

This is an open design question — picked before step 3 (typed footnotes) ships, since the citation contract needs to know whether URLs are accepted as primary refs.

### What this means for the build plan

Two adjustments to the seven-step build plan above:

- **Step 3 (typed footnote + reference index)** — the index is keyed on AssetManager `(providerId, id)` pairs, not page UUIDs. The typed footnote syntax accepts any asset address: `[^source:asset/UUID]`, `[^source:media/UUID]`, `[^source:sist2/DocID]`. Plus URL handling per the chosen policy.
- **New step 6.5 — `Sist2AssetProvider`.** Sits between "discipline prerequisites" and the deferred LLM extension points. Independent — could ship sooner if the operator wants their NAS content citable before the lint surface is built.

The rest of the build plan stands.

## Build plan — seven structural pieces

The plan is staged so each step ships independently and useful work compounds. The first five pieces don't need any LLM in the loop and improve the platform for users who never touch one. The sixth and seventh are LLM-friendly extension points, not LLM-required features.

Total effort estimate for steps 1-5: about 2-3 days of focused work.

### 1. `knowledge-role` frontmatter field

Add an optional frontmatter field `knowledge-role: source | citation | concept`. `ValidationManager` enforces the enum when present; absence means the page is outside the knowledge graph. The badge mechanism shipped in v3.14.0 renders an optional "Source" / "Citation" / "Concept" badge for graph-participating pages with no new infrastructure.

About a dozen lines plus tests. **Foundational — unblocks everything else.**

### 2. Source-role immutability

A page with `knowledge-role: source` becomes immutable by default. The save handler rejects body changes — new content needs to be a new source page. Metadata edits (title, badges) still allowed. The editor UI surfaces a "this is a locked source page" hint.

Why: the source layer becomes trustworthy without requiring discipline from users. The platform enforces the contract.

About 2 hours of server-side work + a small editor UI hint.

### 3. Typed footnote + reference index

Citations need a hard-link to their sources, distinct from free-text footnotes. Add a typed-footnote syntax — either `[^source:UUID]` (extends existing footnote syntax) or `[{Cite source='UUID'}]` (new plugin). Renders as a footnote with a source icon and click-through to the source page.

Alongside the typed-footnote addition, build a `knowledge-graph-index.json` that records source→citation→concept edges as they're written. Rebuilds at startup from a frontmatter scan; cached during normal operation. The lint and the future LLM ingest both consume this index.

4-6 hours. **The largest single piece in the foundation layer.**

### 4. Citation- and concept-role validation

Lint rules enforced via `ValidationManager`:

- A `citation` page must have at least one typed footnote pointing at a source page.
- A `concept` page must reference at least one citation (via wiki-link or transclusion).

Violations are warnings, not hard rejections — users can override with a `--force` flag when they really need a free-floating concept. The reference index from step 3 is what's queried.

2-3 hours.

### 5. Deterministic lint surface

> **Lifted out — filed as #730 (2026-05-16), shipped as `[{AppHealthPlugin}]`.** Per the 2026-05-16 brainstorm this is the value-certain piece of this doc and helps every user with no LLM involved, so it is tracked independently of the knowledge-graph work (#706/#707) and is **not** gated on them. The rest of this section is the original design context.

A `[{WikiLint}]` plugin or `/admin/wiki-health` page that runs the three pure-graph audits:

- **Orphan pages** — no inbound links from any other page
- **Missing entity pages** — concepts mentioned in page bodies that have no page of their own
- **Stale claims** — citation's `lastModified` is older than its source's `lastModified`

None of these need an LLM. All three are operations over data the platform already has. Reports render as a list with one-click "open the offending page" links.

4-6 hours.

### 6. Discipline prerequisites in `CatalogManager`

Extend `ngdpbase.system-keywords` config schema with an optional `prerequisites: string[]` field on each entry:

```json
"biology": {
  "label": "biology",
  "description": "Life sciences",
  "category": "subject",
  "enabled": true,
  "prerequisites": ["chemistry"]
}
```

`CatalogManager` exposes `getPrerequisites(keyword)`. The lint extends to flag "this Biology page cites no Chemistry-tagged sources." Backward-compat: missing `prerequisites` means no constraint, identical to today's behavior.

3-4 hours.

### 7. LLM extension points (deferred)

These are LLM-required and stay deferred until there's a concrete user asking for them:

- **LLM-driven `ImportManager` converter** — takes a raw source, emits a structured plan of N pages to create/update. Hooks into the existing converter registry rather than being new machinery.
- **Contradiction-detection lint** — flags pairs of pages whose claims contradict. Exposed as an API hook the operator can wire to an external LLM (Claude Code, an MCP server, etc.).
- **Citation suggestion** — given a draft citation page, suggest source pages it should link to.

Don't build these speculatively. The substrate (steps 1-6) makes them straightforward to add when needed; building them before user demand risks shipping the wrong shape.

---

## What we are NOT building

Explicit non-goals to keep the scope honest:

- **In-app LLM chat panel.** No chatbox in the admin UI that runs the workflow. External agents (Claude Code, MCP servers) work against the platform's existing APIs. Self-hostable, vendor-neutral.
- **Mandatory citations for all content.** Free-form pages (recipes, profile pages, SOPs) stay first-class. The knowledge-role axis is opt-in.
- **Vendor lock-in to a specific LLM.** Nothing in the platform should require Claude or OpenAI or any particular model. The platform exposes data and contracts; LLMs are clients.
- **Replacing existing managers.** The Catalog, Import, Audit, Footnote, BackgroundJob, and Schema managers stay as they are. The build plan adds a thin composition layer on top.

---

## Open design questions

These need decisions before the corresponding step ships:

- **Typed-footnote syntax.** `[^source:UUID]` extends existing footnote markdown; `[{Cite source='UUID'}]` is a new plugin. Different ergonomics, different parser cost. Decide before step 3.
- **`knowledge-role` storage.** Top-level frontmatter field, or nested under a `knowledge` object? Affects how `ValidationManager` enforces it and how the editor renders the field.
- **Per-topic vs. per-instance index/log.** Karpathy uses per-instance. ngdpbase could support per-topic-keyword scoping so multiple unrelated topical wikis can coexist in one install. Affects step 5's lint scoping.
- **`source` page immutability — hard or soft?** Hard = save handler rejects. Soft = warning only, allow override. Hard is more trustworthy; soft is more forgiving.
- **`CatalogManager` prerequisite scope.** Is `prerequisites: ["chemistry"]` a hint (lint flags missing coverage) or a hard rule (validator rejects pages with `discipline: biology` that lack any Chemistry-tagged citations)? Probably hint for v1.

---

## Why this matters

ngdpbase's existing positioning is "a self-hostable wiki engine you can extend with addons." This pattern would extend that to "a self-hostable wiki engine where the data graph is first-class and an LLM can maintain it for you" — a meaningfully different product story without changing the core engine, because the substrate is already there.

The risk: every wiki platform is racing to add AI features. ngdpbase's differentiation is **self-hostable, no vendor lock-in, your data stays yours**. Layering an LLM-maintenance pattern on top — where the LLM is bring-your-own (Claude Code, GPT, local Ollama) and the wiki content stays in your filesystem — leans into that differentiation rather than fighting it.

The biggest concrete win from this whole brainstorm is probably the most boring one: cleaning up `system-keywords` to be a structured taxonomy and adding a proper knowledge-role axis. That's a real platform improvement independent of whether the LLM-wiki workflow is ever fully built.

---

## Appendix — generic LLM-Wiki schema (Karpathy)

For reference: the schema Karpathy proposes for an instance running the pattern. Adapted from his gist; the file/folder conventions are platform-agnostic (apply in a personal directory; the ngdpbase mapping in this doc covers how the same concepts map onto a running ngdpbase instance).

### Folder structure (file-based version)

```
raw/          -- source documents (immutable -- never modify these)
wiki/         -- markdown pages maintained by Claude
wiki/index.md -- table of contents for the entire wiki
wiki/log.md   -- append-only record of all operations
```

In ngdpbase: `raw/` becomes attachments OR pages with `knowledge-role: source`; `wiki/` is the page store; `index.md` and `log.md` are normal pages.

### Ingest workflow

When a new source is added and the LLM is asked to ingest it:

1. Read the full source document.
2. Discuss key takeaways with the user before writing anything.
3. Create a summary page (one `citation` per major claim).
4. Create or update concept pages for each major idea or entity.
5. Add page-links to connect related pages.
6. Update the curated index page.
7. Append an entry to the activity log with the date, source name, and what changed.

A single source may touch 10-15 pages. That is normal.

### Page format (Karpathy convention)

```markdown
# Page Title

**Summary**: One to two sentences describing this page.

**Sources**: List of source pages this page draws from.

**Last updated**: Date of most recent update.

---

Main content goes here. Use clear headings and short paragraphs.

Link to related concepts using page-links throughout the text.
```

In ngdpbase the Summary, Sources, and Last updated fields fit naturally as frontmatter (`description`, sources list as typed footnotes, `lastModified`).

### Citation rules

- Every factual claim should reference its source via a typed footnote.
- If two sources disagree, note the contradiction explicitly.
- If a claim has no source, mark it as needing verification.

### Question answering

When the user asks a question:

1. Read the curated index page first.
2. Read relevant pages and synthesize an answer with citations.
3. If the answer is valuable, offer to save it as a new page.

Good answers should be filed back into the wiki so they compound over time.

### Lint

Periodic audit checks for:

- Contradictions between pages
- Orphan pages
- Concepts mentioned in pages that lack their own page
- Claims that may be outdated based on newer sources
- Format consistency

Report findings as a list with suggested fixes.

### Rules

- Never modify source-role pages.
- Always update the index and log after changes.
- Write in clear, plain language.
- When uncertain about how to categorize something, ask the user.
