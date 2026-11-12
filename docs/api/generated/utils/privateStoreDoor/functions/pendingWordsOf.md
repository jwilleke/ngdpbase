[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / pendingWordsOf

# Function: pendingWordsOf()

> __pendingWordsOf__(`handle`, `username`, `store`): \{ `envelope`: [`UserKeyEnvelope`](../../privateStoreCrypto/interfaces/UserKeyEnvelope.md); `madeAt`: `Date`; `words`: `string`[]; \} \| `undefined`

Defined in: src/utils/privateStoreDoor.ts:307

The words this session is part-way through confirming for `store`, to
download or print (#2144), or undefined: none, or they expired. Once
confirmed or abandoned they are gone.

## Parameters

### handle

`string`

### username

`string`

### store

`string`

## Returns

\{ `envelope`: [`UserKeyEnvelope`](../../privateStoreCrypto/interfaces/UserKeyEnvelope.md); `madeAt`: `Date`; `words`: `string`[]; \} \| `undefined`
