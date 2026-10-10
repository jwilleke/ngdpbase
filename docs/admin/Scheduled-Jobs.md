# Scheduled Jobs

For operators: what runs by itself on a schedule, how to see it and change it, and what the server needs for it to be reliable. The add-on author's side is [Background Jobs](../guides/addons-developer-guide.md#8-background-jobs) in the add-on guide; the design is epic [#1611](https://github.com/jwilleke/ngdpbase/issues/1611).

## What it does

Core and add-ons register jobs that run on a schedule: end of month, every day at 02:00, every 15 minutes. The server keeps, for each job, the next slot, the last slot done, the run in hand and a history, so that:

- a slot missed while the server was down runs when it is back, by the job's catch-up rule (most jobs: the newest missed slot, once);
- a slot runs once, even during a rolling update when two servers share the data volume;
- a failed run is tried again after 1, 5 and 15 minutes, then reported as failed;
- a run cut off by a shutdown is handed to the next start and resumed;
- every slot passed over is recorded, never dropped silently.

A job started by hand — a Maintenance button, Run now, an add-on's button — is recorded the same way. If a restart cuts it off, the next start either restarts it (the job is declared safe to run again, as core's reindex and rebuild jobs are, and the person who started it still has the permission) or reports it: an error notification saying it did not finish and should be run again.

Automatic backups are a scheduled job (`backup.auto`). So are core's maintenance ticks — `media.folder-scan`, `pages.delete-retention`, `audit.archive-retention`, `tokens.maintenance` and `sessions.key-sweep` — which run on their usual cadence, catch nothing up, and report only failures. An add-on's jobs are named `<add-on>.<job>`.

## Admin → Scheduled Jobs

`/admin/jobs`, linked from the dashboard next to Private Stores. Each job shows its schedule and time zone, next slot, last slot done, the run in hand, and recent runs with skipped and failed slots.

| Button | What it does | Needs |
|---|---|---|
| Run now | Runs the job outside its schedule, as you. Marks no slot done, is not retried. | `admin-system` |
| Run this slot | Runs a skipped slot, or one that failed for good, again under its own time. Success marks that slot done. | `admin-system` |
| Retry now | Runs a retry that is waiting out its backoff straight away. | `admin-system` |
| Pause / Resume | Stops the job from starting slots, or starts it again. Writes `ngdpbase.jobs.<id>.enabled`. | `config-manage`, with a fresh sign-in |

Run now and Run this slot are refused while the job is running or has an unfinished run. The same list and actions are an API: `GET /api/admin/jobs/scheduled`, `POST /api/admin/jobs/<id>/run-now | rerun | retry | pause`.

## Configuration

| Key | Default | |
|---|---|---|
| `ngdpbase.jobs.state.provider` | `auto` | Where job state lives. `auto`: the application database when it is open, else files. `file` or `sqlite` to choose; `sqlite` with no database open refuses to start. |
| `ngdpbase.jobs.state.dir` | `${FAST_STORAGE}/jobs` | The `file` backend's folder. |
| `ngdpbase.jobs.min-interval-ms` | `60000` | A schedule with slots closer than this is refused. |
| `ngdpbase.jobs.max-timeout-ms` | `0` | Caps every job's time limit, including a job that asked for none. `0` is no cap. |
| `ngdpbase.jobs.history-limit` | `50` | Runs kept per job. |
| `ngdpbase.jobs.max-checkpoint-bytes` | `65536` | The largest bookmark a job may save between attempts. |
| `ngdpbase.jobs.shutdown-grace-ms` | `5000` | At shutdown, how long running jobs get to stop before they are handed off. |
| `ngdpbase.default.timezone` | `UTC` | The time zone of a schedule that names none. |

### Overriding one job

Set these in `app-custom-config.json`, or with Pause / Resume on the admin page. Both are read on every look, so no restart is needed.

```json
{
  "ngdpbase.jobs.my-addon.month-close.schedule": "end-of-month 22:00",
  "ngdpbase.jobs.my-addon.month-close.enabled": false
}
```

- The schedule is a shorthand (`daily 06:00`, `end-of-month`, `every 15m`, `last-business-day`, …) or an RRULE (`FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=22;BYMINUTE=0`). The add-on guide lists the shorthands.
- An override's times are in `ngdpbase.default.timezone`, whatever time zone the job registered with.
- A changed schedule counts its slots from the moment it takes effect: nothing is caught up for the schedule it replaced. The change is audited (`job-schedule-change`).
- An override that does not compile is refused with an error in the log, and the schedule in force stays.
- Automatic backups are set on Admin → Backup, not with an override.

## What the server needs

- __FAST_STORAGE on local disk.__ The `file` backend's slot locks rely on exclusive create and atomic rename, which NFS and SMB do not guarantee across servers; the server refuses to start with job state on a network filesystem. Keep job state in the application database (`ngdpbase.jobs.state.provider: sqlite`) if FAST_STORAGE must be remote.
- __One server per data volume, overlap aside.__ Locks cover the overlap of a rolling update or a restart on one host. Running several replicas against one volume is not supported.
- __A signal at shutdown.__ Docker and Kubernetes send SIGTERM, PM2 and a terminal SIGINT; either hands running jobs to the next start. A hard kill (SIGKILL, a crash, power loss) cannot: the run's lock expires after 60 s, and the next start resumes it as a retry.
- __Switching backends carries nothing across.__ The new one starts empty: next slots are counted from then, and nothing is caught up.

## Reading the log

| Line | Means |
|---|---|
| `BackgroundJobManager initialized (scheduled-job state: file)` | Where job state lives. |
| `Scheduler started: N scheduled job(s)` | Looking for due slots every 15 s, after add-ons have loaded. |
| `'<id>' N slot(s) skipped (…)` | Slots passed over by the catch-up or overlap rule; also in the job's history and the audit log. |
| `'<id>' slot … attempt 1 of 3 failed (…) — trying again at …` | A failed attempt, and when it is retried. |
| `'<id>' slot … failed after 3 attempt(s)` | Given up; the next slot runs as usual. |
| `'<id>' slot … handed off at shutdown` | Saved as interrupted; the next start resumes it. |
| `'<id>' slot … is held by another server` | The other server in a rolling update runs it. |
