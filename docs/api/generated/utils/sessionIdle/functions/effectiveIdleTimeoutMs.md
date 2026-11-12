[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionIdle](../README.md) / effectiveIdleTimeoutMs

# Function: effectiveIdleTimeoutMs()

> __effectiveIdleTimeoutMs__(`siteMinutes`, `roleMinutes?`): `number`

Defined in: src/utils/sessionIdle.ts:51

The limit that applies to one person (#1546): the shortest positive value
among the site setting and their roles' `idle-timeout-minutes`. A role can
only shorten the site value, never lengthen it; 0 or absent means "no limit
from here", so with nothing set anywhere the timeout stays off.

## Parameters

### siteMinutes

`unknown`

### roleMinutes?

readonly `unknown`[] = `[]`

## Returns

`number`
