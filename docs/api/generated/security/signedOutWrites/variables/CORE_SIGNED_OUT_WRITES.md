[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/signedOutWrites](../README.md) / CORE\_SIGNED\_OUT\_WRITES

# Variable: CORE\_SIGNED\_OUT\_WRITES

> `const` __CORE\_SIGNED\_OUT\_WRITES__: readonly [`SignedOutWriteRoute`](../interfaces/SignedOutWriteRoute.md)[]

Defined in: src/security/signedOutWrites.ts:71

Core's list. Each reason says why the route cannot wait for a sign-in.
Routes that need a signed-in session by their nature (consent, the
account-setup password, the second-factor enrolment, reauthentication) are
not here: their callers are signed in when they reach them.
