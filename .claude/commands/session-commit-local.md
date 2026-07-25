# Session Commit

Commit current work, validate on jimstest, decide a semver bump, propagate to the other instances, then update the project log and any related GitHub issues.

## Order

The high-level flow is:

1. Gather context
2. Create the commit
3. **jimstest pre-flight** (build → restart → unit tests → E2E if UI-affecting) — **runs by default** before propagation, but **skipped entirely for docs-only commits** (see Step 3 for the precise file-path rule).
4. **Semver decision** (patch / minor / major / skip)
5. **`/othersites` propagation** (pull + build + restart + tests on the satellite instances) — **only when Step 4 was `minor` or `major`**. Skipped for `patch` and `skip`. Standalone `/othersites` invocations (typed by the operator outside this command) are unaffected and always run.
6. Update project log
7. Update GitHub issues
8. Final commit and push
9. `/check-todos`

## Steps

### Step 1: Gather context

Run these in parallel:

- `git status` to see all changed files
- `git diff --stat` to see the scope of changes
- `git log --oneline -5` to match commit message style
- `gh issue list --state open --limit 20` to see related open issues

### Step 2: Create the commit

- Stage all relevant changed files (skip `.claude/settings.local.json` and other local-only files)
- Write a conventional commit message: `type(scope): description`
- Commit the changes

### Step 3: jimstest pre-flight (before propagation)

Validate the just-committed work on jimstest (this repo, port 3000) **before** running `/othersites` or making a semver call. Catches build / test regressions on the operator's primary instance first.

#### Docs-only skip (no pre-flight)

If the commit touches **zero runtime / test surface**, skip pre-flight entirely — there is nothing for the build to compile differently, nothing for the server to serve differently, and nothing for the test suite to exercise differently. Continue straight to Step 4 with `skip` as the expected semver outcome.

A commit qualifies as docs-only when **every** changed file matches one of these patterns:

- `*.md` anywhere (docs pages, READMEs, project log, TODO, CHANGELOG)
- `docs/**` (developer documentation tree)
- `required-pages/**` (end-user content shipped to all sites)
- `.claude/**` (Claude slash commands, agents, skills — not read by the running server)
- `.github/**` (GitHub issue/PR templates and Actions workflow YAML)
- `package-lock.json` **only when** the diff is a pure version-string sync (no dependency tree additions/removals) — confirm with `git diff package-lock.json | head -50` showing only the top-level `"version"` change

If **any** changed file is outside these patterns — `src/**`, `addons/**`, `views/**`, `public/**`, `tests/**`, `server.sh`, `config/**`, `package.json` dep changes, etc. — run the full pre-flight below.

When in doubt, run the pre-flight — the cost of an unnecessary cycle is bounded; the cost of shipping a broken release is not.

#### Standard pre-flight

Run sequentially from the repo root:

1. `npm run build` — must exit 0
2. `./server.sh stop` then `./server.sh start` — server must come up cleanly (the script reports `✅ Server started` and the URL when ready)
3. `npm test` — unit tests must end GREEN (210/210 files, 5500+/5500+ tests at time of writing). Re-run any single intermittent failure once before treating it as a real regression
4. **E2E — conditional**. Run `npm run test:e2e` if and only if the commit's file list (per `git diff --stat HEAD~1`) touches any of:
   - `views/**` (EJS templates)
   - `public/**` (static assets / client JS)
   - `src/plugins/**` (plugins that render content)
   - `addons/**` (addon code, themes, templates)
   - `tests/e2e/**` (the E2E tests themselves)

   For pure refactor / handler-logic / docs / config commits that don't touch any UI-affecting path, skip E2E — unit tests are the gate. If unsure, run E2E anyway.

If pre-flight fails: do **not** proceed to semver or `/othersites`. Diagnose, fix, amend or create a follow-up commit, then restart Step 3.

### Step 4: Semver decision

Decide whether this commit warrants a version bump:

- **patch** (`/semver patch`) — bug fixes, small UI tweaks, internal refactors, doc updates that don't add features
- **minor** (`/semver minor`) — new features, new addons, new public configuration, new public manager methods. Auto-publishes a GitHub Release.
- **major** (`/semver major`) — breaking changes to public APIs / config schema / data on disk. Auto-publishes a GitHub Release.
- **skip** — no version bump needed (very small docs-only / dev-only changes, or version was already bumped this session)

Note the typical pattern: `/semver patch` defers publishing the release; `/semver minor|major` auto-publishes. See `feedback_release_workflow.md` in memory for the full rules.

### Step 5: `/othersites` propagation (conditional)

Run `/othersites` **only if Step 4 was `minor` or `major`.** For `patch` releases or `skip` (no version bump), this step is **skipped entirely** — satellites stay on whatever release they last pulled and will catch up at the next minor/major. The rationale is that patch chains accumulate without churning every satellite restart; one consolidated propagation per minor is cheaper and lower-risk than per-patch propagation.

This applies only to `/othersites` invoked **as a step of /session-commit**. The operator can still run `/othersites` standalone at any time (e.g. `/othersites` typed directly) and it will always propagate — that path is unaffected by this gate.

Precondition for running: jimstest pre-flight (Step 3) must be green and any semver bump (Step 4) must already be pushed to origin. Satellites pull from origin, so the new tag has to exist there first.

**jimstest-first invariant (mandatory).** Step 3 pre-flight validated jimstest on the *pre-release* commit. A `minor`/`major` bump in Step 4 creates the version-bump + release commit *after* that, so jimstest is stale relative to what satellites will pull. `/semver` Step 8a handles this — it rebuilds + restarts + fully tests jimstest on the **release commit FIRST**, before any satellite. Do not let satellites be propagated while jimstest is still on pre-release code; jimstest (source of truth) must never lag the satellites. See `feedback_jimstest_first` in memory and `/othersites` "Mode".

Targets:

- `fairways-base` (port 2121, "The Fairways")
- `ngdp-temp-builds/ngdpbase` (port 3001, "ngdpbase temp build")
- `geohazardwatch` (separate repo, if affected — including the local instance on port 3333, which runs from the old `ngdpbase-veg` directory and updates via GHCR + Renovate, not via `/othersites`)

`/othersites` runs the same `git pull` → `./server.sh stop` → `npm run build` → `./server.sh start` → `npm test` → `npm run test:e2e` cycle on each. Note that the current `/othersites` skill also includes jimstest in its instance list — invoking it after Step 3 will re-process jimstest, which is harmless but redundant. (If repetition becomes annoying, update `/othersites` to skip jimstest when called from this command.)

If a satellite instance fails any step, fix or file a `[BUG]` (using `--template bug_report.md`) before continuing. Intermittent flakes that pass on retry can be noted in the project log rather than filed.

### Step 6: Update project log

Append a new session log entry to `docs/project_log.md` using this format:

```
## yyyy-MM-dd-##

- Agent: [Claude/Gemini/Other]
- Subject: [Brief description of the session's work]
- Current Issue: [GitHub issue number if applicable, or "none"]
- Tests: [unit pass count; E2E pass count if run; note any flakes]
- Work Done:
  - [task 1]
  - [task 2]
- Commits: [commit hash(es) from this session]
- Files Modified:
  - [list each modified file]
```

Rules for the log entry:

- One `##` heading per entry, flat bullet list, **no** `###` subheadings (long-standing repo convention)
- Use today's date for `yyyy-MM-dd`
- Use `##` as an incrementing number if there are multiple entries for the same date (start at `01`)
- For Agent, use the name of the AI agent (e.g., "Claude")
- For Current Issue, reference any GitHub issue numbers as `#123` format
- For Commits, use the short hash(es) from git log
- For Files Modified, list every file that was changed in this session

### Step 7: Update GitHub issues

For each related open GitHub issue:

- Add a comment summarizing what was done and referencing the commit hash(es)
- Use `gh issue comment <number> --body "<comment>"` to post
- If the work fully resolves the issue, note that in the comment but do NOT close it — let the operator decide (or rely on `Closes #N` in the commit message having auto-closed it on push)

If no GitHub issues are related to the current work, skip this step and note "none" for Current Issue in the log.

### Step 8: Final commit and push

- Stage the updated `docs/project_log.md`
- Commit with message: `docs: update project log for session yyyy-MM-dd-##`
- Push to remote (the satellite instances' next `/othersites` run will pull this)

### Step 9: `/check-todos`

Refresh the root `TODO.md` against live state if any items closed or were filed during this session.
