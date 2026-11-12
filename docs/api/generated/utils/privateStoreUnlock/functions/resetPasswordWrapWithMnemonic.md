[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / resetPasswordWrapWithMnemonic

# Function: resetPasswordWrapWithMnemonic()

> __resetPasswordWrapWithMnemonic__(`args`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreUnlock.ts:400

A forgotten password, reset with the recovery words (#1452): the words
unwrap the KEK, and the password wrap is replaced with one made from the
new password. The recovery wrap and the KEK are untouched.

Returns `false` — writing nothing — when the user has no keys or the words
do not open them. The words are never logged or stored.

## Parameters

### args

#### newPassword

`string`

#### pagesDirectory

`string`

#### username

`string`

#### words

`string`

## Returns

`Promise`\<`boolean`\>
