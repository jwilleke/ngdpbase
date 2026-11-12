[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/assetMetadataTags](../README.md) / supportsEmbeddedMetadata

# Function: supportsEmbeddedMetadata()

> __supportsEmbeddedMetadata__(`mimeType`): `boolean`

Defined in: src/utils/assetMetadataTags.ts:111

Whether a MIME type can carry embedded metadata ExifTool can write (#999).

Attachments are not curated media — a page can carry a `.zip`, a `.csv`, a
`.json`. Writing EXIF to those either fails or corrupts them, so the caller
must know when to persist the edit as sidecar metadata only rather than
attempting a file write.

Conservative allowlist rather than a denylist: an unrecognised type is
treated as unwritable. Getting that wrong the safe way costs a sidecar-only
edit; getting it wrong the other way damages a user's file.

## Parameters

### mimeType

`string`

The attachment's MIME type

## Returns

`boolean`

Whether an embedded write should be attempted
