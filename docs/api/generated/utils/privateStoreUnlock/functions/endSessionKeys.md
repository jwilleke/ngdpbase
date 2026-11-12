[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / endSessionKeys

# Function: endSessionKeys()

> __endSessionKeys__(`handle`): `void`

Defined in: src/utils/privateStoreUnlock.ts:556

The one door for a session ending (#1626): whatever ends it — logout, idle
timeout, a password change, an admin revoke, a new sign-in on the same
browser — calls this with the session's private-store handle before the
session is gone, so its keys are zeroed and dropped and no recovery words
stay pending. Takes the raw session value, so a caller never re-implements
the "is there a handle" check.

## Parameters

### handle

`unknown`

## Returns

`void`
