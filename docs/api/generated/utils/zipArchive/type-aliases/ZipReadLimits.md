[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/zipArchive](../README.md) / ZipReadLimits

# Type Alias: ZipReadLimits

> __ZipReadLimits__ = `object`

Defined in: src/utils/zipArchive.ts:189

Limits on what `readZip` will unpack, so an upload cannot exhaust memory.

## Properties

### maxEntries

> __maxEntries__: `number`

Defined in: src/utils/zipArchive.ts:191

Most members accepted.

***

### maxTotalBytes

> __maxTotalBytes__: `number`

Defined in: src/utils/zipArchive.ts:193

Most bytes accepted once everything is inflated.
