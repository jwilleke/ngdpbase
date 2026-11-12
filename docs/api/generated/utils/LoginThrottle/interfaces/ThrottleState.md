[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/LoginThrottle](../README.md) / ThrottleState

# Interface: ThrottleState

Defined in: src/utils/LoginThrottle.ts:52

## Properties

### blocked

> __blocked__: `boolean`

Defined in: src/utils/LoginThrottle.ts:54

True when the key is currently locked out.

***

### failures

> __failures__: `number`

Defined in: src/utils/LoginThrottle.ts:58

Failures recorded in the current window.

***

### retryAfterMs

> __retryAfterMs__: `number`

Defined in: src/utils/LoginThrottle.ts:56

Milliseconds until the lock expires. 0 when not blocked.
