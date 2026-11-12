[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [core/Engine](../README.md) / default

# Abstract Class: default

Defined in: src/core/Engine.ts:37

Engine interface - Main wiki engine following JSPWiki architecture

Provides Wiki services to the application. There's basically only a single Engine
for each web application instance. This is the base class that WikiEngine extends.

 Engine

## Extended by

- [`default`](../../../WikiEngine/classes/default.md)

## Constructors

### Constructor

> __new default__(): `Engine`

Defined in: src/core/Engine.ts:63

Creates a new Engine instance

#### Returns

`Engine`

## Properties

### capabilities

> `protected` __capabilities__: `Map`\<`string`, `boolean`\>

Defined in: src/core/Engine.ts:53

Optional-capability registry.
Records which optional features (e.g. 'media', 'audit') are enabled.
Set via setCapability() during initialization; read by admin UIs and templates.

***

### config?

> `optional` __config?__: [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: src/core/Engine.ts:46

Configuration object passed during initialization

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/core/Engine.ts:43

Flag indicating if engine has been initialized

***

### maintenance

> `readonly` __maintenance__: [`MaintenanceState`](../../../utils/maintenanceState/classes/MaintenanceState.md)

Defined in: src/core/Engine.ts:234

Whether the site is in maintenance mode, and why (#1906): the one door a
manager calls to close the site (`enter(reason, { message? })`) or reopen
it (`leave(reason)`). Created here, before any manager initialises, because
the boot paths enter it while initialisation is still running.

It replaces `blockConfiguration` (#1152): a value an administrator can
repair, or a failure the site cannot serve through, is still recorded
rather than thrown, so `initialize()` finishes and the instance serves
`/admin`, `/login` and `/logout` with a route to the fix. A failure of the
machinery needed to SERVE that UI is fatal and still throws — see D10 of
docs/security-posture.md.

***

### managers

> `protected` __managers__: `Map`\<`string`, [`default`](../../../managers/BaseManager/classes/default.md)\>

Defined in: src/core/Engine.ts:39

Map of registered manager instances keyed by name

## Methods

### getApplicationName()

> __getApplicationName__(): `string`

Defined in: src/core/Engine.ts:174

The application's name. The base engine has no configuration of its own:
WikiEngine overrides this to read `ngdpbase.application-name` from
ConfigurationManager, the one configuration reader (#1191).

#### Returns

`string`

'ngdpbase'

***

### getCapabilities()

> __getCapabilities__(): `Record`\<`string`, `boolean`\>

Defined in: src/core/Engine.ts:211

Return a plain-object snapshot of all registered optional capabilities.
Consumed by getCommonTemplateData() so every EJS template receives it.

#### Returns

`Record`\<`string`, `boolean`\>

Record mapping capability ID → boolean

#### Example

```ts
const caps = engine.getCapabilities();
// { media: false, audit: true }
```

***

### getConfig()

> __getConfig__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: src/core/Engine.ts:183

Get configuration object

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Configuration object

***

### getDegradedManagers()

> __getDegradedManagers__(): (`object` & [`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md))[]

Defined in: src/core/Engine.ts:245

Every manager that is not `ready`, with its reason (#1155).

Thirteen managers could end up degraded and exactly one reported it
anywhere a person could see. This is the collection point that makes the
other twelve reachable — by the admin dashboard, by the effective-posture
report (#1146), and by anything else that needs to know what the instance
is actually doing rather than what it was configured to do.

#### Returns

(`object` & [`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md))[]

***

### getManager()

> __getManager__\<`T`\>(`managerName`): `T` \| `undefined`

Defined in: src/core/Engine.ts:119

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

### getRegisteredManagers()

> __getRegisteredManagers__(): `string`[]

Defined in: src/core/Engine.ts:154

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

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/core/Engine.ts:77

Initialize the engine with configuration

#### Parameters

##### config?

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

Defined in: src/core/Engine.ts:102

Initialize all managers

To be implemented by subclasses.
Subclasses can make this async if needed.

#### Returns

`Promise`\<`void`\>

***

### isConfigured()

> __isConfigured__(): `boolean`

Defined in: src/core/Engine.ts:163

Check if engine has been initialized

#### Returns

`boolean`

True if engine is initialized and configured

***

### registerManager()

> __registerManager__(`name`, `manager`): `void`

Defined in: src/core/Engine.ts:141

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

### setCapability()

> __setCapability__(`id`, `enabled`): `void`

Defined in: src/core/Engine.ts:197

Record whether an optional capability is active.
Call this during initialization for every feature that can be enabled or disabled.

#### Parameters

##### id

`string`

Short identifier used in admin UIs and templates (e.g. 'media', 'audit')

##### enabled

`boolean`

Whether the capability is active in this instance

#### Returns

`void`

#### Example

```ts
this.setCapability('media', mediaEnabled);
```

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/core/Engine.ts:263

#### Returns

`Promise`\<`void`\>
