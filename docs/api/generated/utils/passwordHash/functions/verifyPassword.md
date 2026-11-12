[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/passwordHash](../README.md) / verifyPassword

# Function: verifyPassword()

> __verifyPassword__(`password`, `stored`, `legacySalt`): `Promise`\<`boolean`\>

Defined in: src/utils/passwordHash.ts:105

Verify `password` against a stored value in EITHER scheme.

## Parameters

### password

`string`

### stored

`string`

the value from the user record

### legacySalt

`string`

instance-wide salt, for pre-#1042 hashes only

## Returns

`Promise`\<`boolean`\>
