---
title: ngdpbase Addons / Satellite Health Report
generatedBy: /check-addons
lastRun: 2026-05-22T09:08Z
---

# Addons / Satellite Health Report

Snapshot survey of ngdpbase-adjacent repositories and local instances. Overwritten on each `/check-addons` run.

## 1. Per-target sections

### fairways-gen2-website (separate-repo satellite)

- __Local path__: `/Volumes/hd2A/workspaces/github/fairways-gen2-website`
- __Repo__: <https://github.com/jwilleke/fairways-gen2-website>
- __Branch__: `master` at `d71561c` — __up to date with origin__ (0 commits behind).
- __Working tree__: clean.

#### Open PRs — 8

CI fixed in `d71561c` (this session's earlier work). PR __#19__ opened *after* the fix; the other 7 still reference the old job names (`build` / `lint-and-test`) from their stale CI runs. Dependabot will retire those job entries on the next rebase.

| # | Title | mergeState | CI |
|---|---|---|---|
| __#19__ | bump `ws` 8.20.0 → 8.20.1 | __CLEAN__ ✅ | `lint (18.x)` + `lint (20.x)` + `security-audit` all pass. __Ready to merge.__ |
| #18 | bump `brace-expansion` 5.0.5 → 5.0.6 | UNSTABLE | stale CI (old `build` + `lint-and-test` jobs); needs Dependabot rebase |
| #17 | bump `basic-ftp` 5.2.0 → 5.3.1 | UNSTABLE | stale CI; needs rebase |
| #16 | bump `ip-address` 10.1.0 → 10.2.0 | UNSTABLE | stale CI; needs rebase |
| #10 | bump `markdown-it` + `markdownlint-cli` | UNSTABLE | stale CI; needs rebase; conflicts with #7/8/9 (cluster) |
| #9 | bump `minimatch` + `markdownlint-cli` | UNSTABLE | stale CI; needs rebase; conflicts with #7/8/10 |
| #8 | bump `glob` + `markdownlint-cli` | UNSTABLE | stale CI; needs rebase; conflicts with #7/9/10 |
| #7 | bump `smol-toml` + `markdownlint-cli` | UNSTABLE | stale CI; needs rebase; conflicts with #8/9/10 |

__#7-#10 conflict cluster__ unchanged from previous report: all four touch `markdownlint-cli` in the same lockfile lines. Recommended resolution: merge #10, close #7-#9 as Dependabot will recreate consolidated.

#### Open Dependabot alerts — 13

| Alert # | Package | Severity | Auto-fix PR |
|---|---|---|---|
| #1 | `glob` | __high__ | #8 |
| #2 | `markdown-it` | medium | #10 |
| #3 / #4 / #5 | `minimatch` (×3) | __high__ | #9 |
| #6 | `smol-toml` | medium | #7 |
| #7 / #8 / #9 / #11 | `basic-ftp` (×4) | __high__ | #17 |
| #10 | `ip-address` | medium | #16 |
| #12 | `brace-expansion` | medium | #18 |
| #13 | `ws` | medium | __#19 (ready to merge)__ |

All 13 paths show as `package-lock.json` — single-lockfile repo. 4 high-severity alerts (`basic-ftp` × 4, `glob`, `minimatch` × 3) are the priority items, all auto-fixable through the existing PRs.

#### Open issues — 8

Unchanged from last report. Mix of feature work for the `fairways` addon (#15 / #14 / #6 / #5) and "add-on" feature requests (#1 / #2 / #3); plus #4 working-with-amdwiki note.

#### Failing recurring workflows on master

| Workflow | Last failed | Reason |
|---|---|---|
| __Deploy__ | 2026-05-22 08:30Z | Triggered by my `d71561c` push earlier this session; `deploy.yml` still has `npm run test` + `npm run build` references (unchanged this session because deploy only fires on push to master, didn't block PR CI). __Same fix as `ci.yml` applies.__ |
| CI (old name) | 2026-04-23 | Stale — workflow was renamed to `lint` in `d71561c`. Not actionable. |

### fairways-base (local checkout — port 2121)

- __Local path__: `/Volumes/hd2A/workspaces/github/fairways-base`
- __`PROJECT_NAME`__: `The Fairways` (port 2121)
- __Branch__: `master` at `0349ff59` (v3.32.0). __6 commits behind__ origin/master.
- __Server__: HTTP 302 on `http://localhost:2121/` — healthy.
- __Working tree__: 1 untracked file (`docs/planning/plan-addon-accounting.md`) — expected operator working notes.
- __Addons__: match main ngdpbase. No drift.

### ngdp-temp-builds (local checkout — port 3001)

- __Local path__: `/Volumes/hd2/ngdp-temp-builds/ngdpbase`
- __`PROJECT_NAME`__: `ngdpbase temp build` (port 3001)
- __Branch__: `master` at `0349ff59`. __6 commits behind__ origin/master.
- __Server__: HTTP 302 on `http://localhost:3001/` — healthy.
- __Working tree__: clean.
- __Addons__: match main ngdpbase. No drift.

## 2. Per-addon Dependabot breakdown (main ngdpbase repo)

4 open alerts on `jwilleke/ngdpbase`, sliced by manifest path:

| Manifest path | Package | GHSA | Severity | Status |
|---|---|---|---|---|
| `package.json` / `package-lock.json` (root) | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by __PR #769__ (open) |
| `addons/forms/package-lock.json` | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by __PR #769__ |
| `addons/calendar/package-lock.json` | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by __PR #769__ |
| `package-lock.json` (root) | `showdown` | GHSA-rmmh-p597-ppvv | medium | No upstream patch (tracked in #599; mitigation only) |

__Resolved earlier this session__ by Dependabot's PR #768 (merged): `addons/journal/package-lock.json` uuid alert closed.

PR #769 closes 3 of the 4 remaining alerts on merge. The `showdown` mitigation-only alert is permanent until upstream patches.

## 3. Workflow file freshness

| Target | `actions/checkout` | `actions/setup-node` | `actions/upload-artifact` |
|---|---|---|---|
| ngdpbase | v5 | v5 | v4 |
| fairways-base | v5 | v5 | v4 |
| ngdp-temp-builds | v5 | v5 | v4 |
| __fairways-gen2-website__ | __v4__ ⚠️ | __v4__ ⚠️ | (none) |

__fairways-gen2-website still one major behind__ on `checkout` + `setup-node`. Unchanged from previous report. Bump opportunistically next time touching that repo.

## 4. Cross-repo dep drift

__fairways-gen2-website__: no Dockerfile, no `"ngdpbase":` npm dep, no `NGDPBASE_VERSION` ARG anywhere. __No cross-repo version pin to track.__

ngdpbase current release: __v3.32.0__.

## 5. CI-config sanity scan results

Workflow yml `npm run <script>` references cross-checked against `package.json` scripts:

| Target | Workflow | Missing script reference |
|---|---|---|
| __fairways-gen2-website__ | `deploy.yml` | `npm run test` (no such script) |
| __fairways-gen2-website__ | `deploy.yml` | `npm run build` (no such script) |
| ngdpbase | (all clean) | — |

`deploy.yml` issue is the same one flagged in the previous report. __The Deploy workflow's failing run on master at 08:30Z (Section 1) is this exact issue firing in real-time__ — my earlier `d71561c` push to master triggered deploy.yml, which then failed for the missing scripts. Two-line fix when next touching fwg2w (same pattern as `ci.yml`'s fix).

## 6. Notable findings

1. __PR #19 in fairways-gen2-website is mergeable RIGHT NOW__ — first PR opened after the CI fix; all 4 checks green. Resolves the `ws` medium-severity alert immediately.
2. __PRs #7-#10, #16-#18 still on stale CI__ — they reference the old `build` + `lint-and-test` job names that no longer exist on master post-`d71561c`. Dependabot's rebase cycle hasn't fired for these yet. The `mergeStateStatus` of `UNSTABLE` is because their last CI run failed against a workflow that's been replaced; once rebased, they'll run the new `lint` + `security-audit` jobs.
3. __Deploy workflow on fairways-gen2-website is broken on master right now__ — same scaffolded-script issue as `ci.yml` had pre-fix. The CI-sanity scan correctly identifies it. Two-line fix.
4. __All 3 local ngdpbase checkouts are 6 commits behind master__ — pure doc-only lag accumulated across yesterday/today's sessions (project_log + skill + report commits, no runtime code). Pull whenever convenient; no urgency.
5. __Per-addon Dependabot view confirms PR #769 covers the 3 still-open uuid alerts__ — root + addons/forms + addons/calendar. Once merged, only `showdown` (mitigation-only) remains.

## 7. Recommended next moves

1. __Merge fairways-gen2-website PR #19__ — 1 click, resolves 1 alert immediately.
2. __Comment `@dependabot rebase` on PRs #7-#10 + #16-#18__ to nudge the rebase if it doesn't happen within ~10 min. After rebase they should go green and become mergeable; resolve the #7-#10 cluster by merging #10 + closing #7-#9.
3. __Merge ngdpbase PR #769__ when ready — closes 3 of 4 remaining per-addon Dependabot alerts on the main repo.
4. __Optional, low-priority__: fix `deploy.yml` in fairways-gen2-website (drop `npm run test` + `npm run build` references — same one-line trim as `ci.yml` got); bump fwg2w action pins from v4 → v5.
