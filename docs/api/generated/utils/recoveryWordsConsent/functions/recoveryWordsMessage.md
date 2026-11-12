[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/recoveryWordsConsent](../README.md) / recoveryWordsMessage

# Function: recoveryWordsMessage()

> __recoveryWordsMessage__(`vaults`): `string`

Defined in: src/utils/recoveryWordsConsent.ts:86

What the reminder says (#1928). Accurate about what is at stake: the files
in the vaults are locked with the user's own key, nobody can open them, the
words are the only way back after a lost password, and without them those
files are lost for good. Nothing is said about other records.

## Parameters

### vaults

readonly `string`[]

## Returns

`string`
