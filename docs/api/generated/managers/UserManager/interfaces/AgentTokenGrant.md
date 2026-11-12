[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / AgentTokenGrant

# Interface: AgentTokenGrant

Defined in: src/managers/UserManager.ts:80

The agent token a request arrived with (#946).

Declared rather than reached by a cast (#1164). `hasPermission` used to read
`viaToken` off a parameter typed `{ username; roles; isAuthenticated }` — a
field the declared type did not mention. That is not a detail: the type
described a three-field object, so satisfying it by BUILDING one was the
obvious thing to do, and any object built that way silently carries no token
for the ceiling to find. `AttachmentManager` did exactly that and bypassed
the ceiling on the path that looked safe.

## Properties

### aal?

> `optional` __aal?__: `1` \| `2` \| `3`

Defined in: src/managers/UserManager.ts:89

The assurance level stored with the token when it was made (#2261): the
level of the minting session at that moment, never higher. Absent on a
token made before it was stored, which then has no `subject:aal`.

***

### id

> __id__: `string`

Defined in: src/managers/UserManager.ts:81

***

### name

> __name__: `string`

Defined in: src/managers/UserManager.ts:82

***

### scopes

> __scopes__: `string`[]

Defined in: src/managers/UserManager.ts:83
