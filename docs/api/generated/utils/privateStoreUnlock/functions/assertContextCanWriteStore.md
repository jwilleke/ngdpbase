[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / assertContextCanWriteStore

# Function: assertContextCanWriteStore()

> __assertContextCanWriteStore__(`ctx`, `args`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreUnlock.ts:512

Refuse a write into an encrypted store unless this context holds its DEK
(#1394). The context-carrying form of assertCurrentSessionCanWriteStore.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### args

#### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

#### owner

`string`

#### pagesDirectory

`string`

#### store

`string`

## Returns

`Promise`\<`void`\>
