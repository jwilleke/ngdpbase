[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/healthChecks](../README.md) / runReadinessChecks

# Function: runReadinessChecks()

> __runReadinessChecks__(`checks`): `Promise`\<`Record`\<`string`, `boolean`\>\>

Defined in: src/utils/healthChecks.ts:56

Run every check, converting a throw or rejection into `false`.

A readiness probe that 500s tells an orchestrator nothing it can act on, so
a check that blew up is treated as "has not demonstrated readiness" rather
than as an error. Every check runs even when an earlier one fails, so the
report names all the problems instead of only the first.

## Parameters

### checks

readonly [`ReadinessCheck`](../interfaces/ReadinessCheck.md)[]

## Returns

`Promise`\<`Record`\<`string`, `boolean`\>\>
