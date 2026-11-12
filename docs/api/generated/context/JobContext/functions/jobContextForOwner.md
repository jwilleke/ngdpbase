[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextForOwner

# Function: jobContextForOwner()

> __jobContextForOwner__(`owner`, `reason`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:248

Boot work done in one user's own vaults, on that user's behalf (#1815) —
the start-up vault upgrades. The job carries the owner's username, so the
vault container rule admits it as it admits any job carrying who asked, and
what it may do there is the owner's own rights, resolved by policy when
each write is decided. Never the system principal, which no vault admits.
Like every job it carries no key, so an encrypted vault stays closed to it.

## Parameters

### owner

`string`

### reason

`string`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
