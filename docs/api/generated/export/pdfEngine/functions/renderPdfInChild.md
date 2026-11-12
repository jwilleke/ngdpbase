[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / renderPdfInChild

# Function: renderPdfInChild()

> __renderPdfInChild__(`job`): `Promise`\<[`PdfJobResult`](../type-aliases/PdfJobResult.md)\>

Defined in: src/export/pdfEngine.ts:210

Render one job in a child process. Resolves with the child's answer; rejects
only when the child timed out, crashed or never answered.

## Parameters

### job

[`PdfJob`](../interfaces/PdfJob.md)

The render

## Returns

`Promise`\<[`PdfJobResult`](../type-aliases/PdfJobResult.md)\>
