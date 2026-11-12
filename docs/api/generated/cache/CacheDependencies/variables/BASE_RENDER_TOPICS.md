[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/CacheDependencies](../README.md) / BASE\_RENDER\_TOPICS

# Variable: BASE\_RENDER\_TOPICS

> `const` __BASE\_RENDER\_TOPICS__: readonly `string`[]

Defined in: src/cache/CacheDependencies.ts:41

What every cached page render reads (#1751): any page can link, list or
include pages, show configuration and name people, so each render depends
on these. A plugin adds its own data with `context.dependsOn(topic)`.
