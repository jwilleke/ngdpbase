[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / WIKI\_LINK\_PATTERN\_SOURCE

# Variable: WIKI\_LINK\_PATTERN\_SOURCE

> `const` __WIKI\_LINK\_PATTERN\_SOURCE__: "(?\<=(?:^\|\[^\\\\\\\\\])(?:\\\\\\\\\\\\\\\\)\*)(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\[-\*+\]\|\\\\d+\[.)\])\[ \\\\t\]+)\\\\\[\[ xX\]\\\\\]\[ \\\\t\])(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\>\[ \\\\t\]?)+\[ \\\\t\]\*)\\\\\[!(?:NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION)\\\\\]\[ \\\\t\]\*(?:\\\\n\|$))\\\\\[(\[^\|\\\\\]\]+)(?:\\\\\|(\[^\|\\\\\]\]+))?(?:\\\\\|(\[^\\\\\]\]+))?\\\\\](?!\\\\()"

Defined in: src/parsers/LinkParser.ts:86

The wiki link syntax, as a source string: `[text]`, `[text|target]` or
`[text|target|attributes]`. The trailing `(?!\()` skips `[text](url)` —
that is a markdown link, and its bracket text is not a wiki link target.

Exported as a source string rather than a RegExp because the compiled form
needs the `g` flag, and a shared global RegExp carries `lastIndex` between
callers. Use [wikiLinkPattern](../functions/wikiLinkPattern.md) to get a fresh one.

Shared so that anything reasoning about link targets — rendering, the
link graph, the rename rewriter (#1094) — agrees with the parser about what
a link *is*. A second copy of this pattern is a second answer waiting to
drift from this one.
