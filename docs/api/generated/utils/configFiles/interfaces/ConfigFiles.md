[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configFiles](../README.md) / ConfigFiles

# Interface: ConfigFiles

Defined in: src/utils/configFiles.ts:58

## Properties

### customConfig

> __customConfig__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/configFiles.ts:62

The custom file with `_`-prefixed comment keys dropped; empty when the file is absent.

***

### customConfigFound

> __customConfigFound__: `boolean`

Defined in: src/utils/configFiles.ts:65

***

### customKeys

> __customKeys__: `Set`\<`string`\>

Defined in: src/utils/configFiles.ts:64

The keys the operator set themselves, for "explicit or inherited?" questions (#1163).

***

### defaultConfig

> __defaultConfig__: `Record`\<`string`, `unknown`\> \| `null`

Defined in: src/utils/configFiles.ts:60

Null when the shipped file is missing — the caller decides whether that is fatal.
