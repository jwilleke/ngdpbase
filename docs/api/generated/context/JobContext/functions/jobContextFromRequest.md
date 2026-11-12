[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextFromRequest

# Function: jobContextFromRequest()

> __jobContextFromRequest__(`identity`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:137

Derive a job context from the request that triggered the work.

Takes the identity a route already holds — `req.userContext`, an
`ApiContext`, or a `WikiContext`'s `userContext` — rather than a username
string, so `viaToken` comes along instead of being dropped.

## Parameters

### identity

[`RequestIdentity`](../interfaces/RequestIdentity.md) \| `null` \| `undefined`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
