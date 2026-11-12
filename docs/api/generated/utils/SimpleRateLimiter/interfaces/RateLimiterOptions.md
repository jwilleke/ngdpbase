[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SimpleRateLimiter](../README.md) / RateLimiterOptions

# Interface: RateLimiterOptions

Defined in: src/utils/SimpleRateLimiter.ts:15

Minimal in-memory per-key rate limiter (#658 iteration 3).

Used for `/contact` POST to slow down trivial spam from a single client IP.
Not suitable for distributed deployments (each pod has its own counter).
For stronger protection across replicas, swap for a Redis-backed limiter
or wire `express-rate-limit` with a shared store — but adding a new
dependency for a single endpoint is overkill at the current scale.

Implementation: per-key counter that resets when the window expires.
Memory grows with active-key cardinality; an opportunistic GC sweeps
expired entries on each `consume()` call so long-idle IPs don't pile up.

## Properties

### max

> __max__: `number`

Defined in: src/utils/SimpleRateLimiter.ts:17

Max events allowed per window.

***

### windowMs

> __windowMs__: `number`

Defined in: src/utils/SimpleRateLimiter.ts:19

Window length in milliseconds.
