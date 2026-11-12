[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiRoutes](../README.md) / agentMutationRateLimiter

# Variable: agentMutationRateLimiter

> `const` __agentMutationRateLimiter__: [`SimpleRateLimiter`](../../utils/SimpleRateLimiter/classes/SimpleRateLimiter.md)

Defined in: src/routes/WikiRoutes.ts:749

Rate limiter for token-authenticated page mutations (#946 slice 2), keyed by
token id so one runaway agent cannot starve another.

Deferred in slice 1 on the grounds that ingest is an idempotent upsert — a
repeated create/edit converges. Delete and rename are neither idempotent nor
self-correcting, and a token runs unattended for up to 24 hours, so a loop
has real consequences.

# 947 softened the worst case considerably: a delete is now recoverable for
the retention window rather than destroying version history outright. That
lowers the severity but does not remove the need — a delete loop still churns
every page it touches into the trash, and rename has no such safety net at
all.

60/minute is far above any legitimate agent editing rate and far below what
a runaway loop would produce.
