[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / PersonKey

# Interface: PersonKey

Defined in: src/utils/privateStoreCrypto.ts:46

A person's own key pair (#1762 slice 5): what lets someone else's grant hand
them a copy of a vault key while they are offline. The pair is the share
lockbox's (ECDH P-256, `shareLockbox.ts`); no other crypto.

## Properties

### privateWrap

> __privateWrap__: [`WrappedBlob`](WrappedBlob.md)

Defined in: src/utils/privateStoreCrypto.ts:50

The private half (the lockbox key string), wrapped under the person's own KEK.

***

### publicKey

> __publicKey__: [`LinkPublicKey`](../../shareLockbox/interfaces/LinkPublicKey.md)

Defined in: src/utils/privateStoreCrypto.ts:48

The public half, readable: a grant seals a copy of the owner's KEK to it.
