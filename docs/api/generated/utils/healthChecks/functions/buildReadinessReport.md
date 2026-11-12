[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/healthChecks](../README.md) / buildReadinessReport

# Function: buildReadinessReport()

> __buildReadinessReport__(`checks`): [`ReadinessReport`](../interfaces/ReadinessReport.md)

Defined in: src/utils/healthChecks.ts:76

Turn raw check results into the response body and status.

An empty check set reports ready: absence of a known problem is not itself
a problem, which is the same reasoning liveness runs on.

## Parameters

### checks

`Record`\<`string`, `boolean`\>

## Returns

[`ReadinessReport`](../interfaces/ReadinessReport.md)
