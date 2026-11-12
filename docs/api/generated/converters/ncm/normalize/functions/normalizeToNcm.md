[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/normalize](../README.md) / normalizeToNcm

# Function: normalizeToNcm()

> __normalizeToNcm__(`input`, `sourceFormat`, `options?`): [`NcmResult`](../../types/interfaces/NcmResult.md)

Defined in: src/converters/ncm/normalize.ts:57

Normalize input to NCM. See module docs for the Slice-1 scope.

## Parameters

### input

`string`

Raw source content (may include YAML frontmatter)

### sourceFormat

[`NcmSourceFormat`](../../types/type-aliases/NcmSourceFormat.md)

One of [NcmSourceFormat](../../types/type-aliases/NcmSourceFormat.md)

### options?

[`NcmNormalizeOptions`](../interfaces/NcmNormalizeOptions.md) = `{}`

## Returns

[`NcmResult`](../../types/interfaces/NcmResult.md)
