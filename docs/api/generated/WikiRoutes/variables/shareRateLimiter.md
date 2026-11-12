[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / shareRateLimiter

# Variable: shareRateLimiter

> `const` __shareRateLimiter__: [`SimpleRateLimiter`](../../utils/SimpleRateLimiter/classes/SimpleRateLimiter.md)

Defined in: src/routes/WikiRoutes.ts:729

Module-scope rate limiter for anonymous /share/:token/* access (#853,
decision 5) keyed `token:ip`. Generous budget — one album view fans out
into one request per thumbnail, so a big album must fit in the window.
Exported so tests can call `.reset()` between cases.
