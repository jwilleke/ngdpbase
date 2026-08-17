[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/WikiEngine](../README.md) / WikiEngine

# Interface: WikiEngine

Defined in: [src/types/WikiEngine.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L52)

WikiEngine interface

The core engine that orchestrates all wiki functionality.
Manages initialization, configuration, and provides access to all managers.

## Indexable

\[`key`: `string`\]: `any`

Allow additional properties for extensibility

## Properties

### config?

> `optional` __config__: [`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Defined in: [src/types/WikiEngine.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L54)

Wiki configuration

***

### context?

> `optional` __context__: `any`

Defined in: [src/types/WikiEngine.ts:67](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L67)

Current context (request-scoped)

***

### logger?

> `optional` __logger__: `Logger`

Defined in: [src/types/WikiEngine.ts:60](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L60)

Logger instance (winston Logger)

***

### startTime?

> `optional` __startTime__: `number`

Defined in: [src/types/WikiEngine.ts:63](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L63)

Engine start time

## Methods

### getConfig()

> __getConfig__(): [`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Defined in: [src/types/WikiEngine.ts:101](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L101)

Get wiki configuration

#### Returns

[`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Wiki configuration object

***

### getManager()

> __getManager__\<`T`\>(`managerName`): `T` \| `undefined`

Defined in: [src/types/WikiEngine.ts:87](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L87)

Get a manager by name

#### Type Parameters

##### T

`T` = `any`

#### Parameters

##### managerName

`string`

Name of the manager

#### Returns

`T` \| `undefined`

Manager instance or undefined

#### Example

```ts
// Type-safe usage with explicit type parameter:
const pageManager = engine.getManager<PageManager>('PageManager');
```

***

### getRegisteredManagers()

> __getRegisteredManagers__(): `string`[]

Defined in: [src/types/WikiEngine.ts:112](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L112)

Get all registered manager names

#### Returns

`string`[]

Array of manager names

***

### initialize()

> __initialize__(`config?`): `Promise`\<`any`\>

Defined in: [src/types/WikiEngine.ts:75](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L75)

Initialize the wiki engine

#### Parameters

##### config?

[`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Wiki configuration

#### Returns

`Promise`\<`any`\>

The initialized engine or void

***

### registerManager()

> __registerManager__(`managerName`, `manager`): `void`

Defined in: [src/types/WikiEngine.ts:95](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L95)

Register a manager

#### Parameters

##### managerName

`string`

Name of the manager

##### manager

`any`

Manager instance

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/types/WikiEngine.ts:106](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/WikiEngine.ts#L106)

Shutdown the wiki engine

#### Returns

`Promise`\<`void`\>
