[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / PersonUpdate

# Type Alias: PersonUpdate

> __PersonUpdate__ = `Partial`\<`Omit`\<[`Person`](../interfaces/Person.md), `"@context"` \| `"@type"` \| `"@id"` \| `"identifier"`\>\>

Defined in: src/types/Person.ts:99

Patch shape for update operations.
`@context`/`@type` are immutable; `@id` and `identifier` cannot be changed via update.
