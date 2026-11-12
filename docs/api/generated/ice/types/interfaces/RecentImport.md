[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / RecentImport

# Interface: RecentImport

Defined in: src/ice/types.ts:637

One file in a user's recent imports (#2110), read from the ledger: what
the import screen lists, so the list survives a restart. Only the user's
own entries, from the receivers they may use.

## Properties

### at

> __at__: `string`

Defined in: src/ice/types.ts:645

When the ledger last recorded this file, ISO.

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:641

The name the user gave what it became (#2130); the screen shows it with `name` beside it.

***

### link?

> `optional` __link?__: `string`

Defined in: src/ice/types.ts:655

Where the user can open the first of them (`linkFor`), when they may.

***

### message?

> `optional` __message?__: `string`

Defined in: src/ice/types.ts:643

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:639

The file's own name, as uploaded.

***

### receiver

> __receiver__: `string`

Defined in: src/ice/types.ts:647

The receiver it went into.

***

### receiverLabel?

> `optional` __receiverLabel?__: `string`

Defined in: src/ice/types.ts:648

***

### refs

> __refs__: `number`

Defined in: src/ice/types.ts:653

How many references the receiver gave (pages, records).

***

### status

> __status__: [`IceFileStatus`](../type-aliases/IceFileStatus.md)

Defined in: src/ice/types.ts:642

***

### target?

> `optional` __target?__: `string`

Defined in: src/ice/types.ts:650

The place within it (#2118), when the receiver has places.

***

### targetLabel?

> `optional` __targetLabel?__: `string`

Defined in: src/ice/types.ts:651
