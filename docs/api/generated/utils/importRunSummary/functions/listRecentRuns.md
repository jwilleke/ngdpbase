[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/importRunSummary](../README.md) / listRecentRuns

# Function: listRecentRuns()

> __listRecentRuns__(`runsDir`, `limit?`): `Promise`\<[`ImportRunSummary`](../interfaces/ImportRunSummary.md)[]\>

Defined in: src/utils/importRunSummary.ts:102

Return the most-recent N run summaries, newest first. Filenames are ISO
timestamps so lexicographic sort is chronological. Missing/empty dir
returns []. Malformed individual files are skipped, not fatal.

## Parameters

### runsDir

`string`

### limit?

`number` = `10`

## Returns

`Promise`\<[`ImportRunSummary`](../interfaces/ImportRunSummary.md)[]\>
