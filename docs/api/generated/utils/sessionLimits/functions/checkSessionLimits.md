[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionLimits](../README.md) / checkSessionLimits

# Function: checkSessionLimits()

> __checkSessionLimits__(`session`, `now`, `limits`): [`SessionLimitVerdict`](../type-aliases/SessionLimitVerdict.md)

Defined in: src/utils/sessionLimits.ts:77

The per-request check of a signed-in session against both limits: the cap
first (it holds whatever the activity), then the idle timeout. A session
signed in before `signedInAt` was recorded starts its cap now
(`stampSignedIn`), as the idle timer does for a missing last activity.

## Parameters

### session

#### lastActivity?

`unknown`

#### signedInAt?

`unknown`

### now

`number`

### limits

#### capMs

`number`

#### idleMs

`number`

## Returns

[`SessionLimitVerdict`](../type-aliases/SessionLimitVerdict.md)
