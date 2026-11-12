[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / privateStoreIdsOf

# Function: privateStoreIdsOf()

> __privateStoreIdsOf__(`pagesDirectory`, `owner`, `layout?`): `Promise`\<`string`[]\>

Defined in: src/utils/privateStoreFiles.ts:146

Every store id in `owner`'s container, whether or not it can be opened (#1460).

Which stores EXIST is a question about a folder, not about keys: an
unencrypted store has no DEK for a session to hold, so
`unlockedStoreIdsFor` — which answers from the session's key bag — can only
ever name the encrypted ones. A caller that wants all of the owner's stores
asks here and then opens each through [storeFileIO](storeFileIO.md), which refuses the
encrypted ones it holds no key for.

Empty for a user with no container. Nothing here decides access: the
container rule (`mayActInPrivateContainer`) is the caller's to apply, as it
is at the page door.

## Parameters

### pagesDirectory

`string`

### owner

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`Promise`\<`string`[]\>
