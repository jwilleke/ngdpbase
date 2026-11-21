[__ngdpbase API v5.45.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/jspwikiLinkLeftovers](../README.md) / fixLinkLeftoversInLine

# Function: fixLinkLeftoversInLine()

> __fixLinkLeftoversInLine__(`line`, `lostBrackets?`): `string`

Defined in: [src/converters/ncm/fix/jspwikiLinkLeftovers.ts:103](https://github.com/jwilleke/ngdpbase/blob/d29d3e4638115cb9acc688f0f55536414fcab7bc/src/converters/ncm/fix/jspwikiLinkLeftovers.ts#L103)

Apply fixText to a line, leaving its code spans as written. With
`lostBrackets` false, the lost-bracket repairs (#2451) are skipped: the join
test needs a second half of a split link as it was written.

## Parameters

### line

`string`

### lostBrackets?

`boolean` = `true`

## Returns

`string`
