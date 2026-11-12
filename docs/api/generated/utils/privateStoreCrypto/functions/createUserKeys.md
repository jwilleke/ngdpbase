[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / createUserKeys

# Function: createUserKeys()

> __createUserKeys__(`password`, `opts?`): `Promise`\<\{ `envelope`: [`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md); `kek`: `Buffer`; `mnemonic`: `string`; \}\>

Defined in: src/utils/privateStoreCrypto.ts:143

## Parameters

### password

`string`

### opts?

#### kdf?

[`ScryptKdf`](../interfaces/ScryptKdf.md)

## Returns

`Promise`\<\{ `envelope`: [`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md); `kek`: `Buffer`; `mnemonic`: `string`; \}\>
