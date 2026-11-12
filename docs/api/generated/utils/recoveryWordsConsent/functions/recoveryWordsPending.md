[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/recoveryWordsConsent](../README.md) / recoveryWordsPending

# Function: recoveryWordsPending()

> __recoveryWordsPending__(`engine`, `ctx`, `state`): `Promise`\<[`ConsentDocument`](../../../types/Consent/interfaces/ConsentDocument.md)[]\>

Defined in: src/utils/recoveryWordsConsent.ts:64

What `ctx` is still to confirm about their recovery words: the document at its current version, or none.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### state

[`RecoveryWordsState`](../interfaces/RecoveryWordsState.md)

## Returns

`Promise`\<[`ConsentDocument`](../../../types/Consent/interfaces/ConsentDocument.md)[]\>
