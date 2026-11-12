[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/renameLinkRewrite](../README.md) / rewriteLinkTargets

# Function: rewriteLinkTargets()

> __rewriteLinkTargets__(`content`, `oldTitle`, `newTitle`): [`LinkRewriteResult`](../interfaces/LinkRewriteResult.md)

Defined in: src/utils/renameLinkRewrite.ts:197

Rewrite links pointing at `oldTitle` so they point at `newTitle`.

## Parameters

### content

`string`

The referring page's markdown.

### oldTitle

`string`

The title the page was renamed away from.

### newTitle

`string`

The title it now has.

## Returns

[`LinkRewriteResult`](../interfaces/LinkRewriteResult.md)

The rewritten content and a report. Returns the input unchanged
  (and `rewritten: 0`) when there is nothing to do, including when either
  title is blank or the two are equal.
