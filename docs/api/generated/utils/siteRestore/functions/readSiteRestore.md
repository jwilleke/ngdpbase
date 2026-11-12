[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / readSiteRestore

# Function: readSiteRestore()

> __readSiteRestore__(`file`): [`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`

Defined in: src/utils/siteRestore.ts:105

The manifest, or null when there is none. Throws when a file is there but
is not a manifest: a restore record that can't be read is never ignored.

## Parameters

### file

`string`

## Returns

[`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`
