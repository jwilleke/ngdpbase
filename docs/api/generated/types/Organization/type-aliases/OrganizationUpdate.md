[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / OrganizationUpdate

# Type Alias: OrganizationUpdate

> __OrganizationUpdate__ = `Partial`\<`Omit`\<[`Organization`](../interfaces/Organization.md), `"@context"` \| `"@type"` \| `"@id"`\>\>

Defined in: src/types/Organization.ts:107

Patch shape for update operations.
`@context`/`@type` are immutable; `@id` cannot be changed via update.
