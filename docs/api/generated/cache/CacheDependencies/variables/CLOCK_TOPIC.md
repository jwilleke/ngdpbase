[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/CacheDependencies](../README.md) / CLOCK\_TOPIC

# Variable: CLOCK\_TOPIC

> `const` __CLOCK\_TOPIC__: `"Clock"` = `'Clock'`

Defined in: src/cache/CacheDependencies.ts:34

The time, to the minute: its version is the current minute, so nothing has
to write it. A plugin that shows the time, an uptime or a count that drifts
on its own depends on it and is re-rendered at most once a minute, where
`volatile` would re-render the whole page on every request.
