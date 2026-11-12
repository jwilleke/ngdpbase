[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / personKeyOf

# Function: personKeyOf()

> __personKeyOf__(`pagesDirectory`, `username`): `Promise`\<[`LinkPublicKey`](../../shareLockbox/interfaces/LinkPublicKey.md) \| `null`\>

Defined in: src/utils/privateStoreUnlock.ts:283

The public half of `username`'s key pair (#1762 slice 5), or null when they
have no keys or no pair yet. Public: anyone may seal to it.

## Parameters

### pagesDirectory

`string`

### username

`string`

## Returns

`Promise`\<[`LinkPublicKey`](../../shareLockbox/interfaces/LinkPublicKey.md) \| `null`\>
