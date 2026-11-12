[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/jspwikiTableRow](../README.md) / JspwikiTableRow

# Interface: JspwikiTableRow

Defined in: src/parsers/jspwikiTableRow.ts:18

One JSPWiki table row, read the way JSPWiki reads it (#1338).

The one implementation for both table paths: a table inside a `%%` style
block (`MarkupParser.createTableNode`) and a bare one
(`JSPWikiPreprocessor`). They had a copy each, and the bare one dropped the
last cell of every row without a trailing delimiter — 4,442 rows on 475
jimstest pages — because it always cut the last split piece.

- A row starting with `||` is a header row, split on `||`; otherwise on `|`.
- The piece before the leading delimiter is empty and is dropped.
- The trailing delimiter is optional. The piece after the last delimiter is
  dropped only when it is empty, as JSPWiki does; otherwise it is a cell.
- A delimiter inside `[...]` belongs to a wiki link (`[Text|Page]`), not
  to the table.

## Properties

### cells

> __cells__: `string`[]

Defined in: src/parsers/jspwikiTableRow.ts:20

***

### isHeader

> __isHeader__: `boolean`

Defined in: src/parsers/jspwikiTableRow.ts:19
