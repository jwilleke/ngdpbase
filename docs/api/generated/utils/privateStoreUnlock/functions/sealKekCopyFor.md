[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / sealKekCopyFor

# Function: sealKekCopyFor()

> __sealKekCopyFor__(`ctx`, `recipient`): `Promise`\<[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md) \| `null`\>

Defined in: src/utils/privateStoreUnlock.ts:294

Seal a copy of this context's OWN unlocked KEK to `recipient` (#1762 slice
5): what a proxy grant made while the owner's store is open carries. Null
when the context holds no key — a locked store, a token, a proxy (it holds
no KEK of its own through `kekFor`). The KEK copy taken here is zeroed.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### recipient

[`LinkPublicKey`](../../shareLockbox/interfaces/LinkPublicKey.md)

## Returns

`Promise`\<[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md) \| `null`\>
