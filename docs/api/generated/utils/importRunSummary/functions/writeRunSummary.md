[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/importRunSummary](../README.md) / writeRunSummary

# Function: writeRunSummary()

> __writeRunSummary__(`runsDir`, `summary`): `Promise`\<`void`\>

Defined in: src/utils/importRunSummary.ts:79

Write a single per-run summary. Idempotent for same runId. Best-effort — errors logged, never thrown.

## Parameters

### runsDir

`string`

### summary

[`ImportRunSummary`](../interfaces/ImportRunSummary.md)

## Returns

`Promise`\<`void`\>
