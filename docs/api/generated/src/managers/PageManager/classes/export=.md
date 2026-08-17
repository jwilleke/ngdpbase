[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/PageManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/PageManager.ts:53](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L53)

PageManager - Manages wiki page operations through a pluggable provider system

Follows JSPWiki's provider pattern where the actual storage implementation
is abstracted behind a provider interface. This allows for different storage
backends (filesystem, database, cloud, etc.) to be swapped via configuration.

The PageManager acts as a thin coordinator that:

- Loads the configured provider (via "ngdpbase.page.provider")
- Proxies all page operations to the provider
- Maintains the public API for backward compatibility

 PageManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- FileSystemProvider for default provider implementation

## Example

```ts
const pageManager = engine.getManager('PageManager');
const page = await pageManager.getPage('Main');
console.log(page.content);
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new export=__(`engine`): `PageManager`

Defined in: [src/managers/PageManager.ts:63](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L63)

Creates a new PageManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`PageManager`

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

Defined in: [src/managers/PageManager.ts:455](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L455)

Backup all pages through the provider

Delegates to the provider's backup() method to serialize all page data.
The backup includes all page content, metadata, and directory structure.

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data from provider

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### ~~deletePage()~~

> __deletePage__(`identifier`): `Promise`\<`boolean`\>

Defined in: [src/managers/PageManager.ts:366](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L366)

Delete a page

Removes a page from storage. The page can be identified by UUID, title, or slug.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Async

#### Deprecated

Use deletePageWithContext() with WikiContext instead

#### Example

```ts
const deleted = await pageManager.deletePage('Old Page');
if (deleted) console.log('Page removed');
```

***

### deletePageWithContext()

> __deletePageWithContext__(`wikiContext`): `Promise`\<`boolean`\>

Defined in: [src/managers/PageManager.ts:335](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L335)

Delete a page using WikiContext

Removes a page from storage using WikiContext as the single source of truth.
Extracts the page name from the context.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing page info

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Async

#### Example

```ts
const deleted = await pageManager.deletePageWithContext(wikiContext);
if (deleted) console.log('Page removed');
```

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: [src/managers/PageManager.ts:405](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L405)

Get all page titles

Returns a sorted list of all page titles in the wiki.

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

#### Async

#### Example

```ts
const pages = await pageManager.getAllPages();
console.log('Total pages:', pages.length);
```

***

### getCurrentPageProvider()

> __getCurrentPageProvider__(): [`PageProvider`](../../../types/Provider/interfaces/PageProvider.md) \| `null`

Defined in: [src/managers/PageManager.ts:189](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L189)

Get the current page provider instance

#### Returns

[`PageProvider`](../../../types/Provider/interfaces/PageProvider.md) \| `null`

The active provider instance

#### Example

```ts
const provider = pageManager.getCurrentPageProvider();
const info = provider.getProviderInfo();
console.log('Using:', info.name);
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

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getPage()

> __getPage__(`identifier`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: [src/managers/PageManager.ts:211](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L211)

Get complete page with content and metadata

Retrieves a page by UUID, title, or slug. Returns the full page object
including content, metadata, and file path information.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Async

#### Example

```ts
const page = await pageManager.getPage('Main');
console.log(page.title, page.metadata.author);
```

***

### getPageContent()

> __getPageContent__(`identifier`): `Promise`\<`string`\>

Defined in: [src/managers/PageManager.ts:231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L231)

Get only page content (without metadata)

More efficient than getPage() when only content is needed.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<`string`\>

Markdown content

#### Async

#### Example

```ts
const content = await pageManager.getPageContent('Main');
console.log(content);
```

***

### getPageMetadata()

> __getPageMetadata__(`identifier`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: [src/managers/PageManager.ts:251](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L251)

Get only page metadata (without content)

More efficient than getPage() when only metadata is needed.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Metadata object or null if not found

#### Async

#### Example

```ts
const meta = await pageManager.getPageMetadata('Main');
console.log('Author:', meta.author);
```

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:82](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L82)

Initialize the PageManager by loading and initializing the configured provider

Reads the page provider configuration and dynamically loads the provider class.
The provider name is normalized from lowercase (config) to PascalCase (class name).

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Example

```ts
await pageManager.initialize();
// Loads FileSystemProvider by default
```

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

### pageExists()

> __pageExists__(`identifier`): `boolean`

Defined in: [src/managers/PageManager.ts:386](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L386)

Check if page exists

Fast existence check without loading page content.

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`boolean`

True if page exists

#### Example

```ts
if (pageManager.pageExists('Main')) {
  console.log('Main page exists');
}
```

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:425](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L425)

Refresh internal cache/index

Forces the provider to rebuild its internal caches and indices.
Useful after external file system changes.

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await pageManager.refreshPageList();
console.log('Page list refreshed');
```

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:496](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L496)

Restore pages from backup data

Delegates to the provider's restore() method to recreate all pages
from the backup data.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### ~~savePage()~~

> __savePage__(`pageName`, `content`, `metadata?`): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:314](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L314)

Save page content and metadata

Creates a new page or updates an existing one. Handles UUID generation
for new pages and version management automatically.

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

Markdown content

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Frontmatter metadata

#### Returns

`Promise`\<`void`\>

#### Async

#### Deprecated

Use savePageWithContext() with WikiContext instead

#### Example

```ts
await pageManager.savePage('New Page', '# Hello World', {
  author: 'admin',
  tags: ['tutorial']
});
```

***

### savePageWithContext()

> __savePageWithContext__(`wikiContext`, `metadata?`): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:274](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L274)

Save page content and metadata using WikiContext

Creates a new page or updates an existing one using WikiContext as the
single source of truth. Extracts page name, content, and author from context.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing page and user info

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Additional frontmatter metadata

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await pageManager.savePageWithContext(wikiContext, {
  tags: ['tutorial']
});
```

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/PageManager.ts:440](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PageManager.ts#L440)

Shutdown the PageManager and its provider

Cleanly shuts down the provider, closing connections and flushing caches.

#### Returns

`Promise`\<`void`\>

#### Async

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)
