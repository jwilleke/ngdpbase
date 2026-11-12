[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / JobSubject

# Interface: JobSubject

Defined in: src/managers/UserManager.ts:230

The subject of work with no request behind it (#631, #1212).

A job enqueued at 09:00 and run at 09:12 must authorise against 09:12's
roles, so it carries who asked and __no roles__ — they resolve at decision
time. Until #1212 that shape was "a `PermissionSubject` whose `roles` happen
to be absent", which the type could not tell apart from a caller that
forgot them. `resolveRolesNow` says it on purpose: the compiler now refuses
a subject missing `roles`, and this is the one sanctioned way to ask for
live resolution. `viaToken` / `viaShare` / `viaProxy` ride along exactly as on a request.

## Properties

### grantedAal?

> `optional` __grantedAal?__: `1` \| `2` \| `3`

Defined in: src/managers/UserManager.ts:241

# 2261: the level stored with the job's request (`JobContext.aal`); absent when it stored none.

***

### isAuthenticated

> __isAuthenticated__: `boolean`

Defined in: src/managers/UserManager.ts:232

***

### job?

> `optional` __job?__: `string`

Defined in: src/managers/UserManager.ts:239

# 1999: the scheduled job a run acts as (`JobContext.job`).

***

### resolveRolesNow

> __resolveRolesNow__: `true`

Defined in: src/managers/UserManager.ts:234

Roles are resolved live at decision time, not carried.

***

### username

> __username__: `string`

Defined in: src/managers/UserManager.ts:231

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](ProxyClaim.md)

Defined in: src/managers/UserManager.ts:237

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/managers/UserManager.ts:236

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](AgentTokenGrant.md)

Defined in: src/managers/UserManager.ts:235
