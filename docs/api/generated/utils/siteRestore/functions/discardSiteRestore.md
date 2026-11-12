[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / discardSiteRestore

# Function: discardSiteRestore()

> __discardSiteRestore__(`file`): [`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`

Defined in: src/utils/siteRestore.ts:164

Throw a staged (or half-staged) site restore away: every part's staged
files and the manifest are removed. Live data is never touched.

## Parameters

### file

`string`

## Returns

[`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`
