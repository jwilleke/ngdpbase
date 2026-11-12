[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/CatalogManager](../README.md) / UserKeywordsCatalogProvider

# Class: UserKeywordsCatalogProvider

Defined in: src/managers/CatalogManager.ts:120

Serves the user-keywords vocabulary (the human tagging bucket in the #869
five-bucket model) through the provider registry, so it shares one interface
with system-keywords: SKOS ConceptScheme emission at
/api/catalog/vocabulary/user-keywords, altLabels aliasing later, and the
drift report's canonical side.

# 896: vocabulary is content, not configuration. Two layers:

- SEED — `ngdpbase.user-keywords` read from the SHIPPED defaults only
    (`getDefaultProperty`), so legacy whole-catalog snapshots in instance
    custom config can't shadow it (the #895 propagation bug).
- STORE — `<instance-data>/vocabulary/user-keywords.json`, read-write,
    owned by this provider. Holds instance-created/adopted terms and
    per-key overrides of seed entries (disable = `enabled:false` delta).
`getCatalogObject()` merges the two (store wins per key);
`saveCatalogObject()` diffs against the seed and persists only deltas.
All catalog writes (admin CRUD, drift Adopt, import auto-register) go
through this provider — never through ConfigurationManager.setProperty.

## Implements

- [`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md)

## Constructors

### Constructor

> __new UserKeywordsCatalogProvider__(`engine`): `UserKeywordsCatalogProvider`

Defined in: src/managers/CatalogManager.ts:127

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`UserKeywordsCatalogProvider`

## Properties

### displayName

> `readonly` __displayName__: `"User Keywords"` = `'User Keywords'`

Defined in: src/managers/CatalogManager.ts:122

Human-readable name shown in admin UIs

#### Implementation of

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md).[`displayName`](../../../types/Catalog/interfaces/CatalogProvider.md#displayname)

***

### domain

> `readonly` __domain__: `"user-keywords"` = `'user-keywords'`

Defined in: src/managers/CatalogManager.ts:123

Optional domain scope — e.g. 'geoscience', 'medicine'.
When set, CatalogManager.getTerms(domain) will only include this provider
when the requested domain matches.

#### Implementation of

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md).[`domain`](../../../types/Catalog/interfaces/CatalogProvider.md#domain)

***

### id

> `readonly` __id__: `"user-keywords"` = `'user-keywords'`

Defined in: src/managers/CatalogManager.ts:121

Unique identifier for the provider

#### Implementation of

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md).[`id`](../../../types/Catalog/interfaces/CatalogProvider.md#id)

## Methods

### getCatalogObject()

> __getCatalogObject__(): `Promise`\<`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>\>

Defined in: src/managers/CatalogManager.ts:165

Full catalog as an id-keyed object (seed merged with store, store wins).
Includes disabled entries — callers filter as needed.

#### Returns

`Promise`\<`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>\>

***

### getStorePath()

> __getStorePath__(): `string` \| `null`

Defined in: src/managers/CatalogManager.ts:132

Absolute path of the instance vocabulary store.

#### Returns

`string` \| `null`

***

### getTerms()

> __getTerms__(): `Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

Defined in: src/managers/CatalogManager.ts:208

Return the terms this provider owns or manages

#### Returns

`Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

#### Implementation of

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md).[`getTerms`](../../../types/Catalog/interfaces/CatalogProvider.md#getterms)

***

### readStoreForBackup()

> __readStoreForBackup__(): `Promise`\<`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>\>

Defined in: src/managers/CatalogManager.ts:196

# 896 backup contract: raw instance-store contents (NOT the merged
catalog — the seed ships with the code and needs no backup).

#### Returns

`Promise`\<`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>\>

***

### resolveUri()

> __resolveUri__(`term`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/CatalogManager.ts:224

Resolve a term string to a canonical Linked-Data URI.
Return null if this provider does not know the term.

#### Parameters

##### term

`string`

#### Returns

`Promise`\<`string` \| `null`\>

#### Implementation of

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md).[`resolveUri`](../../../types/Catalog/interfaces/CatalogProvider.md#resolveuri)

***

### restoreStore()

> __restoreStore__(`store`): `Promise`\<`void`\>

Defined in: src/managers/CatalogManager.ts:201

# 896 restore contract: write store contents verbatim (no delta pass).

#### Parameters

##### store

`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>

#### Returns

`Promise`\<`void`\>

***

### saveCatalogObject()

> __saveCatalogObject__(`catalog`): `Promise`\<`void`\>

Defined in: src/managers/CatalogManager.ts:175

Persist a full catalog object. Only deltas against the seed are written
to the store: entries identical to their seed counterpart are omitted;
seed entries absent from `catalog` are stored as `enabled:false`
overrides (a seed key can't be deleted, only disabled).

#### Parameters

##### catalog

`Record`\<`string`, [`UserKeywordConfig`](../interfaces/UserKeywordConfig.md)\>

#### Returns

`Promise`\<`void`\>
