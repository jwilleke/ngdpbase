[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ExportOutcome

# Interface: ExportOutcome

Defined in: src/ice/types.ts:727

How an export ended, for its source's record (#2120).

## Properties

### format

> __format__: `string`

Defined in: src/ice/types.ts:729

The shim that made, or was to make, the file.

***

### items

> __items__: `string`[]

Defined in: src/ice/types.ts:732

The names of the items the source read.

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/ice/types.ts:735

Why it failed, as the user is told.

***

### result

> __result__: `"success"` \| `"failure"`

Defined in: src/ice/types.ts:733

***

### runId

> __runId__: `string`

Defined in: src/ice/types.ts:730
