[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / contactRateLimiter

# Variable: contactRateLimiter

> `const` __contactRateLimiter__: [`SimpleRateLimiter`](../../utils/SimpleRateLimiter/classes/SimpleRateLimiter.md)

Defined in: src/routes/WikiRoutes.ts:714

Module-scope rate limiter for #658 POST /contact. 5 submissions per IP per
15-minute window. Exported so tests can call `.reset()` between cases.
