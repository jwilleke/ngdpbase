[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / PostalAddress

# Interface: PostalAddress

Defined in: src/types/Organization.ts:27

Schema.org PostalAddress (subset used by Organization/Person).

In schema.org a PostalAddress is a ContactPoint, so it carries the
ContactPoint fields too: a `contactPoint[]` entry may be one (a mailing or
business address, with its `contactType`, `name` and `telephone`).

## See

<https://schema.org/PostalAddress>

## Extends

- `Omit`\<[`ContactPoint`](ContactPoint.md), `"@type"`\>

## Properties

### @type

> __@type__: `"PostalAddress"`

Defined in: src/types/Organization.ts:28

***

### addressCountry?

> `optional` __addressCountry?__: `string` \| `null`

Defined in: src/types/Organization.ts:33

***

### addressLocality?

> `optional` __addressLocality?__: `string` \| `null`

Defined in: src/types/Organization.ts:30

***

### addressRegion?

> `optional` __addressRegion?__: `string` \| `null`

Defined in: src/types/Organization.ts:31

***

### availableLanguage?

> `optional` __availableLanguage?__: `string`[]

Defined in: src/types/Organization.ts:52

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`availableLanguage`](ContactPoint.md#availablelanguage)

***

### contactType?

> `optional` __contactType?__: `string`

Defined in: src/types/Organization.ts:43

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`contactType`](ContactPoint.md#contacttype)

***

### email?

> `optional` __email?__: `string`

Defined in: src/types/Organization.ts:46

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`email`](ContactPoint.md#email)

***

### extension?

> `optional` __extension?__: `string`

Defined in: src/types/Organization.ts:50

A phone's extension, digits, kept apart from `telephone` (#2073).

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`extension`](ContactPoint.md#extension)

***

### name?

> `optional` __name?__: `string`

Defined in: src/types/Organization.ts:45

Who or what this contact point reaches, e.g. an agent's or an emergency contact's name (schema.org Thing.name).

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`name`](ContactPoint.md#name)

***

### postalCode?

> `optional` __postalCode?__: `string` \| `null`

Defined in: src/types/Organization.ts:32

***

### streetAddress?

> `optional` __streetAddress?__: `string` \| `null`

Defined in: src/types/Organization.ts:29

***

### telephone?

> `optional` __telephone?__: `string`

Defined in: src/types/Organization.ts:48

E.164 (`+14155552671`) when written from /profile (#2073); add-ons may store other forms.

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`telephone`](ContactPoint.md#telephone)

***

### url?

> `optional` __url?__: `string`

Defined in: src/types/Organization.ts:51

#### Inherited from

[`ContactPoint`](ContactPoint.md).[`url`](ContactPoint.md#url)
