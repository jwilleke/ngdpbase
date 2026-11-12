[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/record](../README.md) / pickItemsArray

# Function: pickItemsArray()

> __pickItemsArray__(`data`): `unknown`[]

Defined in: src/ice/shims/record.ts:136

Locate the items array in a JSON response when no explicit `itemsPath` is
configured: the body itself if it's an array, else the first array found
under common envelope keys, else any array-valued property, else [].

## Parameters

### data

`unknown`

## Returns

`unknown`[]
