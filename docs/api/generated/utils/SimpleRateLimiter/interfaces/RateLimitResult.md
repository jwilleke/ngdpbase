[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SimpleRateLimiter](../README.md) / RateLimitResult

# Interface: RateLimitResult

Defined in: src/utils/SimpleRateLimiter.ts:22

## Properties

### allowed

> __allowed__: `boolean`

Defined in: src/utils/SimpleRateLimiter.ts:24

Whether this event was allowed (within budget).

***

### count

> __count__: `number`

Defined in: src/utils/SimpleRateLimiter.ts:26

Events already counted in the current window (including this one if allowed).

***

### retryAfterMs

> __retryAfterMs__: `number`

Defined in: src/utils/SimpleRateLimiter.ts:28

Milliseconds until the current window expires and the count resets.
