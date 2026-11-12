[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SimpleRateLimiter](../README.md) / SimpleRateLimiter

# Class: SimpleRateLimiter

Defined in: src/utils/SimpleRateLimiter.ts:39

Per-key rate limiter. `key` is typically `req.ip` for IP-based throttling.

## Constructors

### Constructor

> __new SimpleRateLimiter__(`opts`): `SimpleRateLimiter`

Defined in: src/utils/SimpleRateLimiter.ts:42

#### Parameters

##### opts

[`RateLimiterOptions`](../interfaces/RateLimiterOptions.md)

#### Returns

`SimpleRateLimiter`

## Methods

### configure()

> __configure__(`opts`): `void`

Defined in: src/utils/SimpleRateLimiter.ts:54

Replace the options at runtime. Existing buckets are preserved — their
counters keep accruing under the new options. Used by `/contact` (#670
Phase E) to reflect operator config changes without restarting the app.

Shrinking `windowMs` may cause in-flight buckets to be treated as expired
on the next consume (their `windowStart` is now older than the new
window); that's the desired semantics — operators tightening the limiter
shouldn't need to wait out the old window.

#### Parameters

##### opts

[`RateLimiterOptions`](../interfaces/RateLimiterOptions.md)

#### Returns

`void`

***

### consume()

> __consume__(`key`, `now?`): [`RateLimitResult`](../interfaces/RateLimitResult.md)

Defined in: src/utils/SimpleRateLimiter.ts:67

Record an event under `key` and return whether it should be allowed.

- When the current window has expired, the counter resets to 1 and the
  event is allowed.
- Otherwise, the counter increments. If `count > max`, the event is
  denied; the bucket still records the attempt so a flood doesn't
  amortise back to "allowed" once the legit traffic stops.

#### Parameters

##### key

`string`

##### now?

`number` = `...`

#### Returns

[`RateLimitResult`](../interfaces/RateLimitResult.md)

***

### reset()

> __reset__(): `void`

Defined in: src/utils/SimpleRateLimiter.ts:85

Drop all state. Test-only helper.

#### Returns

`void`
