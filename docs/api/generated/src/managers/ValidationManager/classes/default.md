[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/ValidationManager](../README.md) / default

# Class: default

Defined in: [src/managers/ValidationManager.ts:126](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L126)

ValidationManager - Ensures all files follow UUID naming and metadata conventions

Validates page metadata and enforces architectural constraints including UUID-based
naming, required metadata fields, valid system categories, and keyword limits.

 ValidationManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const validationManager = engine.getManager('ValidationManager');
const result = validationManager.validatePage(metadata);
if (!result.valid) console.error(result.errors);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ValidationManager`

Defined in: [src/managers/ValidationManager.ts:139](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L139)

Creates a new ValidationManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`ValidationManager`

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

### generateFilename()

> __generateFilename__(`metadata`): `string`

Defined in: [src/managers/ValidationManager.ts:538](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L538)

Generate UUID-based filename from metadata

#### Parameters

##### metadata

[`PageMetadata`](../interfaces/PageMetadata.md)

Page metadata containing UUID

#### Returns

`string`

Filename in UUID.md format

***

### generateFixSuggestions()

> __generateFixSuggestions__(`filename`, `metadata`): [`FixSuggestions`](../interfaces/FixSuggestions.md)

Defined in: [src/managers/ValidationManager.ts:569](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L569)

Generate suggestions to fix validation issues

#### Parameters

##### filename

`string`

Current filename

##### metadata

`Record`\<`string`, `unknown`\>

Current metadata

#### Returns

[`FixSuggestions`](../interfaces/FixSuggestions.md)

Fix suggestions

***

### generateSlug()

> __generateSlug__(`title`): `string`

Defined in: [src/managers/ValidationManager.ts:525](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L525)

Generate URL-safe slug from title

#### Parameters

##### title

`string`

Page title

#### Returns

`string`

URL-safe slug

***

### generateValidMetadata()

> __generateValidMetadata__(`title`, `options`): [`PageMetadata`](../interfaces/PageMetadata.md)

Defined in: [src/managers/ValidationManager.ts:499](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L499)

Generate properly formatted metadata for a new page

#### Parameters

##### title

`string`

Page title

##### options

[`GenerateMetadataOptions`](../interfaces/GenerateMetadataOptions.md) = `{}`

Additional metadata options

#### Returns

[`PageMetadata`](../interfaces/PageMetadata.md)

Complete metadata object with all required fields

***

### getAllSystemCategories()

> __getAllSystemCategories__(): [`CategoryConfig`](../interfaces/CategoryConfig.md)[]

Defined in: [src/managers/ValidationManager.ts:246](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L246)

Get all enabled system categories

#### Returns

[`CategoryConfig`](../interfaces/CategoryConfig.md)[]

Array of category configurations

***

### getCategoryConfig()

> __getCategoryConfig__(`label`): [`CategoryConfig`](../interfaces/CategoryConfig.md) \| `null`

Defined in: [src/managers/ValidationManager.ts:217](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L217)

Get system category configuration by label

#### Parameters

##### label

`string`

Category label (e.g., "General", "System")

#### Returns

[`CategoryConfig`](../interfaces/CategoryConfig.md) \| `null`

Category configuration or null if not found

***

### getCategoryStorageLocation()

> __getCategoryStorageLocation__(`category`): `string`

Defined in: [src/managers/ValidationManager.ts:237](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L237)

Get storage location for a category

#### Parameters

##### category

`string`

Category label

#### Returns

`string`

Storage location ('regular' or 'required')

***

### getDefaultSystemCategory()

> __getDefaultSystemCategory__(): `string`

Defined in: [src/managers/ValidationManager.ts:267](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L267)

Get the default system category

#### Returns

`string`

Default category label

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

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/ValidationManager.ts:154](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L154)

Initialize the ValidationManager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

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

### isValidSlug()

> __isValidSlug__(`slug`): `boolean`

Defined in: [src/managers/ValidationManager.ts:406](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L406)

Validate slug format (URL-safe)

#### Parameters

##### slug

`string`

The slug to validate

#### Returns

`boolean`

True if valid

***

### loadSystemCategories()

> __loadSystemCategories__(`configManager`): `void`

Defined in: [src/managers/ValidationManager.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L175)

Load system categories from ConfigurationManager

#### Parameters

##### configManager

Configuration manager instance

[`default`](../../ConfigurationManager/classes/default.md) | `undefined`

#### Returns

`void`

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

***

### validateContent()

> __validateContent__(`content`): [`ContentValidationResult`](../interfaces/ContentValidationResult.md)

Defined in: [src/managers/ValidationManager.ts:472](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L472)

Validate page content (optional checks)

#### Parameters

##### content

`string`

The page content

#### Returns

[`ContentValidationResult`](../interfaces/ContentValidationResult.md)

Content validation result

***

### validateExistingFile()

> __validateExistingFile__(`filePath`, `fileData`): [`PageValidationResult`](../interfaces/PageValidationResult.md)

Defined in: [src/managers/ValidationManager.ts:551](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L551)

Validate and fix an existing page file

#### Parameters

##### filePath

`string`

Path to the existing file

##### fileData

[`FileData`](../interfaces/FileData.md)

Object with content and metadata from gray-matter

#### Returns

[`PageValidationResult`](../interfaces/PageValidationResult.md)

Validation result with fix suggestions

***

### validateFilename()

> __validateFilename__(`filename`): [`ValidationResult`](../interfaces/ValidationResult.md)

Defined in: [src/managers/ValidationManager.ts:293](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L293)

Validate that a filename follows UUID naming convention

#### Parameters

##### filename

`string`

The filename to validate

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

Validation result with success and error properties

***

### validateMetadata()

> __validateMetadata__(`metadata`): [`MetadataValidationResult`](../interfaces/MetadataValidationResult.md)

Defined in: [src/managers/ValidationManager.ts:321](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L321)

Validate page metadata contains all required fields with proper values

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\>

The metadata object to validate

#### Returns

[`MetadataValidationResult`](../interfaces/MetadataValidationResult.md)

Validation result with success, error, and warnings properties

***

### validatePage()

> __validatePage__(`filename`, `metadata`, `content`): [`PageValidationResult`](../interfaces/PageValidationResult.md)

Defined in: [src/managers/ValidationManager.ts:418](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/ValidationManager.ts#L418)

Validate a complete page before saving

#### Parameters

##### filename

`string`

The target filename

##### metadata

`Record`\<`string`, `unknown`\>

The page metadata

##### content

The page content (optional validation)

`string` | `null`

#### Returns

[`PageValidationResult`](../interfaces/PageValidationResult.md)

Comprehensive validation result
