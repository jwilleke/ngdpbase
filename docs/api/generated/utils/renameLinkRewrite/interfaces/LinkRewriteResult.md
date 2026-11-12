[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/renameLinkRewrite](../README.md) / LinkRewriteResult

# Interface: LinkRewriteResult

Defined in: src/utils/renameLinkRewrite.ts:72

Outcome of rewriting one page's content.

## Properties

### content

> __content__: `string`

Defined in: src/utils/renameLinkRewrite.ts:74

The content, rewritten. Identical to the input when `rewritten` is 0.

***

### rewritten

> __rewritten__: `number`

Defined in: src/utils/renameLinkRewrite.ts:76

How many link targets were replaced.

***

### unchangedTargets

> __unchangedTargets__: `string`[]

Defined in: src/utils/renameLinkRewrite.ts:83

Internal page targets seen and left as they were, de-duplicated and in
first-seen order. The caller logs these for a referrer that yielded no
rewrites: it is the visible trace of a fuzzy variant, a markdown-syntax
link, or a link-graph edge that no longer reflects the content.
