[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / rewrapPassword

# Function: rewrapPassword()

> __rewrapPassword__(`envelope`, `oldPassword`, `newPassword`, `opts?`): `Promise`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)\>

Defined in: src/utils/privateStoreCrypto.ts:250

## Parameters

### envelope

[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)

### oldPassword

`string`

### newPassword

`string`

### opts?

#### kdf?

[`ScryptKdf`](../interfaces/ScryptKdf.md)

## Returns

`Promise`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md)\>
