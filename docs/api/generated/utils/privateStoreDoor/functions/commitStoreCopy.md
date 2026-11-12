[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / commitStoreCopy

# Function: commitStoreCopy()

> __commitStoreCopy__(`args`): `Promise`\<\{ `dek?`: `Buffer`\<`ArrayBufferLike`\>; \}\>

Defined in: src/utils/privateStoreDoor.ts:387

Write the user's copy of a store kind: `user-keys.json` first when this
commit creates the user's KEK, then `store.json` — each written only if it
does not exist yet. Returns the store DEK for a sealed copy, so the caller
can put it in the session that walked through the door.

## Parameters

### args

#### kek?

`Buffer`\<`ArrayBufferLike`\>

The user KEK — required for a sealed copy.

#### kind

[`StoreKind`](../interfaces/StoreKind.md)

#### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

#### newEnvelope?

[`UserKeyEnvelope`](../../privateStoreCrypto/interfaces/UserKeyEnvelope.md)

The new envelope, when this commit creates the user's KEK.

#### now?

`Date`

#### pagesDirectory

`string`

#### username

`string`

## Returns

`Promise`\<\{ `dek?`: `Buffer`\<`ArrayBufferLike`\>; \}\>
