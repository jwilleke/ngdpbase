[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / runImport

# Function: runImport()

> __runImport__(`siteDeps`, `request`, `ctx`, `report`): `Promise`\<[`IceRunReport`](../../types/interfaces/IceRunReport.md)\>

Defined in: src/ice/runImport.ts:513

Run one import. Fills and returns `report`, which the caller may be
showing while it runs. Never throws for one file's failure; that file's
status says why.

## Parameters

### siteDeps

[`IceRunDeps`](../interfaces/IceRunDeps.md)

### request

[`IceRunRequest`](../../types/interfaces/IceRunRequest.md)

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### report

[`IceRunReport`](../../types/interfaces/IceRunReport.md)

## Returns

`Promise`\<[`IceRunReport`](../../types/interfaces/IceRunReport.md)\>
