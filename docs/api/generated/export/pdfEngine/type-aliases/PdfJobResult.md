[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / PdfJobResult

# Type Alias: PdfJobResult

> __PdfJobResult__ = \{ `ok`: `true`; `pdf`: `Uint8Array`; \} \| \{ `error`: `string`; `ok`: `false`; `stage`: `"launch"` \| `"render"`; \}

Defined in: src/export/pdfEngine.ts:77

What the child sends back. `launch` means Chromium could not start: the engine is unavailable.
