[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvSecret](../README.md) / InstanceEnvFs

# Interface: InstanceEnvFs

Defined in: src/utils/instanceEnvSecret.ts:24

Filesystem seams, injected so the backfill is testable in a scratch dir.

## Properties

### appendFile

> __appendFile__: (`path`, `line`, `createMode`) => `void`

Defined in: src/utils/instanceEnvSecret.ts:26

#### Parameters

##### path

`string`

##### line

`string`

##### createMode

`number`

#### Returns

`void`

***

### randomSecret

> __randomSecret__: () => `string`

Defined in: src/utils/instanceEnvSecret.ts:27

#### Returns

`string`

***

### readFile

> __readFile__: (`path`) => `string` \| `null`

Defined in: src/utils/instanceEnvSecret.ts:25

#### Parameters

##### path

`string`

#### Returns

`string` \| `null`
