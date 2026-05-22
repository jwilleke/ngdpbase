---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-22T13:30:00.000Z'
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

_(none)_ — operator confirmed and closed today's four shipped issues (**#754**, **#772**, **#773**, **#774**) as they landed across v3.33.0 → v3.36.0. Durable trail in `docs/project_log.md` and the GitHub issue history.

## Open BUGS (ngdpbase, by issue #)

2 open as of 2026-05-22 (unchanged from 2026-05-21 — both are perma-open backlog items). Remaining: #660 cosmetic doc-stub backlog, #599 mitigation-only CVE with no upstream patch.

| # | Title |
|---|---|
| #660 | Agent and ./docs documentation — tooling shipped; 48 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); recurring patch-check workflow last ran green 2026-05-21; next scheduled check Tuesday 09:23 UTC |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- _(none)_ — #754 (page `created` timestamp + 17K-page backfill) shipped v3.33.0 and **#774** (`dateField=created`) shipped v3.36.0; together they deliver the half of **#643** that was deferred at v3.22.0. The full creation-date search axis is now wired end-to-end. No operator-decision items outstanding.

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Not "TODO" exactly — these are filed, scoped, and awaiting prioritization or implementation cycles.

### Recently closed (2026-05-22, the 4-release day)

EPIC **#755** "Metadata schemas ratified — schema.org-shaped CreativeWork model" — **functionally complete** (5 of 6 slices shipped). EPIC **#760** "Deliver operator-visible value on the #755 plumbing" — **functionally complete** (8 of 10 items shipped; remainder either deferred until a consumer surfaces or covered by the route refactor under #773). Closed today:

| # | Released | Summary |
|---|---|---|
| #754 | v3.33.0 | Page-model `created` timestamp + 17,654-page backfill |
| #772 | v3.34.0 | PageManager as CatalogSource (Slice 4 of #755) |
| #773 | v3.35.0 | Unified page→JSON-LD via the new CatalogSource path |
| #774 | v3.36.0 | `SearchCriteria.dateField=created` — closes the deferred half of #643 |

EPIC #755 + EPIC #760 are both fully delivered at the design level. Remaining downstream pieces (asset-picker date control, `created` sort key, search-index Lunr/ES uniformity) are real UX work, not bookkeeping — file fresh issues if/when a driver appears.

### Still in flight (low priority, no driver pushing them)

| # | Topic | Priority hint |
|---|---|---|
| #714 | [EPIC] Unified access-control evaluator — `wikiContext.canAccess` as single facade | Low — body reconciled with `master` 2026-05-16; search-provider ACL explicitly out-of-scope; refactor intentionally not started |
| #738 | NCM/import conversion metrics | Low — **unblocked** by #728 S3 (structured `kind` codes now exist); observability follow-up |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images | Low — adds sharp/libvips; do when a real driver appears |
| #736 | `config/app-default-config.json` documentation | Low — large config surface incl. new NCM keys |
| #729 | Improvements to `[{Location}]` | Low — good-first-issue; Location plugin follow-ups |
| #722 | Video poster-frame thumbnails (ffmpeg) | Low — better video tiles; adds ffmpeg dep |
| #707 | Typed footnote + knowledge-graph reference index | Low — **depends on #706**; speculative |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — sharpened to field+enum+badge; **foundational, blocks #707** |
| #689 | Admin show/edit frontmatter | Low |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Domain Addon Deployment Lever 3 |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks geohazardwatch data-source imports |
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
