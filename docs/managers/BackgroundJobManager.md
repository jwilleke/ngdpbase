---
name: BackgroundJobManager
description: Long-running job registry + scheduler with progress reporting and polling API
dateModified: '2026-05-28'
category: managers
code: src/managers/BackgroundJobManager.ts
---

# BackgroundJobManager

Lets the platform run long-running work (page-reindex, version-history maintenance, bulk imports) without blocking request handlers. Each job type is registered with a unique id, a display name, and a `run(reportProgress)` function. Job results carry a success flag + a summary string.

## Core Types

| Type | Purpose |
|---|---|
| `JobDefinition` | Registered job blueprint: `{ id, displayName, run }` |
| `JobResult` | What a job's `run` resolves with: `{ success, summary? }` |
| `ReportProgress` | Callback the job calls during execution to push live progress messages |

## Lifecycle

1. __Register__ — call sites add `JobDefinition`s during init (e.g. `pages.reindex`).
2. __Start__ — operator/API triggers a job; manager creates a job instance with a UUID + tracks status.
3. __Run__ — the `run` callback executes; can call `reportProgress(message)` repeatedly.
4. __Poll__ — clients poll `/api/jobs/:id` for status + latest progress messages.
5. __Complete__ — manager records `JobResult` and surfaces in notifications.

## See Also

- Admin Maintenance → Reindex Pages
- Admin Maintenance → Version Maintenance
