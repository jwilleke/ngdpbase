[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/BaseManager](../README.md) / default

# Abstract Class: default

Defined in: [src/managers/BaseManager.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L52)

Base class for all managers

Provides common functionality for initialization, lifecycle management,
and backup/restore operations.

## Extended by

- [`export=`](../../ACLManager/classes/export=.md)
- [`export=`](../../AuditManager/classes/export=.md)
- [`export=`](../../PageManager/classes/export=.md)
- [`export=`](../../PolicyEvaluator/classes/export=.md)
- [`export=`](../../PolicyManager/classes/export=.md)
- [`export=`](../../PolicyValidator/classes/export=.md)
- [`export=`](../../RenderingManager/classes/export=.md)
- [`export=`](../../SearchManager/classes/export=.md)
- [`export=`](../../TemplateManager/classes/export=.md)
- [`export=`](../../UserManager/classes/export=.md)
- [`default`](../../AttachmentManager/classes/default.md)
- [`default`](../../BackupManager/classes/default.md)
- [`default`](../../CacheManager/classes/default.md)
- [`default`](../../ConfigurationManager/classes/default.md)
- [`default`](../../ExportManager/classes/default.md)
- [`default`](../../NotificationManager/classes/default.md)
- [`default`](../../PluginManager/classes/default.md)
- [`default`](../../SchemaManager/classes/default.md)
- [`default`](../../ValidationManager/classes/default.md)
- [`default`](../../VariableManager/classes/default.md)
- [`default`](../../../parsers/MarkupParser/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseManager`

Defined in: [src/managers/BaseManager.ts:76](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L76)

Creates a new BaseManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`BaseManager`

#### Example

```ts
class MyManager extends BaseManager {
  constructor(engine: WikiEngine) {
    super(engine);
    this.myData = new Map();
  }
}
```

## Properties

### config?

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Returns

`Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Backup data object containing all manager state

#### Throws

If backup operation fails

#### Example

```ts
async backup(): Promise<BackupData> {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

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

***

### initialize()

> __initialize__(`config`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L98)

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Parameters

##### config

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async initialize(config: Record<string, any> = {}): Promise<void> {
  await super.initialize(config);
  // Your initialization logic here
  console.log('MyManager initialized');
}
```

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

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../interfaces/BackupData.md)

Backup data object from backup() method

#### Returns

`Promise`\<`void`\>

#### Throws

If restore operation fails or backup data is missing

#### Example

```ts
async restore(backupData: BackupData): Promise<void> {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
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
