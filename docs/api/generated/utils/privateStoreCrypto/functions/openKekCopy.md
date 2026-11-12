[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / openKekCopy

# Function: openKekCopy()

> __openKekCopy__(`envelope`, `ownKek`, `copy`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/utils/privateStoreCrypto.ts:194

Open a KEK copy sealed to this person (#1762 slice 5): `ownKek` unwraps
their private key from `envelope`, which opens `copy`. Throws when any step
fails; the private key never leaves this function.

## Parameters

### envelope

`Pick`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md), `"personKey"`\>

### ownKek

`Buffer`

### copy

[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md)

## Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>
