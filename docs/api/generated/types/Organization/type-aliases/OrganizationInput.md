[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / OrganizationInput

# Type Alias: OrganizationInput

> __OrganizationInput__ = `Partial`\<`Omit`\<[`Organization`](../interfaces/Organization.md), `"@id"`\>\> & `object`

Defined in: src/types/Organization.ts:101

What a caller gives `OrganizationManager.create` (#1930): the fields. The
`@id` is never the caller's: `create` makes a new `urn:uuid:` (#2041).

## Type Declaration

### name

> __name__: `string`
