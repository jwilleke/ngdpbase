[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / exportStartRateLimiter

# Variable: exportStartRateLimiter

> `const` __exportStartRateLimiter__: [`SimpleRateLimiter`](../../utils/SimpleRateLimiter/classes/SimpleRateLimiter.md)

Defined in: src/routes/WikiRoutes.ts:775

Per-user limiter for starting an export (#2120), `POST /export/page/:page`.
Each start reads the thing into memory and queues it for the one ICE job;
`max-queued-per-user` bounds what is held at once, this bounds how fast a
user can come back for more. 20 a minute is well past anyone clicking
Export. Exported so tests can call `.reset()`.
