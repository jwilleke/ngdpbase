---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-05-25T08:15:00.000Z'
slug: ngdpbase-todo
---

# Project Development TODO

Current near-term priorities for ngdpbase and the sister sites tracked by `/othersites`. Maintained as a snapshot of **open** work — closed/resolved items are not retained here (see `docs/project_log.md` and the GitHub issue history for the trail). For the live state run `/check-todos`.

**See also**: [`docs/architecture-threads.md`](./docs/architecture-threads.md) maps in-flight cross-cutting design threads (CatalogManager unification, NCM pipeline, JSON-LD render, Journal reconcile, ACL evaluator, system principal, addon platform) — issues here that belong to a thread are listed there with their dependency context. Use TODO.md for "what's open and how to prioritise"; use architecture-threads.md for "how do these issues relate to each other."

**Latest release**: v3.41.1 (2026-05-25; patch, deferred GitHub Release) — 13 commits bundled including #788, #689, #649-Phase-1, #778-Slice-1, #722-Slice-1, plus #791 doc trail.

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

## Waiting on Review Sign-off

Items carrying the `in review` label — work is shipped/merged; operator verification is the only thing left before close. **Clear this list before starting new feature work.**

- _(none)_

## Open BUGS (ngdpbase, by issue #)

| # | Title |
|---|---|
| #660 | Agent and ./docs documentation — 48 doc-stub warnings remain for source-only modules (stub-creation backlog; cosmetic, non-blocking) |
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); weekly patch-check workflow watches for a fix |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- _(none)_

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Filed and scoped, awaiting prioritization or implementation cycles.

| # | Topic | Priority hint |
|---|---|---|
| **#790** | **[EPIC] Journal addon — reconcile with generic page primitives** (filed 2026-05-24 from #789 debug). Retire the journal addon's parallel implementations of editor/save/index/templates/tags/mood/date/storage-routing in favor of thin UI specializations over generic page primitives. Two sub-issues filed: **#791** (config-driven JSON-LD `@type` via new `ngdpbase.schema-types` block — design finalized 2026-05-25, doc trail in `docs/schemas.md`) and **#792** (SchemaGenerator reconciliation — blocker for #791). Foundation work that also unblocks #786. | Medium — implementation order: #792 Phase 1 → #791 → register `journal` category → ProfilePage `@graph` for `user-profile`. |
| #786 | Auto-journal — digester consuming CatalogManager records into journal entries | Gated by #685 + EPIC #790. Consumer-pattern; no source-specific code |
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images | Low — adds sharp/libvips; do when a real driver appears |
| #707 | Typed footnote + knowledge-graph reference index | Low — **depends on #706**; speculative |
| #706 | `knowledge-role` frontmatter field — opt-in page role | Low — sharpened to field+enum+badge; **foundational, blocks #707** |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Domain Addon Deployment Lever 3 (Thread #7 in `docs/architecture-threads.md`) |
| #631 | System/service principal model for non-request code paths | Low — Thread #6 in `docs/architecture-threads.md`; forward-compat hooks landed in #738 |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks geohazardwatch data-source imports. **Pairs with #501** — the JSON→NCM serializer is #685's rendering counterpart; pick them up together when a driver appears. |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |
| #501 | JSON → ngdp Compatible Markdown serializer (re-scoped 2026-05-17 from "JSON → HTML") | Deferred — dependency #728 (NCM spec/normalizer) shipped, but **no driver today**. **Pairs with #685**: #685 is the mandatory downstream consumer (fetch/schedule) and hasn't started; #501 is the render-to-page-body counterpart. Picking up #501 in isolation risks designing the API around the inline-plugin consumer and refactoring when #685 lands. Pick them up together. Four architectural questions still open (template DSL, fetch policy, template storage, ImportManager integration shape) — a Decisions doc would unblock implementation when the driver appears. |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- **Closed/resolved items are removed, not archived here.** The durable trail lives in `docs/project_log.md` and the GitHub issue history.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
