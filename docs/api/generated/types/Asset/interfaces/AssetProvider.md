[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetProvider

# Interface: AssetProvider

Defined in: src/types/Asset.ts:394

AssetProvider — the single interface that all asset backends implement.

Required methods: search, getById.
Optional (capability-gated) methods: store, delete, getThumbnail, stream, healthCheck.

## See

- BasicAttachmentProvider  implements 'upload' | 'search' | 'stream'
- BaseMediaProvider        implements 'search' | 'thumbnail'

## Properties

### capabilities

> `readonly` __capabilities__: [`ProviderCapability`](../type-aliases/ProviderCapability.md)[]

Defined in: src/types/Asset.ts:400

Capabilities this provider supports

***

### displayName

> `readonly` __displayName__: `string`

Defined in: src/types/Asset.ts:398

Human-readable display name

***

### id

> `readonly` __id__: `string`

Defined in: src/types/Asset.ts:396

Stable provider identifier (e.g. 'local', 'media-library', 's3')

## Methods

### delete()?

> `optional` __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/types/Asset.ts:428

Delete an asset by its provider-internal ID.
Returns true if deleted, false if not found.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getById()

> __getById__(`id`): `Promise`\<[`AssetRecord`](AssetRecord.md) \| `null`\>

Defined in: src/types/Asset.ts:412

Retrieve a single asset by its provider-internal ID.
Returns null if not found.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`AssetRecord`](AssetRecord.md) \| `null`\>

***

### getThumbnail()?

> `optional` __getThumbnail__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/types/Asset.ts:436

Generate (or retrieve cached) thumbnail data.
Only available when 'thumbnail' is in capabilities.

#### Parameters

##### id

`string`

Asset identifier

##### size

`string`

Requested size string (e.g. "300x300")

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

***

### healthCheck()?

> `optional` __healthCheck__(): `Promise`\<`boolean`\>

Defined in: src/types/Asset.ts:465

Optional liveness check for the underlying storage backend.

Return true when the provider can serve requests normally.
Return false (or throw) when storage is unreachable — e.g. a NAS volume
that has been unmounted, an SMB share that dropped, or expired cloud
credentials.  AssetManager calls this during initialize() and on demand
(admin health-check endpoint) and skips degraded providers in fan-out.

Providers without this method are always considered healthy.

#### Returns

`Promise`\<`boolean`\>

***

### search()

> __search__(`query`): `Promise`\<[`AssetPage`](AssetPage.md)\>

Defined in: src/types/Asset.ts:406

Search assets with optional filtering and pagination.
All providers must implement this.

#### Parameters

##### query

[`AssetQuery`](AssetQuery.md)

#### Returns

`Promise`\<[`AssetPage`](AssetPage.md)\>

***

### store()?

> `optional` __store__(`buffer`, `info`, `ctx`): `Promise`\<[`AssetRecord`](AssetRecord.md)\>

Defined in: src/types/Asset.ts:422

Store a new asset. Only available when 'upload' is in capabilities.
Goes through the asset-upload door (AttachmentManager.uploadAttachment,
# 1629), so it carries the acting context like every other upload.

#### Parameters

##### buffer

`Buffer`

Raw file data

##### info

[`AssetInput`](AssetInput.md)

File information and linkage hints

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is acting (request subject or JobContext)

#### Returns

`Promise`\<[`AssetRecord`](AssetRecord.md)\>

***

### stream()?

> `optional` __stream__(`id`): `Promise`\<`ReadableStream` \| `null`\>

Defined in: src/types/Asset.ts:442

Stream the asset file contents.
Only available when 'stream' is in capabilities.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`ReadableStream` \| `null`\>

***

### updateMetadata()?

> `optional` __updateMetadata__(`id`, `patch`): `Promise`\<[`AssetRecord`](AssetRecord.md) \| `null`\>

Defined in: src/types/Asset.ts:452

Update user-editable descriptive metadata on an asset.
Only available when 'edit' is in capabilities.

Writes the patch into the source file's embedded metadata (EXIF/IPTC/XMP)
and refreshes the provider's index entry. Returns the refreshed record,
or null if the asset was not found.

#### Parameters

##### id

`string`

##### patch

[`AssetMetadataPatch`](AssetMetadataPatch.md)

#### Returns

`Promise`\<[`AssetRecord`](AssetRecord.md) \| `null`\>
