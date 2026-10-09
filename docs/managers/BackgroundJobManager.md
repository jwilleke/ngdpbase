---
name: BackgroundJobManager
description: Long-running job registry + scheduler with progress reporting and polling API
dateModified: '2026-10-09'
category: managers
code: src/managers/BackgroundJobManager.ts
---

# BackgroundJobManager

Lets the platform run long-running work (page-reindex, version-history maintenance, bulk imports) without blocking request handlers. Each job type is registered with a unique id, a display name, and a `run(reportProgress)` function. Job results carry a success flag + a summary string.

## Core Types

| Type | Purpose |
|---|---|
| `JobDefinition` | Registered job blueprint: `{ id, displayName, run }`, plus `schedule`, `catchUp`, `overlap`, `timeout` and `persist` for a scheduled job |
| `JobResult` | What a job's `run` resolves with: `{ success, summary? }` |
| `ReportProgress` | Callback the job calls during execution to push live progress messages |
| `JobRunContext` | The `ctx` a run receives: who asked (`JobContext`), the `signal` aborted on timeout, the `slot` it runs for, `resume` (set when it picks up an unfinished slot) and `checkpoint(data)` |

## Lifecycle

1. __Register__ — call sites add `JobDefinition`s during init (e.g. `pages.reindex`).
2. __Start__ — operator/API triggers a job; manager creates a job instance with a UUID + tracks status.
3. __Run__ — the `run` callback executes; can call `reportProgress(message)` repeatedly.
4. __Poll__ — clients poll `/api/jobs/:id` for status + latest progress messages.
5. __Complete__ — manager records `JobResult` and surfaces in notifications.

## Scheduled jobs (#1715)

A job registered with a `schedule` also runs by itself. The design and its decisions are on epic [#1611](https://github.com/jwilleke/ngdpbase/issues/1611). For add-on authors: [Background Jobs](../guides/addons-developer-guide.md#8-background-jobs); for operators: [Scheduled Jobs](../admin/Scheduled-Jobs.md).

```ts
jobManager.registerJob({
  id: 'accounting.month-close',
  displayName: 'Accounting: month close',
  schedule: 'end-of-month 06:00',   // or an RRULE: { rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=6;BYMINUTE=0', tz: 'America/New_York' }
  catchUp: 'latest',                // none | latest (default) | all (newest 12)
  overlap: 'queue',                 // queue (default, one waits) | skip
  timeout: 2 * 60 * 60_000,         // default 1 h; 0 = no limit
  run: async (reportProgress, ctx) => {
    // ctx.slot is the slot's instant; stop when ctx.signal is aborted
    return { success: true };
  }
});
```

- The schedule is an RRULE or a shorthand, compiled by `src/utils/schedule.ts`. A schedule that does not compile throws from `registerJob`.
- Every 15 s the scheduler looks for due slots. Which run and which are skipped is decided by `selectSlots` in `src/utils/jobSlots.ts`: slots that came due while the job ran follow `overlap`; slots missed while it was idle or the server was down follow `catchUp`. A skipped slot is recorded in the job's history and in one `job-skipped` audit event, never dropped silently.
- A slot runs once: under a lock in the job state, as the system principal with origin `schedule`. A slot another server holds (a rolling update) is left to it.
- State (next slot, last slot done, current run, history, locks) is kept by a `JobStateProvider` (`src/providers/jobState.ts`), chosen by `ngdpbase.jobs.state.provider`. `persist: false` keeps it in memory instead: no catch-up after a restart and no lock.
- `ngdpbase.jobs.<jobId>.schedule` overrides a job's schedule and `ngdpbase.jobs.<jobId>.enabled: false` stops it; both are read on every look. A changed rule, at runtime or across a restart, counts slots from then, catches nothing up for the old rule, and is audited as `job-schedule-change`.
- The scheduler starts from `app.ts` once add-ons have loaded (`startScheduler()`).

| Key | Default | |
|---|---|---|
| `ngdpbase.jobs.state.provider` | `auto` | `sqlite` when the application database is open, else `file` |
| `ngdpbase.jobs.state.dir` | `${FAST_STORAGE}/jobs` | the `file` backend's folder |
| `ngdpbase.jobs.min-interval-ms` | `60000` | slots closer than this are refused |
| `ngdpbase.jobs.max-timeout-ms` | `0` | caps every job's timeout; 0 = no cap |
| `ngdpbase.jobs.history-limit` | `50` | runs kept per job |
| `ngdpbase.jobs.max-checkpoint-bytes` | `65536` | largest checkpoint a job may save |
| `ngdpbase.jobs.shutdown-grace-ms` | `5000` | how long running jobs get to stop at shutdown |

### Attempts, resume and checkpoints (#1716)

- A scheduled slot gets `maxAttempts` (default 3). A failed attempt — an error, a timeout, a `success: false` result, or the server stopping mid-run — is tried again after 1, 5, then 15 minutes, with the same run id and slot. While it waits, the job starts no other slot. After the last attempt the slot is failed for good and audited, and the next slot runs as usual.
- A run the state still names as running, whose lock has expired, belongs to a server that stopped: it counts as a failed attempt. One whose lock is still held belongs to a live server and is left alone. A run handed off as `interrupted` at shutdown is picked up at once and does not count (the shutdown handoff below writes it).
- The next attempt gets `ctx.resume = { attempt, checkpoint, reason }`.
- `ctx.checkpoint(data)` saves a bookmark such as `{ doneThrough: 311 }`: JSON, at most `ngdpbase.jobs.max-checkpoint-bytes` (default 64 KiB; larger throws to the job), written at most once every 5 s with the latest winning, and once more when the run ends. Deleted when the slot succeeds, kept when it fails. Without a checkpoint, a resumed job starts its slot again, so a job must be idempotent per slot.

### Shutdown handoff (#1717)

- On SIGTERM (Docker, Kubernetes) or SIGINT (PM2, a terminal), app.ts calls `engine.shutdown()`, which calls `handOff()` before any manager stops, add-ons included.
- `handOff()` starts no new slot, aborts every running job's `ctx.signal`, and gives the jobs `ngdpbase.jobs.shutdown-grace-ms` (default 5 s) to stop.
- A scheduled run that has not finished is then saved as `interrupted`, with its last checkpoint, and its slot lock is released. A job that ignores its signal is handed off when the grace ends. Each is audited as `job-interrupted`.
- The next start resumes an interrupted run at once, as the same attempt, with `ctx.resume.reason` `interrupted`.
- A hard kill (SIGKILL, a crash, power loss) reaches none of this: the run's lock expires after 60 s and the resume counts as an attempt.
- Nothing depends on PM2, systemd, Docker or Kubernetes beyond delivering the signal.

### Maintenance jobs (#1721)

`registerMaintenance({ id, displayName, everyMs, run })` declares a routine tick whose next run does the same work, in place of a hand-rolled `setInterval`: every `everyMs` in whole minutes (at least one), `catchUp: 'none'`, `overlap: 'skip'`, `persist: false`, one attempt. A success is neither audited nor notified; a failure is. `everyMs` 0 leaves the job unscheduled.

Core's maintenance jobs: `media.folder-scan` (`ngdpbase.media.scaninterval`), `pages.delete-retention` (hourly, when delete retention is on), `audit.archive-retention` (hourly), `tokens.maintenance` (`ngdpbase.auth.agent-token.sweep-interval-seconds`) and `sessions.key-sweep` (every 10 minutes). BackgroundJobManager starts right after DatabaseManager so every manager can register during its own initialize. The `setInterval`s left in core are write flushes, the scheduler's own tick and lock heartbeat, and a server-sent-events keep-alive — none of them scheduled work.

### Admin page and API (#1718)

`/admin/jobs` (linked from the dashboard) lists every scheduled job: its schedule and time zone, next slot, last slot done, the run in hand, and its recent history with skipped and failed slots. The same list is `GET /api/admin/jobs/scheduled`. Reading needs admin read access.

| Action | Form | API | Permission |
|---|---|---|---|
| Run now: outside the schedule, as the person asking; marks no slot done, is not retried | `POST /admin/jobs/:jobId/run-now` | `POST /api/admin/jobs/:jobId/run-now` | `admin-system` |
| Run a skipped slot, or one that failed for good, again under its own time (`slot` in the body); success marks that slot done, the next slot does not move | `…/rerun` | `…/rerun` | `admin-system` |
| Retry a run waiting out its backoff now | `…/retry` | `…/retry` | `admin-system` |
| Pause or resume (`paused` true or false): writes `ngdpbase.jobs.<jobId>.enabled` | `…/pause` | `…/pause` | `config-manage`, with step-up |

- One run of a job at a time: run now and rerun are refused (409) while the job runs or has an unfinished run (waiting for a retry, or interrupted).
- The manager methods are `listScheduledJobs`, `runNow`, `rerunSlot` and `retryNow`; a refusal is a `JobActionError` carrying its HTTP status.
- Audited: run now and rerun as `job-started` / `job-completed` / `job-failed` with the person as the user; retry now as `job-retry`; pause as a configuration change.

## See Also

- Admin Maintenance → Reindex Pages
- Admin Maintenance → Version Maintenance
