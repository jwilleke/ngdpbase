[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PageManager](../README.md) / PageConvertResult

# Interface: PageConvertResult

Defined in: src/managers/PageManager.ts:293

[PageManager.convertPageToNcm](../classes/default.md#convertpagetoncm): the NCM result plus the fix steps that changed the body.

## Extends

- [`NcmResult`](../../../converters/ncm/types/interfaces/NcmResult.md)

## Properties

### content

> __content__: `string`

Defined in: src/converters/ncm/types.ts:49

Full NCM document including frontmatter.

#### Inherited from

[`NcmResult`](../../../converters/ncm/types/interfaces/NcmResult.md).[`content`](../../../converters/ncm/types/interfaces/NcmResult.md#content)

***

### fixes

> __fixes__: [`FixChange`](../../../converters/ncm/fix/types/interfaces/FixChange.md)[]

Defined in: src/managers/PageManager.ts:294

***

### ncmVersion

> __ncmVersion__: `number`

Defined in: src/converters/ncm/types.ts:53

The `ncmVersion` stamped on / read from the document.

#### Inherited from

[`NcmResult`](../../../converters/ncm/types/interfaces/NcmResult.md).[`ncmVersion`](../../../converters/ncm/types/interfaces/NcmResult.md#ncmversion)

***

### warnings

> __warnings__: [`NcmWarning`](../../../converters/ncm/types/interfaces/NcmWarning.md)[]

Defined in: src/converters/ncm/types.ts:51

Structured warnings (see [NcmWarningKind](../../../converters/ncm/types/type-aliases/NcmWarningKind.md)).

#### Inherited from

[`NcmResult`](../../../converters/ncm/types/interfaces/NcmResult.md).[`warnings`](../../../converters/ncm/types/interfaces/NcmResult.md#warnings)
