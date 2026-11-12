[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / sealKekCopy

# Function: sealKekCopy()

> __sealKekCopy__(`recipient`, `kek`): `Promise`\<[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md)\>

Defined in: src/utils/privateStoreCrypto.ts:185

Seal a copy of `kek` to `recipient`'s public key (#1762 slice 5): the copy a
proxy grant carries. Only the recipient's private key opens it.

## Parameters

### recipient

[`LinkPublicKey`](../../shareLockbox/interfaces/LinkPublicKey.md)

### kek

`Buffer`

## Returns

`Promise`\<[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md)\>
