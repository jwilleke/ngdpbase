[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/shareLockbox](../README.md) / newLinkKeyPair

# Function: newLinkKeyPair()

> __newLinkKeyPair__(): `Promise`\<\{ `linkKey`: `string`; `publicKey`: [`LinkPublicKey`](../interfaces/LinkPublicKey.md); \}\>

Defined in: src/utils/shareLockbox.ts:107

Make a key pair on the server. A link's pair is made in the owner's browser,
so for links this is the tests' stand-in; a person's own key pair for proxy
access (#1762 slice 5, `privateStoreCrypto.newPersonKey`) is made here.

## Returns

`Promise`\<\{ `linkKey`: `string`; `publicKey`: [`LinkPublicKey`](../interfaces/LinkPublicKey.md); \}\>
