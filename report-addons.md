---
title: ngdpbase Addons / Satellite Health Report
generatedBy: /check-addons
lastRun: 2026-05-22T08:35Z
---

# Addons / Satellite Health Report

Snapshot survey of ngdpbase-adjacent repositories and local instances that fall outside `/check-todos` (jwilleke/ngdpbase scope) and `/othersites` (local-ngdpbase-propagation scope). Overwritten on each `/check-addons` run.

## fairways-gen2-website (separate-repo satellite)

- **Local path**: `/Volumes/hd2A/workspaces/github/fairways-gen2-website`
- **Repo**: <https://github.com/jwilleke/fairways-gen2-website>
- **Branch**: `master` at `d71561c` — **up to date with origin** (0 commits behind).
- **Working tree**: clean.

### Open PRs — 8

All Dependabot dev-dep bumps. CI was **broken for months** by a pre-existing workflow misconfiguration (`npm run test` / `npm run test:coverage` / `npm run build` referenced but no such scripts existed). Fixed in `d71561c` (pushed this session — `.github/workflows/ci.yml` trimmed to just `lint` + `security-audit`). PRs need Dependabot to rebase + re-run CI before they merge.

| # | Title | mergeState | CI (post-fix) |
|---|---|---|---|
| **#19** | bump `ws` 8.20.0 → 8.20.1 | `CLEAN` | ✅ first PR opened after the CI fix; all green. **Ready to merge.** |
| #18 | bump `brace-expansion` 5.0.5 → 5.0.6 | `UNSTABLE` | new CI not yet retriggered; needs rebase |
| #17 | bump `basic-ftp` 5.2.0 → 5.3.1 | UNKNOWN | needs rebase against new master |
| #16 | bump `ip-address` 10.1.0 → 10.2.0 | UNKNOWN | needs rebase |
| #10 | bump `markdown-it` and `markdownlint-cli` | UNKNOWN | needs rebase + may conflict with #7/8/9 (same lockfile lines) |
| #9 | bump `minimatch` and `markdownlint-cli` | UNKNOWN | needs rebase + may conflict with #7/8/10 |
| #8 | bump `glob` and `markdownlint-cli` | UNKNOWN | needs rebase + may conflict with #7/9/10 |
| #7 | bump `smol-toml` and `markdownlint-cli` | UNKNOWN | needs rebase + may conflict with #8/9/10 |

**Conflict cluster**: #7 / #8 / #9 / #10 all touch `markdownlint-cli` in the same lockfile. They cannot all merge cleanly — one merges, then the other three need to be re-resolved. Practical path: merge #10 (newest, has `markdown-it` bonus), close #7 / #8 / #9 if Dependabot rebases them into duplicates of #10.

### Open Dependabot alerts — 13

| GHSA | Package | Severity | Note |
|---|---|---|---|
| #1 | `glob` | **high** | covered by PR #8 |
| #2 | `markdown-it` | medium | covered by PR #10 |
| #3 / #4 / #5 | `minimatch` (3 alerts, different paths) | **high** | covered by PR #9 |
| #6 | `smol-toml` | medium | covered by PR #7 |
| #7 / #8 / #9 / #11 | `basic-ftp` (4 alerts, different paths) | **high** | covered by PR #17 |
| #10 | `ip-address` | medium | covered by PR #16 |
| #12 | `brace-expansion` | medium | covered by PR #18 |
| #13 | `ws` | medium | covered by PR #19 |

**All 13 alerts are auto-fixable** — merging the 8 PRs (with #7-#10 cluster resolved) resolves every open alert. **4 high-severity alerts** (`glob`, `minimatch×3`, `basic-ftp×4`) are the priority items.

### Open issues — 8

Mostly feature work for the `fairways` addon (units, parcels, member directory). None blocking.

| # | Title | Type |
|---|---|---|
| #15 | Refactor unit data model: parcel as primary key, deedOwner as authoritative owner | FEATURE |
| #14 | Add `/addons/fairways` admin page for unit management | BUG |
| #6 | Import unit directory from `private/data/directory.tsv` into unit registry | FEATURE |
| #5 | Import units from UNITs.tsv into units.json | FEATURE |
| #4 | Working With amdWiki | (note / discussion) |
| #3 | Financial Ledger with SQLite and Optional Medici Upgrade | ADD-ON |
| #2 | Business Hub - Integrator Dashboard | ADD-ON |
| #1 | Person-Contacts Management System | ADD-ON |

### Failing GitHub Actions

Pre-`d71561c` runs in the Actions tab all fail for the historical "missing script" reason. No new master-branch CI runs since the fix; PR-runs covered above. **No actionable failing recurring workflows** at this snapshot.

## ngdpbase-veg (local checkout of jwilleke/ngdpbase)

- **Local path**: `/Volumes/hd2A/workspaces/github/ngdpbase-veg`
- **`PROJECT_NAME`**: `ve-geology` (port 3333)
- **Branch**: `master` at `0349ff59` (release v3.32.0)
- **3 commits behind** origin/master. Also: Dependabot just opened a new branch `dependabot/npm_and_yarn/addons/forms/uuid-14.0.0` upstream that overlaps with the still-open ngdpbase PR #769 — Dependabot is independently producing fixes for the alerts that #769 already covers.
- **Server reachability**: `curl http://localhost:3333/` returns 302 (front-page redirect; healthy).
- **Working tree**: clean.

### Addon drift

Addons present: `calendar`, `elasticsearch`, `forms`, `journal` — identical to main ngdpbase. No drift.

### Notable

- The 3-commit lag matches the same lag that satellites have any time the operator pushes commits without running `/othersites`. Today's session pushed: project-log updates + the (unmerged) `chore/uuid-sibling-bumps` branch — none of which touch runtime code, so the lag is documentation-only.
- A new sibling Dependabot PR (uuid in `addons/forms`) was opened upstream during this session, partially overlapping with the still-open PR #769. Worth checking whether Dependabot will close its auto-PR once #769 merges, or if there'll be conflicts.

## Notable findings

1. **fairways-gen2-website CI was silently broken for months.** Every Dependabot PR's CI failed on `npm run test` / `npm run build` referencing missing scripts. The cause: scaffolded workflow steps never wired up to actual `package.json` scripts. Fixed in `d71561c` this session.
2. **13 open Dependabot alerts in fairways-gen2-website** — all auto-fixable through the 8 open PRs. 4 are high-severity (basic-ftp × 4, glob, minimatch × 3). Once the CI rebase cycle completes, all are mergeable in a few minutes.
3. **PR #7-#10 conflict cluster** — four PRs all bump `markdownlint-cli` plus a sibling. They cannot all merge cleanly without re-resolution. Merging the newest (#10) and closing #7-#9 is the cleanest path.
4. **ngdpbase-veg is healthy** — server responds, addons match main, only doc-only lag.
5. **Dependabot raced PR #769** by opening its own sibling for the `addons/forms` uuid alert. Worth a quick check after #769 merges to see if the auto-PR self-closes.

## Recommended next moves

1. **Merge fairways-gen2-website PR #19** (already green; resolves the `ws` high-severity alert immediately).
2. **Wait ~5 minutes for Dependabot to rebase #16, #17, #18** against the new master, then merge each as it goes green. Resolves 4 more alerts (basic-ftp × 4, ip-address, brace-expansion).
3. **Resolve the #7-#10 markdownlint-cli cluster**: merge #10 first, close #7-#9 as duplicates (or wait for Dependabot to recreate them as a consolidated multi-bump). Resolves `glob`, `minimatch × 3`, `smol-toml`, `markdown-it` — 6 more alerts.
4. **Optional**: rebase ngdpbase-veg via `git -C /Volumes/hd2A/workspaces/github/ngdpbase-veg pull --ff-only`. Pure doc-update lag — no urgency.

## Possible additions to scope (advisory)

Recommendations for what `/check-addons` could include in the next iteration:

1. **`fairways-base` local checkout** (port 2121) — currently in `/othersites` scope for propagation, not surveyed for addon-specific drift. Could mirror the `ngdpbase-veg` block here.
2. **`ngdp-temp-builds`** (port 3001) — same shape as `fairways-base`. Lower priority since it's a throwaway sandbox.
3. **Per-addon Dependabot alerts in the main ngdpbase repo** — `addons/calendar/package.json` / `addons/forms/` / `addons/journal/` show up in Dependabot's alert list with the addon path (#117 / #118 / #119 / #116 today). Pulling them out per-addon would surface dep issues that the root-repo view blurs together.
4. **Workflow file freshness check** — compare `.github/workflows/*.yml` across targets. The `actions/checkout@v5` / `actions/setup-node@v5` pins in ngdpbase drift away from older-pinned satellites silently otherwise. (Caught the `npx tsc --noEmit` scaffolding issue here only because it was *broken*; same workflow with v4 actions would just keep working invisibly.)
5. **Cross-repo dep drift** — if `fairways-gen2-website` (or other satellites) pin to a specific ngdpbase version, flag if they lag master by N releases. Useful once multiple satellites are pinning.
6. **`jwilleke/geohazardwatch`** — currently covered by `/check-todos` sister-site table. Including here would double-report. **Skip**, unless `/check-todos` drops it.
7. **CI-config sanity** — scan each target's `.github/workflows/` for `npm run <script>` references and verify each script exists in the local `package.json`. The fairways-gen2-website CI break would have been caught immediately by this check. Useful as a one-shot lint, not necessarily per-run.
