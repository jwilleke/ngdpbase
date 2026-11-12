[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SchemaGenerator](../README.md) / default

# Class: default

Defined in: src/utils/SchemaGenerator.ts:37

## Constructors

### Constructor

> __new default__(): `SchemaGenerator`

#### Returns

`SchemaGenerator`

## Methods

### generateOrganizationSchema()

> `static` __generateOrganizationSchema__(`organizationData`, `options?`): `Record`\<`string`, `unknown`\>

Defined in: src/utils/SchemaGenerator.ts:55

Generate Organization JSON-LD from a Schema.org-shaped Organization
record. Adds `url` when missing and `options.baseUrl` is supplied.

#### Parameters

##### organizationData

`OrganizationData`

##### options?

`SchemaOptions` = `{}`

#### Returns

`Record`\<`string`, `unknown`\>

***

### generatePersonSchema()

> `static` __generatePersonSchema__(`personData`, `options?`): `Record`\<`string`, `unknown`\>

Defined in: src/utils/SchemaGenerator.ts:43

Generate Person JSON-LD from a Schema.org-shaped Person record. The
`authentication` field (if present) is stripped — never publish secrets.
Adds `url` when missing and `options.baseUrl` is supplied.

#### Parameters

##### personData

`PersonData`

##### options?

`SchemaOptions` = `{}`

#### Returns

`Record`\<`string`, `unknown`\>
