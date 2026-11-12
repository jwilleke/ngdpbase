[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / PersonChange

# Type Alias: PersonChange

> __PersonChange__ = `Omit`\<[`PersonUpdate`](PersonUpdate.md), `"affiliation"`\> & `object`

Defined in: src/types/Person.ts:106

What `IdentityManager.update` takes: a [PersonUpdate](PersonUpdate.md) whose
`affiliation` (the whole list) may still hold entries in the old
`{ organization, role? }` shape, converted at the door, for one release (#2039).

## Type Declaration

### affiliation?

> `optional` __affiliation?__: ([`PersonAffiliation`](../interfaces/PersonAffiliation.md) \| [`LegacyPersonAffiliation`](../interfaces/LegacyPersonAffiliation.md))[]
