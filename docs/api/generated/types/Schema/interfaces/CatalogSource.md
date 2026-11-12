[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / CatalogSource

# Interface: CatalogSource

Defined in: src/types/Schema.ts:438

The Manager-layer contract for asset sources (Decision 7).

PageManager / MediaManager / AttachmentManager each implement this
during their `initialize()`, registering themselves with
CatalogManager via `registerSource()`. Storage providers underneath
stay diverse and pluggable per-deployment.

ACL filtering happens here (each source knows its permission model).
`get()` returns `null` for both not-found and ACL-filtered; only throw
on actual errors.

## Properties

### currentSchemaVersion

> `readonly` __currentSchemaVersion__: `number`

Defined in: src/types/Schema.ts:450

Schema version of the on-disk records this source writes/reads.
Compared against the manager's CURRENT_SCHEMA_VERSION constant on
startup (Decision 6).

***

### sourceId

> `readonly` __sourceId__: `string`

Defined in: src/types/Schema.ts:440

Stable identifier — e.g. `'pages'`, `'media'`, `'attachments'`.

***

### types

> `readonly` __types__: readonly [`SchemaType`](../type-aliases/SchemaType.md)[]

Defined in: src/types/Schema.ts:443

Which subtypes this source produces.

## Methods

### get()

> __get__(`identifier`): `Promise`\<[`CreativeWork`](../type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/types/Schema.ts:463

Get a single CreativeWork by stable identifier (the
`identifier` field — rename-stable UUID per Decision 4).
Returns null for not-found and for ACL-filtered.

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`CreativeWork`](../type-aliases/CreativeWork.md) \| `null`\>

***

### getByUrl()?

> `optional` __getByUrl__(`atId`): `Promise`\<[`CreativeWork`](../type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/types/Schema.ts:469

Optional URL-based convenience lookup. When implemented, callers
with only `@id` can resolve without computing the identifier.

#### Parameters

##### atId

`string`

#### Returns

`Promise`\<[`CreativeWork`](../type-aliases/CreativeWork.md) \| `null`\>

***

### list()

> __list__(`query`): `Promise`\<[`CatalogPage`](CatalogPage.md)\>

Defined in: src/types/Schema.ts:456

List CreativeWorks matching the query. Returns a cursor-paginated
CatalogPage. Sources cap `limit` at their own discretion.

#### Parameters

##### query

[`CatalogQuery`](CatalogQuery.md)

#### Returns

`Promise`\<[`CatalogPage`](CatalogPage.md)\>

***

### rebuild()

> __rebuild__(`opts?`): `Promise`\<`void`\>

Defined in: src/types/Schema.ts:475

Rebuild this source's on-disk index from authoritative storage.
Per Decision 6, this is what advances a stale `schemaVersion`.

#### Parameters

##### opts?

[`RebuildOpts`](RebuildOpts.md)

#### Returns

`Promise`\<`void`\>
