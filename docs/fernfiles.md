# Fernfiles vs ngdpbase — what they do better, what to borrow

Comparison of [activescott/fernfiles](https://github.com/activescott/fernfiles) (local checkout `/Volumes/hd2A/workspaces/github/fernfiles`, HEAD `e5dc73a`, 2026-08-23) against ngdpbase v4.11.1. Written 2026-08-23. Every claim about ngdpbase below was checked against the current tree; file:line references are to this repo unless prefixed `ff:`.

## Scale, so the comparison is fair

| | fernfiles | ngdpbase |
|---|---|---|
| Age | 15 days (first commit 2026-08-08) | ~1 year (first commit 2025-09-05) |
| Commits | 241 | 3,698 |
| TS lines | ~32k | ~206k |
| Unit test files / cases | 57 / ~627 | 320 / (much more) |
| E2E specs / tests | 25 / 207 | 9 / (fewer) |
| Storage | Postgres (metadata, jobs, activity, shares) + local-disk VFS | File-only: Markdown + JSON indexes |
| Deploy | k8s, Kustomize, Flux GitOps, self-hosted ARC runners | pm2 via `server.sh`; Docker image; k8s on deby for satellites |
| Scope | Files + folders + markdown notes; sharing; viewers | Full platform: pages, plugins, addons, ACL/policies, media library, search, forms, calendar, MCP, agent tokens |

Fernfiles is small, new, and single-purpose. ngdpbase is an order of magnitude bigger and does far more. Fernfiles has no page ACL model, no plugin-in-content system, no metadata vocabulary, no EXIF pipeline, no perf-baseline history, no REST API, no MCP, no CLI (all "planned"). Nothing below argues ngdpbase should become fernfiles. What fernfiles has is a handful of __discipline decisions__ made on day one that ngdpbase accreted partially, and a few concrete engineering patterns worth copying verbatim.

## TL;DR — the six things worth acting on

Ranked by observed operator friction in ngdpbase, not by how clever the fernfiles version is.

1. __Mutation audit has holes.__ ([#1080](https://github.com/jwilleke/ngdpbase/issues/1080)) ngdpbase audits `page.delete`, admin raw-edit, sessions, shares — but __not__ page create, edit, or rename (`src/routes/WikiRoutes.ts:4547` is the only page mutation audit call; grep for `page.edit`/`page.create`/`page.rename` finds nothing outside `RecentChangesPlugin`). Fernfiles logs every mutation with actor (`web`, `web:link-rewrite`, share identity) to a user-visible File Activity Log. "What happened to my page?" is answerable there; here it is answerable only if the versioning provider is on and only from the version manifest.
2. __Conflict protection is form-only.__ ([#1081](https://github.com/jwilleke/ngdpbase/issues/1081)) `baseLastModified` is checked at `src/routes/WikiRoutes.ts:3914`, but `mcp-server.ts` and the JSON API never send it, so every agent write is last-writer-wins. Fernfiles has no unconditional-overwrite mode in its storage interface at all (`ff:packages/server-core/src/vfs/types.ts:59-60`) and its rule 7 is "agents get no special destructive powers."
3. __Rename breaks links and has no safety net.__ ([#1082](https://github.com/jwilleke/ngdpbase/issues/1082)) `src/routes/WikiRoutes.ts:4423` says so in its own comment. Fernfiles rewrites inbound links on rename (bounded, conditional, each rewrite versioned and logged) and falls back to a rename-chain lookup from the activity log.
4. __No editor auto-save.__ ([#1083](https://github.com/jwilleke/ngdpbase/issues/1083)) `views/_basicEditor.ejs` is a plain POST form; a closed tab loses everything. Fernfiles has a 1.5 s idle / 10 s max debounce with an etag chain, halt-on-conflict, and `sendBeacon` leave-flush.
5. __No liveness/readiness endpoint.__ ([#1079](https://github.com/jwilleke/ngdpbase/issues/1079)) `docker/k8s/deployment.yaml:154-169` and the Dockerfile `HEALTHCHECK` probe `/` — a full page render through auth, ACL, and the rendering pipeline, accepting 200 or 302. Only `/admin/attachments/health` exists as a dedicated route. Fernfiles has `/ops/health/liveness` (static 200), `/ops/health/readiness` (dependency check, 503 pulls the pod from rotation), and `/ops/metrics` behind one ingress rule.
6. __Tests that cannot fail.__ ([#1084](https://github.com/jwilleke/ngdpbase/issues/1084)) Fernfiles twice shipped a green regression test that was vacuous, found out by reverting the fix and watching CI stay green, and now writes that down as a rule. ngdpbase's `docs/testing/PREVENTING-REGRESSIONS.md` does not have this rule.

A seventh, found while verifying the report, is a live bug: malformed `Range` headers hang the media route ([#1078](https://github.com/jwilleke/ngdpbase/issues/1078)).

Everything else below is context, detail, and the "nice but not now" pile.

## What fernfiles does better — detail

### 1. Durability is a binding, checklisted tenet, not a value statement

`ff:docs/durability.md` has eight numbered rules (never destroy the only copy; conflicts don't pick a loser; atomic writes; every mutation logged; deleted/renamed stays findable; export always works; agents get no special powers; durability tests are release gates) and a five-question decision checklist. `ff:AGENTS.md:8` makes it mandatory: every spec `plan.md` has a `## Durability` section answering the checklist (present in 23 of 30 specs), and every PR touching write/delete paths answers it in the description via the PR template. Code comments cite rules by number (`ff:local.ts:258`).

ngdpbase ground truth: the pieces exist but as independent features with different coverage.

- Atomic temp+rename writes: yes, `src/utils/atomicWrite.ts` (#1062), fsync off by default with a measured justification. Same mechanism as fernfiles, arguably better documented.
- Versioning: only with `versioningfileprovider`; the shipped default `filesystemprovider` overwrites in place and hard-deletes (`src/providers/FileSystemProvider.ts:686-702`). A fresh install is __not__ durable by default.
- Tombstone delete + restore + retention: yes (#947), versioning provider only.
- Conflicts: 409 with re-editable form (`views/edit-conflict.ejs`) — the loser keeps their text in the browser, nothing is written. Fernfiles writes a conflict sibling to disk so both survive a closed tab too.
- Mutation log: partial (see TL;DR 1).
- Durability tests as release gates: none specifically. No kill-mid-write test, no two-writer test.

__Lesson:__ the value is not the rules, it is the __checklist at design time__. ngdpbase's `AGENTS.md` "Think Before Coding" is generic; a five-question durability checklist for any issue touching `PageManager.savePage`, delete, rename, attachments, or migrations would have caught #1062 and the #789 orphan-index chain earlier.

### 2. The storage interface forbids unconditional overwrite

`ff:types.ts:59-60`: `VfsStreamWriteMode = {kind:"create"} | {kind:"overwrite"; expectedEtag}`. There is no third option. Restore is also a conditional write (`VfsRestoreTarget`), so restore is itself undoable. Rename migrates history __before__ the live entry so a crash between the two is healed by retrying the same rename (`ff:local.ts:546-552`).

ngdpbase: `PageManager.savePage` has no base-version parameter; the check lives in the route (`WikiRoutes.ts:3903-3933`) and only fires when the form field is present. `mcp-server.ts` `update_page` and `POST /api/page/ingest` bypass it entirely. Before changing this, confirm how the agent-token write path and `ingest` callers would obtain and return a token.

__Smallest slice:__ accept an optional `baseLastModified` in `update_page` (MCP) and the ingest API, return `lastModified` from every read so agents can chain it, and 409 on mismatch. Do not make it mandatory yet — satellites and scripts would break.

### 3. Rename: history moves, links follow, failures are idempotent

Fernfiles `ff:rewrite.server.ts`: after a rename commits, it scans notes that link to the old name, rewrites each with a conditional write (so every rewritten note gets its own version and activity row `link-rewrite`), retries once on conflict, never throws (an exception would turn a committed rename into "rename failed" inviting a destructive retry), bounded by count and a 20 s wall clock. Deliberately __no__ conflict siblings for machine-derived text. Second mechanism: when live resolution fails, `rename-chain.ts` walks `rename`/`move` rows in the activity log (8 hops, refuses on ambiguity at every hop).

ngdpbase: UUID-keyed files mean history survives rename for free — better than fernfiles' path-keyed history. But `[Old Title]` links in other pages go red, there is no redirect, and `apiRenamePage` documents that it has no safety net. `RenderingManager.linkGraph` already knows every referrer (it is used to clear their render cache on rename, `WikiRoutes.ts:4414-4487`), so the candidate list is already computed.

__Smallest slice:__ on rename, log the old→new title pair (audit event `page.rename`) and have `PageNameMatcher`/`DOMLinkHandler` consult a rename map before declaring a red link. That is the rename-chain fallback without touching any page content. Content rewrite can come later, if ever — NCM links are title-based and `PageNameMatcher` already does fuzzy resolution, so a rename map may be enough.

### 4. Auto-save done carefully

`ff:use-editor-autosave.ts`: idle 1.5 s, max interval 10 s, status `pristine|dirty|saving|saved|error|conflict`, etag chained from each save's __response__ (not loader revalidation, which races with typing), a guard against self-conflict when a completed save has not been processed, permanent halt on conflict with a banner in host chrome (not inside the viewer — a lesson from `ff:011/summary.md:118`), `sendBeacon` on `pagehide` with keepalive-fetch fallback, and flush explicitly skipped while a save is in flight (a stale second POST could regress the file).

ngdpbase: none. `ngdpbase.page.provider.filesystem.autosave` is a provider flag, not this.

__Value check:__ has anyone lost editor text in ngdpbase? If yes, this is P1. If not, a `localStorage` draft (restore on reopen) is the 20-line version that removes the data-loss risk without touching the save path or conflict semantics. Ask the operator which.

### 5. Two logs with stated guarantees, actor on every row

Fernfiles keeps a synchronous pino mutation log (the durability record) __and__ a fire-and-forget Postgres `FileActivity` table (the queryable user view that may lag). They say which is which. One op (`rename`) is awaited durably because link rewrites depend on it. Table has no FK to `User` so account merges cannot cascade-delete history.

ngdpbase has a mature `AuditManager` with file provider, rotation, retention, search, export, and an admin UI — strictly more infrastructure than fernfiles. It is just not called for the common mutations. Adding `page.create`, `page.edit`, `page.rename`, `attachment.upload`, `attachment.delete` events with `actor` and `viaTokenId` (the delete path already does this at `WikiRoutes.ts:4533-4563`) is a few call sites. Then `RecentChangesPlugin` could become a view over the audit log instead of over page metadata.

### 6. Health, metrics, and request IDs

- `/ops/health/liveness` static 200; `/ops/health/readiness` does `SELECT 1`, 503 on failure. Probes flipped via temporary alias routes (expand/contract) so old and new pods never 404 their own probe mid-rollout.
- `/ops/metrics` prom-client, unauthenticated, reachable only from cluster (ingress denies `/ops/*` from the internet). Active-user gauge deliberately uncached because caching made e2e nondeterministic.
- `pino-http` with `x-request-id` passthrough or `randomUUID()`, __allowlist__ serializers because the default `req` serializer dumps the session cookie, probe requests logged at `trace`.
- Redaction configured on the logger, not per call site: path keys become `<hmac12>.<ext>:d<depth>` (extension and depth still queryable), identity keys become digests. "A rule that has to be remembered per call is a rule that leaks the first time someone adds a line in a hurry."

ngdpbase: OpenTelemetry metrics exist (default off, `/metrics` at `src/app.ts:625-634`); winston file logging with `redactSecrets.ts` helper; __no request IDs__, __no dedicated health endpoint__ — probes hit `/`, so a slow render or a redirect loop reads as healthy/unhealthy for the wrong reasons, and readiness cannot distinguish "booting, index not loaded" from "up".

__Smallest slice:__ `GET /health/liveness` (200, no dependencies) and `GET /health/readiness` (checks `FAST_STORAGE` writable and page index loaded). Twenty lines. Request IDs via a tiny middleware setting `req.id` and a winston default-meta — worth it the next time a deby pod log has to be correlated with a user report.

### 7. Tests that are proven to be able to fail

Three fernfiles rules, each written after it cost them:

- __"A test that cannot fail is worse than no test."__ `ff:016/summary.md:104` — the first mid-download-abort test downloaded 64 bytes, written in one shot, so `abort()` landed after the body finished. CI on a branch with the fix reverted went green. The fixed test uses an 8 MiB incompressible body and asserts the first chunk is smaller than the whole body, so the premise is checked, not assumed.
- __Local and CI e2e are different servers__ (Vite dev vs production image in kind). A dev-only test seam gated on `import.meta.env.DEV` failed eight specs on CI that passed locally. "Assume a local pass proves the test does not error, not that it proves what it claims."
- __Re-run a failure the way the suite ran it.__ `--keep-users` made a spec fail twice in a row, reading exactly like a reproducible regression; it passed 4/4 without the flag.
- __Process-level SIGKILL test__ as a release gate: spawn a child running the real VFS against real disk, feed it an endless slow stream, kill on a stdout marker proving bytes are mid-flight, assert old-content-or-nothing plus intact history (`ff:local-kill-mid-write.test.ts`).

ngdpbase has far more tests, a documented vitest pool tuning (#622), and the hard-won "never wipe `./data/`" teardown rule (#1065 just moved suite temp trees out of `src/`). What it lacks is the __prove-it-fails__ step in `PREVENTING-REGRESSIONS.md` and any crash-mid-write test for `atomicWrite` / `page-index.json` / version manifests. The `atomicWrite` helper is exactly the kind of code a SIGKILL test pins.

### 8. Spec → PRs → summary, with lessons as first-class output

`ff:docs/specs/<nnn>-<name>/plan.md` (Goal, Decisions with date and who signed off, Design, __Durability__, Tests, PR breakdown, Out of scope, Follow-ups, Rollback) and `summary.md` as an append-only progress log per PR with `## Verification performed` carrying real numbers, `## Gotchas discovered`, `## Quick commands`, and `## What is NOT done`. `handoff.md` is the index with an explicit rule: update it in the same PR as the summary, plus the README status table, plus the landing page's `comingSoon` flags.

The postmortem `ff:016-stream-abort-crash/summary.md` is the best single artefact in the repo: root cause traced into `@react-router/node`'s `StreamPump.cancel` ordering, why rollback was rejected, the wrong theory that was held for two reproduction attempts, the vacuous test, follow-up issues filed (alerting, single-replica outage, missing scenario), and a test that __pins the upstream bug__ so if react-router fixes it the workaround is flagged removable.

ngdpbase: `private/project_log.md` (gitignored) holds session history; `docs/` has 900+ files organized by subsystem; GH issues hold decisions. The per-issue __rationale__ is spread across issue comments and commit messages, which is fine for a single maintainer, but there is no equivalent of a postmortem file for the #789 orphan-index chain or the `./data/` wipe incident — both were exactly the "wrong theory, then ground truth" story fernfiles writes up.

__Do not copy the spec directory structure__ — AGENTS.md forbids phases inside one issue and the issue-per-step convention already works. __Do copy__ the postmortem form for the next incident that costs more than an hour: what happened, wrong theory, what actually reproduced it, what test now pins it, follow-ups filed. One file under `docs/postmortems/`, linked from the issue.

### 9. CI gates on generated artefacts and on the shipped image

- Generated registries are committed and `git diff --exit-code`'d after regeneration — forgetting to regenerate is a CI failure, and a plugin's wiring shows up in the PR diff.
- Schema-vs-migrations drift check against a throwaway Postgres, with an error message naming the fix command and distinguishing "drift" from "the check broke."
- `scripts/validate-prod-image` imports the bundle __inside the built container__ with a fake-but-valid env, because a sibling project passed every source-tree check and crash-looped in prod on a missing dependency.
- CI e2e deploys the __production Dockerfile__ into kind, not the dev server.
- `paths-ignore` for `**/*.md` and `docs/**` with the reasoning inline (an 18-minute e2e for a docs change).
- Comments in config files name the incident and date that caused the setting (`workers: 2`, `tagPolicy: inputDigest`, no `portForward`, 20 s vitest timeout with the three dates it blew the 5 s default).

ngdpbase: `docs:index:check` and `lint:docs` drift gates in pre-commit already follow the first pattern. `docker-build.yml` builds the image but nothing starts it and hits a route. __Smallest slice:__ after the image builds, `docker run` it with `FAST_STORAGE=/tmp/x` and curl the (new) liveness endpoint. The "serves stale code" class of bug is what an image smoke test catches.

### 10. Per-worktree dev instances, zero config

`ff:scripts/lib/dev-env.sh` derives namespace, database, and hostname from the checkout directory name; all instances share port 3300 and ingress routes by Host header. Two agents ran 164-test e2e suites concurrently in two checkouts. `reset-dev` deletes only its own namespace.

ngdpbase: `server.sh` refuses a second instance on the same port ("not yet supported", `server.sh` port check) and multi-instance is env-var driven. With pm2 and file storage the fernfiles design does not transfer directly, but the __need__ does: a worktree-aware `server.sh` that derives `PORT`, `FAST_STORAGE`, and the pm2 process name from the directory would let a second agent run tests without stopping jimstest. Medium value, medium cost; only worth it if parallel agent sessions are actually happening.

### 11. Plugins cannot write; the host owns atomicity

`ff:viewer-contract/src/vfs.ts` gives viewers a __read-only__ VFS, so a plugin structurally cannot fork the conditional-write/conflict logic. Derived producers (ffmpeg) get a temp directory and throw; the host does the atomic publish/discard. The descriptor ("what the output is") is a separate entry point from the producer ("how to make it") so `node:child_process` never enters the web bundle — enforced by the image import gate. Durability-visible UI (the conflict banner) lives in host chrome, never inside a viewer, after a viewer once swallowed it.

ngdpbase plugins and addons have full engine access by design (addons register managers, routes, auth providers). That is the right call for a platform. The transferable idea is narrower: __when an addon writes pages, it must go through `PageManager.savePageWithContext`__ and nothing else. Worth a one-line rule in `docs/plugins/` and a grep-based check, the same way `check-csrf-fetch.ts` guards fetches.

### 12. Background sweeps that cannot starve

`ff:paged-scan.ts` `scanFromRandomStart`: keyset paging entering at a random UUID and wrapping, so a budgeted sweep that runs out of time does not re-enter at the same big user forever; no persisted cursor because a crash-looping pod would reset it to the top exactly when the system is least healthy. Cooperative deadlines checked __between__ units of work (the unit is an `rm -rf`; interrupting it creates the state the sweep exists to clean). `deferred` reported separately from `truncated` because deferral is healthy and truncation is a missed deadline. A mount-check guards against reading an unmounted volume as "every file was deleted."

ngdpbase `BackgroundJobManager`, hourly tombstone purge, media rescan, version maintenance: none are budgeted; they run to completion. Fine at current scale. The __mount-check__ is the one to steal now: `SLOW_STORAGE` is an external volume on this Mac and on deby; a purge or reconcile job that runs while it is unmounted should refuse, not act on an empty tree. Check whether `purgeExpiredDeletedPages` and `reconcile:mentions` already do.

### 13. Migrations: the re-run trap and expand/contract

`ff:AGENTS.md` "Database migrations": prod is the only populated database a migration ever meets, so CI proves only that the SQL parses; the four-step form for a required column; destructive changes split across two releases because the old pod still serves during rollout; a failed migration is a hung rollout, not a rollback. `ff:023/summary.md` found `DROP CONSTRAINT IF EXISTS` is not idempotent by __running the migration file twice__ against a throwaway database.

ngdpbase has no SQL, but it has ~15 `migrate-*.ts` scripts plus boot-time `autoMigrateExistingPages()` and `migratePageIndexEntries()` (`VersioningFileProvider.ts:733-760`). Same trap applies: dev and test run them against empty or tiny trees; jimstest and the 18,000-page instance are where they meet real data. The `:dry` variants are good. __Add to the rule set:__ every migration script is run twice against a copy of real data before release, and the second run must be a no-op. Most likely already practised — write it down in `docs/migration/`.

### 14. Honest user-facing status

`ff:README.md` has a done/planned table; `handoff.md` requires the landing page's "What works today" list to change in the same PR a feature ships, because "a landing page that promises shipped features as future ones (or vice versa) is the most visible thing we get wrong." `getting-started.md` opens with "don't trust it with your most important stuff yet."

ngdpbase: `docs/SEMVER.md` still says v1.2.0 and references a deleted `scripts/version.js`; `AGENTS.md:223` says Jest while the project runs Vitest. Small, but the same class. Fix both (trivial) and consider whether `required-pages/` help content has a similar done/planned drift.

## Things fernfiles chose that ngdpbase should not copy

- __Postgres.__ ngdpbase's file-only design is a feature ("your data, your disk" — fernfiles says the same thing and then puts shares, jobs, activity, and users in Postgres). Keep file-only; put the activity log in the existing `AuditManager`.
- __Path-keyed version history.__ ngdpbase's UUID-keyed `pages/{uuid}.md` + `versions/{uuid}/` is better: rename costs nothing and cannot strand history. Fernfiles needed `moveSubtree`, `mergeDirectories`, and crash-ordering rules to get what ngdpbase has for free.
- __Per-request link index rebuild.__ Fernfiles rebuilds the whole link index per request (capped at 5,000 files) because it has no job runner to repair a stale one. ngdpbase's incremental in-memory `linkGraph` is the right design at 18k pages.
- __`[[Name]]` link syntax.__ NCM `[Title]` with `PageNameMatcher` plural handling is already settled; do not reopen.
- __Spec directories with numbered phases.__ Conflicts with the issue-per-step rule in AGENTS.md and the kit. Keep issues as the unit; borrow only the postmortem form.
- __Sharing by identity with an FGA-shaped choke point.__ ngdpbase's role/policy/audience model is a superset; link-scoped shares with TTL already exist. Nothing to borrow except the sentence "every permission decision goes through `ACLManager`; expressing one anywhere else is a bug" — which ngdpbase already lives by.
- __No CLI, REST, or MCP.__ ngdpbase has all three. Fernfiles' planned OAuth device flow for agents is worth reading when agent tokens (#946) grow scopes, not before.

## Recommended issues, in order

Value-over-cool filter applied: observed friction first, architecture second. Each is a single issue; none bundles another.

All twelve were reviewed on 2026-08-23; the first seven are filed, the rest stay parked until the friction is observed.

| # | Title | Issue | Label | Smallest slice |
|---|---|---|---|---|
| 1 | Audit `page.create` / `page.edit` / `page.rename` / attachment upload+delete with actor | [#1080](https://github.com/jwilleke/ngdpbase/issues/1080) | P1 | 5 `logAuditEvent` call sites mirroring `auditPageDelete` |
| 2 | `GET /health/liveness` + `/health/readiness` | [#1079](https://github.com/jwilleke/ngdpbase/issues/1079) | P1 | Two routes registered before wiki routes like `/metrics`; repoint `docker/k8s/deployment.yaml` and `HEALTHCHECK` |
| 3 | Optional `baseLastModified` on MCP `update_page` and `/api/page/ingest`, 409 on mismatch | [#1081](https://github.com/jwilleke/ngdpbase/issues/1081) | P1 | Route-level check already exists; plumb the field, return `lastModified` on reads |
| 4 | Rename map consulted before red-link, `page.rename` audit row as its source | [#1082](https://github.com/jwilleke/ngdpbase/issues/1082) | P1, blocked by #1080 | No content rewrite; resolver fallback only |
| 5 | Editor draft persistence (`localStorage`) or real auto-save | [#1083](https://github.com/jwilleke/ngdpbase/issues/1083) | needs-triage | Open question in the issue: has editor text actually been lost here? |
| 6 | Malformed `Range` on `/media/file/:id` hangs the connection | [#1078](https://github.com/jwilleke/ngdpbase/issues/1078) | P1, bug | Validate before `writeHead`, 416 on unsatisfiable, `stream.pipeline` |
| 7 | `PREVENTING-REGRESSIONS.md` rules + `SEMVER.md` / `AGENTS.md` drift | [#1084](https://github.com/jwilleke/ngdpbase/issues/1084) | P2, documentation | Doc edits |
| 8 | SIGKILL-mid-write test for `atomicWrite` and `page-index.json` flush | — | parked | One vitest file spawning a child, as `ff:local-kill-mid-write.test.ts` |
| 9 | Docker image smoke test in `docker-build.yml` | — | parked, wants #1079 | `docker run` + curl liveness after build |
| 10 | Mount/empty-tree guard in purge and reconcile jobs | — | parked | Stat root, refuse if missing or empty when index says non-empty |
| 11 | Request ID middleware + winston default meta | — | parked | `req.id` = `x-request-id` or UUID |
| 12 | Postmortem form under `docs/postmortems/` for next >1 h incident | — | parked | Template only, no backfill |

Not filed, parked: worktree-aware `server.sh`; logger-level path redaction; budgeted background sweeps; addon write-path guard. Revisit when the friction is observed, not before.

## One concrete bug-shaped thing — confirmed

`src/routes/WikiRoutes.ts:16325-16350` (`streamMediaItemFile`) parses `Range` by hand with no bounds check. Reproduced on jimstest 2026-08-23: `bytes=999999999-`, `bytes=abc-`, and `bytes=50-10` all send `206` headers, then `fs.createReadStream` throws `ERR_OUT_OF_RANGE` synchronously; the catch logs it but headers are already sent, so the response never completes and the client waits out its own timeout (`curl` reports `000` after 2 minutes). Filed as [#1078](https://github.com/jwilleke/ngdpbase/issues/1078).

The fernfiles crash (`ff:016`) does not apply — `src/app.ts:117` installs an `uncaughtException` handler — but the bare `.pipe(res)` on both the range and whole-file paths is the same shape: a disconnect mid-stream leaves the `ReadStream` unpiped rather than destroyed. `stream.pipeline(readStream, res, cb)` plus a 416 branch is the whole fix.

## Sources read

- fernfiles: `README.md`, `AGENTS.md`, `docs/durability.md`, `docs/specs/handoff.md`, `docs/specs/001-original-requirements/plan.md`, `docs/specs/016-stream-abort-crash/summary.md`, plus agent-driven reads of specs 004, 009, 011, 012, 015, 017–027, `packages/server-core/src/vfs/*`, `packages/viewer-contract/src/*`, `packages/worker/src/*`, `packages/web-app/app/lib/{files,wiki,derived}/*`, `tests/e2e/*`, `.github/workflows/*`, `scripts/*`, `k8s/*`.
- ngdpbase: `AGENTS.md`, `src/utils/atomicWrite.ts`, `src/utils/pageVersionToken.ts`, `src/routes/WikiRoutes.ts` (save, rename, delete, media stream, audit call sites), `src/providers/{FileSystemProvider,VersioningFileProvider}.ts`, `src/managers/{AuditManager,AuthManager,ShareManager,AddonsManager,BackgroundJobManager,MetricsManager}.ts`, `mcp-server.ts`, `views/_basicEditor.ejs`, `.github/workflows/*`, `server.sh`, `docs/architecture/Current-Save-Page-Pipeline.md`.
