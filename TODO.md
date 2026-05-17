---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-17T23:59:00.000Z'
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

4 open as of 2026-05-17. **No actionable bug left without operator input** — #741/#739/#740 closed earlier; #742 ("All sources" aggregation) implemented & shipped in **v3.19.0**, awaiting operator close. Remaining: #735 needs repro, #724 is `help wanted`/awaiting decision, #660/#599 non-actionable carry-forwards.

| # | Title |
|---|---|
| #735 | `/search` fails on Mobile — filed 2026-05-16; **body still empty, needs repro detail** (device/OS/browser, exact failure, desktop comparison). Not yet actionable without repro |
| #724 | `NGDPBASE-test-*` files linger after test runs (recurring) — test teardown not cleaning created pages; `help wanted`/testing. Note global rule: never delete live `data/` in teardown — fix must scope-delete only test-created subdirs |
| #660 | Agent and ./docs documentation — tooling shipped; 49 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); tracked by Dependabot #96 |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- **#742** — `/search` "All sources" aggregation. Implemented per operator-approved A(i)+B(ii), shipped in **v3.19.0** (commit `822cf876`), propagated to all satellites. Fully resolves the reported gap; left open for operator close per workflow.
- **#735** — `[BUG] /search fails on Mobile`, empty body. Awaiting operator repro detail (device/OS/browser, exact failure, desktop comparison) before it can be triaged.
- **#724** — recurring `NGDPBASE-test-*` test-file lingering, labelled `help wanted`. Awaiting decision/assignment; the fix touches test teardown (must only scope-delete test-created subdirs, never the live `data/` tree).

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
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Low — body reconciled with `master` 2026-05-16 (audit comment pinned); search-provider ACL now explicitly out-of-scope; `stash@{0}` is a reference, no longer `git stash pop`-clean. Refactor intentionally not started |
| #738 | NCM/import conversion metrics — aggregate by structured `kind`, trend | Low — **unblocked** by #728 S3 (structured `kind` codes now exist); observability follow-up, reuses MetricsManager/OTLP |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images (security+size) | Low — #728 Phase-2 hardening split-out; config-gated, adds sharp/libvips; do when a real driver appears |
| #736 | `config/app-default-config.json` documentation | Low — filed 2026-05-17; doc task; large config surface incl. new NCM keys |
| #729 | Improvements to `[{Location}]` | Low — filed 2026-05-16; good-first-issue; Location plugin follow-ups |
| #722 | Video poster-frame thumbnails (ffmpeg) | Low — substantial; adds ffmpeg dep. #731 shipped v3.16.0; this fills the video thumbnail cell in its list/card rows |
| #721 | Asset-picker advanced filters: capture-date for video + collapse into disclosure | Low — filter-input axis; backend video `dateTimeOriginal` indexing + UI tidy |
| #720 | Asset-picker format dropdown: separate Video/Audio from Other | Low — filter-input axis; smallest standalone asset-picker win; mirrors existing Images filter |
| #691 | Asset-picker page filter UI (source=Pages) | Low — filter-input axis; #716/#731 (presentation) shipped v3.16.0; the remaining page filter-input piece |
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
