[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / LedgerFileEntry

# Interface: LedgerFileEntry

Defined in: src/ice/types.ts:623

What the engine remembers about one file in a scope.

## Properties

### at

> __at__: `string`

Defined in: src/ice/types.ts:634

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:627

The name the user gave what it became (#2130), when it was applied.

***

### heldAs?

> `optional` __heldAs?__: `string`

Defined in: src/ice/types.ts:629

The name what it is already goes by on the site, when a given name was not applied (#2130).

***

### message?

> `optional` __message?__: `string`

Defined in: src/ice/types.ts:633

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:625

The file's own name, as uploaded.

***

### original?

> `optional` __original?__: [`LedgerOriginal`](LedgerOriginal.md)

Defined in: src/ice/types.ts:637

The original kept for this fingerprint, whatever became of the conversion (D11).

***

### refs

> __refs__: `string`[]

Defined in: src/ice/types.ts:635

***

### sha256

> __sha256__: `string`

Defined in: src/ice/types.ts:630

***

### size

> __size__: `number`

Defined in: src/ice/types.ts:631

***

### status

> __status__: [`IceFileStatus`](../type-aliases/IceFileStatus.md)

Defined in: src/ice/types.ts:632
