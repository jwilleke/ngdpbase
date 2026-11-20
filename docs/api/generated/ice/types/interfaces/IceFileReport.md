[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceFileReport

# Interface: IceFileReport

Defined in: src/ice/types.ts:571

## Properties

### chain

> __chain__: `string`[]

Defined in: src/ice/types.ts:588

The shims the file went through.

***

### duplicates

> __duplicates__: `number`

Defined in: src/ice/types.ts:593

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:574

The name the user gave what it becomes (#2130), when it was applied: something was stored under it.

***

### heldAs?

> `optional` __heldAs?__: `string`

Defined in: src/ice/types.ts:582

The name what the file already is goes by on the site, when a name given was not applied (#2130).

***

### link?

> `optional` __link?__: `string`

Defined in: src/ice/types.ts:580

Where the user can open what the file already is on the site, when a
name they gave was not applied because it was already here (#2130):
the receiver's `linkFor`, a path on this site only.

***

### message?

> `optional` __message?__: `string`

Defined in: src/ice/types.ts:586

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:572

***

### original?

> `optional` __original?__: [`KeptOriginal`](KeptOriginal.md)

Defined in: src/ice/types.ts:594

***

### refs

> __refs__: `string`[]

Defined in: src/ice/types.ts:590

Where each item went.

***

### sha256?

> `optional` __sha256?__: `string`

Defined in: src/ice/types.ts:583

***

### size

> __size__: `number`

Defined in: src/ice/types.ts:584

***

### status

> __status__: [`IceFileStatus`](../type-aliases/IceFileStatus.md)

Defined in: src/ice/types.ts:585

***

### stored

> __stored__: `number`

Defined in: src/ice/types.ts:592

Items stored, and items skipped as already seen.

***

### warnings

> __warnings__: [`IceWarning`](IceWarning.md)[]

Defined in: src/ice/types.ts:595
