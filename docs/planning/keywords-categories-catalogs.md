---
name: keywords-categories-catalogs
description: "Brainstorming / planning inventory — every keyword, category, and catalog surface that exists today, the issues that shaped them, and the open tensions to resolve before further keyword work"
dateModified: '2026-07-20'
category: planning
---

# Keywords, Categories, Catalogs — current-state inventory and planning notes

Working document for planning the future of tagging/vocabulary features. Everything in the first half is __what exists today__ (verified against code, config, and issues on 2026-07-20). The second half is tensions, gaps, and directions — brainstorming, not commitments.

Primary open work: __[#869 — EPIC: Unified canonical keywords across pages, media, and external tools (digiKam-compatible)](https://github.com/jwilleke/ngdpbase/issues/869)__ (P1). This document is background for that epic.

---

## 1. The vocabularies that exist today

Three config-defined controlled vocabularies plus one open (uncontrolled) vocabulary:

| Vocabulary | Config key | Nature | Applied to | Notes |
|---|---|---|---|---|
| System categories | `ngdpbase.system-category` | Closed, operator-curated | Pages (exactly one per page) | Each entry carries label, description, `storageLocation` (regular/required), enabled flag. Default: `general` (`ngdpbase.default.system-category`) |
| System keywords | `ngdpbase.system-keywords` | Closed, operator-curated | Pages (multi) | 13 defaults. Each entry has its own `category` facet: `content-type`, `workflow-status`, `subject` |
| User keywords | `ngdpbase.user-keywords` | Closed but user-facing | Pages (multi, max `ngdpbase.maximum.user-keywords` = 5) | Entries: label, description, `category` facet (general/status/subject), `enabled`, `restrictEditing`. `capture` added by commit 5c43a23e (for the #881 bookmarklet) |
| Media/attachment keywords | *(none — no catalog)* | __Open__ | Media + attachment files | Stored __in the file__ (EXIF/IPTC/XMP `Keywords` / `dc:subject`); digiKam-compatible; anything a camera/tool/user wrote |

Confusing overlaps baked into the defaults:

- `user-keywords` and `system-keywords` __duplicate terms__: draft/review/published and the whole subject list (medicine, geology, …) exist in both. The `user-keywords` comment already marks these as "deprecated here — see system-keywords", but they still ship in both catalogs.
- The word __"category" means three things__: (1) `system-category` (page's single storage/ACL category), (2) the `category` *facet field* inside each keyword definition (general/status/subject/workflow-status), (3) `ngdpbase.storageLocation.categoryBasedStorage` mapping (System/Admin/Security → required storage). Any future doc/UI work should disambiguate these.

## 2. Where each vocabulary surfaces (UI + API)

### Page editor (`views/_basicEditor.ejs`)

- __User Keywords__ — dropdown with checkboxes (`_basicEditor.ejs:126`), one checkbox per catalog entry. Enforces the max-5 cap at submit. __Config-derived__ (`getUserKeywords` path): shows every enabled catalog entry, whether or not any page uses it. `private` is filtered out of the dropdown (has its own checkbox; legacy `user-keywords: [private]` still honored for unmigrated pages).
- __System Category__ — admin-only single select.

### Media item page (`views/media-item.ejs`)

- __Keywords (comma-separated)__ — free-text typeahead (`media-item.ejs:122`) with suggest dropdown (`mediaEditKeywordsSuggest`). Open vocabulary. Saving __writes back into the file's EXIF/IPTC/XMP__ with a one-time `_original` backup (shipped in #866). This is the digiKam-compatibility path — the file itself is the source of truth, ngdp's media index just mirrors it.

### Asset picker (`views/_asset-picker.ejs`, shared by /search and /attachments/browse)

- `ap-user-keywords` + `ap-system-keywords` multi-selects (Pages source only, #691) — server-injected catalogs.
- __Related keywords strip__ (#882, in-review) — when a keyword filter is active, `GET /api/keywords/related?keyword=` returns co-occurring user keywords ranked by shared-page count (ACL-safe: computed over `advancedSearchWithContext` hits, private pages never counted; top 12, seed excluded). Rendered as a badge strip that chains to further keyword searches.
- __Asymmetry worth remembering:__ the search page's keyword filter list is __index-derived__ (`SearchManager.getAllUserKeywords()` — union of what pages actually carry), while the edit-form picker is __config-derived__ (catalog entries). A newly registered catalog term shows in the editor immediately but only appears in search filters once a visible page carries it (bit us with `capture`, #881).

### Admin + self-serve keyword management (`src/routes/WikiRoutes.ts:11067–11093`)

- `/admin/keywords` — CRUD over the user-keyword catalog (GET list, POST create, PUT/DELETE per id, usage count endpoint `/api/admin/keywords/:id/usage`).
- `/user-keywords/create` — user-facing creation flow, plus `create-page/:keywordId` to spin up a keyword landing page.
- `GET /api/user-keywords` — catalog as JSON.

### Search integration

- Lunr boosts (`ngdpbase.search.provider.lunr.boost`): `systemcategory` 8, `userkeywords` 6, `keywords` 4 — keywords already outrank body text; #884 plans further field-weighting/keyword-first work.
- Page JSON-LD merges `user-keywords` + `system-keywords` into schema.org `keywords` (deduplicated) — `docs/schemas.md:315`.
- Media: EXIF/IPTC `Keywords` → `keywords` on the ImageObject record (`docs/schemas.md:328`); PDF `Keywords`/`dc:subject` likewise for documents.
- Page search-index entries stay page-text-only: image keywords do __not__ bleed into embedding pages (parked "hybrid" idea in `docs/schemas.md:89` — revisit on operator pain).
- Keyword accessors live on the route layer, not a manager: `WikiRoutes.getUserKeywords()` / `getUserKeywordsWithDescriptions()` (`src/routes/WikiRoutes.ts:1596/1667`) read the config catalog; `SearchManager.getAllUserKeywords()` reads the index.

### Keyword share links (#842 epic, shipped)

Keywords are also an __access-control scope__: `ShareManager` mints anonymous, time-limited, revocable share tokens scoped *by keyword* — token-gated album/page/media views (#852–#856). Any vocabulary redesign must keep keyword identity stable enough that outstanding share tokens don't dangle.

### Journal addon

Journal pages reuse the same vocabulary: journal-tags were migrated into `user-keywords` (#799) and the journal editor extends `_basicEditor.ejs` (#797) — so the page-side closed vocabulary is the *only* page tagging system left; no parallel tag namespaces.

## 3. CatalogManager — the machinery layer

`src/managers/CatalogManager.ts` (doc: `docs/managers/CatalogManager.md`). Two registries, both shipped:

- __Vocabulary providers__ (#424, closed) — `registerProvider()`; `DefaultCatalogProvider` reads `ngdpbase.system-keywords` from config; `AICatalogProvider` stub awaits an LLM addon (`ngdpbase.catalog.ai.enabled` = false, threshold 0.7). `resolveUri(term)` powers page-keyword `sameAs` links. `suggestTerms()` fan-out exists but returns `[]` until a real AI provider registers.
- __Asset sources__ (#755 epic, closed) — MediaManager / AttachmentManager / PageManager registered as `CatalogSource` producers; JSON-LD emission shipped (page embeds #765, content negotiation #766, SKOS ConceptScheme endpoint `/api/catalog/vocabulary/<scheme-id>` #767). Admin runtime-visibility dashboard shipped (#780).
- __Not yet implemented:__ SKOS-shaped terms — `CatalogTerm` gaining `altLabels`, `broader`/`narrower`, `exactMatch`/`closeMatch`, `definition`, `scopeNote`. This is the natural hook for hierarchy and synonyms (see §5).

Notable: the vocabulary registry serves __system-keywords__ via provider; __user-keywords__ are read straight from config by the editor/admin routes and are *not* a CatalogProvider today.

## 4. Issue map

### Open

- [#869](https://github.com/jwilleke/ngdpbase/issues/869) — __EPIC: unified canonical keywords__ across pages, media, external tools (digiKam-compatible). P1. The umbrella for everything below. Carries the 2026-07-20 keyword-UI audit comment (closed vs open vocabulary analysis).
- [#883](https://github.com/jwilleke/ngdpbase/issues/883) — Suggested keywords from recent pages in the editor. P1. Natural next slice after #882.
- [#884](https://github.com/jwilleke/ngdpbase/issues/884) — Search ranking: field weighting, URL tokenization, prefix typeahead, keyword-first. P1.
- [#882](https://github.com/jwilleke/ngdpbase/issues/882) — Related keywords via co-occurrence. __In review__ (shipped 0531d27d, awaiting close).
- [#868](https://github.com/jwilleke/ngdpbase/issues/868) — Attachment metadata editing + #866 follow-ups. P1. Extends the write-back path (=the open-vocabulary side).
- [#762](https://github.com/jwilleke/ngdpbase/issues/762) — CatalogSource producer roster. P2. Asset-source side of CatalogManager.
- [#786](https://github.com/jwilleke/ngdpbase/issues/786) — Auto-journal digester over CatalogManager records. P2.
- [#550](https://github.com/jwilleke/ngdpbase/issues/550) — elasticsearch addon: vector/hybrid search. Deferred. Would change what "keyword search" even means (semantic neighbors vs literal tags).

### Shipped / closed (context)

- [#866](https://github.com/jwilleke/ngdpbase/issues/866) — media metadata write-back (title/caption/keywords/DateTimeOriginal into EXIF/IPTC/XMP). Created the open-vocabulary typeahead.
- [#881](https://github.com/jwilleke/ngdpbase/issues/881) — browser bookmarklet (one-click capture into a page/journal); commit 5c43a23e registered `capture` in user-keywords for it (v3.54.0). Case study: a term used by pages but absent from the catalog; manual one-off sync.
- [#842](https://github.com/jwilleke/ngdpbase/issues/842) (epic, slices #852–#856) — keyword share links: anonymous, time-limited, revocable access to media and pages __by keyword__. Keywords as an ACL scope.
- [#691](https://github.com/jwilleke/ngdpbase/issues/691) / [#692](https://github.com/jwilleke/ngdpbase/issues/692) / [#693](https://github.com/jwilleke/ngdpbase/issues/693) / [#696](https://github.com/jwilleke/ngdpbase/issues/696) / [#744](https://github.com/jwilleke/ngdpbase/issues/744) / [#745](https://github.com/jwilleke/ngdpbase/issues/745) / [#731](https://github.com/jwilleke/ngdpbase/issues/731) — asset-picker consolidation: keyword/category multi-selects, unified /search, IA simplification, date dropdown, list-default view.
- [#746](https://github.com/jwilleke/ngdpbase/issues/746) — keyword chips link to a keyword search.
- [#424](https://github.com/jwilleke/ngdpbase/issues/424) — CatalogManager vocabulary provider registry (+ AI scaffold).
- [#755](https://github.com/jwilleke/ngdpbase/issues/755) (epic, 6 slices incl. #765/#766/#767/#780) — schema.org CreativeWork model + JSON-LD/SKOS publishing.
- [#790](https://github.com/jwilleke/ngdpbase/issues/790) (epic) / [#799](https://github.com/jwilleke/ngdpbase/issues/799) / [#797](https://github.com/jwilleke/ngdpbase/issues/797) — journal reconciliation: journal-tags migrated into user-keywords; journal editor extends `_basicEditor.ejs`.
- [#639](https://github.com/jwilleke/ngdpbase/issues/639) / [#712](https://github.com/jwilleke/ngdpbase/issues/712) / [#802](https://github.com/jwilleke/ngdpbase/issues/802) — `private` moved out of the user-keywords array into a top-level frontmatter field (legacy fallback still honored in the editor).
- [#507](https://github.com/jwilleke/ngdpbase/issues/507) — content-based auto-tagging for Elasticsearch (Phase 4 relates to the deby ES enrichment/vector mirror; see #550).

### Bug history worth remembering (all closed — recurring failure shapes)

- [#862](https://github.com/jwilleke/ngdpbase/issues/862) — `searchByUserKeywords` never matched pages with >1 keyword (comma-join vs whitespace-split). Multi-value serialization is a repeat trap.
- [#545](https://github.com/jwilleke/ngdpbase/issues/545) — JSPWiki import stored `user-keywords` as scalar string, not array.
- [#304](https://github.com/jwilleke/ngdpbase/issues/304) — user-keywords inconsistency (early normalization bug).

## 5. Tensions and gaps (the actual planning input)

1. __Closed vs open vocabulary is the core split.__ Pages enforce a curated catalog; media accepts anything (and must — EXIF interop). A user can tag a photo with a keyword the page editor will never offer. Vocabulary drift is structural, not a bug. Unifying *widgets* without deciding the *vocabulary model* just hides the drift (per the #869 audit comment).
2. __Config-derived vs index-derived lists disagree.__ Editor picker shows catalog; search filters show index reality. Terms in-catalog-but-unused and in-use-but-uncatalogued both produce "where's my keyword?" confusion (#881 was exactly this).
3. __Duplicated defaults.__ draft/review/published + subject terms live in both system- and user-keyword catalogs with a deprecation note nobody can see in the UI. Needs an explicit migration/cleanup decision.
4. __"Category" is overloaded three ways__ (page system-category, keyword facet, storage mapping). Rename or namespace before adding more surface.
5. __No hierarchy or synonyms.__ All vocabularies are flat. The SKOS extension of `CatalogTerm` (`broader`/`narrower`/`altLabels`) is designed but unimplemented — it's the ready-made slot for digiKam-style hierarchical tags (`Places/Ohio/Columbus`) and alias resolution.
6. __user-keywords bypass CatalogManager.__ Only system-keywords flow through the provider registry. Unification (#869) probably wants *all* vocabularies behind CatalogProvider so addons/AI/SKOS emission see one interface.
7. __No promotion path.__ Media keywords (open) never become catalog terms (closed) except by hand (#881). Candidate flows: an admin "adopt this keyword" action off usage stats; auto-suggest from `getAllUserKeywords()` diff against catalog; AI suggestion via the dormant `AICatalogProvider` once an LLM addon exists.
8. __Discovery features are page-only.__ Related keywords (#882) and suggested keywords (#883) operate on page keywords. Media keywords have no equivalent; a unified model would give them co-occurrence and suggestions for free.
9. __Keyword identity is load-bearing beyond tagging.__ Share tokens (#842) scope access by keyword string; renaming or merging terms can orphan live share links, and media-side renames mean rewriting EXIF in files (slow-storage write policy applies). Any canonicalization plan needs a rename/merge story, not just a create story.
10. __Multi-value serialization keeps biting__ (#862 comma-vs-whitespace, #545 scalar-vs-array). A unified model should pick one canonical wire/storage shape and normalize at every boundary.

## 6. Brainstorm directions (unranked, uncommitted)

- __Canonical-set + open-extensions model:__ one canonical keyword catalog (CatalogManager-hosted, SKOS-shaped) that pages *enforce* and media *suggests from*, with media allowed to carry extra uncatalogued terms flagged as "local".
- __Promotion workflow:__ usage-driven queue (`in-use-but-uncatalogued` report) with one-click adopt into the catalog — turns #881's manual fix into a feature.
- __Alias/synonym layer via SKOS `altLabels`:__ lets `photo`/`photograph`/`capture` resolve to one canonical term without retagging files.
- __Hierarchical keywords (digiKam `/` paths)__ mapped to SKOS `broader`/`narrower`; asset-picker filter gains subtree matching.
- __Merge system- and user-keyword catalogs__ into one catalog with a `curatorOnly`/`restrictEditing` flag per term, killing the duplicated defaults (big migration; decide early whether worth it).
- __Retire the checkbox dropdown__ for a single typeahead-with-enforcement widget once vocabulary model is unified — same interaction on pages and media, different acceptance rules.
- __Keyword landing pages__ (`/user-keywords/create-page/:keywordId` exists) as the canonical URI target for SKOS `Concept` dereferencing — ties vocabulary to the wiki itself.

## 7. DECIDED (2026-07-21) — adopted model and stepped decisions

Operator adopted the five-bucket model and stepped through the follow-on decisions (recorded on [#869](https://github.com/jwilleke/ngdpbase/issues/869)):

| Bucket | Author | Cardinality | Nature |
|---|---|---|---|
| `system-category` | operator config | one per page | storage/ACL routing |
| `status` (new field) | human editorial | one per page | lifecycle: draft/review/published, default `published` |
| flags (`private:`, `author-lock:` etc.) | human/system | booleans | operational |
| `user-keywords` | humans, free-typed | many, suggested typeahead; __no cap__ (max-5 retired) | open, canonicalized post-hoc |
| `system-keywords` | AI/automation only | many | machine classification + provenance (`capture`) + formerly-restrictEditing terms |

__Flag-name rule (operator ruling, 2026-07-21):__ a flag's name is never a keyword. Terms like `author lock` or `page privacy` in `user-keywords` are bucket violations — the concept lives in the flags row, and even documentation *about* a flag tags with topical vocabulary (e.g. `access control`), not the flag's own name. Seed pages "Author Lock" and "Page Private" were retagged accordingly.

Stepped decisions:

1. __Status__ — `status:` frontmatter field; migration rewrites pages carrying draft/review/published in either keyword array; search gains a status facet.
2. __Cap dropped__ — `ngdpbase.maximum.user-keywords` retires (operator call; recommendation was raise-to-15). Watch suggestion/related-keyword quality for tag-spam.
3. __restrictEditing terms → system-keywords__ — privileged UI/automation applies them; the open user field carries no restrictions.
4. __SKOS-lite__ — `altLabels` on `CatalogTerm` when aliasing ships; keep ConceptScheme emission (#767); `broader`/`narrower` deferred. Rule: __aliases merge, concepts split__ — synonyms get altLabels; homonyms (Paris (Ohio) vs Paris (Texas)) get separate qualified concepts, resolved by GPS EXIF / digiKam path / human at adopt time.
5. __Leaves-only ingestion__ — read flat IPTC/`dc:subject`; never strip `lr:hierarchicalSubject`/`digiKam:TagsList` on write-back. Guardrail task: verify #866's write path preserves those fields. Reversible — paths stay in files.
6. __capture clean cut__ — bookmarklet writes `system-keywords: [capture]`; one-time migration of existing `user-keywords: [capture]`; search filter moves facet.
7. __Slice order__ — (1) `status:` field + capture migration; (2) user-keywords behind a CatalogProvider; (3) drift report (first real join of CatalogManager's two registries: observed via asset sources minus canonical via vocabulary providers, usage counts, adopt/alias actions); widget unification after.
8. __User-facing wiki pages__ (`keywords-and-categories`, `user-keywords`, `system-keywords` required-pages — stale since 2025-10-17) — rewritten with each shipped slice, starting Slice 1.

CatalogManager fit (no redesign): canonical user-keywords become a CatalogProvider (alias-table owner), AI providers write system-keywords (`AICatalogProvider`/`suggestTerms` machinery activates unchanged), drift report joins the two registries.

## 7a. Claude's original recommendations (superseded by §7 decisions; kept for rationale)

Ranking principle: observed operator friction first, speculative architecture last. Every recurring real-world pain in this space so far has been a *sync* problem (#881 capture, config-vs-index confusion, #862/#545 serialization) — none has been "we lack hierarchy" or "we lack SKOS". Recommend in this order:

1. __Adopt the canonical-set + open-extensions model as the #869 decision — decide it now, before any more keyword features.__ Pages enforce the catalog; media suggests from it but may carry extra "local" terms. This is the only model that respects both the digiKam/EXIF interop constraint (media can't be closed) and the curation value of the page catalog (pages shouldn't be open). Every slice below assumes it; #883/#884 should be built against it too, so decision cost is now, not after three more features harden the split.
2. __Ship the promotion workflow as the first slice__ — an "uncatalogued keywords" report (diff `SearchManager.getAllUserKeywords()` + media-index keywords against the catalog, with usage counts) plus one-click adopt into `/admin/keywords`. Small: the accessors, the admin CRUD, and the usage endpoint all exist. Directly converts #881-class manual syncs into a feature, and doubles as the monitoring surface for drift. This is the highest value-per-effort item on the board.
3. __Normalize multi-value shape at every boundary in the same pass__ — one canonical storage/wire shape (string array), asserted at save, import, index, and API edges. #862 and #545 were both this bug wearing different hats; cheap insurance while touching the accessors anyway.
4. __Fold user-keywords behind a CatalogProvider.__ Mechanical refactor (`WikiRoutes.getUserKeywords()` currently reads config directly), no behavior change, but it gives promotion (slice 2), SKOS emission, AI suggestion, and addons one interface instead of two. Do it before — not with — any catalog-content changes so the diff stays reviewable.
5. __Write the rename/merge story before offering rename/merge anywhere.__ Constraint from tension #9: share tokens (#842) scope by keyword string and media renames rewrite EXIF on slow storage (operator-side policy). Recommendation: renames are catalog-level with an alias left behind (old term becomes `altLabel`), share tokens resolve through aliases, EXIF rewrite is an explicit operator-triggered batch — never a side effect.
6. __Defer the system-/user-catalog merge and full SKOS hierarchy until pain is observed.__ The duplicated defaults are ugly but only confusing at config-reading depth; the merge is a big migration with ACL implications and small user-visible payoff. Hierarchy (digiKam `/` paths) is real interop surface but no operator request exists yet. Park both with explicit reopen triggers: catalog-merge when the duplication causes a user-visible bug; hierarchy when hierarchical tags actually arrive in the media library.
7. __Widget unification last.__ The checkbox dropdown vs typeahead split is cosmetic once the vocabulary model is decided — replacing widgets before the model just repaints the drift. When it happens, converge on typeahead-with-enforcement (catalog terms autocomplete + hard reject on pages, soft accept + "local" badge on media).

Net: slices 2–4 are each small, independently shippable, and low risk; slice 1 is a decision, not code; slices 5–7 are sequenced constraints, not near-term work.

## 8. Suggested reading order for future sessions

1. This document.
2. #869 issue thread (audit comment has the file:line specifics).
3. `docs/managers/CatalogManager.md` + `docs/schemas.md` §terminology note and field-mapping tables.
4. `views/_basicEditor.ejs:126` (closed widget), `views/media-item.ejs:122` (open widget), `views/_asset-picker.ejs` (filter + related-keywords strip).
