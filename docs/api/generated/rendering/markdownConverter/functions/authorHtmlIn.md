[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [rendering/markdownConverter](../README.md) / authorHtmlIn

# Function: authorHtmlIn()

> __authorHtmlIn__(`markdown`): [`AuthorHtml`](../interfaces/AuthorHtml.md)[]

Defined in: src/rendering/markdownConverter.ts:214

The author HTML in page source, found exactly as the page profile finds it
when rendering: the html_block and html_inline tokens. Code blocks and code
spans are code to markdown-it, so they are not here. The save-time check
(SecurityFilter) holds these to the policy the renderer applies (#1623).

## Parameters

### markdown

`string`

## Returns

[`AuthorHtml`](../interfaces/AuthorHtml.md)[]
