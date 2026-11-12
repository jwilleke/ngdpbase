[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/bridge](../README.md) / ncmToConversionResult

# Function: ncmToConversionResult()

> __ncmToConversionResult__(`ncm`): [`ConversionResult`](../../../../IContentConverter/interfaces/ConversionResult.md)

Defined in: src/converters/ncm/bridge.ts:25

Adapt an [NcmResult](../../types/interfaces/NcmResult.md) to the legacy [ConversionResult](../../../../IContentConverter/interfaces/ConversionResult.md) shape.
Frontmatter (including the stamped `ncmVersion`) is split into `metadata`
so existing ImportManager/MCP pipelines consume it unchanged.

## Parameters

### ncm

[`NcmResult`](../../types/interfaces/NcmResult.md)

## Returns

[`ConversionResult`](../../../../IContentConverter/interfaces/ConversionResult.md)
