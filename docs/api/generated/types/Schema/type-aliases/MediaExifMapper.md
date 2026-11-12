[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / MediaExifMapper

# Type Alias: MediaExifMapper

> __MediaExifMapper__ = (`record`) => [`ImageObject`](../interfaces/ImageObject.md) \| [`VideoObject`](../interfaces/VideoObject.md) \| [`AudioObject`](../interfaces/AudioObject.md)

Defined in: src/types/Schema.ts:518

Maps a media-file record (EXIF/QuickTime extraction) to a media-typed
CreativeWork. Implementation lands in Slice 3 (#755) — MediaManager
via FileSystemMediaProvider.

## Parameters

### record

`Record`\<`string`, `unknown`\>

## Returns

[`ImageObject`](../interfaces/ImageObject.md) \| [`VideoObject`](../interfaces/VideoObject.md) \| [`AudioObject`](../interfaces/AudioObject.md)
