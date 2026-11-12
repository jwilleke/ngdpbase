[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/ownedRecords](../README.md) / ownerDeclarationProblem

# Function: ownerDeclarationProblem()

> __ownerDeclarationProblem__(`type`, `entry`): `string` \| `null`

Defined in: src/security/ownedRecords.ts:72

What is wrong with a resource type's `owner` declaration, or null (#1823).
`owner`, when present at all, must be exactly `{ "type": "identity" }`.
Anything else, `null` included, would quietly make an owner type
policy-alone, so the decision throws and start-up refuses the config.

## Parameters

### type

`string`

### entry

`unknown`

## Returns

`string` \| `null`
