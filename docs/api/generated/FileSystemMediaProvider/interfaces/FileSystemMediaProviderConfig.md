[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [FileSystemMediaProvider](../README.md) / FileSystemMediaProviderConfig

# Interface: FileSystemMediaProviderConfig

Defined in: src/providers/FileSystemMediaProvider.ts:43

Configuration for FileSystemMediaProvider.

## Properties

### excludedRoots?

> `optional` __excludedRoots?__: `string`[]

Defined in: src/providers/FileSystemMediaProvider.ts:67

Private storage the scanner never walks under or keeps in the index (#2195):
the roots `privateStorageRoots` lists. MediaManager already refuses a folder
that overlaps them; this holds even if one gets past it.

***

### extensions

> __extensions__: `Set`\<`string`\>

Defined in: src/providers/FileSystemMediaProvider.ts:61

Set of file extensions (lowercase, no dot) to index

***

### folders

> __folders__: `string`[]

Defined in: src/providers/FileSystemMediaProvider.ts:45

Absolute paths to the root media folders to scan

***

### ignoreDirs

> __ignoreDirs__: `string`[]

Defined in: src/providers/FileSystemMediaProvider.ts:47

Directory names to skip during scan (e.g. [".dtrash", ".ts"])

***

### indexFile

> __indexFile__: `string`

Defined in: src/providers/FileSystemMediaProvider.ts:51

Absolute path to the media-index.json file

***

### maxDepth

> __maxDepth__: `number`

Defined in: src/providers/FileSystemMediaProvider.ts:49

Maximum directory depth to recurse into (0 = unlimited)

***

### metadataPriority

> __metadataPriority__: `string`[]

Defined in: src/providers/FileSystemMediaProvider.ts:57

Metadata extraction priority order (e.g. ["EXIF", "IPTC", "XMP"])

***

### readonly

> __readonly__: `boolean`

Defined in: src/providers/FileSystemMediaProvider.ts:59

Whether the provider may write to source media folders (always false)

***

### thumbnailDir

> __thumbnailDir__: `string`

Defined in: src/providers/FileSystemMediaProvider.ts:53

Absolute path to the thumbnail cache directory

***

### thumbnailSizes

> __thumbnailSizes__: `string`

Defined in: src/providers/FileSystemMediaProvider.ts:55

Comma-separated thumbnail size specs (e.g. "300x300,150x150")
