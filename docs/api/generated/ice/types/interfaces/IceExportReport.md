[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceExportReport

# Interface: IceExportReport

Defined in: src/ice/types.ts:777

## Properties

### chain

> __chain__: `string`[]

Defined in: src/ice/types.ts:782

***

### error?

> `optional` __error?__: `string`

Defined in: src/ice/types.ts:788

***

### expiresAt?

> `optional` __expiresAt?__: `string`

Defined in: src/ice/types.ts:793

When the file is let go (`ngdpbase.export.engine.keep-minutes`).

***

### file?

> `optional` __file?__: [`IceExportFile`](IceExportFile.md)

Defined in: src/ice/types.ts:791

***

### finishedAt?

> `optional` __finishedAt?__: `string`

Defined in: src/ice/types.ts:787

***

### format

> __format__: `string`

Defined in: src/ice/types.ts:781

***

### notes?

> `optional` __notes?__: `string`[]

Defined in: src/ice/types.ts:790

What the source says about what it read, such as how many items were left out.

***

### ref

> __ref__: `string`

Defined in: src/ice/types.ts:780

***

### runId

> __runId__: `string`

Defined in: src/ice/types.ts:778

***

### source

> __source__: `string`

Defined in: src/ice/types.ts:779

***

### startedAt?

> `optional` __startedAt?__: `string`

Defined in: src/ice/types.ts:786

***

### state

> __state__: `"failed"` \| `"done"` \| `"running"` \| `"queued"`

Defined in: src/ice/types.ts:785

***

### username

> __username__: `string`

Defined in: src/ice/types.ts:784

Who it ran as: the only user who sees it or downloads its file.
