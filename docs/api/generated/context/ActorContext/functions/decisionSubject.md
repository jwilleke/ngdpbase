[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ActorContext](../README.md) / decisionSubject

# Function: decisionSubject()

> __decisionSubject__\<`S`\>(`input`): [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| [`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md) \| `S` \| `null` \| `undefined`

Defined in: src/context/ActorContext.ts:58

The one place a context becomes the subject a decision reads (#2022).

Called by the deciders — `PolicyDecisionPoint` (`decide`, `permits`,
`holds`) and `PolicyInformationPoint`'s page questions — and by nobody
else: a caller hands them its context as given. A `JobContext` carries
identity, never authority, so it becomes a `JobSubject` whose roles policy
resolves now, keeping its token, share and proxy claims
(`toPermissionSubject`). Anything else is already a subject and passes
through. The object guard is #1173's: `'x' in 'jim'` throws. Not part of
the add-on API; `npm run lint:context` holds callers to it.

## Type Parameters

### S

`S` *extends* [`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| [`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md)

## Parameters

### input

[`ActorContext`](../type-aliases/ActorContext.md) \| `S` \| `null` \| `undefined`

## Returns

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| [`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md) \| `S` \| `null` \| `undefined`
