[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [WikiEngine](../README.md) / default

# Class: default

Defined in: src/WikiEngine.ts:81

WikiEngine - The core orchestrator for the wiki application

Follows JSPWiki's architecture patterns by coordinating all managers
and providing a central access point for wiki functionality. This is the
main entry point for the application and initializes all 24+ managers
in the correct dependency order.

 WikiEngine

## Implements

IWikiEngine

## See

[Engine](../../core/Engine/classes/default.md) for base functionality

## Extends

- [`default`](../../core/Engine/classes/default.md)

## Constructors

### Constructor

> __new default__(`config?`): `WikiEngine`

Defined in: src/WikiEngine.ts:91

Creates a new WikiEngine instance

#### Parameters

##### config?

[`WikiConfig`](../../types/Config/interfaces/WikiConfig.md) = `...`

Initial configuration object (not used in constructor)

#### Returns

`WikiEngine`

#### Overrides

[`default`](../../core/Engine/classes/default.md).[`constructor`](../../core/Engine/classes/default.md#constructor)

## Properties

### capabilities

> `protected` __capabilities__: `Map`\<`string`, `boolean`\>

Defined in: src/core/Engine.ts:53

Optional-capability registry.
Records which optional features (e.g. 'media', 'audit') are enabled.
Set via setCapability() during initialization; read by admin UIs and templates.

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`capabilities`](../../core/Engine/classes/default.md#capabilities)

***

### config?

> `optional` __config?__: [`WikiConfig`](../../types/Config/interfaces/WikiConfig.md)

Defined in: src/core/Engine.ts:46

Configuration object (inherited from Engine)

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`config`](../../core/Engine/classes/default.md#config)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/core/Engine.ts:43

Flag indicating if engine has been initialized

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`initialized`](../../core/Engine/classes/default.md#initialized)

***

### maintenance

> `readonly` __maintenance__: [`MaintenanceState`](../../utils/maintenanceState/classes/MaintenanceState.md)

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

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`maintenance`](../../core/Engine/classes/default.md#maintenance)

***

### managers

> `protected` __managers__: `Map`\<`string`, [`default`](../../managers/BaseManager/classes/default.md)\>

Defined in: src/core/Engine.ts:39

Map of registered manager instances

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`managers`](../../core/Engine/classes/default.md#managers)

***

### startTime

> `readonly` __startTime__: `number`

Defined in: src/WikiEngine.ts:83

Timestamp when the engine was started

The engine holds no request state. A WikiContext is per-request and is passed
into manager calls; see ApiContext.from for the per-request shape.

## Methods

### createDefault()

> `static` __createDefault__(`overrides?`): `Promise`\<`WikiEngine`\>

Defined in: src/WikiEngine.ts:595

Create a new WikiEngine with default configuration

Factory method for creating and initializing a WikiEngine in one step.

#### Parameters

##### overrides?

[`WikiConfig`](../../types/Config/interfaces/WikiConfig.md) = `...`

Configuration overrides to apply

#### Returns

`Promise`\<`WikiEngine`\>

Fully initialized WikiEngine instance

#### Static

#### Async

#### Example

```ts
const engine = await WikiEngine.createDefault({
  applicationName: 'MyWiki',
  port: 3000
});
```

***

### createRouter()

> __createRouter__(`options?`): `Router`

Defined in: src/WikiEngine.ts:560

An Express `Router` built from core's own Express (#1861).

Add-ons build their routers here and mount them with `engine.app.use(...)`.
They never value-import `express`: an add-on installed into `<data>/addons`
resolves imports from its own folder, where there is no Express (and no npm
at runtime), and a second bundled copy would miss core's security patches.
`import type { Request, Response } from 'express'` stays fine — it is erased.
`npm run lint:addons` refuses a value import of `express` in add-on code.

#### Parameters

##### options?

`RouterOptions`

Passed to `express.Router(options)` unchanged

#### Returns

`Router`

A new Router

#### Example

```ts
const router = engine.createRouter();
router.get('/status', (req, res) => { res.json({ ok: true }); });
engine.app?.use('/api/my-addon', router);
```

***

### getApplicationName()

> __getApplicationName__(): `string`

Defined in: src/WikiEngine.ts:611

Get application name from configuration

Uses ConfigurationManager to retrieve the application name.

#### Returns

`string`

Application name (defaults to 'ngdpbase')

#### Example

```ts
const name = engine.getApplicationName(); // 'ngdpbase'
```

#### Overrides

[`default`](../../core/Engine/classes/default.md).[`getApplicationName`](../../core/Engine/classes/default.md#getapplicationname)

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

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`getCapabilities`](../../core/Engine/classes/default.md#getcapabilities)

***

### ~~getConfig()~~

> __getConfig__(): `never`

Defined in: src/WikiEngine.ts:640

Get configuration instance

#### Returns

`never`

#### Deprecated

Use engine.getManager('ConfigurationManager').getProperty() instead

#### Throws

Always throws - use ConfigurationManager instead

#### Example

```ts
// OLD (deprecated):
// const config = engine.getConfig();
// const value = config.get('key');

// NEW (use this instead):
const configManager = engine.getManager('ConfigurationManager');
const value = configManager.getProperty('ngdpbase.key', 'default');
```

#### Overrides

[`default`](../../core/Engine/classes/default.md).[`getConfig`](../../core/Engine/classes/default.md#getconfig)

***

### getDegradedManagers()

> __getDegradedManagers__(): (`object` & [`ManagerStatus`](../../managers/BaseManager/interfaces/ManagerStatus.md))[]

Defined in: src/core/Engine.ts:245

Every manager that is not `ready`, with its reason (#1155).

Thirteen managers could end up degraded and exactly one reported it
anywhere a person could see. This is the collection point that makes the
other twelve reachable — by the admin dashboard, by the effective-posture
report (#1146), and by anything else that needs to know what the instance
is actually doing rather than what it was configured to do.

#### Returns

(`object` & [`ManagerStatus`](../../managers/BaseManager/interfaces/ManagerStatus.md))[]

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`getDegradedManagers`](../../core/Engine/classes/default.md#getdegradedmanagers)

***

### getManager()

> __getManager__\<`T`\>(`managerName`): `T` \| `undefined`

Defined in: src/core/Engine.ts:119

Get a manager instance by class/name

#### Type Parameters

##### T

`T` = [`default`](../../managers/BaseManager/classes/default.md)

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

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`getManager`](../../core/Engine/classes/default.md#getmanager)

***

### getPageManager()

> __getPageManager__(): [`default`](../../managers/PageManager/classes/default.md) \| `undefined`

Defined in: src/WikiEngine.ts:655

Convenience method to get PageManager

#### Returns

[`default`](../../managers/PageManager/classes/default.md) \| `undefined`

PageManager instance or undefined if not initialized

#### Example

```ts
const page = await engine.getPageManager()?.getPage('Main');
```

***

### getPluginManager()

> __getPluginManager__(): [`default`](../../managers/PluginManager/classes/default.md) \| `undefined`

Defined in: src/WikiEngine.ts:667

Convenience method to get PluginManager

#### Returns

[`default`](../../managers/PluginManager/classes/default.md) \| `undefined`

PluginManager instance or undefined if not initialized

#### Example

```ts
const plugins = engine.getPluginManager()?.getAllPlugins();
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

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`getRegisteredManagers`](../../core/Engine/classes/default.md#getregisteredmanagers)

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/WikiEngine.ts:131

Initialize the wiki engine with configuration

This method initializes all 24+ managers in the correct dependency order:

1. ConfigurationManager - Core configuration (no dependencies)
2. CacheManager - Caching support (used by many managers)
3. UserManager - User authentication/authorization (critical for security)
4. NotificationManager - Notification system
5. PageManager - Page storage and retrieval
6. TemplateManager - Template rendering
7. PolicyValidator - Policy validation (policies read live, #1431); PolicyEvaluator starts with the PDP, before UserManager (#1930)
8. PolicyInformationPoint - page and subject attributes; starts before UserManager and reads PolicyEvaluator at use (#1431 step 13)
9. PluginManager - Plugin system
10. MarkupParser - Markup parsing
11. RenderingManager - Content rendering (depends on MarkupParser)
12. SearchManager - Full-text search
13. ValidationManager - Schema validation
14. VariableManager - Variable expansion
15. SchemaManager - Schema management
16. ExportManager - Page export
17. AttachmentManager - File attachments
18. AuditManager - Audit logging
19. BackupManager - Backup/restore (must be last)

#### Parameters

##### config?

[`WikiConfig`](../../types/Config/interfaces/WikiConfig.md) = `...`

Configuration object (passed to ConfigurationManager)

#### Returns

`Promise`\<`void`\>

The initialized engine instance

#### Async

#### Throws

If any manager fails to initialize

#### Example

```ts
const engine = new WikiEngine();
await engine.initialize();
console.log('Engine ready with', engine.getRegisteredManagers().length, 'managers');
```

#### Overrides

[`default`](../../core/Engine/classes/default.md).[`initialize`](../../core/Engine/classes/default.md#initialize)

***

### initializeAddons()

> __initializeAddons__(): `Promise`\<`void`\>

Defined in: src/WikiEngine.ts:525

Initialize the AddonsManager — must be called from app.ts AFTER session and
userContext middleware have been registered on the Express app, so that addon
route handlers can read req.session and req.userContext normally.

#### Returns

`Promise`\<`void`\>

***

### initializeManagers()

> `protected` __initializeManagers__(): `Promise`\<`void`\>

Defined in: src/core/Engine.ts:102

Initialize all managers

To be implemented by subclasses.
Subclasses can make this async if needed.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`initializeManagers`](../../core/Engine/classes/default.md#initializemanagers)

***

### isConfigured()

> __isConfigured__(): `boolean`

Defined in: src/core/Engine.ts:163

Check if engine has been initialized

#### Returns

`boolean`

True if engine is initialized and configured

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`isConfigured`](../../core/Engine/classes/default.md#isconfigured)

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

[`default`](../../managers/BaseManager/classes/default.md)

Manager instance to register

#### Returns

`void`

#### Example

```ts
engine.registerManager('PageManager', new PageManager(engine));
```

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`registerManager`](../../core/Engine/classes/default.md#registermanager)

***

### serveStatic()

> __serveStatic__(`root`, `options?`): `RequestHandler`

Defined in: src/WikiEngine.ts:575

Static-file middleware from core's own Express (`express.static`), for an
add-on's `public/` folder (#1861) — the same reason as [createRouter](#createrouter).

#### Parameters

##### root

`string`

Directory to serve

##### options?

`ServeStaticOptions`\<`Response`\<`any`, `Record`\<`string`, `any`\>\>\>

Passed to `express.static(root, options)` unchanged

#### Returns

`RequestHandler`

The middleware

#### Example

```ts
engine.app?.use('/addons/my-addon', engine.serveStatic(path.join(__dirname, 'public')));
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

#### Inherited from

[`default`](../../core/Engine/classes/default.md).[`setCapability`](../../core/Engine/classes/default.md#setcapability)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/WikiEngine.ts:515

Stop the engine. Scheduled jobs are handed off first (#1717): a running
job may use any manager, an add-on's included, and the reverse-order stop
below would shut those down while it still runs.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../core/Engine/classes/default.md).[`shutdown`](../../core/Engine/classes/default.md#shutdown)
