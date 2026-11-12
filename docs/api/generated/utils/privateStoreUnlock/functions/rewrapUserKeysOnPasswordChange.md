[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / rewrapUserKeysOnPasswordChange

# Function: rewrapUserKeysOnPasswordChange()

> __rewrapUserKeysOnPasswordChange__(`args`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreUnlock.ts:377

Password change: re-wrap the user envelope. Recovery wrap is unchanged.
No-ops when there is no envelope yet. Not a manager — any caller can use this.

## Parameters

### args

#### newPassword

`string`

#### oldPassword

`string`

#### pagesDirectory

`string`

#### username

`string`

## Returns

`Promise`\<`void`\>
