[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / NOT\_ALERT\_MARKER

# Variable: NOT\_ALERT\_MARKER

> `const` __NOT\_ALERT\_MARKER__: "(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\>\[ \\\\t\]?)+\[ \\\\t\]\*)\\\\\[!(?:NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION)\\\\\]\[ \\\\t\]\*(?:\\\\n\|$))" = '(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\>\[ \\\\t\]?)+\[ \\\\t\]\*)\\\\\[!(?:NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION)\\\\\]\[ \\\\t\]\*(?:\\\\n\|$))'

Defined in: src/parsers/LinkParser.ts:70

Not a GitHub alert marker (#1493): `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`,
`[!WARNING]` or `[!CAUTION]` alone on a blockquote's line, which the page
profile renders as an alert box — never a link to a page named "!NOTE". A
lookahead, so it consumes nothing; spells the line start as `(?:^|\n)`.
