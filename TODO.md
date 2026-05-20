---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-20T17:30:00.000Z'
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

## Open BUGS (ngdpbase, by issue #)

4 open as of 2026-05-20 (#752 closed — operator confirmed the v3.24.4 InsertPlugin guard; #748/#751 previously closed). #753 = deferred core MarkupParser fix. #749 pairs with #599; #660 non-actionable. No untriaged functional bug remains.

| # | Title |
|---|---|
| #753 | **MarkupParser** leaks `data-jspwiki-placeholder` spans for CommonMark variable-length backtick code spans (```` ``` ````); the inner ` ``` ` is mis-detected as a fence and cascade-corrupts placeholder restore (e.g. `/view/Using InsertPlugin`). Interim doc reword shipped v3.24.4; **core fix open** — high-blast-radius `MarkupParser.ts`, own focused session (full unit+E2E+multi-page render) |
| #749 | Showdown CVE-2024-1899 patch check — filed 2026-05-19; recurring tracking task to re-check for an upstream `showdown` patch (pairs with #599 / Dependabot GHSA-rmmh-p597-ppvv). Not a code bug |
| #660 | Agent and ./docs documentation — tooling shipped; 49 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); tracked by Dependabot / #749 |

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
| #755 | [EPIC] Metadata schemas ratified — schema.org-shaped CreativeWork model + JSON-LD linked-data publishing (6 slices) | **NEW 2026-05-20** — filed today; `docs/schemas.md` now `status: ratified`; closes Q4/Q5/Q8. Sub-issues filed: **#756 Slice 1 (CatalogManager audit)** + **#757 Slice 2 (`src/types/Schema.ts`)** — both prep work, can run in parallel. Slices 3–6 to be filed when predecessors land; Slice 4 blocked on #754 |
| #756 | Slice 1 of #755 — CatalogManager audit: docs + minimum-API recommendation | **NEW 2026-05-20** — prep work, no production code. Side benefit: chips a row off #660's doc-stub list (CatalogManager.md doesn't exist today) |
| #757 | Slice 2 of #755 — `src/types/Schema.ts`: CreativeWork + subtypes + per-source mapper signatures | **NEW 2026-05-20** — prep work, no consumer wired in. Blocks Slices 3–6. Can run in parallel with #756 |
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Low — body reconciled with `master` 2026-05-16 (audit comment pinned); search-provider ACL explicitly out-of-scope; de-scoped from the **Search + Finding Entries** label 2026-05-18 (ACL epic, not search-UX); refactor intentionally not started |
| #738 | NCM/import conversion metrics — aggregate by structured `kind`, trend | Low — **unblocked** by #728 S3 (structured `kind` codes now exist); observability follow-up, reuses MetricsManager/OTLP |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images (security+size) | Low — #728 Phase-2 hardening split-out; config-gated, adds sharp/libvips; do when a real driver appears |
| #736 | `config/app-default-config.json` documentation | Low — filed 2026-05-17; doc task; large config surface incl. new NCM keys |
| #729 | Improvements to `[{Location}]` | Low — filed 2026-05-16; good-first-issue; Location plugin follow-ups |
| #744 | [EPIC] Search-picker IA simplification | **CLOSED** — all slices shipped: #735 (2-row toolbar v3.22.0), #720 (format facets), #745 (date v3.21/3.23), #691 (Category multi-select **v3.25.0** — final residual). #721 closed (collapse obsolete). Nothing left |
| #691 | Asset-picker: Category multi-select for source=Pages | **Fixed v3.25.0** (`a4d60c35`) — `in review` label no longer set (operator dropped 2026-05-20); presumed accepted. Closes out the #744 EPIC residual |
| #750 | Index video capture-date (CreateDate/MediaCreateDate/CreationDate) | **Fixed v3.25.1** (`97089601`) — `in review`. Shared `CAPTURE_DATE_FIELDS` constant + `extractDateTimeOriginal` helper; videos now populate the indexed timestamp instead of dropping out of date sort/filter. Optional `media.rebuild` back-fills existing items. (Prior #519/#518 cross-refs were stale — both CLOSED; #750 stands alone) |
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
