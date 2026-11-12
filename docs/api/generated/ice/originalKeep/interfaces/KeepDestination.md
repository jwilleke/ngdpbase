[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/originalKeep](../README.md) / KeepDestination

# Interface: KeepDestination

Defined in: src/ice/originalKeep.ts:43

Where an upload is going, as the door resolved it.

## Properties

### owner

> __owner__: `string`

Defined in: src/ice/originalKeep.ts:47

The vault's owner.

***

### uploader

> __uploader__: `string`

Defined in: src/ice/originalKeep.ts:45

Who is uploading: the request's username.

***

### vaultAddon

> __vaultAddon__: `string` \| `null`

Defined in: src/ice/originalKeep.ts:49

The add-on whose system-category declares the vault (`StoreKind.owner`); null when no category does.
