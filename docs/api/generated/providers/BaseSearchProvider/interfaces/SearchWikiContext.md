[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseSearchProvider](../README.md) / SearchWikiContext

# Interface: SearchWikiContext

Defined in: src/providers/BaseSearchProvider.ts:53

Minimal WikiContext shape needed by search providers to filter private results.
The full WikiContext lives in src/context/WikiContext.ts.

Optional method declarations match the real WikiContext API (#625) so providers
can call `wikiContext.hasRole(...)` / `getPrincipals()` directly. Optional so
non-WikiContext duck-typed callers (older tests, fixtures) still satisfy the type.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### userContext?

> `optional` __userContext?__: `object`

Defined in: src/providers/BaseSearchProvider.ts:54

#### Index Signature

\[`key`: `string`\]: `unknown`

#### authenticated?

> `optional` __authenticated?__: `boolean`

#### roles?

> `optional` __roles?__: `string`[]

#### username?

> `optional` __username?__: `string`

## Methods

### getPrincipals()?

> `optional` __getPrincipals__(): `string`[]

Defined in: src/providers/BaseSearchProvider.ts:61

#### Returns

`string`[]

***

### hasRole()?

> `optional` __hasRole__(...`names`): `boolean`

Defined in: src/providers/BaseSearchProvider.ts:60

#### Parameters

##### names

...`string`[]

#### Returns

`boolean`
