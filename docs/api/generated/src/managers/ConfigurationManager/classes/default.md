[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/ConfigurationManager](../README.md) / default

# Class: default

Defined in: [src/managers/ConfigurationManager.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L41)

ConfigurationManager - Handles JSPWiki-compatible configuration management

Implements a hierarchical configuration system that merges multiple configuration
sources in priority order. This allows for flexible deployment configurations while
maintaining sensible defaults.

Configuration merge order (later overrides earlier):

1. app-default-config.json (base defaults - required)
2. app-{environment}-config.json (environment-specific - optional)
3. app-custom-config.json (local overrides - optional)

Environment is determined by NODE_ENV environment variable (default: 'development')

 ConfigurationManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const configManager = engine.getManager('ConfigurationManager');
const appName = configManager.getApplicationName();
const port = configManager.getServerPort();
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ConfigurationManager`

Defined in: [src/managers/ConfigurationManager.ts:58](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L58)

Creates a new ConfigurationManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ConfigurationManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/ConfigurationManager.ts:592](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L592)

Backup configuration data

Backs up the custom configuration (user overrides) which can be restored
to recreate the user's configuration settings. We don't backup default or
environment configs as those are part of the codebase.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data containing custom configuration

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### getAccessControlConfig()

> __getAccessControlConfig__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:450](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L450)

Get access control configuration

#### Returns

`object`

Access control configuration

##### businessHours

> __businessHours__: `object`

###### businessHours.days

> __days__: `unknown`

###### businessHours.enabled

> __enabled__: `boolean`

###### businessHours.end

> __end__: `unknown`

###### businessHours.start

> __start__: `unknown`

##### contextAware

> __contextAware__: `object`

###### contextAware.enabled

> __enabled__: `boolean`

###### contextAware.timeZone

> __timeZone__: `unknown`

***

### getAllProperties()

> __getAllProperties__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: [src/managers/ConfigurationManager.ts:251](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L251)

Get all configuration properties

Returns a copy of the entire merged configuration object.

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

All merged configuration properties

#### Example

```ts
const allConfig = configManager.getAllProperties();
console.log(JSON.stringify(allConfig, null, 2));
```

***

### getApplicationName()

> __getApplicationName__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L263)

Get application name

#### Returns

`string`

Application name (defaults to 'ngdpbase')

#### Example

```ts
const name = configManager.getApplicationName(); // 'ngdpbase'
```

***

### getAuditConfig()

> __getAuditConfig__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:481](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L481)

Get audit configuration

#### Returns

`object`

Audit configuration

##### enabled

> __enabled__: `boolean`

##### includeContext

> __includeContext__: `object`

###### includeContext.decision

> __decision__: `boolean`

###### includeContext.ip

> __ip__: `boolean`

###### includeContext.reason

> __reason__: `boolean`

###### includeContext.timestamp

> __timestamp__: `boolean`

###### includeContext.userAgent

> __userAgent__: `boolean`

##### logDirectory

> __logDirectory__: `unknown`

##### logFile

> __logFile__: `unknown`

##### retention

> __retention__: `object`

###### retention.maxAge

> __maxAge__: `unknown`

###### retention.maxFiles

> __maxFiles__: `number`

***

### getBaseURL()

> __getBaseURL__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:272](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L272)

Get base URL for the wiki

#### Returns

`string`

Base URL (defaults to '<http://localhost:3000>')

***

### getCustomProperties()

> __getCustomProperties__(): `Partial`\<[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)\>

Defined in: [src/managers/ConfigurationManager.ts:566](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L566)

Get custom configuration for admin UI

Returns only the custom overrides, useful for displaying
which settings have been customized.

#### Returns

`Partial`\<[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)\>

Custom configuration properties only

#### Example

```ts
const customSettings = configManager.getCustomProperties();
console.log('Customized settings:', Object.keys(customSettings));
```

***

### getDefaultProperties()

> __getDefaultProperties__(): [`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Defined in: [src/managers/ConfigurationManager.ts:578](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L578)

Get default configuration for comparison

Returns the base default configuration, useful for comparison
with current settings or resetting individual properties.

#### Returns

[`WikiConfig`](../../../types/Config/interfaces/WikiConfig.md)

Default configuration properties

***

### getDirectories()

> __getDirectories__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:345](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L345)

Get directory paths

#### Returns

`object`

Directory configuration

##### data

> __data__: `unknown`

##### pages

> __pages__: `unknown`

##### resources

> __resources__: `unknown`

##### templates

> __templates__: `unknown`

##### work

> __work__: `unknown`

***

### getEncoding()

> __getEncoding__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:289](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L289)

Get encoding

#### Returns

`string`

Encoding

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L125)

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getFeatureConfig()

> __getFeatureConfig__(`featureName`): `object`

Defined in: [src/managers/ConfigurationManager.ts:398](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L398)

Get feature configuration

#### Parameters

##### featureName

`string`

Name of feature

#### Returns

`object`

Feature configuration

##### enabled

> __enabled__: `boolean`

***

### getFrontPage()

> __getFrontPage__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:281](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L281)

Get front page name

#### Returns

`string`

Front page name (defaults to 'Welcome')

***

### getLoggingConfig()

> __getLoggingConfig__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:418](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L418)

Get logging configuration

#### Returns

`object`

Logging configuration

##### dir

> __dir__: `unknown`

##### level

> __level__: `unknown`

##### maxFiles

> __maxFiles__: `number`

##### maxSize

> __maxSize__: `unknown`

***

### getManagerConfig()

> __getManagerConfig__(`managerName`): `object`

Defined in: [src/managers/ConfigurationManager.ts:377](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L377)

Get manager-specific configuration

Retrieves all configuration properties for a specific manager,
including enabled status and manager-specific settings.

#### Parameters

##### managerName

`string`

Name of the manager

#### Returns

`object`

Manager configuration object with enabled flag and settings

##### enabled

> __enabled__: `boolean`

#### Example

```ts
const searchConfig = configManager.getManagerConfig('SearchManager');
if (searchConfig.enabled) {
  // Use search manager
}
```

***

### getProperty()

> __getProperty__(`key`, `defaultValue?`): `unknown`

Defined in: [src/managers/ConfigurationManager.ts:177](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L177)

Get a configuration property value

Retrieves a property from the merged configuration with optional default value.
Checks environment variables first for specific keys (Docker/Traefik support).

Priority order:

1. Environment variables (for Docker/Traefik deployments)
2. Merged configuration (from config files)
3. Default value parameter

#### Parameters

##### key

`string`

Configuration property key

##### defaultValue?

`unknown` = `null`

Default value if property not found

#### Returns

`unknown`

Configuration value or default

#### Example

```ts
const appName = configManager.getProperty('ngdpbase.application-name', 'MyWiki');
```

***

### getRSSConfig()

> __getRSSConfig__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:519](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L519)

Get RSS settings

#### Returns

`object`

RSS configuration

##### channelDescription

> __channelDescription__: `unknown`

##### channelTitle

> __channelTitle__: `unknown`

##### fileName

> __fileName__: `unknown`

##### generate

> __generate__: `unknown`

##### interval

> __interval__: `unknown`

***

### getSearchConfig()

> __getSearchConfig__(): `object`

Defined in: [src/managers/ConfigurationManager.ts:436](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L436)

Get search configuration

#### Returns

`object`

Search configuration

##### enabled

> __enabled__: `boolean`

##### indexDir

> __indexDir__: `unknown`

***

### getServerHost()

> __getServerHost__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:305](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L305)

Get server host

#### Returns

`string`

Server host

***

### getServerPort()

> __getServerPort__(): `number`

Defined in: [src/managers/ConfigurationManager.ts:297](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L297)

Get server port

#### Returns

`number`

Server port

***

### getSessionHttpOnly()

> __getSessionHttpOnly__(): `boolean`

Defined in: [src/managers/ConfigurationManager.ts:337](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L337)

Get session httpOnly flag

#### Returns

`boolean`

Session httpOnly flag

***

### getSessionMaxAge()

> __getSessionMaxAge__(): `number`

Defined in: [src/managers/ConfigurationManager.ts:321](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L321)

Get session max age in milliseconds

#### Returns

`number`

Session max age

***

### getSessionSecret()

> __getSessionSecret__(): `string`

Defined in: [src/managers/ConfigurationManager.ts:313](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L313)

Get session secret

#### Returns

`string`

Session secret

***

### getSessionSecure()

> __getSessionSecure__(): `boolean`

Defined in: [src/managers/ConfigurationManager.ts:329](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L329)

Get session secure flag

#### Returns

`boolean`

Session secure flag

***

### initialize()

> __initialize__(`config`): `Promise`\<`void`\>

Defined in: [src/managers/ConfigurationManager.ts:81](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L81)

Initialize the configuration manager

Loads and merges all configuration files in the correct priority order.

#### Parameters

##### config

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If default configuration file is not found

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/managers/BaseManager.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L113)

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### reload()

> __reload__(): `Promise`\<`void`\>

Defined in: [src/managers/ConfigurationManager.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L98)

Reload configuration from disk

#### Returns

`Promise`\<`void`\>

***

### resetToDefaults()

> __resetToDefaults__(): `Promise`\<`void`\>

Defined in: [src/managers/ConfigurationManager.ts:548](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L548)

Reset configuration to defaults (admin only)

Clears all custom configuration and resets to default values.
This operation persists the empty custom configuration to disk.

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await configManager.resetToDefaults();
console.log('Configuration reset to defaults');
```

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/ConfigurationManager.ts:649](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L649)

Restore configuration from backup data

Restores the custom configuration (user overrides) from backup data.
This will overwrite the current custom configuration file and reload
all configurations to rebuild the merged config.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### setProperty()

> __setProperty__(`key`, `value`): `Promise`\<`void`\>

Defined in: [src/managers/ConfigurationManager.ts:208](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ConfigurationManager.ts#L208)

Set a configuration property (updates custom config)

Sets a property value and persists it to the custom configuration file.
This allows runtime configuration changes that survive restarts.

#### Parameters

##### key

`string`

Configuration property key

##### value

`unknown`

Configuration value to set

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await configManager.setProperty('ngdpbase.application-name', 'My Custom Wiki');
```

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L143)

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)
