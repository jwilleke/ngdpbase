[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / storeKindFromConfig

# Function: storeKindFromConfig()

> __storeKindFromConfig__(`getProperty`, `id`): [`StoreKind`](../interfaces/StoreKind.md) \| `null`

Defined in: src/utils/privateStoreDoor.ts:76

The kind named `id`, or `null` when no system-category declares that vault.
`encrypt` is read as the boolean it is and nothing else (a string "true" is
not a switch).

## Parameters

### getProperty

`GetProperty`

### id

`string`

## Returns

[`StoreKind`](../interfaces/StoreKind.md) \| `null`
