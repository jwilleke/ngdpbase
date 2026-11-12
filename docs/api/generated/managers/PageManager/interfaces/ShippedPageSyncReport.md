[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / ShippedPageSyncReport

# Interface: ShippedPageSyncReport

Defined in: src/managers/PageManager.ts:581

What `syncShippedPages` did with each requested uuid.

## Properties

### failed

> __failed__: `object`[]

Defined in: src/managers/PageManager.ts:589

Uuids that could not be saved, with why

#### reason

> __reason__: `string`

#### uuid

> __uuid__: `string`

***

### missing

> __missing__: `string`[]

Defined in: src/managers/PageManager.ts:587

Uuids the source does not ship

***

### protected

> __protected__: `string`[]

Defined in: src/managers/PageManager.ts:585

Uuids left alone because the live page was edited on this site

***

### synced

> __synced__: `string`[]

Defined in: src/managers/PageManager.ts:583

Uuids saved from the source
