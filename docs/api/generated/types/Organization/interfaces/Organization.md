[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / Organization

# Interface: Organization

Defined in: src/types/Organization.ts:68

Canonical Organization record.

Required: `@context`, `@type`, `@id`, `name`.
Optional fields mirror schema.org Organization.

## Indexable

> \[`key`: `string`\]: `unknown`

Allow extension fields (additionalProperty, etc.)

## Properties

### @context

> __@context__: `"https://schema.org"`

Defined in: src/types/Organization.ts:69

***

### @id

> __@id__: `string`

Defined in: src/types/Organization.ts:72

The organization's id for life: `urn:uuid:<v4>` (#2041); an organization made before #2041 keeps its own, often its URL

***

### @type

> __@type__: `"Organization"`

Defined in: src/types/Organization.ts:70

***

### address?

> `optional` __address?__: [`PostalAddress`](PostalAddress.md)

Defined in: src/types/Organization.ts:86

Postal address

***

### contactPoint?

> `optional` __contactPoint?__: [`ContactPointEntry`](../type-aliases/ContactPointEntry.md)[]

Defined in: src/types/Organization.ts:88

Contact points (support, sales, a mailing address, etc.)

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Organization.ts:82

Short description

***

### foundingDate?

> `optional` __foundingDate?__: `string`

Defined in: src/types/Organization.ts:84

Founding year/date as string (schema.org uses Date or DateTime)

***

### identifier?

> `optional` __identifier?__: `string`

Defined in: src/types/Organization.ts:92

Optional legacy slug or external identifier

***

### legalName?

> `optional` __legalName?__: `string`

Defined in: src/types/Organization.ts:76

Legal/registered name if different from `name`

***

### logo?

> `optional` __logo?__: `string`

Defined in: src/types/Organization.ts:80

Logo URL

***

### name

> __name__: `string`

Defined in: src/types/Organization.ts:74

Human-readable name

***

### sameAs?

> `optional` __sameAs?__: `string`[]

Defined in: src/types/Organization.ts:90

Other URLs that identify this org (LinkedIn, Twitter, etc.)

***

### url?

> `optional` __url?__: `string`

Defined in: src/types/Organization.ts:78

Public web address: an ordinary field, never the id (#2041)
