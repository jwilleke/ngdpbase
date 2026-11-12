[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / AalFacts

# Interface: AalFacts

Defined in: src/utils/policyAttributes.ts:205

What a subject carries that bears on its assurance level (#2261 slice 3).
Read from the request's subject, never from a request field: a caller
cannot send an `aal` and have it believed.

## Properties

### aalCap?

> `optional` __aalCap?__: `number`

Defined in: src/utils/policyAttributes.ts:210

The highest level the account's methods can reach; the level never exceeds it.

***

### bearerWithoutLevel?

> `optional` __bearerWithoutLevel?__: `unknown`

Defined in: src/utils/policyAttributes.ts:216

A bearer JWT (Authentik): verified, but it records no sign-in level, so the subject has none (#2287).

***

### grantedAal?

> `optional` __grantedAal?__: `unknown`

Defined in: src/utils/policyAttributes.ts:218

A background job: the level stored when the job was requested.

***

### isAuthenticated?

> `optional` __isAuthenticated?__: `boolean`

Defined in: src/utils/policyAttributes.ts:206

***

### resolveRolesNow?

> `optional` __resolveRolesNow?__: `unknown`

Defined in: src/utils/policyAttributes.ts:220

A background job (`JobSubject`): it has no session to read.

***

### signIn?

> `optional` __signIn?__: \{ `aal?`: `unknown`; \} \| `null`

Defined in: src/utils/policyAttributes.ts:208

The session's sign-in record; absent on a session from before #1523.

***

### viaShare?

> `optional` __viaShare?__: `unknown`

Defined in: src/utils/policyAttributes.ts:214

A share visitor has no sign-in.

***

### viaToken?

> `optional` __viaToken?__: \{ `aal?`: `unknown`; \} \| `null`

Defined in: src/utils/policyAttributes.ts:212

A token request: the level stored when the token was made.
