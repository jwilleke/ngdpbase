[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/BackupManager](../README.md) / default

# Class: default

Defined in: [src/managers/BackupManager.ts:90](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L90)

BackupManager - Coordinates backup and restore operations across all managers

Orchestrates system-wide backup and restore by calling backup()/restore()
on all registered managers and aggregating their data into compressed archives.

Responsibilities:

- Call backup() on all registered managers
- Aggregate backup data into a single .gz file
- Restore from .gz backup file
- Call restore() on all registered managers

Architecture:

- Each manager implements backup() to return its state
- BackupManager collects all states into one object
- Serializes to JSON and compresses with gzip
- Stores as single .gz file

 BackupManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality and backup() pattern

## Example

```ts
const backupManager = engine.getManager('BackupManager');
const backupPath = await backupManager.createBackup();
console.log('Backup created:', backupPath);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BackupManager`

Defined in: [src/managers/BackupManager.ts:101](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L101)

Creates a new BackupManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`BackupManager`

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

Defined in: [src/managers/BackupManager.ts:144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L144)

Backup BackupManager's own state (conforms to BaseManager interface)

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data for this manager

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### createBackup()

> __createBackup__(`options`): `Promise`\<`string`\>

Defined in: [src/managers/BackupManager.ts:185](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L185)

Perform a complete backup of all managers to a file

Process:

1. Get all registered managers from engine
2. Call backup() on each manager
3. Aggregate all backup data
4. Compress to .gz file
5. Save with timestamp
6. Clean up old backups

#### Parameters

##### options

[`BackupOptions`](../interfaces/BackupOptions.md) = `{}`

Backup options

#### Returns

`Promise`\<`string`\>

Path to created backup file

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

### getLatestBackup()

> __getLatestBackup__(): `Promise`\<`string` \| `null`\>

Defined in: [src/managers/BackupManager.ts:474](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L474)

Get the most recent backup file path

#### Returns

`Promise`\<`string` \| `null`\>

Path to most recent backup, or null if none exist

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/BackupManager.ts:115](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L115)

Initialize BackupManager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available

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

### listBackups()

> __listBackups__(): `Promise`\<[`BackupFileInfo`](../interfaces/BackupFileInfo.md)[]\>

Defined in: [src/managers/BackupManager.ts:405](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L405)

List all available backups

#### Returns

`Promise`\<[`BackupFileInfo`](../interfaces/BackupFileInfo.md)[]\>

List of backup files with metadata

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

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

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreFromFile()

> __restoreFromFile__(`backupPath`, `options`): `Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md)\>

Defined in: [src/managers/BackupManager.ts:286](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L286)

Restore all managers from a backup file

Process:

1. Read and decompress backup file
2. Parse JSON data
3. Validate backup structure
4. Call restore() on each manager with its data

#### Parameters

##### backupPath

`string`

Path to backup file

##### options

[`RestoreOptions`](../interfaces/RestoreOptions.md) = `{}`

Restore options

#### Returns

`Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md)\>

Restore results

***

### restoreState()

> __restoreState__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BackupManager.ts:162](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BackupManager.ts#L162)

Restore BackupManager's own state (conforms to BaseManager interface)

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data from backup()

#### Returns

`Promise`\<`void`\>

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
