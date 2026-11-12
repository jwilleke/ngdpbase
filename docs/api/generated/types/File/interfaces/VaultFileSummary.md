[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/File](../README.md) / VaultFileSummary

# Interface: VaultFileSummary

Defined in: src/types/File.ts:87

What the operator inventory shows of one vault (#1859's dry run). Counts
only: a vault's names, owners and metadata belong to its owner and never
leave the door. A sealed vault can't be read without its owner's key, so
only what is on disk is counted (bytes as stored, sealed) and its clashes
are unknown (`null`).

## Properties

### bytes

> __bytes__: `number`

Defined in: src/types/File.ts:94

***

### clashes

> __clashes__: `number` \| `null`

Defined in: src/types/File.ts:96

Files that would get a `-###` suffix in this vault; `null` when it can't be read.

***

### files

> __files__: `number`

Defined in: src/types/File.ts:93

***

### owner

> __owner__: `string`

Defined in: src/types/File.ts:88

***

### readable

> __readable__: `boolean`

Defined in: src/types/File.ts:92

Whether its index could be read. False for a sealed vault (no key here) or one refused as not yet opened.

***

### systemCategory

> __systemCategory__: `string` \| `null`

Defined in: src/types/File.ts:90

***

### vault

> __vault__: `string`

Defined in: src/types/File.ts:89
