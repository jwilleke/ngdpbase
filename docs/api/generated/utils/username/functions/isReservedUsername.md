[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / isReservedUsername

# Function: isReservedUsername()

> __isReservedUsername__(`username`): `boolean`

Defined in: src/utils/username.ts:131

True when the name belongs to a principal rather than a user, is a "no user
recorded" value ([NO\_RECORDED\_USER](../variables/NO_RECORDED_USER.md), #2097: an account by that name
would take over the records that hold it), or has the contact, `@id`, orphan or
add-on author (#2255) prefix.

## Parameters

### username

`unknown`

## Returns

`boolean`
