[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/styleBlockSyntax](../README.md) / STYLE\_BLOCK\_OPENER

# Variable: STYLE\_BLOCK\_OPENER

> `const` __STYLE\_BLOCK\_OPENER__: `RegExp`

Defined in: src/parsers/styleBlockSyntax.ts:12

The opener of a block-form `%%` style block, on its own line (#1345).

One or more class names, separated by spaces or dots — `%%information`,
`%%btn btn-sm`, `%%size-20.bg-silver`. A dot is a class separator, as in
the inline form (`%%btn.btn-info … /%`) and in Apache JSPWiki
(`JSPWikiMarkupParser.handleDiv`). Shared by the markup parser's
extraction and the JSPWiki preprocessor, which each had their own copy and
had drifted: neither accepted a dot, and the preprocessor accepted only one
class.
