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

2 open as of 2026-05-16 (post-v3.16.0). Closed this session: #716 (subsumed by #731), #724 (`c2d25d77` + backlog), #622 (operationally resolved via runner retry `7328c0ae`), plus the #709/#727/#723/#717/#718/#719 arc. Neither remaining bug is an actionable defect.

| # | Title |
|---|---|
| #660 | Agent and ./docs documentation — tooling shipped; 49 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); tracked by Dependabot #96 |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- None open. All 2026-05-16 carryover (#716/#724/#622/#725/#730/#731/#705/#733) resolved + closed; nothing currently awaiting a yes/no/close.

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
| #728 | ngdp Compatible Markdown | Low — filed 2026-05-16; architecture; markdown-compat scoping |
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
