[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateLinkRewrite](../README.md) / rewriteToPrivateLinks

# Function: rewriteToPrivateLinks()

> __rewriteToPrivateLinks__(`content`, `store`, `titles`): [`LinkRewriteResult`](../../renameLinkRewrite/interfaces/LinkRewriteResult.md)

Defined in: src/utils/privateLinkRewrite.ts:45

Point this page's `[Title]` links at the store they are already in.

## Parameters

### content

`string`

The private page's markdown.

### store

`string`

The store the page lives in; the prefix its links gain.

### titles

`Iterable`\<`string`\>

Every page title in that store.

## Returns

[`LinkRewriteResult`](../../renameLinkRewrite/interfaces/LinkRewriteResult.md)

The rewritten content and a report — the input unchanged, and
  `rewritten: 0`, when nothing in it names a page of this store.
