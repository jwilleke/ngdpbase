[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/mediaFolderOverlap](../README.md) / describeMediaFolderOverlap

# Function: describeMediaFolderOverlap()

> __describeMediaFolderOverlap__(`o`): `string`

Defined in: src/utils/mediaFolderOverlap.ts:137

The message for a refused folder. It names the folder by its position and
the kind of storage. It never echoes the folder: one inside a vault would
name the vault's owner and id, and the message reaches admin notices and
their email.

## Parameters

### o

[`MediaFolderOverlap`](../interfaces/MediaFolderOverlap.md)

## Returns

`string`
