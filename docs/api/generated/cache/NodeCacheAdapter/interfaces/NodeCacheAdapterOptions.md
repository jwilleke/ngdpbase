[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/NodeCacheAdapter](../README.md) / NodeCacheAdapterOptions

# Interface: NodeCacheAdapterOptions

Defined in: src/cache/NodeCacheAdapter.ts:8

NodeCacheAdapter configuration options

## Indexable

> \[`key`: `string`\]: `unknown`

Additional node-cache options

## Properties

### checkperiod?

> `optional` __checkperiod?__: `number`

Defined in: src/cache/NodeCacheAdapter.ts:12

Check period for expired keys in seconds (default: 120)

***

### deleteOnExpire?

> `optional` __deleteOnExpire?__: `boolean`

Defined in: src/cache/NodeCacheAdapter.ts:16

Delete keys on expiration (default: true)

***

### maxKeys?

> `optional` __maxKeys?__: `number`

Defined in: src/cache/NodeCacheAdapter.ts:18

Maximum number of keys (default: 1000)

***

### stdTTL?

> `optional` __stdTTL?__: `number`

Defined in: src/cache/NodeCacheAdapter.ts:10

Standard TTL in seconds (default: 300)

***

### useClones?

> `optional` __useClones?__: `boolean`

Defined in: src/cache/NodeCacheAdapter.ts:14

Whether to clone objects (default: true)
