[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/images](../README.md) / localizeNcmImages

# Function: localizeNcmImages()

> __localizeNcmImages__(`ncm`, `cfg`, `deps`): `Promise`\<\{ `content`: `string`; `warnings`: [`NcmWarning`](../../types/interfaces/NcmWarning.md)[]; \}\>

Defined in: src/converters/ncm/images.ts:88

Localize embedded remote/data images in an NCM document.
Pure aside from the injected `deps`; idempotent.

## Parameters

### ncm

`string`

### cfg

[`NcmImageConfig`](../interfaces/NcmImageConfig.md)

### deps

[`NcmImageDeps`](../interfaces/NcmImageDeps.md)

## Returns

`Promise`\<\{ `content`: `string`; `warnings`: [`NcmWarning`](../../types/interfaces/NcmWarning.md)[]; \}\>
