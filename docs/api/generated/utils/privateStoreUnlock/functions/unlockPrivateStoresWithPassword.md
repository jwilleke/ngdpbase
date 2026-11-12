[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / unlockPrivateStoresWithPassword

# Function: unlockPrivateStoresWithPassword()

> __unlockPrivateStoresWithPassword__(`args`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreUnlock.ts:156

After password login: unwrap the user KEK into the bag and load store DEKs.
No-ops when the user has no envelope yet. Never writes key bytes to session JSON.

## Parameters

### args

#### handle

`string`

The session's private-store handle ([newPrivateStoreHandle](newPrivateStoreHandle.md)), not its session id.

#### pagesDirectory

`string`

#### password

`string`

#### username

`string`

## Returns

`Promise`\<`void`\>
