[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / Person

# Interface: Person

Defined in: src/types/Person.ts:64

Canonical Person record.

Required: `@context`, `@type`, `@id`, `identifier`.
Optional fields mirror schema.org Person.

## Indexable

> \[`key`: `string`\]: `unknown`

Allow extension fields (additionalProperty, etc.)

## Properties

### @context

> __@context__: `"https://schema.org"`

Defined in: src/types/Person.ts:65

***

### @id

> __@id__: `string`

Defined in: src/types/Person.ts:68

urn:uuid:<v4>

***

### @type

> __@type__: `"Person"`

Defined in: src/types/Person.ts:66

***

### address?

> `optional` __address?__: [`PostalAddress`](../../Organization/interfaces/PostalAddress.md)

Defined in: src/types/Person.ts:80

Postal address

***

### affiliation?

> `optional` __affiliation?__: [`PersonAffiliation`](PersonAffiliation.md)[]

Defined in: src/types/Person.ts:90

Affiliations: each a schema.org OrganizationRole, an organization with a title and dates (#2039).

***

### contactPoint?

> `optional` __contactPoint?__: [`ContactPointEntry`](../../Organization/type-aliases/ContactPointEntry.md)[]

Defined in: src/types/Person.ts:82

Everything but the home address: phones, a mailing or business address (a PostalAddress), an agent, an emergency contact; each typed by `contactType`.

***

### email?

> `optional` __email?__: `string`

Defined in: src/types/Person.ts:78

Email address

***

### familyName?

> `optional` __familyName?__: `string`

Defined in: src/types/Person.ts:76

Family name (last name)

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/types/Person.ts:74

Given name (first name)

***

### identifier

> __identifier__: `string`

Defined in: src/types/Person.ts:70

The account's username, or `person:<uuid>` for a person with no account (#1930).

***

### image?

> `optional` __image?__: `string`

Defined in: src/types/Person.ts:86

Profile/avatar image URL

***

### knowsLanguage?

> `optional` __knowsLanguage?__: `string`[]

Defined in: src/types/Person.ts:84

ISO language tags this person knows

***

### name?

> `optional` __name?__: `string`

Defined in: src/types/Person.ts:72

Display name

***

### sameAs?

> `optional` __sameAs?__: `string`[]

Defined in: src/types/Person.ts:88

Other URLs that identify this person (LinkedIn, GitHub, etc.)
