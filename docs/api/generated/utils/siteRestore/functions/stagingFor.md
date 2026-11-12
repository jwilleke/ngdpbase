[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / stagingFor

# Function: stagingFor()

> __stagingFor__(`file`, `manager`): [`SiteRestoreStaging`](../../../managers/BaseManager/interfaces/SiteRestoreStaging.md)

Defined in: src/utils/siteRestore.ts:140

The site restore being staged, as one manager's `restore()` gets it
(`ManagerRestoreOptions.siteRestore`, #1986): its part is recorded under
that manager's name, so a manager records its own part and no other.

## Parameters

### file

`string`

### manager

`string`

## Returns

[`SiteRestoreStaging`](../../../managers/BaseManager/interfaces/SiteRestoreStaging.md)
