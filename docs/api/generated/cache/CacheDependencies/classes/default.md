[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/CacheDependencies](../README.md) / default

# Class: default

Defined in: src/cache/CacheDependencies.ts:43

## Constructors

### Constructor

> __new default__(`versionOf`): `CacheDependencies`

Defined in: src/cache/CacheDependencies.ts:47

#### Parameters

##### versionOf

[`VersionLookup`](../type-aliases/VersionLookup.md)

#### Returns

`CacheDependencies`

## Methods

### dependsOn()

> __dependsOn__(`topic`): `void`

Defined in: src/cache/CacheDependencies.ts:50

This render reads `topic`'s data. Call it before reading.

#### Parameters

##### topic

`string`

#### Returns

`void`

***

### isVolatile()

> __isVolatile__(): `boolean`

Defined in: src/cache/CacheDependencies.ts:59

#### Returns

`boolean`

***

### markVolatile()

> __markVolatile__(): `void`

Defined in: src/cache/CacheDependencies.ts:55

This render's output changes on its own; do not store it.

#### Returns

`void`

***

### resolved()

> __resolved__(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: src/cache/CacheDependencies.ts:64

Each declared topic with the version it had when declared.

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>
