[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/renameLinkRewrite](../README.md) / rewriteLinkTargetsBy

# Function: rewriteLinkTargetsBy()

> __rewriteLinkTargetsBy__(`content`, `resolve`): [`LinkRewriteResult`](../interfaces/LinkRewriteResult.md)

Defined in: src/utils/renameLinkRewrite.ts:138

Rewrite link targets by the caller's rule — the matcher, once.

The rename rewrite below and the private-link migration (#1457) decide
different things about a target and agree on everything else: which
bracket forms are links at all, that a task-list checkbox is not one, that
external, mail, anchor, absolute and InterWiki targets are left alone, and
that a `#fragment` survives. A second pass with its own regex would be a
second place for those to drift, so both come through here.

## Parameters

### content

`string`

The page's markdown.

### resolve

[`LinkTargetResolver`](../type-aliases/LinkTargetResolver.md)

What to do with each internal target seen.

## Returns

[`LinkRewriteResult`](../interfaces/LinkRewriteResult.md)

The rewritten content and a report.
