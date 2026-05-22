# Check Addons Command

Survey health of ngdpbase-adjacent repositories and local instances that fall outside the `/check-todos` and `/othersites` scopes, then write the findings to `report-addons.md` at the ngdpbase repo root.

`/check-todos` surveys live state in `jwilleke/ngdpbase` (and rolls in `jwilleke/geohazardwatch` as a separate satellite). `/othersites` validates that a master-branch commit propagates cleanly to the four local ngdpbase checkouts. Neither covers the addon-adjacent repos or the addon-specific health of a local instance. `/check-addons` fills that gap.

## Targets

| Target | Type | Local path | GitHub repo | Issue tracker |
|---|---|---|---|---|
| `fairways-gen2-website` | separate-repo satellite | `/Volumes/hd2A/workspaces/github/fairways-gen2-website` | `jwilleke/fairways-gen2-website` | own tracker |
| `ngdpbase-veg` | local checkout of ngdpbase | `/Volumes/hd2A/workspaces/github/ngdpbase-veg` | `jwilleke/ngdpbase` | issues land in ngdpbase |

## Survey per target

### For separate-repo satellites (e.g. `fairways-gen2-website`)

Run in parallel where possible:

1. **Open PRs** — `gh pr list --repo <owner>/<repo> --state open --json number,title,headRefName,labels --limit 30`
2. **Open issues** — `gh issue list --repo <owner>/<repo> --state open --json number,title,labels --limit 30`
3. **Open Dependabot alerts** — `gh api repos/<owner>/<repo>/dependabot/alerts --jq '[.[] | select(.state == "open") | {number, package: .security_vulnerability.package.name, severity: .security_advisory.severity, ghsa: .security_advisory.ghsa_id}]'`
4. **Failing GitHub Actions on default branch** — `gh run list --repo <owner>/<repo> --branch master --status failure --limit 10 --json name,createdAt,databaseId,url`. Dedupe to most-recent failing run per workflow (workflows that have since recovered should not appear).
5. **Per failing PR**: include the failing-job exit message — `gh run view <id> --log-failed | grep -E "##\\[error\\]|MODULE_NOT_FOUND|Cannot find|npm error" | head -10` — so the report explains *why*, not just *which*.
6. **Local checkout state** — `git -C <path> status --short` (uncommitted changes / untracked files) + `git -C <path> log --oneline -3` (recent commits on the working branch).

### For local-only checkouts (e.g. `ngdpbase-veg`)

These don't have their own issue tracker; their issues are filed against the parent repo (`jwilleke/ngdpbase`). Survey is more about local-instance health:

1. **Git state** — `git -C <path> status --short` + `git -C <path> rev-parse --abbrev-ref HEAD` + `git -C <path> rev-list --count HEAD..origin/<branch>` (commits behind upstream).
2. **Local build artefact health** — `cd <path> && npm test 2>&1 | tail -5` (unit-test pass count; do NOT run E2E here — that's `/othersites` scope).
3. **Server status** — `pm2 list 2>/dev/null | grep <port>` or `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/` to confirm the instance is reachable. Note the `PROJECT_NAME` from `.env` so the report identifies which logical instance this is.
4. **Addon drift** — list `ls <path>/addons/` and compare against the parent ngdpbase's `addons/` — flag any addon present in one but not the other, or version mismatches.

## Output sections in `report-addons.md`

The report is overwritten on each run (snapshot, not append). Frontmatter:

```yaml
---
title: ngdpbase Addons / Satellite Health Report
generatedBy: /check-addons
lastRun: <ISO timestamp>
---
```

Then per target:

- **Header**: target name, type (separate-repo / local-checkout), local path, repo URL.
- **Git state**: branch, uncommitted-files count, commits-behind-upstream count, most-recent commit subject + hash.
- **Open PRs** (separate-repo only): table with `#`, title, labels, CI conclusion (pass / fail / pending), one-line failing-job reason.
- **Open issues** (separate-repo only): count + top 5 by recency, with labels.
- **Open Dependabot alerts** (separate-repo only): table with `GHSA`, package, severity.
- **Failing GitHub Actions** (separate-repo only): most-recent-failing-run-per-workflow + error excerpt.
- **Local-instance health** (local-checkout only): server reachability, unit-test pass count, addon-drift flags.
- **Notable findings**: prose summary of anything that warrants operator attention. Highlight blockers vs. routine noise.

Close with a **Recommended next moves** section: 2-4 concrete actions ordered by impact (e.g. "merge PR #18 (clean rebase available)", "fix `ci.yml` script reference in foo-repo to unblock CI for 5 open PRs", "rebase ngdpbase-veg 8 commits behind upstream").

## Rules

- The report is a **snapshot** — overwrite, don't append. The durable trail is `docs/project_log.md` and the GitHub issue/PR history.
- Don't take action — `/check-addons` reports, it does not merge PRs, close issues, or push commits. Recommendations only.
- Do not run E2E suites against local checkouts — that's `/othersites` scope. `/check-addons` is read-only / fast.
- If a local checkout path doesn't exist, note it in the report and continue with the other targets (don't fail the whole run).
- If a GitHub API call fails (rate-limited, network), note it in the report with the error message and continue.

## Usage

`/check-addons` — runs the survey and overwrites `report-addons.md`.

## Possible additions to scope (advisory)

These are *not* currently in the skill — listed here so a future operator-edit can decide whether to include them:

- **`fairways-base`** (local checkout at `/Volumes/hd2A/workspaces/github/fairways-base`, port 2121) — currently in `/othersites` scope for propagation, but no skill checks its addon-specific drift. Could mirror the `ngdpbase-veg` local-checkout survey.
- **`ngdp-temp-builds`** (`/Volumes/hd2/ngdp-temp-builds/ngdpbase`, port 3001) — same shape as `fairways-base`. Likely lower priority since it's a throwaway build sandbox.
- **`jwilleke/geohazardwatch`** — already covered by `/check-todos`'s sister-site table; including it here would double-report. Skip unless `/check-todos` drops it.
- **`addons/*/` in the ngdpbase main repo** — the four bundled addons (forms / calendar / elasticsearch / journal) each have their own `package.json` + lockfile. Surveying their individual Dependabot alerts (paths like `addons/calendar/package.json` show up in the main repo's alert list — see #117 / #118 / #119) could surface per-addon dep issues that the root-repo survey blurs.
- **Mirror / fork repos** if any exist (none today; flag if the operator adds one).
- **Cross-repo dep drift** — e.g. when `fairways-gen2-website` references a specific ngdpbase version, flag if it lags master by N releases. Useful if multiple satellites pin to specific tags.
- **Workflow file freshness** — check whether `.github/workflows/*.yml` in each target uses the same actions-version pins as ngdpbase (e.g. `actions/checkout@v5`). Drift accumulates silently otherwise.
