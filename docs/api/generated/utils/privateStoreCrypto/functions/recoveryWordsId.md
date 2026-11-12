[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / recoveryWordsId

# Function: recoveryWordsId()

> __recoveryWordsId__(`envelope`): `string`

Defined in: src/utils/privateStoreCrypto.ts:238

Which set of recovery words an envelope holds (#1928), as a short id: a
digest of the recovery wrap, which a new set of words replaces and nothing
else changes (a password change or a new person key keep it). Reveals
nothing about the words or the key; it is what a recorded "I saved my
recovery words" is bound to, so a new set asks again.

## Parameters

### envelope

`Pick`\<[`UserKeyEnvelope`](../interfaces/UserKeyEnvelope.md), `"recoveryWrap"`\>

## Returns

`string`
