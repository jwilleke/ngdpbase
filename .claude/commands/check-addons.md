# Check Addons Command

Survey health of ngdpbase-adjacent repositories and local instances that fall outside the `/check-todos` and `/othersites` scopes, then write the findings to `report-addons.md` at the ngdpbase repo root.

`/check-todos` surveys live state in `jwilleke/ngdpbase` (and rolls in `jwilleke/geohazardwatch` as a separate satellite). `/othersites` validates that a master-branch commit propagates cleanly to the four local ngdpbase checkouts. Neither covers the addon-adjacent repos, the addon-specific health of a local instance, nor the addon-level slicing of Dependabot alerts on the main ngdpbase repo. `/check-addons` fills those gaps.

## Targets

| Target | Type | Local path | GitHub repo / parent | Issue tracker |
|---|---|---|---|---|
| `fairways-gen2-website` | separate-repo satellite | `/Volumes/hd2A/workspaces/github/fairways-gen2-website` | `jwilleke/fairways-gen2-website` | own tracker |
| `fairways-base` | local checkout of ngdpbase | `/Volumes/hd2A/workspaces/github/fairways-base` | `jwilleke/ngdpbase` | issues land in ngdpbase |
| `ngdpbase-veg` | local checkout of ngdpbase | `/Volumes/hd2A/workspaces/github/ngdpbase-veg` | `jwilleke/ngdpbase` | issues land in ngdpbase |
| `ngdp-temp-builds` | local checkout of ngdpbase | `/Volumes/hd2/ngdp-temp-builds/ngdpbase` | `jwilleke/ngdpbase` | issues land in ngdpbase |

**Explicitly out of scope** — these are already covered elsewhere and including them here would double-report:

- `jwilleke/ngdpbase` (the main repo) — covered by `/check-todos`. **Exception**: the per-addon Dependabot alert breakdown in `addons/*/` is unique to `/check-addons` (see [Per-addon Dependabot breakdown](#per-addon-dependabot-breakdown-main-ngdpbase-repo) below).
- `jwilleke/geohazardwatch` — covered by `/check-todos`'s sister-site table.
- `jimstest` (the main ngdpbase working tree itself) — that's the operator's primary instance; `/othersites` validates propagation to it.

## Survey per target

### For separate-repo satellites (e.g. `fairways-gen2-website`)

Run in parallel where possible:

1. **Open PRs** — `gh pr list --repo <owner>/<repo> --state open --json number,title,headRefName,labels --limit 30`
2. **Open issues** — `gh issue list --repo <owner>/<repo> --state open --json number,title,labels --limit 30`
3. **Open Dependabot alerts** — `gh api repos/<owner>/<repo>/dependabot/alerts --jq '[.[] | select(.state == "open") | {number, package: .security_vulnerability.package.name, severity: .security_advisory.severity, ghsa: .security_advisory.ghsa_id, path: .dependency.manifest_path}]'`
4. **Failing GitHub Actions on default branch** — `gh run list --repo <owner>/<repo> --branch master --status failure --limit 10 --json name,createdAt,databaseId,url`. Dedupe to most-recent failing run per workflow (workflows that have since recovered should not appear).
5. **Per failing PR**: include the failing-job exit message — `gh run view <id> --log-failed | grep -E "##\\[error\\]|MODULE_NOT_FOUND|Cannot find|npm error" | head -10` — so the report explains *why*, not just *which*.
6. **Local checkout state** — `git -C <path> status --short` (uncommitted changes / untracked files) + `git -C <path> log --oneline -3` (recent commits on the working branch).

### For local-only checkouts (`fairways-base`, `ngdpbase-veg`, `ngdp-temp-builds`)

These don't have their own issue tracker; their issues are filed against the parent repo (`jwilleke/ngdpbase`). Survey is local-instance health:

1. **Git state** — `git -C <path> status --short` + `git -C <path> rev-parse --abbrev-ref HEAD` + `git -C <path> fetch origin` + `git -C <path> rev-list --count HEAD..origin/<branch>` (commits behind upstream).
2. **Local build artefact health** — `cd <path> && npm test 2>&1 | tail -5` (unit-test pass count; do NOT run E2E here — that's `/othersites` scope).
3. **Server reachability** — `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/` to confirm the instance is reachable. Note the `PROJECT_NAME` from `.env` so the report identifies which logical instance this is.
   - `fairways-base` — port 2121 ("The Fairways")
   - `ngdpbase-veg` — port 3333 ("ve-geology")
   - `ngdp-temp-builds` — port 3001 ("ngdpbase temp build")
4. **Addon drift** — list `ls <path>/addons/` and compare against the parent ngdpbase's `addons/` — flag any addon present in one but not the other.

## Per-addon Dependabot breakdown (main ngdpbase repo)

`/check-todos` surfaces Dependabot alerts in the main ngdpbase repo as a flat list. `/check-addons` slices them by `manifest_path` so addon-level dep problems are visible:

```bash
gh api repos/jwilleke/ngdpbase/dependabot/alerts --jq \
  '[.[] | select(.state == "open") | {path: .dependency.manifest_path, package: .security_vulnerability.package.name, severity: .security_advisory.severity, ghsa: .security_advisory.ghsa_id}]'
```

Group by `path` prefix:

- `package.json` — root deps
- `addons/calendar/package.json` — calendar addon
- `addons/forms/package.json` — forms addon
- `addons/journal/package.json` — journal addon
- `addons/elasticsearch/package.json` — elasticsearch addon

This surfaces e.g. when the same GHSA is open across 4 addon paths and only one has a Renovate / Dependabot auto-PR — the operator can then file sibling bumps (the pattern that produced ngdpbase PR #769 from 4 sibling uuid alerts).

## Workflow file freshness check

GitHub Actions versions drift silently. Scan each target's `.github/workflows/*.yml` for action-version pins and report mismatches:

```bash
grep -hRE "uses: actions/(checkout|setup-node|upload-artifact)@v[0-9]+" \
  <target-path>/.github/workflows/ 2>/dev/null | sort -u
```

Compare across targets. Useful pins to track:

- `actions/checkout@v{N}` — currently ngdpbase uses v5
- `actions/setup-node@v{N}` — ngdpbase v5
- `actions/upload-artifact@v{N}` — ngdpbase v4

Report any target pinning a version older than the ngdpbase reference. The fix (operator-driven) is a bulk find-and-replace per target.

## Cross-repo dep drift check

Satellites that pin to a specific ngdpbase version risk lagging silently. Sources of pin:

- **Dockerfile** `ARG NGDPBASE_VERSION=x.y.z` (geohazardwatch uses this pattern — see its `renovate.json` customManager).
- **npm dep** `"ngdpbase": "^x.y.z"` (not currently used by any known satellite, but track for future).
- **package.json `engines`** — not strictly ngdpbase-version-pinned, but a stale `engines.node` or `engines.npm` can indicate inattention.

For each separate-repo satellite, grep for these patterns and report the pinned version + how it compares to the current ngdpbase release (the latest tag on `jwilleke/ngdpbase` master). Flag if behind by ≥2 minor releases.

## CI-config sanity scan

Cross-check workflow yml `npm run <script>` references against `package.json` scripts in each target. This is the check that would have caught the fairways-gen2-website CI break immediately (workflow referenced `npm run test` / `npm run build` but neither script existed):

```bash
# For each .github/workflows/*.yml file
for wf in <target-path>/.github/workflows/*.yml; do
  refs=$(grep -oE 'npm run [a-z][a-z0-9:_-]*' "$wf" | awk '{print $3}' | sort -u)
  scripts=$(jq -r '.scripts | keys[]' <target-path>/package.json 2>/dev/null)
  for r in $refs; do
    if ! echo "$scripts" | grep -qx "$r"; then
      echo "$wf references 'npm run $r' but no such script in package.json"
    fi
  done
done
```

Report each missing-script reference with the workflow file path. Same pattern can be applied to `addons/*/.github/workflows/` if any addon repos pick up workflows later.

## Output sections in `report-addons.md`

The report is overwritten on each run (snapshot, not append). Frontmatter:

```yaml
---
title: ngdpbase Addons / Satellite Health Report
generatedBy: /check-addons
lastRun: <ISO timestamp>
---
```

Then organized as:

1. **Per-target sections** (separate-repo + each local checkout):
   - Header: name, type, local path, port (if applicable), repo URL.
   - Git state: branch, uncommitted-files count, commits-behind-upstream count, recent commit subject + hash.
   - Open PRs (separate-repo only): table with `#`, title, labels, CI conclusion (pass / fail / pending), one-line failing-job reason.
   - Open issues (separate-repo only): count + top 5 by recency, with labels.
   - Open Dependabot alerts (separate-repo only): table with GHSA, package, severity, manifest path.
   - Failing GitHub Actions (separate-repo only): most-recent-failing-run-per-workflow + error excerpt.
   - Local-instance health (local-checkout only): server reachability, unit-test pass count, addon-drift flags.

2. **Per-addon Dependabot breakdown** (cross-cutting across the main ngdpbase repo).

3. **Workflow file freshness** (cross-cutting across all targets).

4. **Cross-repo dep drift** (cross-cutting across separate-repo satellites).

5. **CI-config sanity scan results** (cross-cutting across all targets with workflows).

6. **Notable findings** — prose summary of anything that warrants operator attention. Highlight blockers vs. routine noise.

7. **Recommended next moves** — 2-4 concrete actions ordered by impact.

## Rules

- The report is a **snapshot** — overwrite, don't append. The durable trail is `docs/project_log.md` and the GitHub issue/PR history.
- Don't take action — `/check-addons` reports, it does not merge PRs, close issues, or push commits. Recommendations only.
- Do not run E2E suites against local checkouts — that's `/othersites` scope. `/check-addons` is read-only / fast.
- If a local checkout path doesn't exist, note it in the report and continue with the other targets (don't fail the whole run).
- If a GitHub API call fails (rate-limited, network), note it in the report with the error message and continue.

## Usage

`/check-addons` — runs the full survey and overwrites `report-addons.md`.

## Cross-skill relationships

- **`/check-todos`** surveys the main ngdpbase tracker + geohazardwatch sister site. Run `/check-todos` for top-of-stack work; run `/check-addons` for satellite + addon-level health.
- **`/othersites`** propagates a master-branch commit across the four ngdpbase local checkouts. Different intent from `/check-addons`: propagation is write/validate; this skill is read-only survey.
- The three skills are complementary; running all three on a session morning gives a complete picture of every ngdpbase-touching surface.
