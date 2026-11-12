[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetMetadataPatch

# Interface: AssetMetadataPatch

Defined in: src/types/Asset.ts:33

Patch of user-editable descriptive metadata for an asset.

Field semantics: `undefined` (absent) = leave unchanged; `null` = clear the
underlying tag(s). `dateTimeOriginal` accepts "YYYY-MM-DD HH:MM[:SS]" or
ISO-8601 "YYYY-MM-DDTHH:MM[:SS]" and is normalized before writing.

## Properties

### dateTimeOriginal?

> `optional` __dateTimeOriginal?__: `string` \| `null`

Defined in: src/types/Asset.ts:41

Capture timestamp override

***

### description?

> `optional` __description?__: `string` \| `null`

Defined in: src/types/Asset.ts:37

Caption / description — schema.org/description

***

### keywords?

> `optional` __keywords?__: `string`[] \| `null`

Defined in: src/types/Asset.ts:39

Keyword / tag list — schema.org/keywords

***

### title?

> `optional` __title?__: `string` \| `null`

Defined in: src/types/Asset.ts:35

Human-readable title — schema.org/name
