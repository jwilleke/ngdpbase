# Current Save-Page Pipeline

__Status__: Production Architecture (as of 2026-04-27)
__Related__: [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md) | [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md)

---

## Overview

The save-page pipeline handles all writes to page content — new page creation, page edits, and index page updates. The primary entry point is `WikiRoutes.savePage()` (HTTP POST `/save/:page`) and `WikiRoutes.editPage()` (HTTP POST from the inline editor).

---

## Request-to-Disk Flow

```
HTTP POST /save/:page  (or POST from inline editor)
    │
    ▼
WikiRoutes.savePage() / editPage()
    │  parse request body (title, content, metadata fields)
    │  build WikiContext with incoming content
    ▼
ACLManager.checkPermission('edit', pageName, userContext)
    │  throws 403 if user lacks write permission
    ▼
PageManager.savePageWithContext(wikiContext, metadata)
    │
    ├─ [1] Reject deprecated inline ACL markup [{ALLOW}/{DENY}]
    ├─ [2] Preserve original author (immutable — never overwritten on edit)
    ├─ [3] Determine storage location from user-keywords config
    │        (private keyword → system-location: private)
    ├─ [4] ValidationManager.sanitizeMetadata()
    │        (trim Unicode whitespace, decode percent-encoded chars)
    ├─ [5] ValidationManager.checkConflicts()
    │        (UUID / slug / title uniqueness across all pages)
    ├─ [6] Move private page file if author changed (edge case)
    └─ [7] provider.savePage()  →  disk write
               │
               ├─ FileSystemProvider  (standard pages)
               └─ VersioningFileProvider  (pages with version history)
    │
    ▼
RenderingManager.updatePageInLinkGraph(pageName, content)
    │  rebuild outbound link graph for this page
    ▼
SearchManager.updatePageInIndex(pageName, pageData)
    │  update full-text search index
    ▼
CacheManager  (cache invalidation for this page)
    │
    ▼
HTTP redirect → view page  (or JSON response for API callers)
```

---

## Step-by-Step Detail

### [1] Inline ACL Rejection

`[{ALLOW …}]` and `[{DENY …}]` markup is rejected with a 400 error. Authors must use the __Audience__ field in the page editor instead. This prevents ACL rules from being encoded in page content where they are invisible to the UI.

__Source__: `src/managers/PageManager.ts` `savePageWithContext()` ~line 420

---

### [2] Author Immutability

`author` in frontmatter is set once at page creation and never overwritten by subsequent edits. It is read from the existing page on disk (`existingPage.metadata.author`) and merged back in regardless of what the editor submits.

For `documentation` and `system` category pages with no logged-in user, `author` defaults to `"system"`.

__Why__: `author` drives private-page ACL ownership in `ACLManager`. Changing it would break access control.

---

### [3] Storage Location Resolution

If any `user-keyword` on the page maps to `storageLocation: "private"` in the keyword config (`ngdpbase.user-keywords`), `system-location: private` is added to the metadata. This causes `FileSystemProvider` to write the page under `data/pages/private/{author}/{uuid}.md` instead of `data/pages/{uuid}.md`.

Required pages (system-category with `storageLocation: "required"`) are never marked private regardless of user-keywords.

__Source__: `src/managers/PageManager.ts` ~lines 445–472

---

### [4] Metadata Sanitization — `ValidationManager.sanitizeMetadata()`

All string-typed metadata fields are sanitized before the provider sees them:

- Trims leading/trailing Unicode whitespace (including non-breaking spaces, zero-width chars)
- Decodes percent-encoded characters (e.g. `%09` → tab) — prevents invisible control characters in frontmatter (#296)

__Source__: `src/managers/ValidationManager.ts` `sanitizeMetadata()`

---

### [5] Conflict Checking — `ValidationManager.checkConflicts()`

Enforces uniqueness before writing:

| Checked field | Conflict type |
|---|---|
| `uuid` | Duplicate UUID — another page already has this identifier |
| `slug` | Duplicate slug — URL collision |
| Title (page name) | Duplicate title — same display name as existing page |

If a conflict is found, `savePageWithContext()` throws an error and the write is aborted. `PageManager` is the single authority on uniqueness — providers do not perform this check.

__Source__: `src/managers/PageManager.ts` ~lines 483–490

---

### [6] Private Page Relocation (edge case)

If a private page's author field would change (should not happen normally — see step 2), the existing file is moved from the old author's directory to the new author's directory via `provider.movePrivatePage(uuid, oldAuthor, newAuthor)`.

---

### [7] Provider Write — `provider.savePage()`

The configured page provider writes the file to disk. Two providers are in use:

| Provider | When used | Storage |
|---|---|---|
| `FileSystemProvider` | Standard page storage | `data/pages/{uuid}.md` or `data/pages/private/{author}/{uuid}.md` |
| `VersioningFileProvider` | Pages with version history enabled | Same paths + delta-compressed version snapshots |

Both write YAML frontmatter + markdown body using `gray-matter`. The file is atomically written via a temp-file rename to prevent partial writes.

__Sources__: `src/providers/FileSystemProvider.ts`, `src/providers/VersioningFileProvider.ts`

---

### Post-Write: Link Graph, Search Index, Cache

After the provider write succeeds:

1. __Link graph__ — `RenderingManager.updatePageInLinkGraph()` parses outbound links from the new content and updates the in-memory graph used for backlink calculation.

2. __Search index__ — `SearchManager.updatePageInIndex()` re-indexes the page content for full-text search.

3. __Cache invalidation__ — The parse-result cache entry for this page is invalidated so the next view request re-renders from the new content.

---

## FilterChain on Save — ⚠️ Not Currently Executing

The `FilterChain` (ValidationFilter, SecurityFilter, SpamFilter) is initialized in `MarkupParser` but `filterChain.execute()` is __never called__ on content before it is saved. This means:

- `ValidationFilter.validateMarkupSyntax()` does not check content at save time
- `SecurityFilter` HTML sanitization does not run at save time
- Markup errors (unclosed plugin syntax, malformed `%%style%%` blocks) are not caught on save — they surface only at render time

__Tracked in__: [#596 — FilterChain configured but filterChain.execute() never called](https://github.com/jwilleke/ngdpbase/issues/596)

> Once #596 is resolved, the natural place to call `filterChain.execute()` for __save-time validation__ is before `provider.savePage()` in step [7]. For __render-time filtering__ it should be called at the end of `MarkupParser.parse()`.

---

## Validation at Save vs. Render Time

| Check | When it runs | Where |
|---|---|---|
| Deprecated ACL markup | Save | `PageManager.savePageWithContext()` |
| Author immutability | Save | `PageManager.savePageWithContext()` |
| Metadata sanitization | Save | `ValidationManager.sanitizeMetadata()` |
| UUID / slug / title conflicts | Save | `ValidationManager.checkConflicts()` |
| ACL / permission check | Save | `ACLManager.checkPermission()` |
| Markup syntax validation | __Not run__ (#596) | `ValidationFilter` (dead code) |
| HTML sanitization | __Not run__ (#596) | `SecurityFilter` (dead code) |
| Spam detection | __Not run__ (#596) | `SpamFilter` (dead code) |
| Inline style rendering | Render | `MarkupParser` Step 0.55 |
| Plugin execution | Render | `MarkupParser` Phase 2 / WikiDocument |

---

## Key Source Files

| File | Role |
|---|---|
| `src/routes/WikiRoutes.ts` | HTTP entry points — `savePage()`, `editPage()`, `editPageIndex()` |
| `src/managers/PageManager.ts` | `savePageWithContext()` — orchestrates save pipeline |
| `src/managers/ValidationManager.ts` | `sanitizeMetadata()`, `checkConflicts()` |
| `src/managers/ACLManager.ts` | `checkPermission()` — access control |
| `src/providers/FileSystemProvider.ts` | Standard disk write |
| `src/providers/VersioningFileProvider.ts` | Versioned disk write |
| `src/managers/RenderingManager.ts` | `updatePageInLinkGraph()` — post-write link update |
| `src/managers/SearchManager.ts` | `updatePageInIndex()` — post-write search update |

---

## See Also

- [Current-Rendering-Pipeline.md](./Current-Rendering-Pipeline.md) — How saved pages are rendered for viewing
- [MANAGERS-OVERVIEW.md](./MANAGERS-OVERVIEW.md) — Manager architecture overview
- [Issue #596](https://github.com/jwilleke/ngdpbase/issues/596) — FilterChain not wired (affects both save and render paths)
