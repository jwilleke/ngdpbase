[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / UserUpdateFn

# Type Alias: UserUpdateFn

> __UserUpdateFn__ = (`current`) => [`UserUpdateInput`](../interfaces/UserUpdateInput.md) \| `undefined` \| `Promise`\<[`UserUpdateInput`](../interfaces/UserUpdateInput.md) \| `undefined`\>

Defined in: src/managers/UserManager.ts:287

A change worked out from the account as it is now (#2025), the function form
of `updateUser`. It runs inside the account's key, is handed a copy of the
account without the password hash (an add-on's own fields included, as
`UserUpdateInput` allows them), and returns the fields to merge, or
`undefined` to change nothing.

## Parameters

### current

`Omit`\<[`User`](../../../types/User/interfaces/User.md), `"password"`\> & `object`

## Returns

[`UserUpdateInput`](../interfaces/UserUpdateInput.md) \| `undefined` \| `Promise`\<[`UserUpdateInput`](../interfaces/UserUpdateInput.md) \| `undefined`\>
