[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/permissionCatalog](../README.md) / RETIRED\_PERMISSIONS

# Variable: RETIRED\_PERMISSIONS

> `const` __RETIRED\_PERMISSIONS__: `ReadonlyMap`\<`string`, readonly `string`[]\>

Defined in: src/utils/permissionCatalog.ts:38

Permissions that were split into narrower ones, and what each stood for.

A policy, an agent token or an app grant written before the split still
names the old permission; it is read as all of the new ones, so nobody loses
an ability on upgrade. New writing should name the new permissions.
