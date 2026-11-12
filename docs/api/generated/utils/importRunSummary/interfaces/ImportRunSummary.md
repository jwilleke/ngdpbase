[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/importRunSummary](../README.md) / ImportRunSummary

# Interface: ImportRunSummary

Defined in: src/utils/importRunSummary.ts:20

Compact per-run record persisted to disk.

## Properties

### actor

> __actor__: `string`

Defined in: src/utils/importRunSummary.ts:33

Who initiated the run — `ImportOptions.actorContext.username` (#1236): the
request's subject for a manual import, the system principal for a job.

***

### converted

> __converted__: `number`

Defined in: src/utils/importRunSummary.ts:46

Items successfully converted to pages.

***

### failed

> __failed__: `number`

Defined in: src/utils/importRunSummary.ts:50

Items that failed to convert.

***

### finishedAt

> __finishedAt__: `string`

Defined in: src/utils/importRunSummary.ts:26

ISO-8601 timestamp of when the run finished (may equal startedAt for trivial runs).

***

### importType

> __importType__: `string`

Defined in: src/utils/importRunSummary.ts:28

What kind of import surfaced this run (`paste`, `url`, `file`, `ingest:<sourceId>`).

***

### isSystem?

> `optional` __isSystem?__: `boolean`

Defined in: src/utils/importRunSummary.ts:40

True when the run was a job with no person behind it (a JobContext whose
origin is boot, schedule or operator) — lets the trend view distinguish
"alice triggered an import" from "scheduled feed ingested overnight".
False for a request, or a request-origin job.

***

### kindCounts

> __kindCounts__: `Record`\<`string`, `number`\>

Defined in: src/utils/importRunSummary.ts:55

Counts of ConversionWarning.kind values aggregated across all items in the run.
Keys are flat (no colon-subkinds today) per the #738 design decision.

***

### origin?

> `optional` __origin?__: `string`

Defined in: src/utils/importRunSummary.ts:42

Where the run came from: `request`, `boot`, `schedule` or `operator` (#1236). Absent on records written before it.

***

### runId

> __runId__: `string`

Defined in: src/utils/importRunSummary.ts:22

Stable id; same as the filename without `.json`.

***

### skipped

> __skipped__: `number`

Defined in: src/utils/importRunSummary.ts:48

Items intentionally skipped (e.g. duplicates).

***

### startedAt

> __startedAt__: `string`

Defined in: src/utils/importRunSummary.ts:24

ISO-8601 timestamp of when the run started.

***

### total

> __total__: `number`

Defined in: src/utils/importRunSummary.ts:44

Total items the run attempted.
