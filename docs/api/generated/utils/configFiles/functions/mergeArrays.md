[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configFiles](../README.md) / mergeArrays

# Function: mergeArrays()

> __mergeArrays__(`defaultArray`, `customArray`): `unknown`[]

Defined in: src/utils/configFiles.ts:112

Merge two arrays.

If both hold objects that share an identity field (`id`, `authproviderid`),
merge by it: a later entry overrides the same one and adds new ones.
Otherwise the custom array replaces the default entirely — which is why a set
an operator or an add-on may extend one entry at a time is a map, never an
array (#1612).

## Parameters

### defaultArray

`unknown`[]

### customArray

`unknown`[]

## Returns

`unknown`[]
