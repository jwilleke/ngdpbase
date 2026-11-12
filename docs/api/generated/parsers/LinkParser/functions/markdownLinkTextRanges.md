[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / markdownLinkTextRanges

# Function: markdownLinkTextRanges()

> __markdownLinkTextRanges__(`content`): \[`number`, `number`\][]

Defined in: src/parsers/LinkParser.ts:160

The link text of every Markdown link whose text holds brackets of its own
(#1708): `[a [b] c](url)`. CommonMark allows balanced brackets there, and
markdown-it renders them, but the wiki link syntax took the inner `[b`
first and split the link. Each range runs from the opening `[` to its
matching `]`, which is followed by `(`.

Every reader of wiki links skips a match that starts inside one of these
ranges, so the renderer, the link graph and the rename rewriter agree that
the brackets are link text. An escaped bracket (#1480) is not counted, and
link text that starts with NCM's `[[` escape is left to it. One
pass with a stack, so a long page costs no more than its length.

Reference links (#1491) are Markdown link text too: `[text][label]`,
`[label][]` and `[label]` when the page defines `label`, and the
definition line's `[label]` itself. See [referenceLinkRanges](referenceLinkRanges.md).

## Parameters

### content

`string`

## Returns

\[`number`, `number`\][]
