[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/shareLockbox](../README.md) / Lockbox

# Interface: Lockbox

Defined in: src/utils/shareLockbox.ts:35

One locked item, as stored and as served.

## Properties

### ct

> __ct__: `string`

Defined in: src/utils/shareLockbox.ts:42

AES-GCM ciphertext with its tag, base64url.

***

### epk

> __epk__: [`LinkPublicKey`](LinkPublicKey.md)

Defined in: src/utils/shareLockbox.ts:38

The ephemeral public key the content was locked with.

***

### iv

> __iv__: `string`

Defined in: src/utils/shareLockbox.ts:40

AES-GCM IV, base64url.

***

### v

> __v__: `1`

Defined in: src/utils/shareLockbox.ts:36
