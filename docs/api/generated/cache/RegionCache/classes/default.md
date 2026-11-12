[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/RegionCache](../README.md) / default

# Class: default

Defined in: src/cache/RegionCache.ts:95

RegionCache - Cache wrapper that provides namespaced access to a cache adapter

This class wraps a cache adapter and automatically prefixes all keys with a region name,
providing isolation between different cache users (managers, components, etc.)

## Constructors

### Constructor

> __new default__(`adapter`, `region`, `versionOf?`): `RegionCache`

Defined in: src/cache/RegionCache.ts:106

#### Parameters

##### adapter

[`default`](../../ICacheAdapter/classes/default.md)

##### region

`string`

##### versionOf?

[`VersionLookup`](../../CacheDependencies/type-aliases/VersionLookup.md)

How to read a data topic's current version (CacheManager.version).
                 Without it every topic reads as version 0, so only a
                 volatile render or the TTL ends an entry.

#### Returns

`RegionCache`

## Methods

### clear()

> __clear__(`pattern?`): `Promise`\<`void`\>

Defined in: src/cache/RegionCache.ts:180

Clear all cache entries for this region

#### Parameters

##### pattern?

`string`

Optional pattern to match keys within the region

#### Returns

`Promise`\<`void`\>

***

### del()

> __del__(`keys`): `Promise`\<`void`\>

Defined in: src/cache/RegionCache.ts:165

Delete one or more keys from the cache

#### Parameters

##### keys

`string` \| `string`[]

Single key or array of keys to delete

#### Returns

`Promise`\<`void`\>

***

### get()

> __get__\<`T`\>(`key`): `Promise`\<`T` \| `undefined`\>

Defined in: src/cache/RegionCache.ts:142

Get a value from the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

The cache key

#### Returns

`Promise`\<`T` \| `undefined`\>

The cached value or undefined if not found

***

### getAdapter()

> __getAdapter__(): [`default`](../../ICacheAdapter/classes/default.md)

Defined in: src/cache/RegionCache.ts:312

Get the underlying adapter

#### Returns

[`default`](../../ICacheAdapter/classes/default.md)

The cache adapter

***

### getOrSet()

> __getOrSet__\<`T`\>(`key`, `factory`, `options?`): `Promise`\<`T`\>

Defined in: src/cache/RegionCache.ts:240

Get or set a value (cache-aside pattern)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

The cache key

##### factory

[`CacheFactory`](../type-aliases/CacheFactory.md)\<`T`\>

Function to generate the value if not cached

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`T`\>

The cached or generated value

***

### getOrSetVersioned()

> __getOrSetVersioned__\<`T`\>(`key`, `factory`, `options?`): `Promise`\<`T`\>

Defined in: src/cache/RegionCache.ts:261

Read-through with data versions (#1751). Returns the stored value while
every topic it was built from still has the version it had then;
otherwise computes it again with `factory`, stores it with the versions it
read (unless the render marked itself volatile), and returns it.

The factory declares what it reads: `deps.dependsOn('LedgerManager')`.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### factory

(`deps`) => `Promise`\<`T`\>

##### options?

[`VersionedSetOptions`](../interfaces/VersionedSetOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

***

### getRegion()

> __getRegion__(): `string`

Defined in: src/cache/RegionCache.ts:303

Get the region name

#### Returns

`string`

The region name

***

### has()

> __has__(`key`): `Promise`\<`boolean`\>

Defined in: src/cache/RegionCache.ts:227

Check if a key exists in this region

#### Parameters

##### key

`string`

The cache key

#### Returns

`Promise`\<`boolean`\>

True if key exists

***

### keys()

> __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: src/cache/RegionCache.ts:198

Get keys matching a pattern within this region

#### Parameters

##### pattern?

`string` = `'*'`

Pattern to match

#### Returns

`Promise`\<`string`[]\>

Array of matching keys (without region prefix)

***

### mget()

> __mget__\<`T`\>(`keys`): `Promise`\<`Record`\<`string`, `T` \| `undefined`\>\>

Defined in: src/cache/RegionCache.ts:275

Get multiple keys at once

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### keys

`string`[]

Array of cache keys

#### Returns

`Promise`\<`Record`\<`string`, `T` \| `undefined`\>\>

Object with keys as properties and cached values

***

### mset()

> __mset__(`keyValuePairs`, `options?`): `Promise`\<`void`\>

Defined in: src/cache/RegionCache.ts:292

Set multiple keys at once

#### Parameters

##### keyValuePairs

`Record`\<`string`, `unknown`\>

Object with keys and values to set

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`void`\>

***

### set()

> __set__(`key`, `value`, `options?`): `Promise`\<`void`\>

Defined in: src/cache/RegionCache.ts:154

Set a value in the cache

#### Parameters

##### key

`string`

The cache key

##### value

`unknown`

The value to cache

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`void`\>

***

### stats()

> __stats__(): `Promise`\<[`RegionStats`](../interfaces/RegionStats.md)\>

Defined in: src/cache/RegionCache.ts:209

Get cache statistics for this region

#### Returns

`Promise`\<[`RegionStats`](../interfaces/RegionStats.md)\>

Cache statistics for this region
