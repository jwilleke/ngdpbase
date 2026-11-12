[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / rewrapPasswordWithKek

# Function: rewrapPasswordWithKek()

> __rewrapPasswordWithKek__(`envelope`, `kek`, `newPassword`, `opts?`): `Promise`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)\>

Defined in: src/utils/privateStoreCrypto.ts:265

Replace the password wrap, given the KEK itself (#1452): how the recovery
words set a new password when the old one is forgotten. The KEK bytes and
the recovery wrap are unchanged, so every store's wrapped DEK stays valid
and the same words keep working.

## Parameters

### envelope

[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)

### kek

`Buffer`

### newPassword

`string`

### opts?

#### kdf?

[`ScryptKdf`](../interfaces/ScryptKdf.md)

## Returns

`Promise`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)\>
