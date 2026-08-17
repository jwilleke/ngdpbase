[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/core/Engine](../README.md) / default

# Abstract Class: default

Defined in: [src/core/Engine.ts:18](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L18)

Engine interface - Main wiki engine following JSPWiki architecture

Provides Wiki services to the application. There's basically only a single Engine
for each web application instance. This is the base class that WikiEngine extends.

 Engine

## Extended by

- [`default`](../../../WikiEngine/classes/default.md)

## Constructors

### Constructor

> __new default__(): `Engine`

Defined in: [src/core/Engine.ts:36](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L36)

Creates a new Engine instance

#### Returns

`Engine`

## Properties

### config?

> `optional` __config__: [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: [src/core/Engine.ts:29](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L29)

Configuration object passed during initialization

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/core/Engine.ts:26](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L26)

Flag indicating if engine has been initialized

***

### managers

> `protected` __managers__: `Map`\<`string`, [`default`](../../../managers/BaseManager/classes/default.md)\>

Defined in: [src/core/Engine.ts:20](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L20)

Map of registered manager instances keyed by name

***

### properties

> `protected` __properties__: `Map`\<`string`, `unknown`\>

Defined in: [src/core/Engine.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L23)

Map of configuration properties

## Methods

### getApplicationName()

> __getApplicationName__(): `string`

Defined in: [src/core/Engine.ts:162](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L162)

Get application name from configuration

#### Returns

`string`

Application name (defaults to 'ngdpbase')

***

### getConfig()

> __getConfig__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: [src/core/Engine.ts:180](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L180)

Get configuration object

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Configuration object

***

### getManager()

> __getManager__\<`T`\>(`managerName`): `T` \| `undefined`

Defined in: [src/core/Engine.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L93)

Get a manager instance by class/name

#### Type Parameters

##### T

`T` = [`default`](../../../managers/BaseManager/classes/default.md)

#### Parameters

##### managerName

`string`

Name of the manager to retrieve

#### Returns

`T` \| `undefined`

Manager instance or undefined if not found

#### Example

```ts
// Type-safe usage with explicit type parameter:
const pageManager = engine.getManager<PageManager>('PageManager');
const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
```

***

### getProperties()

> __getProperties__(): `Map`\<`string`, `unknown`\>

Defined in: [src/core/Engine.ts:144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L144)

Get all configuration properties

#### Returns

`Map`\<`string`, `unknown`\>

Map of all configuration properties

***

### getProperty()

> __getProperty__\<`T`\>(`key`, `defaultValue?`): `T` \| `null`

Defined in: [src/core/Engine.ts:134](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L134)

Get configuration property value

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

Configuration property key

##### defaultValue?

Default value if property not found

`T` | `null`

#### Returns

`T` \| `null`

Property value or default value

#### Example

```ts
const appName = engine.getProperty('applicationName', 'MyWiki');
```

***

### getRegisteredManagers()

> __getRegisteredManagers__(): `string`[]

Defined in: [src/core/Engine.ts:120](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L120)

Get all registered manager names

#### Returns

`string`[]

Array of registered manager names

#### Example

```ts
const managers = engine.getRegisteredManagers();
// ['ConfigurationManager', 'PageManager', 'UserManager', ...]
```

***

### getWorkDir()

> __getWorkDir__(): `string`

Defined in: [src/core/Engine.ts:171](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L171)

Get working directory path from configuration

#### Returns

`string`

Working directory path (defaults to './')

***

### initialize()

> __initialize__(`config`): `Promise`\<`void`\>

Defined in: [src/core/Engine.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L50)

Initialize the engine with configuration

#### Parameters

##### config

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md) = `...`

Configuration object containing engine settings

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If engine is already initialized

***

### initializeManagers()

> `protected` __initializeManagers__(): `Promise`\<`void`\>

Defined in: [src/core/Engine.ts:76](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L76)

Initialize all managers

To be implemented by subclasses.
Subclasses can make this async if needed.

#### Returns

`Promise`\<`void`\>

***

### isConfigured()

> __isConfigured__(): `boolean`

Defined in: [src/core/Engine.ts:153](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L153)

Check if engine has been initialized

#### Returns

`boolean`

True if engine is initialized and configured

***

### registerManager()

> __registerManager__(`name`, `manager`): `void`

Defined in: [src/core/Engine.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L107)

Register a manager with the engine

#### Parameters

##### name

`string`

Unique name for the manager

##### manager

[`default`](../../../managers/BaseManager/classes/default.md)

Manager instance to register

#### Returns

`void`

#### Example

```ts
engine.registerManager('PageManager', new PageManager(engine));
```

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/core/Engine.ts:190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/core/Engine.ts#L190)

Shutdown the engine and cleanup all managers

#### Returns

`Promise`\<`void`\>

#### Async
