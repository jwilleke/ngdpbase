[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/shareLockbox](../README.md) / sealForLink

# Function: sealForLink()

> __sealForLink__(`linkKey`, `plaintext`): `Promise`\<[`Lockbox`](../interfaces/Lockbox.md)\>

Defined in: src/utils/shareLockbox.ts:79

Lock `plaintext` for the link whose public key is `linkKey`. Only that link's private key opens it.

## Parameters

### linkKey

[`LinkPublicKey`](../interfaces/LinkPublicKey.md)

### plaintext

`Uint8Array`

## Returns

`Promise`\<[`Lockbox`](../interfaces/Lockbox.md)\>
