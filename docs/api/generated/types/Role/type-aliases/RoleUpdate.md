[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Role](../README.md) / RoleUpdate

# Type Alias: RoleUpdate

> __RoleUpdate__ = `Partial`\<`Omit`\<[`Role`](../interfaces/Role.md), `"@context"` \| `"@type"` \| `"@id"` \| `"namedPosition"` \| `"organization"`\>\>

Defined in: src/types/Role.ts:80

Patch shape for update operations.
`@context`/`@type`/`@id` are immutable; `namedPosition` and `organization`
are the natural key for the file's location and cannot be changed via update.
