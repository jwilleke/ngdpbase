[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/record](../README.md) / recordItemKey

# Function: recordItemKey()

> __recordItemKey__(`rec`): `string`

Defined in: src/ice/shims/record.ts:114

The key the engine knows a record by (per-item duplicates, #2109): its own
id with a hash of its content. The id alone would skip a record that
changed upstream under the same id (a revised advisory), so the hash is
the version. A receiver's own duplicate check is still its own (the feeds
add-on compares the hash its record store keeps).

## Parameters

### rec

[`IceRecordData`](../../../types/interfaces/IceRecordData.md)

## Returns

`string`
