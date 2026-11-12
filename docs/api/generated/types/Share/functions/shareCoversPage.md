[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / shareCoversPage

# Function: shareCoversPage()

> __shareCoversPage__(`resources`, `pageName`, `metadata`): `boolean`

Defined in: src/types/Share.ts:132

Does a share cover this page? The one rule both page doors ask (the decider
and the list filter): a page in a vault by its uuid or its whole vault
(#1388), any other page by its user-keywords.

## Parameters

### resources

readonly [`ShareResource`](../interfaces/ShareResource.md)[]

### pageName

`string`

### metadata

#### user-keywords?

`string`[]

#### uuid?

`string`

## Returns

`boolean`
