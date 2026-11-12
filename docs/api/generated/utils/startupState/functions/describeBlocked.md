[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/startupState](../README.md) / describeBlocked

# Function: describeBlocked()

> __describeBlocked__(`reasons`): `string`

Defined in: src/utils/startupState.ts:107

The reasons as logged at boot, for administrators. Visitors never see them:
they get `engine.maintenance.visitorView(…)` (#1906).

Every reason at once, rather than the first: an operator who fixes one and
restarts into the next has been made to do the work twice.

## Parameters

### reasons

readonly `string`[]

## Returns

`string`
