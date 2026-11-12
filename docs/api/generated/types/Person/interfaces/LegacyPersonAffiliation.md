[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / LegacyPersonAffiliation

# ~~Interface: LegacyPersonAffiliation~~

Defined in: src/types/Person.ts:53

An affiliation in its shape before #2039, `{ organization, role? }`.
Converted (organization → `memberOf`, role → `roleName`) when read, once on
disk at start-up, and when an add-on still writes it (for one release).

## Deprecated

Write [PersonAffiliation](PersonAffiliation.md).

## Properties

### ~~organization~~

> __organization__: `string`

Defined in: src/types/Person.ts:54

***

### ~~role?~~

> `optional` __role?__: `string`

Defined in: src/types/Person.ts:55
