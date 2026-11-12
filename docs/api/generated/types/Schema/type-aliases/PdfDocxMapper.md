[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / PdfDocxMapper

# Type Alias: PdfDocxMapper

> __PdfDocxMapper__ = (`metadata`, `body`) => [`DigitalDocument`](../interfaces/DigitalDocument.md)

Defined in: src/types/Schema.ts:527

Maps an extracted PDF/docx metadata + text body to a DigitalDocument
CreativeWork. Implementation lands in Slice 5 (#755) —
AttachmentManager.

## Parameters

### metadata

`Record`\<`string`, `unknown`\>

### body

`string`

## Returns

[`DigitalDocument`](../interfaces/DigitalDocument.md)
