[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / beginSiteRestore

# Function: beginSiteRestore()

> __beginSiteRestore__(`file`, `meta`): `void`

Defined in: src/utils/siteRestore.ts:122

Start staging a site restore: the record exists before any part is staged, so an interrupted staging is recognised.

## Parameters

### file

`string`

### meta

`Omit`\<[`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md), `"version"` \| `"state"` \| `"parts"`\>

## Returns

`void`
