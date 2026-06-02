---
title: ngdpbase Development TODO
category: System
user-keywords:
- todo
- planning
- roadmap
uuid: 124f3d52-75a0-4e61-8008-de37d1da4ef6
lastModified: '2026-06-02T00:00:00.000Z'
slug: ngdpbase-todo
---

# Project Development TODO

Current near-term priorities for ngdpbase and the sister sites tracked by `/othersites`. Maintained as a snapshot of **open** work — closed/resolved items are not retained here (see `docs/project_log.md` and the GitHub issue history for the trail). For the live state run `/check-todos`.

**See also**: [`docs/architecture-threads.md`](./docs/architecture-threads.md) maps in-flight cross-cutting design threads (CatalogManager unification, NCM pipeline, JSON-LD render, Journal reconcile, ACL evaluator, system principal, addon platform) — issues here that belong to a thread are listed there with their dependency context. Use TODO.md for "what's open and how to prioritise"; use architecture-threads.md for "how do these issues relate to each other."

**Latest release**: v3.47.1 (2026-06-02; patch, GH Release deferred) — shipped **#808** partial year-only capture-date policy: year-only EXIF stays defaulted to Jan 1 but is now surfaced at **WARN** (was a silent fabrication), and genuinely undated files move to **ERROR**. jimstest GREEN at v3.47.1 (6130 unit, +7 tests); **patch → no `/othersites` propagation**, so satellites (fairways-base, ngdp-temp-builds) remain at **v3.47.0** until the next minor. Prior: v3.47.0 (2026-06-02; minor) shipped **#809** filename→capture-date fallback (`captureDateSource` provenance marker).

Sister sites in scope:

- `fairways-base` — checkout of `jwilleke/ngdpbase` (port 2121, "The Fairways")
- `ngdpbase` (this repo) — port 3000, "jimstest"
- `ngdp-temp-builds` — local builds, no separate issue tracker
- `geohazardwatch` — separate repo at `jwilleke/geohazardwatch`, real satellite with its own issues

All three local checkouts share `jwilleke/ngdpbase` as their git remote — their issues ARE this repo's issues. (`ngdpbase-veg` / "ve-geology" was retired 2026-05-25; port 3333 is now served by `GeoHazardWatch`, a separate satellite tracked by its own repo.)

## Security

Dependabot live state: **1 open alert** on the main repo — #96 `showdown` (medium, GHSA-rmmh-p597-ppvv = CVE-2024-1899), the mitigation-only item tracked under #599 below (no upstream patch to apply, so it cannot be cleared). geohazardwatch and fairways-gen2-website: **0 open**. Note: the unfiltered `dependabot/alerts` query returns only the first page (newest first) and hides #96 behind newer auto-dismissed alerts — use `?state=open&per_page=100` to see it.

| Source | Package | Severity | Status |
|---|---|---|---|
| Manual / #599 | `showdown` | medium (CVE-2024-1899) | ReDoS in markdown link parser; **no upstream patch**. Weekly `Showdown CVE-2024-1899 Patch Check` workflow watches for one — fixed in #749 (`4c9f9a17`); last two scheduled runs (2026-05-21, 2026-05-26) GREEN. Will auto-comment on #599 when upstream lands a fix. |

## Waiting on Review Sign-off

Items carrying the `in review` label — work is shipped/merged; operator verification is the only thing left before close. **Clear this list before starting new feature work.**

- _(none)_ — #809 (filename→date fallback, v3.47.0) and #808 (missing MM/dd → WARN, no date → ERROR, v3.47.1) verified and **closed** 2026-06-02.

## Open BUGS (ngdpbase, by issue #)

| # | Title |
|---|---|
| #599 | showdown ReDoS (CVE-2024-1899) — no upstream patch (mitigation only); weekly patch-check workflow watches for a fix |

## Operator-decision carryover

Items awaiting a yes/no/close or operator-only action. Not blocking other work.

- _(none)_

## Sister-site top priorities — combined table

Top items across the sister-site issue trackers. Excludes Dependency Dashboard noise and items fully tracked under ngdpbase issues (e.g., the geohazardwatch data-import issues all roll up to ngdpbase #685).

| Repo | # | Type | Title | Notes |
|---|---|---|---|---|
| geohazardwatch | [#66](https://github.com/jwilleke/geohazardwatch/issues/66) | bug | Renovate still not auto-bumping ngdpbase base image after #62 | Dockerfile dep extracted but no PR opened. Satellite-local CI/infra issue. |
| geohazardwatch | [#7](https://github.com/jwilleke/geohazardwatch/issues/7) | enhancement | Import: VolcanoDiscovery RSS | Flagged as the suggested first reference consumer for the ngdpbase #685 data-ingestion framework. |
| geohazardwatch | [#4](https://github.com/jwilleke/geohazardwatch/issues/4), [#5](https://github.com/jwilleke/geohazardwatch/issues/5), [#6](https://github.com/jwilleke/geohazardwatch/issues/6), [#13](https://github.com/jwilleke/geohazardwatch/issues/13), [#36](https://github.com/jwilleke/geohazardwatch/issues/36) | enhancement | Other data-source imports | All cross-referenced to ngdpbase #685. Can ship bespoke or wait for framework. |

## Notable feature work in flight (ngdpbase)

Filed and scoped, awaiting prioritization or implementation cycles. (Items carrying the `deferred` GitHub label are listed separately below.)

| # | Topic | Priority hint |
|---|---|---|
| #786 | Auto-journal — digester consuming CatalogManager records into journal entries | Gated by #685. (#790 closed 2026-05-28, removing one of the gates.) Consumer-pattern; no source-specific code |
| #686 | AddonsManager: auto-enable bundled addons in non-default addons-path dirs | Low — Domain Addon Deployment Lever 3 (Thread #7 in `docs/architecture-threads.md`) |
| #685 | Data-ingestion framework (platform addon) | Low / Future — 2-4 weeks platform work; unblocks geohazardwatch data-source imports. **Pairs with #501** — the JSON→NCM serializer is #685's rendering counterpart; pick them up together when a driver appears. |
| #675 | Scaffolder + reference template for new addons | Low |
| #673 | Packaged addon distribution model (npm install) | Low — affects how #685 ships |

## Deferred (`deferred` GitHub label)

Parked work — visible but not actionable. Driven by the `deferred` label in GitHub (the live source of truth; run `/check-todos`). These move out only on an explicit operator go-ahead or when a concrete driver appears — they are never a "recommended next move".

| # | Topic | Parked because |
|---|---|---|
| #737 | NCM Phase-2: transcode/re-encode fetched embedded images | Adds sharp/libvips; do when a real driver appears |
| #707 | Typed footnote + knowledge-graph reference index | **#706 dependency now satisfied (v3.46.0)** but still speculative (the LLM citation workflow "isn't proven for teams or institutions" per the 2026-05-16 brainstorm); revisit only if a real citation-heavy driver materializes. 4-6h scope. |
| #645 | PathPreflight: extend coverage to /mnt/tank/<share>/... autofs paths | No driver; current PathPreflight coverage is sufficient for live paths |
| #631 | System/service principal model for non-request code paths | Foundation in place (#625/#738) but no live breakage and no driver — jobs do no internal permission checks, routes gate admin before enqueue. Parked until a scheduler that acts-as-user or an audit system-vs-user requirement appears. |
| #501 | JSON → ngdp Compatible Markdown serializer (re-scoped 2026-05-17 from "JSON → HTML") | Dependency #728 (NCM spec/normalizer) shipped, but **no driver today**. **Pairs with #685**: #685 is the mandatory downstream consumer and hasn't started; #501 is the render-to-page-body counterpart. In isolation risks designing the API around the inline-plugin consumer and refactoring when #685 lands — pick them up together. Four architectural questions still open (template DSL, fetch policy, template storage, ImportManager integration shape). |
| #448 | AuthManager: Passkey / WebAuthn auth provider | New auth provider (architectural); adds simplewebauthn. No driver |
| #423 | Asset Manager: additional storage providers (S3, Google Drive, plugin-contributed) | New storage providers (architectural). No driver |
| #421 | AuthManager: TOTP / 2FA auth provider | New auth provider (architectural); adds otpauth. No driver |

## How this file is maintained

- Updated when meaningful additions or closes happen during work sessions.
- **Closed/resolved items are removed, not archived here.** The durable trail lives in `docs/project_log.md` and the GitHub issue history.
- Not auto-generated — pruning is a judgment call. Stale rows should be removed when the underlying state has shifted (e.g., issue closed elsewhere).
- For the live state at any moment, run `/check-todos` — that command queries GitHub directly and produces a fresher snapshot than this file.
