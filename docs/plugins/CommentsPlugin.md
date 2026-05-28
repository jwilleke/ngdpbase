---
name: CommentsPlugin
description: Renders the page's comment list with an inline CRUD UI for authorised users
dateModified: '2026-05-28'
category: plugins
code: src/plugins/CommentsPlugin.ts
relatedModules:
  - CommentManager
---

# CommentsPlugin

Renders the comment list for the current page. Shows author display name, timestamp, and body for each comment. Authenticated users can post; comment authors and admins can delete their own.

## Usage

```wiki
[{CommentsPlugin}]
```

Embeds the comment list + posting form. Anonymous users see the list (if visible to them) but cannot post.

## Implementation

- Inner-list HTML rendering is exported as `renderCommentListHtml()` for reuse by `GET /api/comments/:uuid/html` (#590).
- Reads comments via the `CommentManager`.
- Output is `<section class="comments">…</section>` containing the list + an action area.

## See Also

- [CommentManager](../managers/CommentManager.md)
