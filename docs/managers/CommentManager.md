---
name: CommentManager
description: Per-page comment storage + CRUD; sidecar JSON keyed by page UUID
dateModified: '2026-05-28'
category: managers
code: src/managers/CommentManager.ts
---

# CommentManager

Stores per-page comments in sidecar JSON files keyed by page UUID. Independent of page revision history — comments belong to a page logically, not to a specific revision. Read/write goes through `addComment`, `listComments`, `deleteComment` etc.; the [CommentsPlugin](../plugins/CommentsPlugin.md) renders the list inline.

## Storage

- Directory: `data/comments/{pageUuid}.json` (configurable via `ngdpbase.comments.storagedir`).
- Format: array of `PageComment` records (id, author, authorDisplayName, body, createdAt).
- Enabled flag: `ngdpbase.comments.allow` (default `true`).

## Authorization

- Anyone authenticated can post.
- Comment authors and admins can delete their own; admins can delete any.
- ACL gating mirrors page visibility — comments on a private page are private to the same audience.

## See Also

- [CommentsPlugin](../plugins/CommentsPlugin.md) — UI surface
- `src/types/Comment.ts` — `PageComment` shape
- Issue #590 — `GET /api/comments/:uuid/html` endpoint sharing the render code
