# Semver Release

Cut a new semver release: bump `package.json` (and `config/app-default-config.json` + `CHANGELOG.md`) via ngdpbase's `src/utils/version.ts`, create an annotated git tag, push it, and create a GitHub release with auto-generated notes.

This is ngdpbase's own release command. The kit's generic version is installed beside it as `.claude/commands/semver-kit.md` (#1326), because this file existed first; `/semver` is the one to run, and the kit never overwrites this file.

## Relationship to /session-commit

`/semver` is __release mechanics only__ (Steps 1–9: gate → container smoke test → bump → baseline → tag → push → GitHub release → watch the image build → jimstest-first re-validate → `/othersites`). It does __NOT__ update `docs/project_log.md`, comment on / close GitHub issues, or run `/check-todos` — that bookkeeping lives in `/session-commit` Steps 6–9.

- __"I did work, ship it"__ → run __`/session-commit`__, not `/semver`. `/session-commit` commits the work, pre-flights jimstest, makes the semver decision and __invokes `/semver` internally__ (Step 4), propagates, then logs + comments issues + freshens TODO. Running `/semver` yourself in this case skips the log/issue/TODO updates.
- __"Work is already committed & logged, just cut/consolidate a release"__ → standalone `/semver` is correct. But it leaves a bookkeeping gap: after it finishes you must still add a project_log entry for the *release event itself* (version, baseline drift, `/othersites` results, any flakes) and comment/close any issues the release ships. `/semver` will not do this for you.

`/semver` also requires a clean tree on `master` (Step 1) — it never commits your feature work. Commit (or `/session-commit`) first.

## Usage

`/semver <bump>` — where `<bump>` is one of:

- `patch` — `0.2.0` → `0.2.1` (bug fixes, docs, chores; no new features, no breaking changes)
- `minor` — `0.2.0` → `0.3.0` (new features; for pre-1.0 also use this for breaking changes)
- `major` — `0.2.0` → `1.0.0` (breaking changes once the API is stable; rarely used pre-1.0)

If the user did not specify a bump type, ask them which one before proceeding.

## Steps

### Step 1: Verify the working tree is clean and on master

Run in parallel:

- `git status --porcelain` — must be empty. If not, stop and tell the user to commit or stash first.
- `git rev-parse --abbrev-ref HEAD` — must be `master`. If not, ask the user to confirm before proceeding.
- `git fetch origin && git rev-list --count HEAD..origin/master` — must be `0`. If the local branch is behind, stop and tell the user to pull first.

### Step 2: Determine current and next version

- Read `package.json` `version` field.
- Compute the next version from the requested bump (`patch` increments the third number, `minor` increments the second and zeros the third, `major` increments the first and zeros the rest).
- Show the user: `current → next` and confirm before continuing __only if__ the bump is `major` or if there are no commits since the last tag (i.e., nothing to release). For `patch` / `minor` with new commits, proceed without prompting.

### Step 3: Summarize what's in the release

- Run `git log <last-tag>..HEAD --oneline` to list commits since the previous tag.
- If there are zero commits since the last tag, stop and tell the user there's nothing to release.

### Step 4: Build, then run the full test suite

A release that doesn't pass tests should not exist. Run tests __before__ any version bump so nothing on disk has to be rolled back if a test fails.

Run sequentially:

- `npm run build` — compiles TypeScript. Required so both the test build and `dist/src/utils/version.js` (used in Step 5) are fresh.
- `npm test` — must pass (Vitest unit + integration).
- `npm run test:e2e` — must pass (Playwright). The dev server must be up; if it isn't, run `./server.sh restart` and wait for `http://localhost:3000` before invoking E2E.

If anything fails, __stop__. Fix the failures and start again from Step 1. The working tree is still clean at this point — nothing to roll back.

### Step 4a: Build the container image and smoke-test it (#1035)

`npm test` and E2E run against the dev server, so they say nothing about whether the __image__ works. Both v4.8.0 and v4.8.1 passed this gate and produced a broken image: a change to core startup behaviour made a fresh container refuse to boot, which only the container smoke test exercises. Because the image workflow triggers *on the tag*, the failure arrived after the release was already public — and because the plain tag is pushed before the smoke test while `-devtools` is built after it, the damage was invisible until a downstream repo needed `-devtools`, two releases later.

This step reproduces CI's smoke test locally, __before__ anything is tagged, so that failure means no tag is ever created. It runs in two halves that mirror `.github/workflows/docker-build.yml`, so a local pass means the CI step will pass too.

__An unconfigured container must refuse to start.__ [#1087](https://github.com/jwilleke/ngdpbase/issues/1087) made a headless install refuse to boot while the resolved admin password is still the well-known `admin123` shipped in this repository (it used to fail *open* onto a published credential). So half 1 checks the refusal, and half 2 boots a configured container. Skipping half 1, or reading its failure as a stale instruction, is how `v4.12.0` was half-published: `4.12.0` and `latest` were pushed, `4.12.0-devtools` never was (#1142).

```bash
docker build -f docker/Dockerfile --target runtime --build-arg NODE_VERSION=24 \
  -t ngdpbase-release-smoke:local .

# Half 1 — an UNCONFIGURED headless install must REFUSE to boot (#1087).
docker rm -f ngdpbase-smoke-refuse 2>/dev/null
docker run -d --name ngdpbase-smoke-refuse \
  -e HEADLESS_INSTALL=true -e NODE_ENV=production -e PUID=1000 -e PGID=1000 ngdpbase-release-smoke:local
sleep 20
docker inspect --format='{{.State.Running}}' ngdpbase-smoke-refuse   # must be false
docker logs ngdpbase-smoke-refuse 2>&1 | grep "Refusing to create the bootstrap admin account"
docker rm -f ngdpbase-smoke-refuse

# Half 2 — a CONFIGURED headless install must become healthy.
# The config file is required: the guard compares the RESOLVED password rather
# than reading the variable, so the env var alone is still refused.
SM=$(mktemp -d); mkdir -p "$SM/config"
echo '{"ngdpbase.user.security.defaultpassword":"$NGDPBASE_ADMIN_PASSWORD"}' \
  > "$SM/config/app-custom-config.json"
docker rm -f ngdpbase-release-smoke 2>/dev/null
docker run -d --name ngdpbase-release-smoke -p 3099:3000 \
  -e HEADLESS_INSTALL=true -e NODE_ENV=production \
  -e NGDPBASE_ADMIN_PASSWORD="smoke-$(openssl rand -hex 12)" \
  -e PUID=1000 -e PGID=1000 \
  -v "$SM:/app/data" ngdpbase-release-smoke:local

for i in $(seq 1 18); do
  S=$(docker inspect --format='{{.State.Health.Status}}' ngdpbase-release-smoke 2>/dev/null || echo starting)
  echo "  $S"; [ "$S" = "healthy" ] && break
  [ "$S" = "unhealthy" ] && { docker logs ngdpbase-release-smoke; break; }
  sleep 5
done

# #1194 — no NGDPBASE_SESSION_SECRET was passed, so the instance must have
# generated one into the mounted volume's .env. Must print a line; must not be
# the shipped literal. Read it THROUGH the container, as CI does: the file is
# root-owned 0600, and a host-side grep only works here because Docker Desktop
# maps the bind mount's ownership to your user — on the CI runner it does not,
# which is how v4.14.0's image build failed after a green local run.
docker exec ngdpbase-release-smoke grep '^NGDPBASE_SESSION_SECRET=' /app/data/.env | sed 's/=.*/=<set>/'
docker exec ngdpbase-release-smoke grep -q 'ngdpbase-session-secret-change-in-production' /app/data/.env && echo "FAILED: shipped literal"

# #1192 — every bundled addon must have loaded IN THE IMAGE. AddonsManager
# logs and continues on a dead addon, so the container is healthy either way.
docker logs ngdpbase-release-smoke 2>&1 | grep "Failed to load add-on" && echo "FAILED: addon did not load"

# v4.17.1 — the HTTP checks CI runs. Healthy is not ready: the HEALTHCHECK
# probes /health/liveness, which answers 200 while the engine is still starting,
# and a fresh container's first start seeds every required page (#1405). Wait
# for readiness, then request / and /login exactly as docker-build.yml does.
# Skipping this is how v4.17.0 passed locally and failed its image build.
for i in $(seq 1 60); do
  R=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3099/health/readiness)
  ROOT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3099/)
  [ "$R" = "200" ] && [ "$ROOT" != "503" ] && [ "$ROOT" != "000" ] && { echo "  ready after ~$((i * 3))s"; break; }
  sleep 3
done
for u in / /login; do
  C=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3099$u")
  echo "  $u → $C"
  case "$C" in 200|301|302) ;; *) echo "FAILED: $u answered $C" ;; esac
done

# Half 3 — the run-as user (#1687, #1693). Without PUID/PGID the image must
# refuse; with them it runs as an ARBITRARY non-root UID:GID (977:988, an
# NFS-squashed volume's owner) with the versioning page provider and an
# instance .env holding secrets — once started as root with PUID/PGID (the app
# drops to them), once started directly as that user. These are the same
# commands as the two docker-build.yml steps "no PUID/PGID, no start" and
# "runs as an arbitrary non-root UID:GID, both ways": extract and run those
# steps against ngdpbase-release-smoke:local rather than retyping them here.
for STEP in "no PUID/PGID, no start" "runs as an arbitrary non-root UID:GID, both ways"; do
  ( echo 'set -e'; awk -v n="      - name: Smoke test — $STEP" 'index($0,n)==1{f=1;next} f&&/^      - name:/{exit} f' .github/workflows/docker-build.yml \
      | sed 1d | sed 's/^          //' | sed 's#${{ steps.img.outputs.ref }}#ngdpbase-release-smoke:local#' ) | bash \
    || echo "FAILED: $STEP"
done
```

Then clean up whatever the outcome:

```bash
docker rm -f ngdpbase-release-smoke ngdpbase-smoke-refuse ngdpbase-smoke-nopuid ngdpbase-smoke-runas-puid ngdpbase-smoke-runas-user 2>/dev/null
docker volume rm -f ngdpbase-smoke-runas-puid-data ngdpbase-smoke-runas-user-data 2>/dev/null
docker rmi -f ngdpbase-release-smoke:local 2>/dev/null
rm -rf "$SM"
```

- __Half 1 refuses, and halves 2 and 3 reach ready, with every check passing__ → continue to Step 5.
- __Either half fails, or an HTTP check fails__ → __stop__. Read `docker logs`. Nothing is tagged yet, which is the whole point of the step. A failing half is not a stale instruction to work around.

__If Docker is not running__, do not block the release: say so plainly, note it in the Step 9 report, and rely on Step 7a. A skipped check that is announced is fine; a skipped check that is silent is how #1035 happened.

This does not replace Step 7a. It cannot cover registry pushes, multi-arch, Trivy, or the `devtools` stage.

### Step 5: Bump the version with `version.ts`

ngdpbase ships its own version tool at `src/utils/version.ts` which keeps `package.json`, `package-lock.json`, `config/app-default-config.json`, and `CHANGELOG.md` in lockstep. __Do not__ edit those files by hand.

Run sequentially:

- `node dist/src/utils/version.js <bump>` — bumps all four files in one shot. Output looks like `Version updated: 3.3.6 → 3.3.7`.
- Stage all four updated files: `git add package.json package-lock.json config/app-default-config.json CHANGELOG.md`.

`package-lock.json` now __always__ changes on a bump — the tool writes the two places the lockfile mirrors the project version (top-level `version` and `packages[""].version`). Before this, it was left stale, npm rewrote it on the next `npm install`, and every satellite checkout showed a two-line lockfile diff that had to be inspected and discarded by hand at each release. If you see that diff on a satellite now, it is __not__ the old benign drift — investigate it.

### Step 5a: Capture a performance baseline + diff vs previous (#611)

After the version bump (so the new `<VERSION>` is reflected in the filename) and before the release commit, capture a baseline snapshot __and__ diff it against the most recent prior baseline in one shot:

- `npm run test:baseline:compare` — runs `scripts/baseline-profile.sh --compare`. Writes `docs/performance/baseline-v<VERSION>-<DATE>.md` (or `-r2.md` etc. if a same-day same-version baseline already exists), then appends a `## Drift vs <previous>` section to it and prints the same table to stdout.
- Stage the new file: `git add docs/performance/baseline-v<VERSION>-*.md`.

The plain `npm run test:baseline` is still available for non-release captures (just measure, no diff). Use `npm run test:baseline:cold` to also stop/start the server first (slower; only do this when a restart is already part of the plan).

The script auto-detects the previous baseline. If this is the first-ever baseline, the diff section is skipped and the script exits 0.

### Step 5b: Surface the perf diff to the user (and maybe stop)

The script flags regression candidates with `⚠️` and __exits non-zero__ when any threshold trips. __Default thresholds__ — override via env var if needed:

- `BASELINE_MEM_DELTA_PCT=25` — memory % regression
- `BASELINE_RT_DELTA_PCT=50` — route % regression (must trip together with the ms threshold below)
- `BASELINE_RT_DELTA_MS=50` — route absolute regression (avoids 1ms-on-already-fast-route false positives)

Behavior on regression: the script exits 1 with the warning printed. Acknowledge the regression in your reply, surface it in the release report (Step 9), and ask the user whether to proceed before continuing to Step 6. __Don't auto-rollback__ — measurement noise is real (cold-cache snapshots show 100ms+ outliers across the historical baseline series; see `docs/performance/`). User judgment required.

__No regressions__ (script exits 0): just include the printed Drift table in the report and continue.

__First release__ (no prior baseline): the script prints "no prior baseline to compare against" and exits 0 — proceed normally.

### Step 6: Commit, tag, and push

Run sequentially:

- `git commit -m "chore: release v<next>"` (with the standard `Co-Authored-By` trailer).
- `git tag -a v<next> -m "v<next>"` — keep the tag message short; the GitHub release will carry the detailed notes.
- `git push origin master` — push the commit first.
- `git push origin v<next>` — then the tag, so the release commit is reachable on the default branch.

### Step 7: Create the GitHub release (conditional)

__Auto-release rule:__

- __`minor` or `major`__ — always create the GitHub release. New feature surface or breaking change deserves a visible release entry every time.
- __`patch`__ — skip the GitHub release unless the user explicitly asked for one in this turn (or in an earlier turn of the same session). Patch chains shipped without releases can be consolidated later via the `/release` skill — see `.claude/commands/release.md`.
- __When in doubt or when the user asks__ — create the release.

When creating:

- `gh release create v<next> --title "v<next>" --generate-notes --notes-start-tag v<previous>`
  - `--generate-notes` autogenerates from merged PRs and commits in the range.
  - `--notes-start-tag` makes the range explicit so notes don't accidentally span multiple releases.

When skipping (patch with no explicit request):

- Push the tag (Step 6 already did this) and report in Step 9 that the release entry was deferred. Mention that `/release` can publish it later if needed.

### Step 7a: Watch the image build to completion (#1035)

Pushing the tag triggers `docker-build.yml`. Nothing used to check the result, so a red release build was invisible: `/semver` finished minutes before the workflow did. Two consecutive releases shipped with a failed image build and it surfaced only when a downstream repo could not resolve a `-devtools` tag.

Start the watch, then __run Step 8 while it builds__ — propagation takes longer than the image (v4.8.2: 5m42s), so this costs no wall-clock. Collect the result before reporting.

```bash
# The run for this tag — the newest, since the tag push just triggered it
gh run list --workflow=docker-build.yml --limit 1 \
  --json databaseId,displayTitle,status,conclusion

# Then poll until it completes
gh run view <id> --json status,conclusion --jq '"\(.status)/\(.conclusion // "-")"'
```

Since [#1228](https://github.com/jwilleke/ngdpbase/issues/1228) the workflow builds both images, runs every gate, and pushes only at the end: versioned tags first, `latest` + `latest-devtools` last. A red run means __nothing__ reached GHCR.

To dry-run the workflow against master without publishing: `gh workflow run docker-build.yml --ref master -f push_to_registry=false` (the input is honoured).

On __success__, verify the tags exist rather than trusting a green run; the check proves the publish step ran. `latest-devtools` is in the list because, before #1228, a failure between the two pushes left `latest` and `latest-devtools` on different releases, invisible from the workflow status (`v4.12.0`):

```bash
for t in <version> <version>-devtools latest-devtools; do
  docker manifest inspect ghcr.io/jwilleke/ngdpbase:$t >/dev/null 2>&1 \
    && echo "  EXISTS  $t" || echo "  MISSING $t"
done
```

On __failure__:

1. __Stop before the satellites__ if they have not already been done. They pull from git rather than GHCR so they are not directly broken, but a release whose image fails is a release with something wrong in it, and propagating further is the wrong reflex.
2. Get the failing step — `gh run view <id> --log-failed` — and report it.
3. Say plainly in Step 9 that __the git tag and GitHub release are already published__, though no image is (#1228). This step is detection, not prevention; the tag cannot be unshipped. Prevention lives in Step 4a.
4. Fix forward with a patch release; its tags appear together. Re-running the old workflow re-runs the old code and will fail identically.

### Step 8: Update sister installs

__Step 8a — Re-validate jimstest on the release commit FIRST (mandatory, before any satellite).__

The Step 4 test gate ran on the __pre-release__ commit. Step 5/6 then bumped the version and created the release commit *after* that gate, so jimstest's running server has NOT been validated on the final released code. jimstest is the source of truth and must never lag the satellites. Before invoking `/othersites`:

- `npm run build` (release commit is checked out) → `./server.sh stop && ./server.sh start` → `npm test` (unit must be GREEN) → `npm run test:e2e` if the release range touches any UI-affecting path (`views/**`, `public/**`, `src/plugins/**`, `addons/**`, `tests/e2e/**`; when unsure, run it).
- Only after jimstest is green on the __release commit__ do you proceed to the satellites.

This is non-negotiable: never propagate a release to satellites while jimstest is still on pre-release code. See `feedback_jimstest_first` in memory.

__Step 8b — Propagate to the satellites.__

Sister ngdpbase installs (e.g., The Fairways, the temp build) need to be told about the new release. Invoke the `/othersites` skill — defined in `.claude/commands/othersites.md`. It knows the list of installs and the update sequence (`git pull` → `./server.sh stop` → `npm run build` → `./server.sh start` → unit tests + E2E per site → file `[BUG]` issues for any failures). Because Step 8a already validated jimstest on the release commit, `/othersites` may run in satellite-only mode here (skip jimstest) — that skip is valid *only* because Step 8a was performed on the final code.

`/othersites` owns the instance list — treat it as the single source of truth and do not maintain a competing list here. As of v3.67.1 it tracks three:

- `/Volumes/hd2A/workspaces/github/fairways-base` (port 2121, "The Fairways")
- `/Volumes/hd2A/workspaces/github/ngdpbase` (port 3000, "jimstest" — the source of truth)
- `/Volumes/hd2/ngdp-temp-builds/ngdpbase` (port 3001, "ngdpbase temp build")

__Propagate only to the three instances above.__ In particular, the locally-running __GeoHazardWatch__ instance on port 3333 is a separate satellite with its own tracker, updated via the GHCR + Renovate delivery chain — *not* by this flow. Building in its working directory replaces `dist/` underneath a running server, silently staging a version the operator never chose to deploy.

If a site has uncommitted local diffs that block the pull (typically the seed required-pages file from an auto-migration), the pattern that's worked across past releases is `git checkout -- <file>` for the known-identical-to-master files, then re-run the pull. Untracked working notes in `private/` and similar are fine to leave alone.

__Read the diff before discarding it.__ `package-lock.json` used to show up here every release as a benign two-line version-string drift, and reflexive `git checkout --` became the habit. Step 5 now keeps the lockfile in lockstep, so that drift should no longer appear — a lockfile diff on a satellite today is a real change worth reading, not the old noise.

### Step 9: Report

Output to the user:

- Old version → new version
- Tag URL (from `gh release view v<next> --json url --jq .url`)
- Number of commits in this release (from Step 3)
- __Perf diff table__ from Step 5b (re-included here for easy reference; if any regression candidate was flagged, repeat the warning)
- __Container image__: the Step 4a local smoke-test result (or that it was skipped because Docker was unavailable), and the Step 7a workflow conclusion with the tag-existence check. State both — a green workflow with a missing `-devtools` tag is the exact shape of #1035.
- Whether `/othersites` propagation succeeded.

__Bookkeeping reminder (standalone `/semver` only):__ `/semver` does not touch `docs/project_log.md`, GitHub issues, or `/check-todos`. If this was a standalone invocation (not driven by `/session-commit`), add a project_log entry for the release event (version, baseline drift, `/othersites` results + any flakes) and comment/close any issues the release ships — see [Relationship to /session-commit](#relationship-to-session-commit). When `/semver` was invoked from `/session-commit`, its Steps 6–9 cover this; do not duplicate.

## Rules

- Never tag if the working tree is dirty.
- Never tag a commit that hasn't been pushed.
- Never skip the test suite before tagging.
- Never skip the GitHub release — auto-generated notes are the whole point of cutting a tag.
- Use annotated tags (`-a`), never lightweight tags.
- Tag names are always prefixed with `v` (e.g., `v3.3.7`, not `3.3.7`).
- For pre-1.0 versions, treat breaking changes as `minor` bumps (the standard pre-1.0 convention).
- `CHANGELOG.md` is updated automatically by `version.ts`; do not edit it by hand for release entries. (Manual edits are fine for descriptive prose between releases, but the version-bump line itself is owned by the tool.)
- Do not bump versions through `npm version` — it skips `app-default-config.json` and `CHANGELOG.md`.
