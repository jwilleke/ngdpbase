[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / RequestIdentity

# Interface: RequestIdentity

Defined in: src/context/JobContext.ts:99

The shape a request-bound context exposes; both WikiContext and ApiContext satisfy it.

## Properties

### aal?

> `optional` __aal?__: `unknown`

Defined in: src/context/JobContext.ts:115

***

### aalCap?

> `optional` __aalCap?__: `number`

Defined in: src/context/JobContext.ts:104

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/context/JobContext.ts:108

***

### isAuthenticated?

> `optional` __isAuthenticated?__: `boolean`

Defined in: src/context/JobContext.ts:102

With `signIn`, `aalCap` and `viaToken`, what the level the job stores is read from (#2261).

***

### origin?

> `optional` __origin?__: `unknown`

Defined in: src/context/JobContext.ts:113

A `JobContext` handed back in: it already holds the level its requester's session had.

***

### requestedAt?

> `optional` __requestedAt?__: `unknown`

Defined in: src/context/JobContext.ts:114

***

### signIn?

> `optional` __signIn?__: \{ `aal?`: `unknown`; \} \| `null`

Defined in: src/context/JobContext.ts:103

***

### subject?

> `optional` __subject?__: `object` \| `null`

Defined in: src/context/JobContext.ts:110

An `ApiContext` holds the request's subject here, a `WikiContext` as `userContext`: the level is read from that, not from the wrapper (#2287).

***

### userContext?

> `optional` __userContext?__: `object` \| `null`

Defined in: src/context/JobContext.ts:111

***

### username?

> `optional` __username?__: `string` \| `null`

Defined in: src/context/JobContext.ts:100

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md)

Defined in: src/context/JobContext.ts:107

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/context/JobContext.ts:106

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](../../../managers/UserManager/interfaces/AgentTokenGrant.md)

Defined in: src/context/JobContext.ts:105
