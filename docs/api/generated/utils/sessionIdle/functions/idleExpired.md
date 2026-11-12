[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionIdle](../README.md) / idleExpired

# Function: idleExpired()

> __idleExpired__(`lastActivity`, `now`, `timeoutMs`): `boolean`

Defined in: src/utils/sessionIdle.ts:33

Whether a session last active at `lastActivity` (epoch ms) has been idle
past the limit. A session with no recorded activity — one signed in before
the limit was set — is not expired; it starts counting now.

## Parameters

### lastActivity

`unknown`

### now

`number`

### timeoutMs

`number`

## Returns

`boolean`
