[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / openKeyCopy

# Function: openKeyCopy()

> __openKeyCopy__(`args`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreUnlock.ts:313

Open the key copy a proxy grant carries (#1762 slice 5) into the actor's
own bag (`handle`), when the actor's store is unlocked: their KEK unwraps
their private key, which opens the copy of the owner's KEK, which opens the
owner's encrypted stores. Replaces any copy the bag held. False — nothing
held — when the actor's store is locked, the bag is not the actor's, or the
copy does not open (it is then not retried for this bag). No key byte is
returned or logged.

## Parameters

### args

#### actor

`string`

#### copy

[`Lockbox`](../../shareLockbox/interfaces/Lockbox.md)

#### grantId

`string`

#### handle

`string`

#### owner

`string`

#### pagesDirectory

`string`

## Returns

`Promise`\<`boolean`\>
