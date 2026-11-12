[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / finishSiteRestoreAtBoot

# Function: finishSiteRestoreAtBoot()

> __finishSiteRestoreAtBoot__(`file`): [`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`

Defined in: src/utils/siteRestore.ts:330

What a start did with a site restore, for BackupManager to tell admins at
the end of the start: the finished record (`<file>.done`, then kept as
`<file>.last`), or a record with parts still pending — their managers did
not start — which is then refused and its pending parts set aside.

## Parameters

### file

`string`

## Returns

[`SiteRestoreManifest`](../interfaces/SiteRestoreManifest.md) \| `null`
