[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / PersonInput

# Type Alias: PersonInput

> __PersonInput__ = [`PersonChange`](PersonChange.md) & `object`

Defined in: src/types/Person.ts:116

What a caller gives `IdentityManager.create` (#1930): the person's fields.
`identifier` is left out for a person with no account (one is generated);
UserManager passes the account's username when it creates the person for a
new account.

## Type Declaration

### identifier?

> `optional` __identifier?__: `string`
