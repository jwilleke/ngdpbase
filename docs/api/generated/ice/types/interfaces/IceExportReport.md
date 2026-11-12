[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceExportReport

# Interface: IceExportReport

Defined in: src/ice/types.ts:769

## Properties

### chain

> __chain__: `string`[]

Defined in: src/ice/types.ts:774

***

### error?

> `optional` __error?__: `string`

Defined in: src/ice/types.ts:780

***

### expiresAt?

> `optional` __expiresAt?__: `string`

Defined in: src/ice/types.ts:785

When the file is let go (`ngdpbase.export.engine.keep-minutes`).

***

### file?

> `optional` __file?__: [`IceExportFile`](IceExportFile.md)

Defined in: src/ice/types.ts:783

***

### finishedAt?

> `optional` __finishedAt?__: `string`

Defined in: src/ice/types.ts:779

***

### format

> __format__: `string`

Defined in: src/ice/types.ts:773

***

### notes?

> `optional` __notes?__: `string`[]

Defined in: src/ice/types.ts:782

What the source says about what it read, such as how many items were left out.

***

### ref

> __ref__: `string`

Defined in: src/ice/types.ts:772

***

### runId

> __runId__: `string`

Defined in: src/ice/types.ts:770

***

### source

> __source__: `string`

Defined in: src/ice/types.ts:771

***

### startedAt?

> `optional` __startedAt?__: `string`

Defined in: src/ice/types.ts:778

***

### state

> __state__: `"failed"` \| `"done"` \| `"running"` \| `"queued"`

Defined in: src/ice/types.ts:777

***

### username

> __username__: `string`

Defined in: src/ice/types.ts:776

Who it ran as: the only user who sees it or downloads its file.
