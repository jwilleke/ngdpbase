[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/LoginThrottle](../README.md) / throttlePerCopyWarning

# Function: throttlePerCopyWarning()

> __throttlePerCopyWarning__(`env`, `throttleEnabled`): `string` \| `null`

Defined in: src/utils/LoginThrottle.ts:181

The startup warning when this process is one of several copies of the
server (#1767), each with its own throttle counts; null otherwise.

The only signal a process has is pm2's: it puts its app settings in the
environment (`pm_id`; `instances`, the copies it was asked to run, where 0,
a negative number or `max` mean one per CPU; `NODE_APP_INSTANCE`, this
copy's number). Copies a process cannot see — several containers or pods
behind one address, several hosts — get no warning.

## Parameters

### env

`Readonly`\<`Record`\<`string`, `string` \| `undefined`\>\>

### throttleEnabled

`boolean`

## Returns

`string` \| `null`
