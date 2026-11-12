[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / NOT\_TASK\_MARKER

# Variable: NOT\_TASK\_MARKER

> `const` __NOT\_TASK\_MARKER__: "(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\[-\*+\]\|\\\\d+\[.)\])\[ \\\\t\]+)\\\\\[\[ xX\]\\\\\]\[ \\\\t\])" = '(?!(?\<=(?:^\|\\\\n)\[ \\\\t\]\*(?:\[-\*+\]\|\\\\d+\[.)\])\[ \\\\t\]+)\\\\\[\[ xX\]\\\\\]\[ \\\\t\])'

Defined in: src/parsers/LinkParser.ts:62

Not a task-list checkbox (#1476, operator: task lists are supported): a
`[ ]`, `[x]` or `[X]` right after a list marker (`-`, `*`, `+`, `1.`,
`1)`) at the start of a line, followed by a space. GitHub's task lists —
markdown-it-task-lists renders them — and never a link to a page named
"x". A lookahead, so it consumes nothing. Needs the `m` flag for `^`, so it
spells the line start as `(?:^|\n)` instead.
