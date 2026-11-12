[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/normalize](../README.md) / NcmNormalizeOptions

# Interface: NcmNormalizeOptions

Defined in: src/converters/ncm/normalize.ts:32

Options controlling normalization behaviour.

## Properties

### tableClasses?

> `optional` __tableClasses?__: `string`[]

Defined in: src/converters/ncm/normalize.ts:39

Style classes to wrap up-converted tables in (§2.1, NCM v2). Defaults to
[DEFAULT\_TABLE\_CLASSES](../../tables/variables/DEFAULT_TABLE_CLASSES.md). ImportManager resolves this from
`ngdpbase.markdown.ncm.table.default-classes`. Pass `[]` to up-convert the
table syntax without a style wrapper.
