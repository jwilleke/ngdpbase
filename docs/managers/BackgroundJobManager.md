---
name: BackgroundJobManager
description: Long-running job registry + scheduler with progress reporting and polling API
dateModified: '2026-10-25'
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
| `JobRunContext` | The `ctx` a run receives: who asked (`JobContext`), the `signal` aborted on timeout, the `slot` it runs for, `resume` (set when it picks up an unfinished slot) and `checkpoint(data)`. It carries no key: under a proxy grant the claim stays, without its `keyHandle`, here and in the run record ([#2047](https://github.com/jwilleke/ngdpbase/issues/2047)) |

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
- A slot runs once: under a lock in the job state, as the system principal with origin `schedule`, its context naming the job (`job: <id>`). A slot another server holds (a rolling update) is left to it.
- __A scheduled run acts as its job__ ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999)): when a policy names the job (`{ "type": "job", "value": "<id>" }`), its decisions are made as `job:<id>`, holding only what such policies grant; when none does, with the system principal's roles. Run now and a rerun act as the admin who asked, never as the job. Every audit row the run's context records carries `metadata.job`.
- State (next slot, last slot done, current run, history, locks) is kept by a `JobStateProvider` (`src/providers/jobState.ts`), chosen by `ngdpbase.jobs.state.provider`. `persist: false` keeps it in memory instead: no catch-up after a restart and no lock.
- `ngdpbase.jobs.<jobId>.schedule` overrides a job's schedule and `ngdpbase.jobs.<jobId>.enabled: false` stops it; both are read on every look. A changed rule, at runtime or across a restart, counts slots from then, catches nothing up for the old rule, and is audited as `job-schedule-change`.
- `scheduleTimeZone()` is the zone a schedule that names no `tz` runs in: `ngdpbase.default.timezone`, `UTC` when unset, read on each call. It is the scheduler's one source for that zone; an add-on's job passes it with `ctx.slot` to `host.zonedParts` to learn the slot's local year, month and day ([#1998](https://github.com/jwilleke/ngdpbase/issues/1998)).
- An add-on ships a job paused with `ngdpbase.jobs.<jobId>.enabled: false` in its own `config/default-config.json`. The add-on config layer puts it under the site's own file, so Resume (which writes `true` to the site's file) turns it on. A turned-off add-on's key does not apply ([#1998](https://github.com/jwilleke/ngdpbase/issues/1998)).
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

### Runs started by hand survive a restart (#1746)

A run started by `enqueue()` or Run now is recorded like a scheduled run: who asked, when, the attempt, and `running`, under a lock with a heartbeat (kept apart from slot locks, under `<jobId>.by-hand`). On the next start every registered job is looked at once for a run a restart cut off:

- __The job declares `persist: true`__ (safe to run again): the run is restarted as the user who asked — same run id, `ctx.resume` with its last checkpoint, an info notification. If the job declares a `permission`, the user must still hold it (by policy, `pdp.holds`); a crash counts as an attempt, up to `maxAttempts`.
- __It does not__ (the default for a job that is only enqueued, since running it twice could do harm): the run is recorded as failed, audited (`job-failed`, as the user), and posted to admins as an error notification asking them to run it again. Never silent.
- At shutdown a resumable run is handed off as `interrupted` and restarted at once, without counting an attempt; any other is aborted and recorded as failed.
- A run whose lock a live server still holds (a rolling update) is left alone and looked at again later. Of several unfinished runs of one job, the newest is restarted and the older ones reported.

Core's five admin maintenance jobs (`pages.reindex`, `pages.rebuild`, `media.rescan`, `media.rebuild`, `attachments.rebuild`) declare `persist: true` and `permission: 'admin-system'`: each rebuilds from source. A scheduled job's Run now follows its own `persist` (default `true`).

### Maintenance jobs (#1721)

`registerMaintenance({ id, displayName, everyMs, run })` declares a routine tick whose next run does the same work, in place of a hand-rolled `setInterval`: every `everyMs` in whole minutes (at least one), `catchUp: 'none'`, `overlap: 'skip'`, `persist: false`, one attempt. A success is neither audited nor notified; a failure is. `everyMs` 0 leaves the job unscheduled.

Core's maintenance jobs: `media.folder-scan` (`ngdpbase.media.scaninterval`), `pages.delete-retention` (hourly, when delete retention is on), `audit.archive-retention` (hourly), `tokens.maintenance` (`ngdpbase.auth.agent-token.sweep-interval-seconds`) and `sessions.key-sweep` (every 10 minutes). BackgroundJobManager starts right after DatabaseManager so every manager can register during its own initialize. The `setInterval`s left in core are write flushes, the scheduler's own tick and lock heartbeat, and a server-sent-events keep-alive — none of them scheduled work.

### Admin page and API (#1718)

`/admin/jobs` (linked from the dashboard) lists every scheduled job: its schedule and time zone, next slot, last slot done, the run in hand, and its recent history with skipped and failed slots. The same list is `GET /api/admin/jobs/scheduled`. Reading needs admin read access.

| Action | Form | API | Permission |
|---|---|---|---|
| Run now: outside the schedule, as the user asking; marks no slot done, is not retried | `POST /admin/jobs/:jobId/run-now` | `POST /api/admin/jobs/:jobId/run-now` | `admin-system` |
| Run a skipped slot, or one that failed for good, again under its own time (`slot` in the body); success marks that slot done, the next slot does not move | `…/rerun` | `…/rerun` | `admin-system` |
| Retry a run waiting out its backoff now | `…/retry` | `…/retry` | `admin-system` |
| Pause or resume (`paused` true or false): writes `ngdpbase.jobs.<jobId>.enabled` | `…/pause` | `…/pause` | `config-manage`, with step-up |

- One run of a job at a time: run now and rerun are refused (409) while the job runs or has an unfinished run (waiting for a retry, or interrupted).
- The manager methods are `listScheduledJobs`, `runNow`, `rerunSlot` and `retryNow`; a refusal is a `JobActionError` carrying its HTTP status.
- Audited: run now and rerun as `job-started` / `job-completed` / `job-failed` with the user who asked as the audit `user`; retry now as `job-retry`; pause as a configuration change.
- Every job audit row carries the attribution of the context the run was queued under (`actorOf`), merged with the job's own fields: under a proxy grant `actor`, `metadata.delegated: 'proxy'` and `proxyGrantId`; under a token or share `metadata.delegated: 'token'` or `'share'`. Never the proxy's key handle ([#2059](https://github.com/jwilleke/ngdpbase/issues/2059)).

## When the application database is unavailable (#1892)

When `DatabaseManager` could not open the configured application database ([maintenance mode](DatabaseManager.md#when-the-application-database-cant-be-opened-maintenance-mode)), no job runs until a restart opens it: the job state may live in that database, and a job, a backup above all, may need it. A backup taken without it would rotate out the backups that have it.

- The manager is `degraded` with the reason, and opens no job state (no file fallback).
- Jobs still register, persisted or not, so every manager starts.
- `startScheduler()` does not start the scheduler, and `tick()` does nothing.
- `enqueue()` returns a run that has already failed, with the reason; `runNow()`, `rerunSlot()` and `retryNow()` are refused (409).
- The Admin → Jobs page lists the jobs with no state.

## Backup and restore

Job state in the application database is in the database backup and comes back with it ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). File job state (`ngdpbase.jobs.state.dir`) is in the backup as `<stem>.jobs.tar` (`.tar.enc` under the backup key): state, run history and checkpoints, without the slot locks ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)). The folder is declared (`backupFolders()`, with the locks excluded, only while job state is in files) and BackupManager backs it up and stages it ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). At the next start `BaseManager.initialize()` swaps the staged folder in before the state is opened, and the manager then reads the runs since the backup from the state it replaced, kept as `<dir>.pre-restore` (`getRunsReplacedAtStart()`).

__A restore never re-runs a job.__ When the job state was put back at this start (file state applied, or the database restored, `DatabaseManager.restoredAtStart()`), each scheduled job's first look closes a run the backup caught unfinished as `failed` ("cut off by a restore"), never resumed or retried, and sets its next slot to the next one from now, so nothing between the backup and the restore is caught up. A run started by hand that was unfinished is reported cut off and not restarted. Without a restore, the same unfinished run would be resumed as a crashed attempt (#1716). `runsSince(since)` gives BackupManager the runs since a backup, for the critical "not restored" notification, and `displayNameOf(jobId)` their names. See the [backup and restore guide](../guides/backup-restore-guide.md#a-job-run-in-progress-at-backup-time).

## See Also

- Admin Maintenance → Reindex Pages
- Admin Maintenance → Version Maintenance
