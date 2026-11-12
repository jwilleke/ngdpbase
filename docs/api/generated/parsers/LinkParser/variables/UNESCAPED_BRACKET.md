[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / UNESCAPED\_BRACKET

# Variable: UNESCAPED\_BRACKET

> `const` __UNESCAPED\_BRACKET__: "(?\<=(?:^\|\[^\\\\\\\\\])(?:\\\\\\\\\\\\\\\\)\*)" = '(?\<=(?:^\|\[^\\\\\\\\\])(?:\\\\\\\\\\\\\\\\)\*)'

Defined in: src/parsers/LinkParser.ts:52

A bracket that is not escaped: preceded by an even number of backslashes,
none included (#1480). CommonMark's `\[` is a literal `[`, so it is not
a link, a variable or a plugin, for the renderer, the link graph or the
rename rewriter alike. `\\[` — an escaped backslash — still opens one.
A lookbehind, so it consumes nothing and match offsets are unchanged.
