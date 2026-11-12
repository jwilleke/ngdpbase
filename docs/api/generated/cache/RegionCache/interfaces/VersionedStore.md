[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/RegionCache](../README.md) / VersionedStore

# Interface: VersionedStore

Defined in: src/cache/RegionCache.ts:47

The two calls the read-through needs from a store.

## Methods

### get()

> __get__\<`T`\>(`key`): `Promise`\<`T` \| `null` \| `undefined`\>

Defined in: src/cache/RegionCache.ts:48

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`T` \| `null` \| `undefined`\>

***

### set()

> __set__(`key`, `value`, `options?`): `Promise`\<`unknown`\>

Defined in: src/cache/RegionCache.ts:49

#### Parameters

##### key

`string`

##### value

`unknown`

##### options?

[`CacheSetOptions`](CacheSetOptions.md)

#### Returns

`Promise`\<`unknown`\>
