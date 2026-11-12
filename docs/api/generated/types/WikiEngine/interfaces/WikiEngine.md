[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/WikiEngine](../README.md) / WikiEngine

# Interface: WikiEngine

Defined in: src/types/WikiEngine.ts:56

WikiEngine interface

The core engine that orchestrates all wiki functionality.
Manages initialization, configuration, and provides access to all managers.

## Indexable

> \[`key`: `string`\]: `any`

Allow additional properties for extensibility

## Properties

### app?

> `optional` __app?__: `Application`

Defined in: src/types/WikiEngine.ts:77

Express application instance — available for add-ons to mount routes and
middleware via engine.app.use().  Set by app.js before AddonsManager
initialises (#359).

***

### config?

> `optional` __config?__: [`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Defined in: src/types/WikiEngine.ts:58

Wiki configuration

***

### logger?

> `optional` __logger?__: `Logger`

Defined in: src/types/WikiEngine.ts:64

Logger instance (winston Logger)

***

### maintenance

> `readonly` __maintenance__: [`MaintenanceState`](../../../utils/maintenanceState/classes/MaintenanceState.md)

Defined in: src/types/WikiEngine.ts:152

Whether the site is in maintenance mode, and why (#1906): the one door.
A manager that needs the site closed calls `maintenance.enter(reason,
{ message?, estimatedDuration? })`, and `maintenance.leave(reason)` when
the reason clears. Reasons are for administrators only; visitors get
`maintenance.visitorView(configManager)`. Replaces `blockConfiguration`
(#1152), still recorded rather than thrown so `initialize()` finishes and
`/admin`, `/login` and `/logout` stay reachable.

***

### startTime?

> `optional` __startTime?__: `number`

Defined in: src/types/WikiEngine.ts:67

Engine start time

***

### templateData?

> `optional` __templateData?__: (`req`) => `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/WikiEngine.ts:87

The data every page view gets — the header, the left menu, the CSRF token,
the signed-in user — exactly as core's own views get it
(WikiRoutes.getCommonTemplateData). An add-on route that renders a view
spreads it first: `res.render(view, { ...(await engine.templateData?.(req)), ... })`.
One path (#1749): no add-on builds its own. Set by app.ts once the routes
exist; add-ons call it per request.

#### Parameters

##### req

`Request`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

## Methods

### createRouter()

> __createRouter__(`options?`): `Router`

Defined in: src/types/WikiEngine.ts:94

An Express `Router` from core's own Express (#1861). Add-ons build routers
here and mount them with `engine.app.use(...)`; they never value-import
`express` (an installed add-on has none to resolve). `lint:addons` enforces it.

#### Parameters

##### options?

`RouterOptions`

#### Returns

`Router`

***

### getCapabilities()

> __getCapabilities__(): `Record`\<`string`, `boolean`\>

Defined in: src/types/WikiEngine.ts:165

Return the optional-capability map set during initialization.
Used by templates to conditionally show/hide panels for disabled features.

#### Returns

`Record`\<`string`, `boolean`\>

Record mapping capability ID → boolean (e.g. { media: false })

***

### getConfig()

> __getConfig__(): [`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Defined in: src/types/WikiEngine.ts:136

Get wiki configuration

#### Returns

[`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Wiki configuration object

***

### getManager()

> __getManager__\<`T`\>(`managerName`): `T` \| `undefined`

Defined in: src/types/WikiEngine.ts:123

Get a manager by name

#### Type Parameters

##### T

`T` = `unknown`

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

Defined in: src/types/WikiEngine.ts:158

Get all registered manager names

#### Returns

`string`[]

Array of manager names

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/types/WikiEngine.ts:107

Initialize the wiki engine

#### Parameters

##### config?

[`WikiConfig`](../../Config/interfaces/WikiConfig.md)

Wiki configuration

#### Returns

`Promise`\<`void`\>

The initialized engine or void

***

### initializeAddons()

> __initializeAddons__(): `Promise`\<`void`\>

Defined in: src/types/WikiEngine.ts:112

Initialize AddonsManager — call from app.ts after session/userContext middleware.

#### Returns

`Promise`\<`void`\>

***

### registerManager()

> __registerManager__(`managerName`, `manager`): `void`

Defined in: src/types/WikiEngine.ts:130

Register a manager

#### Parameters

##### managerName

`string`

Name of the manager

##### manager

`unknown`

Manager instance

#### Returns

`void`

***

### serveStatic()

> __serveStatic__(`root`, `options?`): `RequestHandler`

Defined in: src/types/WikiEngine.ts:100

`express.static` from core's own Express, for an add-on's `public/`
folder (#1861): `engine.app?.use('/addons/x', engine.serveStatic(dir))`.

#### Parameters

##### root

`string`

##### options?

`ServeStaticOptions`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

#### Returns

`RequestHandler`

***

### setCapability()

> __setCapability__(`id`, `enabled`): `void`

Defined in: src/types/WikiEngine.ts:172

Record whether an optional capability is active.

#### Parameters

##### id

`string`

Capability identifier (e.g. 'media', 'audit')

##### enabled

`boolean`

Whether the capability is active

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/WikiEngine.ts:141

Shutdown the wiki engine

#### Returns

`Promise`\<`void`\>
