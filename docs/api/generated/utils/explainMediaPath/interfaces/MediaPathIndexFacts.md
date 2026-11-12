[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / MediaPathIndexFacts

# Interface: MediaPathIndexFacts

Defined in: src/utils/explainMediaPath.ts:136

Index facts, resolved by the caller so this stays free of I/O.

## Properties

### alternateOf?

> `optional` __alternateOf?__: `object`

Defined in: src/utils/explainMediaPath.ts:140

Set when the path is an alternate folded into another item.

#### filePath

> __filePath__: `string`

#### id

> __id__: `string`

***

### hasIgnoreKeyword?

> `optional` __hasIgnoreKeyword?__: `boolean`

Defined in: src/utils/explainMediaPath.ts:144

True when the file carries the `ngdpbaseignore` EXIF/XMP keyword.

***

### ignorePatternMatch?

> `optional` __ignorePatternMatch?__: `string`

Defined in: src/utils/explainMediaPath.ts:142

`.ngdpbaseignore` pattern that matched, if the caller found one.

***

### indexedId?

> `optional` __indexedId?__: `string`

Defined in: src/utils/explainMediaPath.ts:138

Item id when this exact path is indexed.
