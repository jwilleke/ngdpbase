[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/types](../README.md) / FixStep

# Interface: FixStep

Defined in: src/converters/ncm/fix/types.ts:18

One conversion step: small, pure and idempotent — running it on its own
output changes nothing.

## Properties

### id

> __id__: `string`

Defined in: src/converters/ncm/fix/types.ts:20

Stable id, used in reports and to pick steps by name.

***

### summary

> __summary__: `string`

Defined in: src/converters/ncm/fix/types.ts:22

Plain-language summary for the author, e.g. "JSPWiki ** bullets became nested - bullets".

## Methods

### apply()

> __apply__(`body`): [`FixStepResult`](FixStepResult.md)

Defined in: src/converters/ncm/fix/types.ts:23

#### Parameters

##### body

`string`

#### Returns

[`FixStepResult`](FixStepResult.md)
