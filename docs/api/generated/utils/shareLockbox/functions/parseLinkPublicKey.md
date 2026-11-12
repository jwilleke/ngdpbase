[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/shareLockbox](../README.md) / parseLinkPublicKey

# Function: parseLinkPublicKey()

> __parseLinkPublicKey__(`value`): [`LinkPublicKey`](../interfaces/LinkPublicKey.md) \| `null`

Defined in: src/utils/shareLockbox.ts:51

The public key a browser sent, checked strictly: a P-256 point and nothing
else. Anything malformed is refused rather than stored.

## Parameters

### value

`unknown`

## Returns

[`LinkPublicKey`](../interfaces/LinkPublicKey.md) \| `null`
