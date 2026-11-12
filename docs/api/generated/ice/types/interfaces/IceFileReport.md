[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceFileReport

# Interface: IceFileReport

Defined in: src/ice/types.ts:563

## Properties

### chain

> __chain__: `string`[]

Defined in: src/ice/types.ts:580

The shims the file went through.

***

### duplicates

> __duplicates__: `number`

Defined in: src/ice/types.ts:585

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:566

The name the user gave what it becomes (#2130), when it was applied: something was stored under it.

***

### heldAs?

> `optional` __heldAs?__: `string`

Defined in: src/ice/types.ts:574

The name what the file already is goes by on the site, when a name given was not applied (#2130).

***

### link?

> `optional` __link?__: `string`

Defined in: src/ice/types.ts:572

Where the user can open what the file already is on the site, when a
name they gave was not applied because it was already here (#2130):
the receiver's `linkFor`, a path on this site only.

***

### message?

> `optional` __message?__: `string`

Defined in: src/ice/types.ts:578

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:564

***

### original?

> `optional` __original?__: [`KeptOriginal`](KeptOriginal.md)

Defined in: src/ice/types.ts:586

***

### refs

> __refs__: `string`[]

Defined in: src/ice/types.ts:582

Where each item went.

***

### sha256?

> `optional` __sha256?__: `string`

Defined in: src/ice/types.ts:575

***

### size

> __size__: `number`

Defined in: src/ice/types.ts:576

***

### status

> __status__: [`IceFileStatus`](../type-aliases/IceFileStatus.md)

Defined in: src/ice/types.ts:577

***

### stored

> __stored__: `number`

Defined in: src/ice/types.ts:584

Items stored, and items skipped as already seen.

***

### warnings

> __warnings__: [`IceWarning`](IceWarning.md)[]

Defined in: src/ice/types.ts:587
