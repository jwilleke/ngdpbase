[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/legacyStoreKeys](../README.md) / legacyStoreKeys

# Function: legacyStoreKeys()

> __legacyStoreKeys__(`customConfig`, `categories`): [`LegacyStoreKey`](../interfaces/LegacyStoreKey.md)[]

Defined in: src/utils/legacyStoreKeys.ts:31

Every legacy per-kind key in the operator's custom config, in file order.
`categories` is the merged `ngdpbase.system-category` map, used to name the
entry that declares the kind's vault (the `default` vault is `general`'s).

## Parameters

### customConfig

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

### categories

`unknown`

## Returns

[`LegacyStoreKey`](../interfaces/LegacyStoreKey.md)[]
