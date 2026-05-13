---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-13T00:00:00.000Z'
slug: ngdpbase-todo
---

# Project Development TODO

Current near-term priorities for ngdpbase and the sister sites tracked by `/othersites`. Maintained as a snapshot — for the live state run `/check-todos`. Stale rows pruned regularly.

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

| # | Title |
|---|---|
| #701 | /save/Molly |
| #699 | /api/assets/search?types=user — UserManager.searchUsers cap at 200 silently truncates |
| #697 | /create |
| #690 | /contact yields "Forbidden — invalid CSRF token" |
| #662 | Invalid system-category "User Pages" (legacy data still carries it on disk) |
| #660 | Agent and ./docs documentation |
| #622 | WikiRoutes.coverage3.test.ts intermittent timeout |
| #599 | showdown ReDoS — no upstream patch (mitigation only) |

*#704 (protobufjs — 8 Dependabot alerts) closed 2026-05-13 via PRs #702 + #703 (`376ffbc4`, `f75347d8`). Open alert count 9 → 1.*

## Operator-decision carryover

Items awaiting a yes/no/close from the operator. Not blocking other work.

No items awaiting decision.

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the six geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#43](https://github.com/jwilleke/geohazardwatch/issues/43) | enhancement | Migrate eslint config to flat-config format | Prerequisite for eslint 9+/10 bumps. Renovate rule added to defer eslint majors until done. Low priority — eslint 8 still works. |
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Not "TODO" exactly — these are filed, scoped, and awaiting prioritization or implementation cycles.

| # | Topic | Priority hint |
|---|---|---|
| #707 | Typed footnote syntax + knowledge-graph reference index | Low — speculative; companion to #706 |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — speculative; design captured in `docs/planning/ideas/llm-wiki-pattern.md` |
| #705 | Perf baseline: warm cache or median-of-N | Low — quality-of-life for benchmark accuracy |
| #700 | Wire backend sort for `/api/assets/search?types=page` and `?types=user` | Medium — natural pair to #699 |
| #691 | Surface page-specific filter UI in asset-picker (source=Pages) | Low |
| #689 | Admin show/edit frontmatter | Low |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Lever 3 follow-up from the Domain Addon Deployment cluster |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks bespoke ingestion in any satellite |
| #684 | Route-test infra hardening | Low — E2E compensates; opportunistic |
| #681 | Deployment options hub + per-mode guides | Body content complete; further iteration optional |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |
| #665 | Insert page into another page | `in review` — only item carrying the label |
| #655 | `.env`-style env loading via ConfigMap/Secret in k8s docs | Low |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
