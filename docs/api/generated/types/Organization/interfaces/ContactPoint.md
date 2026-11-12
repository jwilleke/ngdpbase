[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Organization](../README.md) / ContactPoint

# Interface: ContactPoint

Defined in: src/types/Organization.ts:41

Schema.org ContactPoint (subset used by Organization/Person)

## See

<https://schema.org/ContactPoint>

## Properties

### @type

> __@type__: `"ContactPoint"`

Defined in: src/types/Organization.ts:42

***

### availableLanguage?

> `optional` __availableLanguage?__: `string`[]

Defined in: src/types/Organization.ts:52

***

### contactType?

> `optional` __contactType?__: `string`

Defined in: src/types/Organization.ts:43

***

### email?

> `optional` __email?__: `string`

Defined in: src/types/Organization.ts:46

***

### extension?

> `optional` __extension?__: `string`

Defined in: src/types/Organization.ts:50

A phone's extension, digits, kept apart from `telephone` (#2073).

***

### name?

> `optional` __name?__: `string`

Defined in: src/types/Organization.ts:45

Who or what this contact point reaches, e.g. an agent's or an emergency contact's name (schema.org Thing.name).

***

### telephone?

> `optional` __telephone?__: `string`

Defined in: src/types/Organization.ts:48

E.164 (`+14155552671`) when written from /profile (#2073); add-ons may store other forms.

***

### url?

> `optional` __url?__: `string`

Defined in: src/types/Organization.ts:51
