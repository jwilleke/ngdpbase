---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-19T09:40:00.000Z'
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

| Source | # | Severity | Status |
|---|---|---|---|
| Dependabot | #96 | medium | `showdown` ReDoS; tracked in #599; no upstream patch — mitigation only |

## Open BUGS (ngdpbase, by issue #)

5 open as of 2026-05-19 (#735 & #747 **closed**). #724 durable fix **shipped v3.24.0** (awaiting operator confirm + per-satellite Rebuild). New: #748, #749. #660/#599 non-actionable carry-forwards.

| # | Title |
|---|---|
| #749 | Showdown CVE-2024-1899 patch check — filed 2026-05-19; tracking task to re-check for an upstream `showdown` patch (pairs with #599 / Dependabot #96). Not yet triaged |
| #748 | `[{Insert page='...', 'caption='...'}]` — filed 2026-05-19; InsertPlugin parsing/usage bug. Not yet triaged |
| #724 | Deleted/test pages lingered in **search index** ("ghosts"). Root-caused (NOT a delete bug — disk delete is clean; the Lunr `buildIndex` fast-path never reconciled vs disk). **Fixed v3.24.0** (`83ff04bb`): true `pages.rebuild` + Admin → Page Management → **Rebuild Pages** (mirror of media Rebuild). jimstest 53 ghosts→0. Open: operator confirm + click Rebuild Pages on each satellite (own pre-fix backlog) |
| #660 | Agent and ./docs documentation — tooling shipped; 49 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); tracked by Dependabot #96 / #749 |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- **#643** — SearchPlugin date filter. Modified-date half **released v3.22.0**; `created` / `dateField=created` half infeasible without a page-model change (1/116 pages carry a creation timestamp). Operator call: split off `created` as a separate page-model issue, or accept modified-only and close.
- **#724** — durable fix shipped v3.24.0 (true Rebuild Pages; jimstest backlog purged 53→0). Awaiting operator: confirm ghosts gone, and click **Admin → Page Management → Rebuild Pages** on each satellite (fairways/veg/temp) to clear their own pre-fix backlogs. Then closeable.

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
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Low — body reconciled with `master` 2026-05-16 (audit comment pinned); search-provider ACL explicitly out-of-scope; de-scoped from the **Search + Finding Entries** label 2026-05-18 (ACL epic, not search-UX); refactor intentionally not started |
| #738 | NCM/import conversion metrics — aggregate by structured `kind`, trend | Low — **unblocked** by #728 S3 (structured `kind` codes now exist); observability follow-up, reuses MetricsManager/OTLP |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images (security+size) | Low — #728 Phase-2 hardening split-out; config-gated, adds sharp/libvips; do when a real driver appears |
| #736 | `config/app-default-config.json` documentation | Low — filed 2026-05-17; doc task; large config surface incl. new NCM keys |
| #729 | Improvements to `[{Location}]` | Low — filed 2026-05-16; good-first-issue; Location plugin follow-ups |
| #744 | [EPIC] Search-picker IA simplification — consolidate `/search` asset-picker controls (sist2-style) | **Medium — actively driven (operator, 2026-05-18).** Children: #721 (slice 1 = Advanced disclosure, design decided), #720 (Video/Audio format options), #691 (Pages filter UI). Pure IA/markup, behaviour-preserving; one slice per PR. Out of scope: #550 / AI / semantic, #643 (SearchPlugin), #722 (presentation). Mobile-parity dependency (#735) **resolved v3.22.0** — asset-picker toolbar is now responsive (2-row panel) |
| #745 | Real date search in the asset-picker (asset capture-date range only) | **Low — blocked on #519.** Media-year shipped v3.21.0; **pages-date shipped v3.23.0** (filters-row Since/Until → `SearchCriteria.dateRange`). Only remaining scope is a precise asset *capture-date* range (EXIF/mtime), which needs provider-side date filtering = **#519**. Stays open until #519 lands |
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
