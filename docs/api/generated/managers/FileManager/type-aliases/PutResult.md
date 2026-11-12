[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/FileManager](../README.md) / PutResult

# Type Alias: PutResult

> __PutResult__ = [`AttachmentMetadata`](../../AttachmentManager/interfaces/AttachmentMetadata.md) & `object`

Defined in: src/managers/FileManager.ts:56

What `put` hands back (#2149): the stored file's metadata, and, when
vetting cleaned it, what was removed (one note per kind), so the uploader
can be told.

## Type Declaration

### cleaned?

> `optional` __cleaned?__: `string`[]
