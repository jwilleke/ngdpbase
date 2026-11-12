[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / unlockPrivateStoresWithMnemonic

# Function: unlockPrivateStoresWithMnemonic()

> __unlockPrivateStoresWithMnemonic__(`args`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreUnlock.ts:177

Unlock with the 12 recovery words instead of the password (#1453).

The words unwrap the SAME key the password does — the envelope holds it
twice, once per wrap — so everything after the unwrap is the password
path's, shared. Wrong words fail the authenticated unwrap and return
`false`; nothing is unlocked and nothing is written. The words are never
logged, stored or returned.

## Parameters

### args

#### handle

`string`

#### pagesDirectory

`string`

#### username

`string`

#### words

`string`

## Returns

`Promise`\<`boolean`\>
