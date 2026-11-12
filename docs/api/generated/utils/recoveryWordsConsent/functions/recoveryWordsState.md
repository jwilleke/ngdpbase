[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/recoveryWordsConsent](../README.md) / recoveryWordsState

# Function: recoveryWordsState()

> __recoveryWordsState__(`engine`, `ctx`): `Promise`\<[`RecoveryWordsState`](../interfaces/RecoveryWordsState.md) \| `null`\>

Defined in: src/utils/recoveryWordsConsent.ts:42

`ctx`'s recovery words and the encrypted vaults they protect, or null when
they have no keys or no encrypted vault (then there is nothing to remind
them of). Their own vaults only, asked as themselves.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

## Returns

`Promise`\<[`RecoveryWordsState`](../interfaces/RecoveryWordsState.md) \| `null`\>
