[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BasePageProvider](../README.md) / default

# Abstract Class: default

Defined in: [src/providers/BasePageProvider.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L52)

BasePageProvider - Abstract interface for page storage providers

All page storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of wiki pages, whether
from filesystem, database, cloud storage, or other backends.

This follows JSPWiki's provider pattern for pluggable storage backends.

 BasePageProvider

## See

- FileSystemProvider for filesystem implementation
- PageManager for usage

## Example

```ts
class MyProvider extends BasePageProvider {
  async initialize() {
    const config = this.engine.getManager('ConfigurationManager');
    this.storagePath = config.getProperty('myProvider.path');
  }
  async getPage(identifier: string) {
    // Implementation
  }
}
```

## Extended by

- [`default`](../../FileSystemProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BasePageProvider`

Defined in: [src/providers/BasePageProvider.ts:66](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L66)

Create a new page provider

#### Parameters

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BasePageProvider`

#### Throws

If engine is not provided

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../interfaces/WikiEngine.md)

Defined in: [src/providers/BasePageProvider.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L54)

Reference to the wiki engine

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BasePageProvider.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L57)

Whether provider has been initialized

## Methods

### compareVersions()

> __compareVersions__(`_identifier`, `_v1`, `_v2`): `Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Defined in: [src/providers/BasePageProvider.ts:264](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L264)

Compare two versions of a page

Generates a diff between two versions showing what changed.
Returns structured diff data suitable for rendering.

#### Parameters

##### \_identifier

`string`

##### \_v1

`number`

##### \_v2

`number`

#### Returns

`Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Diff data structure

***

### deletePage()

> `abstract` __deletePage__(`identifier`): `Promise`\<`boolean`\>

Defined in: [src/providers/BasePageProvider.ts:147](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L147)

Delete a page

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### findPage()

> `abstract` __findPage__(`identifier`): `string` \| `null`

Defined in: [src/providers/BasePageProvider.ts:174](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L174)

Find page by various identifiers

#### Parameters

##### identifier

`string`

UUID, title, or slug

#### Returns

`string` \| `null`

Canonical page title or null

***

### getAllPageInfo()

> `abstract` __getAllPageInfo__(`options?`): `Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Defined in: [src/providers/BasePageProvider.ts:167](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L167)

Get all page info objects

#### Parameters

##### options?

[`PageListOptions`](../../../types/Page/interfaces/PageListOptions.md)

List options

#### Returns

`Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Array of page info objects

***

### getAllPages()

> `abstract` __getAllPages__(): `Promise`\<`string`[]\>

Defined in: [src/providers/BasePageProvider.ts:160](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L160)

Get all page titles

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

***

### getPage()

> `abstract` __getPage__(`identifier`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: [src/providers/BasePageProvider.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L99)

Get complete page with content and metadata

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageContent()

> `abstract` __getPageContent__(`identifier`): `Promise`\<`string`\>

Defined in: [src/providers/BasePageProvider.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L110)

Get only page content (without metadata)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<`string`\>

Markdown content

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageMetadata()

> `abstract` __getPageMetadata__(`identifier`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: [src/providers/BasePageProvider.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L121)

Get only page metadata (without content)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Metadata object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageVersion()

> __getPageVersion__(`_identifier`, `_version`): `Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Defined in: [src/providers/BasePageProvider.ts:234](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L234)

Get a specific version of a page

Retrieves the content and metadata for a specific version number.
For delta-based storage, this reconstructs the content by applying diffs.

#### Parameters

##### \_identifier

`string`

##### \_version

`number`

#### Returns

`Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Version content and metadata

#### Throws

If version does not exist

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../interfaces/ProviderInfo.md)

Defined in: [src/providers/BasePageProvider.ts:286](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L286)

Get provider information

#### Returns

[`ProviderInfo`](../interfaces/ProviderInfo.md)

Provider metadata

***

### getVersionHistory()

> __getVersionHistory__(`_identifier`, `_limit?`): `Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: [src/providers/BasePageProvider.ts:219](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L219)

Get version history for a page

Returns an array of version metadata entries for the specified page.
Providers that don't support versioning should not implement this method.

#### Parameters

##### \_identifier

`string`

##### \_limit?

`number`

#### Returns

`Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Array of version history entries

#### Example

```ts
// Returns:
[
  {
    version: 1,
    timestamp: "2025-01-01T00:00:00.000Z",
    author: "user@example.com",
    changeType: "create",
    message: "Initial version",
    contentSize: 1234,
    compressed: false
  },
  {
    version: 2,
    timestamp: "2025-01-02T10:30:00.000Z",
    author: "editor@example.com",
    changeType: "update",
    message: "Added section",
    contentSize: 567,
    compressed: false
  }
]
```

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/BasePageProvider.ts:88](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L88)

Initialize the provider with configuration

IMPORTANT: Providers MUST access configuration via ConfigurationManager:
  const configManager = this.engine.getManager('ConfigurationManager');
  const value = configManager.getProperty('key', 'default');

Do NOT read configuration files directly.

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### pageExists()

> `abstract` __pageExists__(`identifier`): `boolean`

Defined in: [src/providers/BasePageProvider.ts:154](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L154)

Check if page exists

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`boolean`

***

### purgeOldVersions()

> __purgeOldVersions__(`_identifier`, `_keepLatest`): `Promise`\<`number`\>

Defined in: [src/providers/BasePageProvider.ts:278](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L278)

Purge old versions based on retention policy

Removes old versions according to configuration settings (maxVersions, retentionDays).
Always preserves v1 (needed for delta reconstruction) and recent versions.

#### Parameters

##### \_identifier

`string`

##### \_keepLatest

`number`

#### Returns

`Promise`\<`number`\>

Number of versions purged

***

### refreshPageList()

> `abstract` __refreshPageList__(): `Promise`\<`void`\>

Defined in: [src/providers/BasePageProvider.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L181)

Refresh internal cache/index
Re-scans storage and rebuilds indexes

#### Returns

`Promise`\<`void`\>

***

### restoreVersion()

> __restoreVersion__(`_identifier`, `_version`): `Promise`\<`void`\>

Defined in: [src/providers/BasePageProvider.ts:249](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L249)

Restore a page to a specific version

Creates a new version by restoring content from an older version.
The restoration itself becomes a new version in the history.

#### Parameters

##### \_identifier

`string`

##### \_version

`number`

#### Returns

`Promise`\<`void`\>

#### Throws

If version does not exist or restoration fails

***

### savePage()

> `abstract` __savePage__(`pageName`, `content`, `metadata?`, `options?`): `Promise`\<`void`\>

Defined in: [src/providers/BasePageProvider.ts:135](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L135)

Save page content and metadata

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

Markdown content

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\>

Frontmatter metadata

##### options?

[`PageSaveOptions`](../../../types/Page/interfaces/PageSaveOptions.md)

Save options

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### shutdown()

> __shutdown__(): `void`

Defined in: [src/providers/BasePageProvider.ts:299](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L299)

Shutdown the provider (cleanup resources)

#### Returns

`void`
