[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/assetMetadataTags](../README.md) / buildMetadataWriteTags

# Function: buildMetadataWriteTags()

> __buildMetadataWriteTags__(`patch`, `mimeType`): `Record`\<`string`, `unknown`\>

Defined in: src/utils/assetMetadataTags.ts:68

Map an `AssetMetadataPatch` onto the ExifTool tags to write for a file of the
given MIME type.

Only fields present on the patch produce tags, so a partial edit never
clears a field the caller did not mention. An explicit `null` DOES clear —
that is how a user removes a value, and it is distinct from omission.

## Parameters

### patch

[`AssetMetadataPatch`](../../../types/Asset/interfaces/AssetMetadataPatch.md)

Fields the caller wants changed

### mimeType

`string`

The file's MIME type, which selects the date tag

## Returns

`Record`\<`string`, `unknown`\>

ExifTool tag object, empty when the patch changes nothing

## Throws

Error if `dateTimeOriginal` is present, non-null and unparseable
