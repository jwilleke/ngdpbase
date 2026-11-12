[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobDefinition

# Interface: JobDefinition

Defined in: src/managers/BackgroundJobManager.ts:178

A job type that can be registered with the BackgroundJobManager.

## Properties

### catchUp?

> `optional` __catchUp?__: [`CatchUp`](../../../utils/jobSlots/type-aliases/CatchUp.md)

Defined in: src/managers/BackgroundJobManager.ts:191

Slots missed while the server was down or the job idle: `none`, `latest` (default) or `all` (newest 12).

***

### displayName

> __displayName__: `string`

Defined in: src/managers/BackgroundJobManager.ts:182

Human-readable name shown in UI and notifications

***

### id

> __id__: `string`

Defined in: src/managers/BackgroundJobManager.ts:180

Unique job type ID, e.g. 'pages.reindex'

***

### maxAttempts?

> `optional` __maxAttempts?__: `number`

Defined in: src/managers/BackgroundJobManager.ts:226

Attempts a scheduled slot gets (default 3, #1716). A failed attempt — an
error, a timeout, a failure result, or the server stopping mid-run — is
tried again after 1, 5, then 15 minutes, with the same run id and slot.
After the last, the slot is failed and the next slot runs as usual.

***

### overlap?

> `optional` __overlap?__: [`Overlap`](../../../utils/jobSlots/type-aliases/Overlap.md)

Defined in: src/managers/BackgroundJobManager.ts:193

Slots that came due while the job was still running: `queue` (default, one waits) or `skip`.

***

### permission?

> `optional` __permission?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:219

The permission a person needs to start this job (#1746), as the route
that enqueues it checks. Before a cut-off run is restarted as them, they
must still hold it; if they do not, the run is reported, not restarted.

***

### persist?

> `optional` __persist?__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:213

For a scheduled job: keep slots, history and locks where a restart finds
them (default `true`). `false` keeps them in memory: no catch-up after a
restart and no lock, so only for harmless maintenance ticks.

For a run started by hand (`enqueue`, Run now) (#1746): `true` declares
the job safe to run again, so a run a restart cut off is restarted, as the
person who asked. Default `false` for a job that is only enqueued — a run
of it that a restart cut off is reported, never repeated, because running
it twice could do harm (an import posting twice). A scheduled job's Run
now follows its `persist`.

***

### routine?

> `optional` __routine?__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:232

A routine maintenance tick (#1721): a success is neither audited nor
notified — an every-minute sweep would bury both — while a failure is
both, as for any job. Set by [BackgroundJobManager.registerMaintenance](../classes/default.md#registermaintenance).

***

### run

> __run__: (`reportProgress`, `ctx`) => `Promise`\<[`JobResult`](JobResult.md)\>

Defined in: src/managers/BackgroundJobManager.ts:247

The work to perform. Resolves with a JobResult.

__`ctx` is mandatory (#631).__ Without it the actor this manager captured
at `enqueue` reached the audit record and stopped there: `job-started`
named who asked for a reindex while the reindex itself ran as nobody. That
is the exact shape P1 in docs/security-posture.md warns about — a
parameter that cannot carry provenance guarantees provenance is lost — and
it was true of this signature for the whole first version of #631.

A handler that needs to make a permission decision or write a record uses
this; one that does neither still receives it, because a handler which can
quietly grow into taking an action must not be able to do so anonymously.

#### Parameters

##### reportProgress

[`ReportProgress`](../type-aliases/ReportProgress.md)

##### ctx

[`JobRunContext`](JobRunContext.md)

#### Returns

`Promise`\<[`JobResult`](JobResult.md)\>

***

### schedule?

> `optional` __schedule?__: [`ScheduleInput`](../../../utils/schedule/type-aliases/ScheduleInput.md)

Defined in: src/managers/BackgroundJobManager.ts:189

When to run by itself (#1715): an RRULE, or a shorthand such as
`end-of-month 06:00` (see `utils/schedule.ts`). Without one the job runs
only when enqueued. `ngdpbase.jobs.<id>.schedule` overrides it, and
`ngdpbase.jobs.<id>.enabled: false` stops it.

***

### timeout?

> `optional` __timeout?__: `number`

Defined in: src/managers/BackgroundJobManager.ts:200

Milliseconds a run may take before it is aborted and failed. Scheduled
jobs default to one hour; `0` is no limit, and must be asked for.
`ngdpbase.jobs.max-timeout-ms` caps it when set. A job that is only ever
enqueued has no limit unless it declares one.
