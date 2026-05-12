---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-12T00:00:00.000Z'
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
| #667 | vitest globals missing from tsconfig types → 171 TS errors in tests |
| #662 | Invalid system-category "User Pages" |
| #661 | Profile Page (/profile) |
| #660 | Agent and ./docs documentation |
| #653 | 'Using FormPlugin' page missing |
| #650 | Change Author of some pages |
| #622 | WikiRoutes.coverage3.test.ts intermittent timeout |
| #606 | /attachments/browse sort order |
| #605 | /attachments/browse vs /search inconsistency |
| #599 | showdown ReDoS — no upstream patch (mitigation only) |

## Operator-decision carryover

Items awaiting a yes/no/close from the operator. Not blocking other work.

*Carryover cleared 2026-05-12: #671 closed (resolved by #680+#681), #674 closed (superseded by #681), #682 closed with Lever 3 lifted to #686.*

No items awaiting decision.

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the six geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#41](https://github.com/jwilleke/geohazardwatch/issues/41) | bug | auto-tag.yml has no rebase-on-conflict | Hit live during today's #37+#38 PR merges. Fix sketched. Pattern applies to any auto-tag consumer. |
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Not "TODO" exactly — these are filed, scoped, and awaiting prioritization or implementation cycles.

| # | Topic | Priority hint |
|---|---|---|
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks bespoke ingestion in any satellite |
| #684 | Route-test infra hardening | Low — E2E compensates; opportunistic |
| #683 | (merged) `@opentelemetry/exporter-prometheus` bump | — |
| #682 | Domain Addon Deployment — Lever 3 outstanding | See operator decision above |
| #681 | Deployment options hub + per-mode guides | Body content complete; further iteration optional |
| #680 | (closed) Self-hosted Renovate end-to-end | — |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |
| #665 | Insert page into another page | Low |
| #655 | `.env`-style env loading via ConfigMap/Secret in k8s docs | Low |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
