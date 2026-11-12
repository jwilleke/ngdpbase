[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / RegisteredExportSource

# Interface: RegisteredExportSource

Defined in: src/ice/types.ts:738

The owner's door for reading the thing being exported (#2120, D5): a page
through PageManager, later a search result or an add-on's list. Export
starts from the thing (operator, 2026-10-28): the source says what kind of
items it yields, and only the `out` shims that can make a file from that
kind are offered.

## Extends

- [`IceExportSource`](IceExportSource.md)

## Properties

### id

> __id__: `string`

Defined in: src/ice/types.ts:739

***

### label?

> `optional` __label?__: `string`

Defined in: src/ice/types.ts:700

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`label`](IceExportSource.md#label)

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:699

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`name`](IceExportSource.md#name)

***

### owner

> __owner__: `string`

Defined in: src/ice/types.ts:740

***

### yields

> __yields__: `string`

Defined in: src/ice/types.ts:702

The kind of the items it yields, e.g. `ncm` for a page.

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`yields`](IceExportSource.md#yields)

***

### zipAs?

> `optional` __zipAs?__: `string`

Defined in: src/ice/types.ts:704

Make the export a zip with this name (`search-results`) even when it holds one file.

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`zipAs`](IceExportSource.md#zipas)

## Methods

### mayExport()

> __mayExport__(`ref`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/ice/types.ts:710

Would this context be allowed to export `ref`? Asked only to decide
whether to offer the Export action: an affordance, which records nothing.
The owner's existing read rule (D5).

#### Parameters

##### ref

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`mayExport`](IceExportSource.md#mayexport)

***

### read()

> __read__(`ref`, `ctx`, `info`): `Promise`\<[`IceItem`](IceItem.md)[] \| `null`\>

Defined in: src/ice/types.ts:716

Read `ref` for export as `ctx`: the door. It checks the owner's existing
permission, records what its owner records, and answers null when the
thing is not there or `ctx` may not export it, without telling the two apart.

#### Parameters

##### ref

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### info

[`ExportReadInfo`](ExportReadInfo.md)

#### Returns

`Promise`\<[`IceItem`](IceItem.md)[] \| `null`\>

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`read`](IceExportSource.md#read)

***

### recordExport()?

> `optional` __recordExport__(`ref`, `ctx`, `outcome`): `Promise`\<`void`\>

Defined in: src/ice/types.ts:723

Record how an export of `ref` ended, as its owner records exports: once
the run has ended, with the file made or not. Also called, as a failure,
when what was read is not exported (too large, the site too busy).
Optional; a record that fails is logged, never thrown.

#### Parameters

##### ref

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### outcome

[`ExportOutcome`](ExportOutcome.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`IceExportSource`](IceExportSource.md).[`recordExport`](IceExportSource.md#recordexport)
