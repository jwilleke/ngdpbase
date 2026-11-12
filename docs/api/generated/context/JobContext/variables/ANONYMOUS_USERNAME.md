[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / ANONYMOUS\_USERNAME

# Variable: ANONYMOUS\_USERNAME

> `const` __ANONYMOUS\_USERNAME__: `"Anonymous"` = `'Anonymous'`

Defined in: src/context/JobContext.ts:128

The username a request-origin job carries when the request had no identity.

Anonymous, and deliberately NOT the system principal. This used to default
to `'System'`, which was harmless while `'System'` named nobody. Under #631
the principal is a configured name that resolves to the `admin` role, so a
route that enqueued work without a `userContext` would have run that work
as the system principal — a bypass reached by forgetting an argument. A
missing identity is a visitor; nothing more.
