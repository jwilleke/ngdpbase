[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionLimits](../README.md) / anonymousSessionMs

# Function: anonymousSessionMs()

> __anonymousSessionMs__(`capMs`, `configured?`): `number`

Defined in: src/utils/sessionLimits.ts:50

How long a session nobody signed in to lives after its last change:
`ngdpbase.session.anonymous-max-age` (the shipped day when not a positive
number), or the cap when that is shorter.

## Parameters

### capMs

`number`

### configured?

`unknown` = `DEFAULT_ANONYMOUS_SESSION_MS`

## Returns

`number`
