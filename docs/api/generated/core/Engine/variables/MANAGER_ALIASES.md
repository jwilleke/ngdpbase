[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [core/Engine](../README.md) / MANAGER\_ALIASES

# Variable: MANAGER\_ALIASES

> `const` __MANAGER\_ALIASES__: `ReadonlyMap`\<`string`, `string`\>

Defined in: src/core/Engine.ts:12

Old manager names still answered, for one release, by the manager that took
over the job (#2038). `getManager(old)` returns the new manager and warns
once per old name, naming the caller. The registry itself holds only the new
name, so nothing that lists managers sees the manager twice.
