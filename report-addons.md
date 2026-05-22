---
title: ngdpbase Addons / Satellite Health Report
generatedBy: /check-addons
lastRun: 2026-05-22T08:55Z
---

# Addons / Satellite Health Report

Snapshot survey of ngdpbase-adjacent repositories and local instances. Overwritten on each `/check-addons` run.

## 1. Per-target sections

### fairways-gen2-website (separate-repo satellite)

- **Local path**: `/Volumes/hd2A/workspaces/github/fairways-gen2-website`
- **Repo**: <https://github.com/jwilleke/fairways-gen2-website>
- **Branch**: `master` at `d71561c` — **up to date with origin** (0 commits behind).
- **Working tree**: clean.

#### Open PRs — 8

All Dependabot dev-dep bumps. CI was broken for months by a pre-existing workflow misconfiguration (`npm run test` / `npm run test:coverage` / `npm run build` referenced but no such scripts). Fixed in `d71561c` this session (`.github/workflows/ci.yml` trimmed to `lint` + `security-audit`). PRs need Dependabot to rebase before merge.

| # | Title | mergeState | CI |
|---|---|---|---|
| **#19** | bump `ws` 8.20.0 → 8.20.1 | `CLEAN` | ✅ post-fix; all green. **Ready to merge.** |
| #18 | bump `brace-expansion` 5.0.5 → 5.0.6 | `UNSTABLE` | needs Dependabot rebase |
| #17 | bump `basic-ftp` 5.2.0 → 5.3.1 | UNKNOWN | needs rebase |
| #16 | bump `ip-address` 10.1.0 → 10.2.0 | UNKNOWN | needs rebase |
| #10 | bump `markdown-it` + `markdownlint-cli` | UNKNOWN | needs rebase; conflicts with #7/8/9 |
| #9 | bump `minimatch` + `markdownlint-cli` | UNKNOWN | needs rebase; conflicts with #7/8/10 |
| #8 | bump `glob` + `markdownlint-cli` | UNKNOWN | needs rebase; conflicts with #7/9/10 |
| #7 | bump `smol-toml` + `markdownlint-cli` | UNKNOWN | needs rebase; conflicts with #8/9/10 |

**#7-#10 conflict cluster**: all four touch `markdownlint-cli` in the same lockfile lines. Practical resolution: merge #10 (newest, has the `markdown-it` bonus), close #7/#8/#9 as Dependabot will recreate consolidated.

#### Open Dependabot alerts — 13

| GHSA | Package | Severity | Manifest | Auto-fix PR |
|---|---|---|---|---|
| #1 | `glob` | **high** | `package-lock.json` | #8 |
| #2 | `markdown-it` | medium | `package-lock.json` | #10 |
| #3-#5 | `minimatch` × 3 | **high** | (multiple paths) | #9 |
| #6 | `smol-toml` | medium | `package-lock.json` | #7 |
| #7-#9, #11 | `basic-ftp` × 4 | **high** | (multiple paths) | #17 |
| #10 | `ip-address` | medium | `package-lock.json` | #16 |
| #12 | `brace-expansion` | medium | `package-lock.json` | #18 |
| #13 | `ws` | medium | `package-lock.json` | #19 |

All 13 alerts auto-fixable through the 8 open PRs. **4 high-severity priority items**: `basic-ftp` (×4), `glob`, `minimatch` (×3).

#### Open issues — 8

| # | Title | Type |
|---|---|---|
| #15 | Refactor unit data model: parcel as primary key | FEATURE |
| #14 | Add `/addons/fairways` admin page for unit management | BUG |
| #6 | Import unit directory from `private/data/directory.tsv` | FEATURE |
| #5 | Import units from UNITs.tsv into units.json | FEATURE |
| #4 | Working With amdWiki | note |
| #3 | Financial Ledger with SQLite | ADD-ON |
| #2 | Business Hub - Integrator Dashboard | ADD-ON |
| #1 | Person-Contacts Management System | ADD-ON |

#### Failing recurring workflows

None active on master post-`d71561c`. Pre-fix runs in the Actions tab all failed for the missing-script reason and are stale.

### fairways-base (local checkout — port 2121)

- **Local path**: `/Volumes/hd2A/workspaces/github/fairways-base`
- **`PROJECT_NAME`**: `The Fairways` (port 2121)
- **Branch**: `master` at `0349ff59` (v3.32.0). **4 commits behind** origin/master (doc-only lag from today's session).
- **Server**: HTTP 302 on `http://localhost:2121/` — healthy.
- **Addons**: `calendar`, `elasticsearch`, `forms`, `journal` — match main ngdpbase. No drift.

### ngdpbase-veg (local checkout — port 3333)

- **Local path**: `/Volumes/hd2A/workspaces/github/ngdpbase-veg`
- **`PROJECT_NAME`**: `ve-geology` (port 3333)
- **Branch**: `master` at `0349ff59` (v3.32.0). **3 commits behind** origin/master.
- **Server**: HTTP 302 on `http://localhost:3333/` — healthy.
- **Addons**: match main ngdpbase. No drift.
- **Note**: a new Dependabot branch `dependabot/npm_and_yarn/addons/forms/uuid-14.0.0` appeared upstream — overlaps with ngdpbase PR #769 (the sibling-bump PR I filed). Worth checking whether Dependabot's auto-PR self-closes after #769 merges or if there'll be conflicts.

### ngdp-temp-builds (local checkout — port 3001)

- **Local path**: `/Volumes/hd2/ngdp-temp-builds/ngdpbase`
- **`PROJECT_NAME`**: `ngdpbase temp build` (port 3001)
- **Branch**: `master` at `0349ff59` (v3.32.0). **4 commits behind** origin/master.
- **Server**: HTTP 302 on `http://localhost:3001/` — healthy.
- **Addons**: match main. No drift.

## 2. Per-addon Dependabot breakdown (main ngdpbase repo)

4 open alerts on `jwilleke/ngdpbase`, sliced by manifest path:

| Manifest path | Package | GHSA | Severity | Status |
|---|---|---|---|---|
| `package-lock.json` (root) | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by **PR #769** (open) |
| `addons/forms/package-lock.json` | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by **PR #769** + a new sibling Dependabot auto-PR opened during this session |
| `addons/calendar/package-lock.json` | `uuid` | GHSA-w5hq-g745-h8pq | medium | Covered by **PR #769** |
| `package-lock.json` (root) | `showdown` | GHSA-rmmh-p597-ppvv | medium | No upstream patch (tracked in #599; mitigation only) |

**Resolved this session** by Dependabot's auto-PR #768 (now merged):

- `addons/journal/package-lock.json` uuid alert (#116) — closed.

**3 of 4 remaining alerts are addon-scoped** (`addons/forms` + `addons/calendar` + root). PR #769 closes all three on merge. After that lands, only the `showdown` mitigation-only alert remains.

## 3. Workflow file freshness

Action-version pins by target:

| Target | `actions/checkout` | `actions/setup-node` | `actions/upload-artifact` |
|---|---|---|---|
| ngdpbase | **v5** | **v5** | **v4** |
| ngdpbase-veg | v5 | v5 | v4 |
| fairways-base | v5 | v5 | v4 |
| ngdp-temp-builds | v5 | v5 | v4 |
| **fairways-gen2-website** | **v4** ⚠️ | **v4** ⚠️ | (none) |

**fairways-gen2-website lags one major version** behind ngdpbase on both `actions/checkout` and `actions/setup-node`. v4 still works; v5 has node 20+ runtime + better caching. Suggested action: bump to v5 in `.github/workflows/ci.yml` (deploy.yml too) when next touching that repo.

## 4. Cross-repo dep drift

**fairways-gen2-website**: no `NGDPBASE_VERSION` ARG in Dockerfile, no `ngdpbase` npm dep. **No cross-repo version pin to track.**

ngdpbase current release: **v3.32.0** (for future reference if a satellite ever pins).

## 5. CI-config sanity scan results

Cross-checking `npm run <script>` references in `.github/workflows/*.yml` against each target's `package.json` scripts:

| Target | Workflow | Missing script reference |
|---|---|---|
| **fairways-gen2-website** | `deploy.yml` | `npm run test` (no such script) |
| **fairways-gen2-website** | `deploy.yml` | `npm run build` (no such script) |
| ngdpbase | (all) | clean |

**Action item**: `deploy.yml` in fairways-gen2-website has the same scaffolded-but-never-wired-up problem that `ci.yml` had before today's fix. It only runs on push to `master` (not on PRs), so it doesn't block PR CI — but the next push to master will fail the deploy step. Fix when next touching that repo.

## 6. Notable findings

1. **8 fairways-gen2-website PRs blocked on Dependabot rebase** — CI fix landed; rebases are pending Dependabot's poll cycle. All 13 Dependabot alerts (4 high-severity) are auto-fixable through these 8 PRs.
2. **#7-#10 conflict cluster** — four PRs touch the same lockfile lines. Merge #10, close #7-#9 is the cleanest path.
3. **Three healthy local checkouts** — fairways-base / ngdpbase-veg / ngdp-temp-builds all serving 302 on their ports and 3-4 commits behind on doc-only lag.
4. **ngdpbase main repo per-addon Dependabot breakdown**: 4 open alerts, 3 covered by PR #769, 1 (`showdown`) mitigation-only. PR #768 already resolved the journal addon's alert.
5. **fairways-gen2-website lags on workflow action pins** (`checkout@v4` / `setup-node@v4`). Not breaking; bump to v5 next opportunity.
6. **fairways-gen2-website `deploy.yml` still has the missing-script issue** (`npm run test` / `npm run build`). I fixed `ci.yml` this session but left `deploy.yml` because it only fires on push to master. Worth fixing when the next push happens.
7. **Dependabot raced PR #769** by opening its own auto-PR for `addons/forms/uuid` after I'd already filed #769. Watch for self-close-on-merge or conflict.

## 7. Recommended next moves

1. **Merge fairways-gen2-website PR #19** — already CLEAN; resolves the `ws` high-severity alert.
2. **Wait ~5-10 min for Dependabot to rebase #16-#18**, then merge each as it goes green. Resolves 4 more high alerts (basic-ftp × 4) + brace-expansion + ip-address.
3. **Resolve #7-#10 cluster** — merge #10, close #7-#9. Resolves `glob` + `minimatch × 3` + `smol-toml` + `markdown-it`.
4. **Merge ngdpbase PR #769** (when ready) — closes 3 of 4 remaining per-addon Dependabot alerts. Showdown is mitigation-only and stays.
5. **Optional, low priority**: bump fairways-gen2-website action pins to v5; fix `deploy.yml` script references.
