[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Role](../README.md) / Role

# Interface: Role

Defined in: src/types/Role.ts:56

Canonical OrganizationRole record.

Required: `@context`, `@type`, `@id`, `namedPosition`, `organization`.
Optional fields mirror schema.org OrganizationRole + the snapshot fields
copied from the role catalog at create time.

## Indexable

> \[`key`: `string`\]: `unknown`

Allow extension fields (forwards-compat).

## Properties

### @context

> __@context__: `"https://schema.org"`

Defined in: src/types/Role.ts:57

***

### @id

> __@id__: `string`

Defined in: src/types/Role.ts:60

URL form: `<org-url>/roles/<namedPosition>#role`

***

### @type

> __@type__: `"OrganizationRole"`

Defined in: src/types/Role.ts:58

***

### additionalProperty?

> `optional` __additionalProperty?__: [`PropertyValue`](PropertyValue.md)[]

Defined in: src/types/Role.ts:69

schema.org extension properties. Not a permissions list (#1431).

***

### member?

> `optional` __member?__: [`IdRef`](IdRef.md)[]

Defined in: src/types/Role.ts:66

Persons holding this role. References by Person `@id`.

***

### namedPosition

> __namedPosition__: `string`

Defined in: src/types/Role.ts:62

Catalog key into `ngdpbase.roles.definitions` (e.g. 'admin', 'editor').

***

### organization

> __organization__: [`IdRef`](IdRef.md)

Defined in: src/types/Role.ts:64

Reference to the owning Organization by its `@id`.
