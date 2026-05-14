---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-14T00:00:00.000Z'
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
| #662 | Invalid system-category "User Pages" — **original repro fixed**; awaiting operator close (`9b977473` demote-not-delete shipped, comment posted 2026-05-14) |
| #660 | Agent and ./docs documentation — **initial pass + mass-conversion shipped 2026-05-14** (`fd5c80f9` + `8b15ffbc`: index refresh, frontmatter policy + lint hook, all 50 managers/plugins/providers docs now compliant); 49 lint warnings remain for source-only modules (stub-creation work) |
| #622 | WikiRoutes.coverage3.test.ts intermittent timeout |
| #599 | showdown ReDoS — no upstream patch (mitigation only) |

*Closed 2026-05-13: #704 (protobufjs), #708 (/search default), #701 (/save/Molly migration script), #699 + #700 (asset-search capped flag + sort), #697 (/create Private + Author-lock toggles), #665 (insert page — operator close), **#711 (ACLManager creator drift — minimal fix `7c52c4c2`; larger refactor parked as #714 epic)**, #712 + #713 (access-control follow-ups). Six-slice access-control arc finished (private → author-lock → audience → role permissions docs); see project_log 2026-05-13-07 through -14 for the slice trail.*

*Closed 2026-05-14: Dependabot PR #715 merged (`3c24a9bc`) bumping `systeminformation` 5.31.1 → 5.31.6, fixing high-severity alert #114 (Linux command injection via NetworkManager profile names). **#690 (`/contact` CSRF field-name mismatch, `1d9d2b91`)** — `views/contact.ejs` and `src/parsers/handlers/WikiFormHandler.ts` both emitted `_csrfToken` while csrf middleware reads `_csrf`; one-char fix in each, two test updates. **#710 (audience picker accepts usernames, `6e8fa1b0`)** — new vanilla typeahead widget + EJS partial alongside the existing role-checkbox dropdown in /edit and /create. Operator follow-up shipped on **#662** (`9b977473`): profile-rename flow now demotes the old page to general instead of hard-deleting (issue still open pending operator close — original repro is fixed by #661 + data cleanup).*

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
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Medium — prototyped during #711 session, parked due to test-mock churn. WIP in `git stash@{0}`. |
| #707 | Typed footnote syntax + knowledge-graph reference index | Low — speculative; companion to #706 |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — speculative; design captured in `docs/planning/ideas/llm-wiki-pattern.md` |
| #705 | Perf baseline: warm cache or median-of-N | Low — quality-of-life for benchmark accuracy |
| #691 | Surface page-specific filter UI in asset-picker (source=Pages) | Low |
| #689 | Admin show/edit frontmatter | Low |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Lever 3 follow-up from the Domain Addon Deployment cluster |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks bespoke ingestion in any satellite |
| #684 | Route-test infra hardening | Low — E2E compensates; opportunistic |
| #681 | Deployment options hub + per-mode guides | Body content complete; further iteration optional |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |
| #655 | `.env`-style env loading via ConfigMap/Secret in k8s docs | Low |

## Access-control arc — follow-up issues filed 2026-05-13

The six-slice access-control arc surfaced four follow-up items. As of 2026-05-14, three are closed and one remains open:

| # | State | Type | Topic |
|---|---|---|---|
| #710 | open | enhancement | Audience picker accepts usernames, not just roles (UI gap with Page Audience doc) |
| #711 | closed | bug | ACLManager Tier-0 creator drift — fixed `7c52c4c2`; larger refactor parked as #714 epic |
| #712 | closed | bug | /save handler legacy `user-keywords:[private]` fallback removed |
| #713 | closed | bug | `_comment_roles` schema doc corrected |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
