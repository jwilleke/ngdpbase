[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/types](../README.md) / NcmResult

# Interface: NcmResult

Defined in: src/converters/ncm/types.ts:47

Result of normalizing arbitrary input to NCM.

## Extended by

- [`PageConvertResult`](../../../../managers/PageManager/interfaces/PageConvertResult.md)

## Properties

### content

> __content__: `string`

Defined in: src/converters/ncm/types.ts:49

Full NCM document including frontmatter.

***

### ncmVersion

> __ncmVersion__: `number`

Defined in: src/converters/ncm/types.ts:53

The `ncmVersion` stamped on / read from the document.

***

### warnings

> __warnings__: [`NcmWarning`](NcmWarning.md)[]

Defined in: src/converters/ncm/types.ts:51

Structured warnings (see [NcmWarningKind](../type-aliases/NcmWarningKind.md)).
