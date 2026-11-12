[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextFromRequestWithReason

# Function: jobContextFromRequestWithReason()

> __jobContextFromRequestWithReason__(`identity`, `reason`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:198

A request-origin context that also says why (#1179).

For an act inside a request that has no subject of its own yet, or acts for
someone other than the caller: self-registration (the new account is the
identity, the reason says so), an identity provider provisioning an account
(the system principal is the identity, the reason names the provider), a
sign-in refreshing login statistics. The reason is mandatory for the same
cause as in `jobContextFromSystem`: an act that cannot say why is the one an
assessor asks about.

## Parameters

### identity

[`RequestIdentity`](../interfaces/RequestIdentity.md) \| `null` \| `undefined`

### reason

`string`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
