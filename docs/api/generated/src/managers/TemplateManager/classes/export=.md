[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/TemplateManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/TemplateManager.ts:100](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L100)

TemplateManager - Handles page templates and themes

Similar to JSPWiki's TemplateManager, this manager provides template
management for creating new pages from predefined templates and managing
wiki themes for UI customization.

Key features:

- Page template management
- Theme loading and switching
- Default template creation
- Template content retrieval

 TemplateManager

## See

[BaseManager](../../BaseManager/classes/default.md) for base functionality

## Example

```ts
const templateManager = engine.getManager('TemplateManager');
const template = templateManager.getTemplate('Meeting Notes');
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `TemplateManager`

Defined in: [src/managers/TemplateManager.ts:112](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L112)

Creates a new TemplateManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`TemplateManager`

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

### applyTemplate()

> __applyTemplate__(`templateName`, `variables`): `string`

Defined in: [src/managers/TemplateManager.ts:380](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L380)

Apply template to create page content

#### Parameters

##### templateName

`string`

Template to use

##### variables

`TemplateVariables` = `{}`

Variables to substitute

#### Returns

`string`

Generated content

#### Throws

If template is not found

***

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

### createDefaultTemplates()

> __createDefaultTemplates__(): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:216](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L216)

Create default page templates

#### Returns

`Promise`\<`void`\>

***

### createDefaultTheme()

> __createDefaultTheme__(): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:243](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L243)

Create default theme

#### Returns

`Promise`\<`void`\>

***

### createTemplate()

> __createTemplate__(`templateName`, `content`): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:449](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L449)

Create a new template

#### Parameters

##### templateName

`string`

Template name

##### content

`string`

Template content

#### Returns

`Promise`\<`void`\>

***

### createTheme()

> __createTheme__(`themeName`, `content`): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:469](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L469)

Create a new theme

#### Parameters

##### themeName

`string`

Theme name

##### content

`string`

CSS content

#### Returns

`Promise`\<`void`\>

***

### generateUUID()

> __generateUUID__(): `string`

Defined in: [src/managers/TemplateManager.ts:415](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L415)

Generate UUID for pages

#### Returns

`string`

UUID

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

### getTemplate()

> __getTemplate__(`templateName`): `Template` \| `null`

Defined in: [src/managers/TemplateManager.ts:368](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L368)

Get a specific template

#### Parameters

##### templateName

`string`

Template name

#### Returns

`Template` \| `null`

Template object or null

***

### getTemplates()

> __getTemplates__(): `Template`[]

Defined in: [src/managers/TemplateManager.ts:358](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L358)

Get available templates

#### Returns

`Template`[]

Available templates

***

### getTheme()

> __getTheme__(`themeName`): `Theme` \| `null`

Defined in: [src/managers/TemplateManager.ts:438](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L438)

Get a specific theme

#### Parameters

##### themeName

`string`

Theme name

#### Returns

`Theme` \| `null`

Theme object or null

***

### getThemes()

> __getThemes__(): `Theme`[]

Defined in: [src/managers/TemplateManager.ts:428](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L428)

Get available themes

#### Returns

`Theme`[]

Available themes

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:127](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L127)

Initialize the TemplateManager and load templates/themes

#### Parameters

##### config?

`TemplateConfig` = `{}`

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

### loadTemplates()

> __loadTemplates__(): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:146](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L146)

Load all page templates

#### Returns

`Promise`\<`void`\>

***

### loadThemes()

> __loadThemes__(): `Promise`\<`void`\>

Defined in: [src/managers/TemplateManager.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L181)

Load all themes

#### Returns

`Promise`\<`void`\>

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

### suggestTemplates()

> __suggestTemplates__(`pageName`, `category`): `string`[]

Defined in: [src/managers/TemplateManager.ts:489](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/TemplateManager.ts#L489)

Get template suggestions based on page name or category

#### Parameters

##### pageName

`string`

Page name

##### category

`string`

Page category

#### Returns

`string`[]

Suggested template names
