[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / PdfOptions

# Interface: PdfOptions

Defined in: src/export/pdfEngine.ts:41

What a caller may set. An `@page` rule in the HTML (size, margin) wins over
these, as it does when a browser prints.

## Properties

### format?

> `optional` __format?__: `"Letter"` \| `"Legal"` \| `"Tabloid"` \| `"Ledger"` \| `"A0"` \| `"A1"` \| `"A2"` \| `"A3"` \| `"A4"` \| `"A5"` \| `"A6"`

Defined in: src/export/pdfEngine.ts:43

Page size; default `ngdpbase.export.pdf.page-size`.

***

### margin?

> `optional` __margin?__: [`PdfMargin`](PdfMargin.md)

Defined in: src/export/pdfEngine.ts:45

Page margins, each a CSS length (`'20mm'`, `'0.5in'`); default none.

***

### printBackground?

> `optional` __printBackground?__: `boolean`

Defined in: src/export/pdfEngine.ts:47

Print background colours and images; default `true`.
