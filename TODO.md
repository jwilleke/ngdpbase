---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-21T09:30:00.000Z'
slug: ngdpbase-todo
---

# Project Development TODO

Current near-term priorities for ngdpbase and the sister sites tracked by `/othersites`. Maintained as a snapshot of **open** work — closed/resolved items are not retained here (see `docs/project_log.md` and the GitHub issue history for the trail). For the live state run `/check-todos`.

Sister sites in scope:

- `fairways-base` — checkout of `jwilleke/ngdpbase` (port 2121, "The Fairways")
- `ngdpbase-veg` — checkout of `jwilleke/ngdpbase` (port 3333, "ve-geology")
- `ngdpbase` (this repo) — port 3000, "jimstest"
- `ngdp-temp-builds` — local builds, no separate issue tracker
- `geohazardwatch` — separate repo at `jwilleke/geohazardwatch`, real satellite with its own issues

The first three local checkouts share `jwilleke/ngdpbase` as their git remote — their issues ARE this repo's issues.

## Security

| Source | Package | Severity | Status |
|---|---|---|---|
| Dependabot (GHSA-rmmh-p597-ppvv) | `showdown` | medium | ReDoS (CVE-2024-1899); tracked in #599; **no upstream patch** — mitigation only. #749 = recurring "re-check for a patch" task. **Only remaining open alert.** |

> `ws` GHSA-58qx-3vcg-4xpx **resolved v3.24.1** (`97a95d1d`) — scoped pm2 override forced ws → 8.20.1; `npm audit` no longer lists it.

## Waiting on Review Sign-off

Items carrying the `in review` label — work is shipped/merged; operator verification is the only thing left before close. **Clear this list before starting new feature work.**

| # | Title | Shipped | How to verify |
|---|---|---|---|
| #753 | MarkupParser: CommonMark variable-length backtick code spans (```` ``` ````) leaked `data-jspwiki-placeholder` spans + cascade-corrupted later fenced blocks | v3.27.1 (`090c77c9` + `739fe57b`) 2026-05-21 | Root cause was the Step-0 inline regex `/`([^`]+)`/g`, not the fenced-code scanner. Replaced with a CommonMark scanner (run-of-N opens; run-of-exactly-N closes). Verify: (a)`npm test -- MarkupParser-Extraction.test.ts -t "#753"` + `... MarkupParser-EndToEnd.test.ts -t "#753"`; (b) UI-edit any wiki page with `` ```` ``` ```` `` and confirm`<code>```</code>` renders with no placeholder spans; (c) live `/view/Using InsertPlugin` needs an operator UI edit — required-pages source only seeds on first install |
| #759 | Slice 5 of #755 — AttachmentManager-as-CatalogSource + PDF/docx metadata extraction | v3.27.0 (`b348bfd4`) 2026-05-20 | Slice 5 plumbed extraction → storage → search-match → CatalogSource emission but **adds no UI surface**. Three review paths: (a) upload a PDF whose embedded `Title`/`Author` differ from filename and search for them in the asset picker — pre-Slice-5 wouldn't match, post-Slice-5 should; (b) grep `data/attachments/attachment-metadata.json` after upload for `documentTitle`/`documentAuthor`/etc.; (c) `npm test -- BasicAttachmentProvider.docMetadata AttachmentManager` (34 cases). Follow-up "Slice 5a" tracked in EPIC #760 |
| #757 | Slice 2 of #755 — `src/types/Schema.ts`: CreativeWork + subtypes + per-source mapper signatures | (`8fd3a996`) 2026-05-20 | Type-only deliverable: 5 subtypes + CatalogSource interface + 5 type guards + 17 tests. Verify by reading `src/types/Schema.ts` and `src/types/guards.ts`; tests `npm test -- src/types/__tests__/guards.test.ts` |
| #756 | Slice 1 of #755 — CatalogManager audit: docs + minimum-API recommendation | (`7a68b718`) 2026-05-20 | Docs deliverable: read `docs/managers/CatalogManager.md`; check it appears in the docs-coverage report (managers 25/37, closed one #660 warning) |
| #750 | Index video capture-date (CreateDate/MediaCreateDate/QuickTime:CreationDate) | v3.25.1 (`97089601`) | Upload a video with a known capture date or run `media.rebuild`; confirm it appears in date sort/filter in the asset picker. Tests: `npm test -- FileSystemMediaProvider.extractDateTimeOriginal` |

## Open BUGS (ngdpbase, by issue #)

2 open as of 2026-05-21. #753 closed-pending-signoff in v3.27.1 (see _Waiting on Review Sign-off_ above); #749 closed (workflow fix + /check-todos GH-actions section, `4c9f9a17`). Remaining: #660 cosmetic doc-stub backlog, #599 mitigation-only CVE with no upstream patch.

| # | Title |
|---|---|
| #660 | Agent and ./docs documentation — tooling shipped; 49 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); recurring patch-check workflow now green (`4c9f9a17`); next scheduled check Tuesday 09:23 UTC |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- _(none)_ — #643 resolved 2026-05-19: closed for the delivered modified-date scope (v3.22.0); the deferred `created`/`dateField=created` half split into the page-model feature **#754**. No operator-decision items outstanding.

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#43](https://github.com/jwilleke/geohazardwatch/issues/43) | enhancement | Migrate eslint config to flat-config format | Prerequisite for eslint 9+/10 bumps. Renovate rule added to defer eslint majors until done. Low priority — eslint 8 still works. |
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Not "TODO" exactly — these are filed, scoped, and awaiting prioritization or implementation cycles.

| # | Topic | Priority hint |
|---|---|---|
| #760 | [EPIC] Deliver operator-visible value on the #755 plumbing — display, backfill, search, JSON-LD render | **NEW 2026-05-21** — follow-up to #755 driven by operator's #759 comment "gather the data but ONLY on new uploads and provides no method of display or search dialog". 7 sub-slices listed in the EPIC; smallest visible win = Slice 5a (render attachment doc metadata in `admin-attachments.ejs` + asset-picker tile) |
| #755 | [EPIC] Metadata schemas ratified — schema.org-shaped CreativeWork model + JSON-LD linked-data publishing (6 slices) | **In flight 2026-05-20** — Slices 1/2/5 shipped (see _Waiting on Review Sign-off_ above); Slice 3 (#758) closed; Slices 4 + 6 not yet filed; Slice 4 blocked on #754. Value-delivery follow-ups split out to #760 |
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Low — body reconciled with `master` 2026-05-16 (audit comment pinned); search-provider ACL explicitly out-of-scope; de-scoped from the **Search + Finding Entries** label 2026-05-18 (ACL epic, not search-UX); refactor intentionally not started |
| #738 | NCM/import conversion metrics — aggregate by structured `kind`, trend | Low — **unblocked** by #728 S3 (structured `kind` codes now exist); observability follow-up, reuses MetricsManager/OTLP |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images (security+size) | Low — #728 Phase-2 hardening split-out; config-gated, adds sharp/libvips; do when a real driver appears |
| #736 | `config/app-default-config.json` documentation | Low — filed 2026-05-17; doc task; large config surface incl. new NCM keys |
| #729 | Improvements to `[{Location}]` | Low — filed 2026-05-16; good-first-issue; Location plugin follow-ups |
| #744 | [EPIC] Search-picker IA simplification | **CLOSED** — all slices shipped: #735 (2-row toolbar v3.22.0), #720 (format facets), #745 (date v3.21/3.23), #691 (Category multi-select **v3.25.0** — final residual). #721 closed (collapse obsolete). Nothing left |
| #691 | Asset-picker: Category multi-select for source=Pages | **Fixed v3.25.0** (`a4d60c35`) — `in review` label no longer set (operator dropped 2026-05-20); presumed accepted. Closes out the #744 EPIC residual |
| #754 | Page-model `created` timestamp (creation-date search/sort) | Low/Medium — split from closed #643 (modified-date shipped v3.22.0). Gated by a per-page schema change + ~17K-page backfill migration; own focused effort. Unblocks `dateField=created` in SearchPlugin + the #745 asset-picker date control |
| #722 | Video poster-frame thumbnails (ffmpeg) | Low — related to #744 (better video tiles make the video filter useful) but **not a child**: result presentation + adds ffmpeg dep. #731 shipped v3.16.0; fills the video thumbnail cell |
| #707 | Typed footnote + knowledge-graph reference index | Low — speculative; **depends on #706**; defer behind a named citation-heavy user (2026-05-16 brainstorm) |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — sharpened to field+enum+badge; **foundational, blocks #707**; design in `docs/planning/ideas/llm-wiki-pattern.md` |
| #689 | Admin show/edit frontmatter | Low |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Lever 3 follow-up from the Domain Addon Deployment cluster |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks bespoke ingestion in any satellite |
| #684 | Route-test infra hardening | Low — E2E compensates; opportunistic |
| #681 | Deployment options hub + per-mode guides | Body content complete; further iteration optional |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |
| #655 | `.env`-style env loading via ConfigMap/Secret in k8s docs | Low |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- **Closed/resolved items are removed, not archived here.** The durable trail lives in `docs/project_log.md` and the GitHub issue history.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
