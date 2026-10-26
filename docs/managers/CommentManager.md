---
name: CommentManager
description: Per-page comment storage + CRUD; sidecar JSON keyed by page UUID
dateModified: '2026-10-26'
category: managers
code: src/managers/CommentManager.ts
---

# CommentManager

Stores per-page comments in sidecar JSON files keyed by page UUID. Independent of page revision history — comments belong to a page logically, not to a specific revision. Read/write goes through `addComment`, `listComments`, `deleteComment` etc.; the [CommentsPlugin](../plugins/CommentsPlugin.md) renders the list inline.

## Storage

- Public page: `data/comments/{pageUuid}/{commentId}.json` (configurable via `ngdpbase.comments.storagedir`).
- Vault page (`vaults/{owner}/{vault}/{title}`): `pages/vaults/{owner}/{vault}/comments/{pageUuid}/{commentId}.json`, read and written through the vault's store I/O, so sealed exactly when the page is, and refused when the vault is locked or not yet opened ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839)). See [private-stores.md](../private-stores.md#footnotes-and-comments).
- A page that moves into or out of a vault takes its comments with it (`movePageComments`, called by the page door).
- Format: one `PageComment` record per file (id, author, authorDisplayName, content, createdAt). `author` is the writer's identity `@id` ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041)); `authorDisplayName` is what is shown, and `deletedBy` records the account that deleted it, by username.
- Enabled flag: `ngdpbase.comments.allow` (default `true`).

## Authorization

- Anyone authenticated can post.
- Comment authors and admins can delete their own; admins can delete any. Whether the caller wrote a comment is `isAuthor(comment, ctx)`: the caller's identity `@id`, or their username on a comment written before and not yet converted.
- Reading, posting and deleting are gated exactly like reading the page: the routes read the page first (`PageManager.readPage`, as the requester) and answer 404 when they may not ([#1839](https://github.com/jwilleke/ngdpbase/issues/1839)). Until #1839 the comment routes asked nothing about the page.
- Every call names the page as `{ name, uuid }` and carries the caller's context.

## Authors by identity @id

From [#2041](https://github.com/jwilleke/ngdpbase/issues/2041) (step 6 of the [identity model](../planning/identity-model.md)) a new comment's `author` is the writer's identity `@id`, from `IdentityManager.getByUserIdentifier(ctx, username)['@id']` under the system context; a name with no account is stored as given. At start-up the manager converts the public folder once: each comment whose `author` is still a username is given that user's `@id`, one write per comment file, under the system context, and the count is logged. Values already an `@id` (`urn:`), `anonymous` and the system principal are left alone, so a second start writes nothing. A username with no account is left as it is and reported, counts only: a log line and the admin dashboard's "needs your attention" list. A vault page's comments are in its vault, which start-up does not open, so they keep their username until written again; `isAuthor` still matches them.

## Backup and restore

Public pages' comments are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.comments.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.comments.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. A vault page's comments are in its vault, which PageManager backs up as stored. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [CommentsPlugin](../plugins/CommentsPlugin.md) — UI surface
- `src/types/Comment.ts` — `PageComment` shape
- Issue #590 — `GET /api/comments/:uuid/html` endpoint sharing the render code
