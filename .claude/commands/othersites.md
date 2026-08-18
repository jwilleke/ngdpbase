# Other Sites

Run the operator's update + validation cycle across the locally-installed ngdpbase deployments. Validates that a master-branch commit propagates cleanly to every running instance.

## Instances

| Path | Port | `PROJECT_NAME` | Notes |
|---|---|---|---|
| `/Volumes/hd2A/workspaces/github/fairways-base` | 2121 | `"The Fairways"` | Satellite checkout |
| `/Volumes/hd2A/workspaces/github/ngdpbase` | 3000 | `"jimstest"` | This repo / primary dev instance |
| `/Volumes/hd2/ngdp-temp-builds/ngdpbase` | 3001 | `"ngdpbase temp build"` | Throwaway build sandbox |

All three are checkouts of `jwilleke/ngdpbase`. Each has its own `.env` with `PROJECT_NAME`, `PORT`, `FAST_STORAGE`, `SLOW_STORAGE`. Their issues land in `jwilleke/ngdpbase`, not in satellite repos (per `feedback_cross_repo_coordination`).

This table is the __single source of truth__ for the instance list. Other skills should link here rather than keep their own copy — `/semver`, `/check-addons` and `/session-commit-local` all drifted out of sync until v3.67.1.

The `geohazardwatch` repo is a separate satellite with its own tracker and is __not__ part of `/othersites` scope today. Its locally-running instance listens on __port 3333__; do not pull, build, or restart it from this flow — it updates via GHCR + Renovate, and building in its working directory swaps `dist/` under a running server, staging a version nobody chose to deploy.

## Mode

`/othersites` runs in one of two modes — pick based on how it was invoked:

- __Standalone (default)__ — operator typed `/othersites` directly. Process __all three__ instances.
- __Satellite-only__ — `/othersites` was invoked from `/session-commit` Step 5 (no version bump) and jimstest was validated on the __exact commit being propagated__ in `/session-commit` Step 3 pre-flight. Only then __skip jimstest__ here and process the two satellites. Avoids double build+restart+test on the operator's working instance.

__Satellite-only is valid ONLY when no commit has landed since the jimstest validation.__ After a `/semver` bump, the version-bump + release commit land *after* the pre-flight gate, so pre-flight validated *pre-release* code — jimstest is then stale relative to what the satellites will pull. In that case jimstest MUST be rebuilt + restarted + fully tested on the __release commit FIRST__, before any satellite. `/semver` Step 8a now does this explicitly; if you reach `/othersites` from a release flow and Step 8a was not performed, process jimstest FIRST on the final commit, then the satellites. jimstest (source of truth) must never lag the satellites. See `feedback_jimstest_first` in memory.

If you're unsure which mode you're in, default to __standalone__. Redundant work is cheap; missed validation isn't.

## Per-instance flow

Process the in-scope instances __sequentially__ (not parallel — disk and CPU contention degrades results, and concurrent `./server.sh` calls fight pm2). For each instance:

1. __Check git state__ — `git -C <path> status --short` (warn if there are uncommitted local changes that aren't expected operator work-in-progress)
2. __`git pull --ff-only`__ (fail loudly on non-fast-forward — never force)
3. __`./server.sh stop`__ (run from instance dir via `(cd <path> && ./server.sh stop)`)
4. __`npm install`__ — __mandatory__ even when `package-lock.json` didn't change at first glance. New deps in `package.json` (or transitive bumps in `package-lock.json`) won't be in the satellite's `node_modules/` until install runs. Skip this step and `npm run build` may either fail loudly (`Cannot find module 'X'`) OR worse: succeed only for `dist/` it already had + leave the new code untyped/uncompiled, then `./server.sh start` happily serves stale dist (silent failure mode — server's "up" but missing the new behaviour). Observed on 2026-05-25 during v3.42.0 propagation when `jose` + `ffmpeg-static` were new deps. `npm install` is idempotent and fast on a no-change pull, so the cost of always running it is negligible vs the cost of a silent-stale-dist deploy.
5. __`npm run build`__ — must exit 0
6. __`./server.sh start`__ — wait for `✅ Server started` and the URL to print
7. __`npm test`__ — unit tests must end GREEN. Re-run any single intermittent failure once before treating it as a real regression
8. __E2E — conditional__ (matches `/session-commit` Step 3 policy). Run `npm run test:e2e` if and only if the commit range you're propagating touches any of:
   - `views/**`
   - `public/**`
   - `src/plugins/**`
   - `addons/**`
   - `tests/e2e/**`

   When in doubt, run E2E. When `/othersites` is invoked standalone without a specific commit reference, run E2E.

## Failure handling

- __Flake (passes on retry)__ — note in `docs/project_log.md` under the same session entry. Add a datapoint comment to `#622` if the failure shape matches its pattern (cold-start vitest race, supertest socket hang up, full-suite-only failure that passes in isolation). Don't file a new `[BUG]` for one-off retries.
- __Repeating flake__ — if the same test fails across multiple instances or sessions, file a `[BUG]` using `--template bug_report.md` (per global CLAUDE.md). Cross-reference `#622` if the shape matches.
- __Real regression__ (test fails deterministically on retry) — stop propagation, diagnose, fix, push, restart `/othersites`. Do not file the failure as a `[BUG]` if a fix lands the same session — the fix commit is the durable trail.

## Notes

- `./server.sh` is the only sanctioned way to start/stop (per `feedback_server_restart`). Never use `pm2`, `kill`, or `node` directly.
- The four servers normally run continuously via pm2; `./server.sh stop && start` cycles them cleanly without disturbing the others.
- Path quoting: jimstest is `/Volumes/hd2A/...`; temp-builds is `/Volumes/hd2/...` (different volume — note the missing `A`).
- After all instances are clean, log the run as a single project-log entry with a results table (one row per instance) plus a "Flakes seen" subsection.
