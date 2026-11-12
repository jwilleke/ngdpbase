[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [rendering/markdownConverter](../README.md) / renderInlineMarkdown

# Function: renderInlineMarkdown()

> __renderInlineMarkdown__(`text`): `string`

Defined in: src/rendering/markdownConverter.ts:171

Inline Markdown for one line of text that is not a paragraph: a table cell
(#1351). The page profile's inline rules — `**bold**`, `*italic*`,
`~~strike~~`, `~sub~`, `^sup^`, `` `code` ``, `[text](url)` — with HTML
escaped rather than passed through, which is what a cell has always done.
No block rules and no paragraph: `renderInline`.

## Parameters

### text

`string`

## Returns

`string`
