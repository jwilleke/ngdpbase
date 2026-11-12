[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/jspwikiTableRow](../README.md) / parseTableRows

# Function: parseTableRows()

> __parseTableRows__(`lines`): [`JspwikiTableRow`](../interfaces/JspwikiTableRow.md)[]

Defined in: src/parsers/jspwikiTableRow.ts:86

The rows of a table block, with a GFM table read as one (#1352): the row
above a separator row is the header, and the separator itself is not a
row. Without this a pasted GFM table rendered its `|---|` line as a row of
dashes and had no header. A JSPWiki table has no separator row and comes
through unchanged.

## Parameters

### lines

readonly `string`[]

## Returns

[`JspwikiTableRow`](../interfaces/JspwikiTableRow.md)[]
