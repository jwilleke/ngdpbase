[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/CommentsPlugin](../README.md) / renderCommentListHtml

# Function: renderCommentListHtml()

> __renderCommentListHtml__(`f`, `comments`, `isAuthenticated`, `isOwn`, `isAdmin`, `pageUuid`, `engine?`): `Promise`\<`string`\>

Defined in: src/plugins/CommentsPlugin.ts:27

Render just the inner comment-list HTML for a page. Shared between the
plugin output and the `GET /api/comments/:uuid/html` endpoint added in #590.

Returns either a `<div class="comment-list">…</div>` or a "no comments yet"
paragraph — never wraps in the outer `<section>` or container.

## Parameters

### f

[`PluginFormatters`](../../../managers/PluginManager/type-aliases/PluginFormatters.md)

### comments

[`PageComment`](../../../types/Comment/interfaces/PageComment.md)[]

### isAuthenticated

`boolean`

### isOwn

(`comment`) => `Promise`\<`boolean`\>

Whether the viewer wrote a comment: `CommentManager.isAuthor` with their context (#2041).

### isAdmin

`boolean`

### pageUuid

`string`

### engine?

`WikiEngineLike`

## Returns

`Promise`\<`string`\>
