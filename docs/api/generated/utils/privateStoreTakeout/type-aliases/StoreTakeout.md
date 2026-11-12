[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreTakeout](../README.md) / StoreTakeout

# Type Alias: StoreTakeout

> __StoreTakeout__ = `object`

Defined in: src/utils/privateStoreTakeout.ts:55

A store found on disk, and everything in it.

## Properties

### files

> __files__: [`StoreFile`](StoreFile.md)[]

Defined in: src/utils/privateStoreTakeout.ts:59

Files of the store directory itself, relative to the store root.

***

### owner

> __owner__: `string`

Defined in: src/utils/privateStoreTakeout.ts:56

***

### store

> __store__: `string`

Defined in: src/utils/privateStoreTakeout.ts:57

***

### totalBytes

> __totalBytes__: `number`

Defined in: src/utils/privateStoreTakeout.ts:61

Total bytes, for a caller that wants to refuse an unreasonable download.
