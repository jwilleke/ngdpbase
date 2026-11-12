[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Catalog](../README.md) / CatalogProvider

# Interface: CatalogProvider

Defined in: src/types/Catalog.ts:40

Interface for all catalog providers — both built-in and addon-contributed.

Addon registration pattern:

```ts
const catalog = engine.getManager<CatalogManager>('CatalogManager');
if (catalog) catalog.registerProvider(new MyDomainCatalogProvider());
```

## Properties

### displayName

> __displayName__: `string`

Defined in: src/types/Catalog.ts:44

Human-readable name shown in admin UIs

***

### domain?

> `optional` __domain?__: `string`

Defined in: src/types/Catalog.ts:50

Optional domain scope — e.g. 'geoscience', 'medicine'.
When set, CatalogManager.getTerms(domain) will only include this provider
when the requested domain matches.

***

### id

> __id__: `string`

Defined in: src/types/Catalog.ts:42

Unique identifier for the provider

## Methods

### getTerms()

> __getTerms__(): `Promise`\<[`CatalogTerm`](CatalogTerm.md)[]\>

Defined in: src/types/Catalog.ts:52

Return the terms this provider owns or manages

#### Returns

`Promise`\<[`CatalogTerm`](CatalogTerm.md)[]\>

***

### resolveUri()?

> `optional` __resolveUri__(`term`): `Promise`\<`string` \| `null`\>

Defined in: src/types/Catalog.ts:57

Resolve a term string to a canonical Linked-Data URI.
Return null if this provider does not know the term.

#### Parameters

##### term

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### suggestTerms()?

> `optional` __suggestTerms__(`content`, `title`): `Promise`\<[`CatalogTerm`](CatalogTerm.md)[]\>

Defined in: src/types/Catalog.ts:62

Suggest terms from the controlled vocabulary for the given page content.
Only meaningful for AI/ML providers — static providers return [].

#### Parameters

##### content

`string`

##### title

`string`

#### Returns

`Promise`\<[`CatalogTerm`](CatalogTerm.md)[]\>
