---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-16T00:00:00.000Z'
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

4 open as of 2026-05-16 (#724 closed — e2e cleanup hardened `c2d25d77` + 48-page backlog cleared).

| # | Title |
|---|---|
| #716 | Page Card Summary — empty page result cards. Brainstormed 2026-05-16; **largely subsumed by #731** (list-view default shows page metadata natively). Narrowed to card-mode page enrichment, de-prioritized behind #731 |
| #660 | Agent and ./docs documentation — index refresh + frontmatter policy + lint + auto-gen index all shipped; 49 lint warnings remain for source-only modules (stub-creation work) |
| #622 | WikiRoutes.coverage3.test.ts intermittent timeout — deferred; recurs as a full-suite-concurrency timeout (2026-05-16 datapoint added from `WikiRoutes.contact.test.ts`) |
| #599 | showdown ReDoS — no upstream patch (mitigation only) |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- None open. (#724 triaged, fixed `c2d25d77`, backlog cleared, and closed 2026-05-16. No items currently awaiting a yes/no/close.)

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
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Medium — prototyped during #711 session, parked due to test-mock churn. WIP in `git stash@{0}`. |
| #731 | Asset-picker / search: list view as default for all result types, card/grid toggle | Medium — operator-decided 2026-05-16; **subsumes #716**; soft-deps #722; parallel to #691/#720/#721 |
| #728 | ngdp Compatible Markdown | Low — filed 2026-05-16; architecture; markdown-compat scoping |
| #729 | Improvements to `[{Location}]` | Low — filed 2026-05-16; good-first-issue; Location plugin follow-ups |
| #722 | Video poster-frame thumbnails (ffmpeg) | Low — substantial; adds ffmpeg dep. Feeds #731's list/card thumbnail cell |
| #721 | Asset-picker advanced filters: capture-date for video + collapse into disclosure | Low — filter-input axis; backend video `dateTimeOriginal` indexing + UI tidy |
| #720 | Asset-picker format dropdown: separate Video/Audio from Other | Low — filter-input axis; mirrors existing Images filter |
| #691 | Asset-picker page filter UI (source=Pages) | Low — filter-input axis (page-side counterpart to #720/#721); complements #716/#731 |
| #707 | Typed footnote + knowledge-graph reference index | Low — speculative; **depends on #706**; defer behind a named citation-heavy user (2026-05-16 brainstorm) |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — sharpened to field+enum+badge; **foundational, blocks #707**; design in `docs/planning/ideas/llm-wiki-pattern.md` |
| #705 | Perf baseline: warm cache or median-of-N | Low — quality-of-life for benchmark accuracy |
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
