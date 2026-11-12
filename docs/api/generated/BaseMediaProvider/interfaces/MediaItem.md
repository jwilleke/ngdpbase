[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [BaseMediaProvider](../README.md) / MediaItem

# Interface: MediaItem

Defined in: src/providers/BaseMediaProvider.ts:29

Represents a single media item in the index.

## Properties

### alternates?

> `optional` __alternates?__: `string`[]

Defined in: src/providers/BaseMediaProvider.ts:49

Alternate-format paths for the same photo (e.g. the HEIC original when JPEG is primary)

***

### creator?

> `optional` __creator?__: `string`

Defined in: src/providers/BaseMediaProvider.ts:43

Username of the content creator

***

### dirPath?

> `optional` __dirPath?__: `string`

Defined in: src/providers/BaseMediaProvider.ts:41

Source directory path (for display purposes)

***

### filename

> __filename__: `string`

Defined in: src/providers/BaseMediaProvider.ts:35

Original filename (basename)

***

### filePath

> __filePath__: `string`

Defined in: src/providers/BaseMediaProvider.ts:33

Absolute path to the source file on disk

***

### id

> __id__: `string`

Defined in: src/providers/BaseMediaProvider.ts:31

Unique identifier for this item (e.g. SHA-256 of file path)

***

### metadata?

> `optional` __metadata?__: [`AssetMetadata`](../../types/Asset/interfaces/AssetMetadata.md)

Defined in: src/providers/BaseMediaProvider.ts:47

Structured metadata bag — EXIF, IPTC, XMP and custom fields

***

### mimeType

> __mimeType__: `string`

Defined in: src/providers/BaseMediaProvider.ts:37

MIME type (e.g. "image/jpeg")

***

### mtime?

> `optional` __mtime?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:45

File modification time in epoch milliseconds — used as a sort fallback when EXIF DateTimeOriginal is absent (#606).

***

### year?

> `optional` __year?__: `number`

Defined in: src/providers/BaseMediaProvider.ts:39

Year extracted from EXIF DateTimeOriginal or path/filename fallback
