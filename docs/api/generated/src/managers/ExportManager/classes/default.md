[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/ExportManager](../README.md) / default

# Class: default

Defined in: [src/managers/ExportManager.ts:70](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L70)

ExportManager - Handles page exports to multiple formats

Similar to JSPWiki's export functionality, provides page export capabilities
to HTML, PDF, markdown, and other formats.

 ExportManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const exportManager = engine.getManager('ExportManager');
const html = await exportManager.exportPageToHtml('Main');
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ExportManager`

Defined in: [src/managers/ExportManager.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L80)

Creates a new ExportManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ExportManager`

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

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

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

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### deleteExport()

> __deleteExport__(`filename`): `Promise`\<`void`\>

Defined in: [src/managers/ExportManager.ts:435](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L435)

Delete an export file

#### Parameters

##### filename

`string`

Export filename

#### Returns

`Promise`\<`void`\>

***

### exportPagesToHtml()

> __exportPagesToHtml__(`pageNames`, `user`): `Promise`\<`string`\>

Defined in: [src/managers/ExportManager.ts:209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L209)

Export multiple pages to a single HTML file

#### Parameters

##### pageNames

`string`[]

Array of page names

##### user

User object for locale-aware formatting

[`ExportUser`](../interfaces/ExportUser.md) | `null`

#### Returns

`Promise`\<`string`\>

Combined HTML content

***

### exportPageToHtml()

> __exportPageToHtml__(`pageName`, `user`): `Promise`\<`string`\>

Defined in: [src/managers/ExportManager.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L110)

Export a single page to HTML

#### Parameters

##### pageName

`string`

Page name to export

##### user

User object for locale-aware formatting

[`ExportUser`](../interfaces/ExportUser.md) | `null`

#### Returns

`Promise`\<`string`\>

HTML content

***

### exportToMarkdown()

> __exportToMarkdown__(`pageNames`, `user`): `Promise`\<`string`\>

Defined in: [src/managers/ExportManager.ts:346](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L346)

Export page(s) to markdown

#### Parameters

##### pageNames

Single page name or array of page names

`string` | `string`[]

##### user

User object for locale-aware formatting

[`ExportUser`](../interfaces/ExportUser.md) | `null`

#### Returns

`Promise`\<`string`\>

Markdown content

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

### getExports()

> __getExports__(): `Promise`\<[`ExportFileInfo`](../interfaces/ExportFileInfo.md)[]\>

Defined in: [src/managers/ExportManager.ts:405](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L405)

Get list of available exports

#### Returns

`Promise`\<[`ExportFileInfo`](../interfaces/ExportFileInfo.md)[]\>

List of export files

***

### getFormattedTimestamp()

> __getFormattedTimestamp__(`user`): `string`

Defined in: [src/managers/ExportManager.ts:446](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L446)

Get formatted timestamp using user's locale

#### Parameters

##### user

User object (optional)

[`ExportUser`](../interfaces/ExportUser.md) | `null`

#### Returns

`string`

Formatted timestamp

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/ExportManager.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L93)

Initialize the ExportManager

#### Parameters

##### config?

[`ExportConfig`](../interfaces/ExportConfig.md) = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Async

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

### saveExport()

> __saveExport__(`content`, `filename`, `format`): `Promise`\<`string`\>

Defined in: [src/managers/ExportManager.ts:389](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ExportManager.ts#L389)

Save export to file

#### Parameters

##### content

`string`

Content to save

##### filename

`string`

Filename

##### format

`string`

File format

#### Returns

`Promise`\<`string`\>

File path

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
