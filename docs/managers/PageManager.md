---
name: PageManager
description: Page CRUD and storage facade over the PageProvider registry
dateModified: 2026-10-26
category: managers
code: src/managers/PageManager.ts
relatedModules: [BaseManager, FileSystemProvider, VersioningFileProvider]
status: stable
---

# PageManager

__Module:__ `src/managers/PageManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [PageManager-Complete-Guide.md](PageManager-Complete-Guide.md)

---

## Overview

PageManager is the central coordinator for all wiki page operations. It implements a pluggable provider architecture following the JSPWiki pattern, allowing different storage backends (filesystem, database, cloud) to be swapped via configuration.

## Key Features

- __Pluggable Providers__ - Swap storage backends via configuration
- __UUID-Based Storage__ - Unique identifiers for all pages
- __Title and UUID Lookup__ - Find pages by either identifier
- __Plural Name Matching__ - "Users" finds "User" page
- __In-Memory Caching__ - Fast lookups with indexes
- __WikiContext Support__ - Context-aware save/delete operations
- __Backup/Restore__ - Full page backup support

## Quick Example

```javascript
const pageManager = engine.getManager('PageManager');

// Save a page
await pageManager.savePage('My Page', '# Hello World', {
  author: 'jim',
  category: 'documentation'
});

// Get a page (by title or UUID)
const page = await pageManager.getPage('My Page');
console.log(page.content, page.uuid);

// Check existence
if (pageManager.pageExists('My Page')) {
  console.log('Page exists');
}

// Delete a page
await pageManager.deletePage('My Page');
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `getPage(identifier, ctx)` | `Promise<Object\|null>` | Get page by title or UUID. Decides nothing: `ctx` only finds the page. A user's read goes through `readPage` |
| `getPageContent(identifier, ctx)` | `Promise<string>` | Get content only. Decides nothing, like `getPage` |
| `readPage(identifier, ctx)` | `Promise<PageRead<WikiPage>>` | The page-read door ([#1622](https://github.com/jwilleke/ngdpbase/issues/1622)). Resolves the identifier (uuid, slug, title or vault name), decides `page-read` on the page it resolved to through the PolicyInformationPoint, and only then reads that same page. Answers `{ ok: true, name, metadata, value }` or `{ ok: false, refusal }`, the refusal being `not-found`, `no-metadata` or `denied`. Refuses everything without a PolicyInformationPoint |
| `readVersionHistory(identifier, ctx, limit?)` | `Promise<PageRead<VersionHistoryEntry[]>>` | The same door, for the version list |
| `readVersion(identifier, version, ctx)` | `Promise<PageRead<VersionContent>>` | The same door, for one past version |
| `readVersionDiff(identifier, v1, v2, ctx)` | `Promise<PageRead<VersionDiff>>` | The same door, for the difference between two versions |
| `mayShowPage(identifier, ctx)` | `Promise<boolean>` | The same `page-read` decision as `readPage`, as an affordance ([#1668](https://github.com/jwilleke/ngdpbase/issues/1668)): would `ctx` be allowed to read the page, asked only to decide whether to show something (`<wiki:If test="exists:Page">`). Reads no content and writes no audit record; a page `ctx` may not read answers false, as a missing one does |
| `getPageMetadata(identifier)` | `Promise<Object\|null>` | Get metadata only |
| `savePage(name, content, metadata, ctx, options?)` | `Promise<PageSaveResult>` | Save page — the one write door ([#1462](https://github.com/jwilleke/ngdpbase/issues/1462)) |
| `deletePage(identifier, ctx)` | `Promise<boolean>` | Delete page — the one delete door |
| `deleteTestArtifacts(ctx, only?)` | `Promise<{ deleted, failed }>` | Delete every shared page carrying the `test-artifact` system keyword, never one without it; `only` narrows by `author` / `systemCategory`. Records `page-delete` before each, then `deletePage` (#2008) |
| `restoreVersion(identifier, version, ctx)` | `Promise<PageSaveResult & { version }>` | Put an old version's body back, as a new version |
| `restoreDeletedPage(uuid, ctx)` | `Promise<{ ok, title } \| { ok, reason }>` | Bring a page back from the trash, and back into the shared indexes |
| `saveRawPageWithAdminOverride(name, raw, ctx)` | `Promise<PageSaveResult>` | The admin raw editor's save ([#689](https://github.com/jwilleke/ngdpbase/issues/689)) |
| `pageExists(identifier)` | `boolean` | Check if page exists |
| `getAllPages()` | `Promise<string[]>` | Every title — the raw index, for callers with no reader (indexing, link graphs, jobs, `admin-system` surfaces). Never rendered to a request ([#1219](https://github.com/jwilleke/ngdpbase/issues/1219)) |
| `listPagesFor(subject, action?)` | `Promise<string[]>` | The titles `subject` may `action` on (default `view`) — the door for anything listed to a reader; the evaluator's `filterAccessiblePages` over the in-memory index. Lists nothing without an PolicyInformationPoint |
| `filterPagesFor(subject, names, action?)` | `Promise<string[]>` | The same door for a list found elsewhere — search hits ([#1962](https://github.com/jwilleke/ngdpbase/issues/1962)): which of `names` `subject` may `action` on, each resolved as `/view` resolves it, decided in one batch by `filterAccessiblePages`. Order kept; a name with no page is dropped; keeps nothing without an PolicyInformationPoint |
| `pageUrl(pageName, action?)` | `string` | The URL for `action` (default `view`) on a page: `/view/<name>`, or `/vaults/<owner>/<vault>/<title>` for a vault page with the action below it. Reads nothing; add-ons ask this instead of building links ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)) |
| `privatePageName(owner, title, vault?)` | `string` | The name of `title` in `owner`'s vault `vault`, or in their default vault (the system-category entry marked default, read live) when none is given: `vaults/<owner>/<vault>/<title>`. Names a page; says nothing about whether it exists or who may open it ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)) |
| `refreshPageList()` | `Promise<void>` | Rescan storage |

## Page Object Structure

```javascript
{
  content: string,      // Markdown content
  metadata: object,     // Frontmatter metadata
  title: string,        // Page title
  uuid: string,         // Page UUID
  filePath: string      // File path (FileSystemProvider)
}
```

## Authorship: identity @ids (#2097)

A page's `author` and `editor`, its version history's editors, its index entries, its tombstones' `deletedBy` and the search documents store the user's identity `@id` (operator, 2026-10-26; [identity model](../planning/identity-model.md)). The rules, in one place each:

- __Writes.__ `savePage` (`normalizeSaveMetadata`) stores the author of a new page and the editor of every save as `IdentityManager.identityIdOf(...) ?? the name`; an edit also converts an author still held as a username. A principal (`system`, `anonymous`), an `@id`, an orphan or a name with no account is stored as it is, and a save never fails because the identity store is down. A vault page's author is its owner's `@id`; the vault is still named by the owner's username, so the Private box resolves an `@id` author to the username (`IdentityManager.usernameOf`) before naming the vault. A tombstone's `deletedBy` is the deleter's `@id`.
- __Lookups.__ "Is this the author" is `IdentityManager.refersTo` (author-lock in PolicyInformationPoint, the save route, the editor's author-lock box). `getPagesByCreator`, `getPagesByEditor` and `getPagesSharedWith` (with `options.username`) pass the provider `IdentityManager.referencesOf(username)`, the `@id` and the username, so converted and unconverted pages both match and an orphan never does. A private page's `creator` (its container owner, a username) still matches; a public page's legacy index `creator` no longer does. `deleteTestArtifacts` matches its `author` the same way. Search by author or editor: `SearchManager` passes the same values to the provider.
- __Display.__ Wherever a page's author or editor is shown, the routes and plugins show `IdentityManager.describeReference`: `jim (urn:uuid:…)`, `bob (no account)`. JSON-LD and social cards name the author by username only. A `[vault/Title]` link on a public page resolves in its author's vaults by username (`RenderingManager`, `MarkupParser`); an `@id` or orphan never reaches a URL.
- __Existing pages.__ `convertAuthorshipAtBoot` (WikiEngine, not awaited: the site serves meanwhile) runs `convertAuthorship(ctx)` under the system context: each public page's frontmatter `author`/`editor` rewritten line by line (`rewriteFrontmatterFields`: the body, every other field and `lastModified` byte-identical, no version made), its index entry, its history's editors (`manifest.json`, in place), the tombstones (and, on the full pass, each deleted page's file and history), then the search index rebuilt from the pages once. Values get `IdentityManager.convertRecordedUser`'s answer through `conversionPass`: an account's name becomes its `@id`; a name with no account `orphan:<name>` (counted in the log at info, never on the dashboard: an orphan is the intended final state; on a shipped or add-on page, whose author is upstream's, counted apart); `migrated`, `unknown`, `import` `orphan:<value>` (counted apart, admin-only, not needing attention). The first complete pass visits every page and is recorded as `authorship-identity-ids` in `site-migrations.json`; later passes open only pages whose index entry still names something to convert. Batches of `ngdpbase.page.authorship-conversion.batch-size` (200), yielding between batches; each page's write is serialised with saves and deletes (`pageWrites`, a `KeyedSerial` by uuid), so a save during the pass is never written over. The identity store down (`canAnswer()` false, or a lookup failing mid-pass): the pass stops, "identity store unavailable, conversion postponed" on the dashboard, and the next start tries again. Logs counts only.
- __Access lists.__ A user entry of `audience` or `access[action]` is stored and converted the same way (roles, pseudo-roles and `kind:` entries kept; nothing converted without the role catalogue); the subject's principals carry its @id (PolicyInformationPoint, and `getRecentChanges`/`getPagesSharedWith` here). The editor's audience chips show `jim (urn:uuid:…)`.
- __Failures and races.__ Every page write, the conversion's included, runs under the provider's `withPageWrite(uuid)`; VersioningFileProvider's restores and purges (and the retention purge) take the same lock, and a tombstone is converted only if it is still there. A page or tombstone that fails for its own reason is skipped and counted by error class on the dashboard (`IdentityStoreUnavailableError` alone postpones the pass, also on the dashboard); the pass is then not recorded as done. These two are the only dashboard entries: orphans and frontmatter that cannot be rewritten line by line are logged at info. A legacy private tombstone (a private page deleted before vaults, with an owner and no store) has its index fields converted and no file or history to visit; an index entry whose file has no `author`/`editor` of its own is converted from the value it holds. The search index is rebuilt when a run changed pages, when the pass is first recorded done, and on a run after one that changed pages and never rebuilt it (`pending` in `site-migrations.json`). `migrated`, `unknown` and `import` are reserved usernames, and a save keeps them as orphans. A file with a UTF-8 byte-order mark is converted and keeps it.
- __Vault pages__ convert when the vault is opened (`convertVaultAuthorship(ctx, owner)`, from `WikiRoutes.adoptSealedPages` at sign-in and unlock, where the keys are live): each vault's pages, its own page index, histories and the owner's vault trash, recorded per vault (`authorship-identity-ids` in the vault's migrations record). Start-up never opens a vault.

## Configuration

```json
{
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8"
}
```

## Available Providers

| Provider | Status | Description |
| ---------- | -------- | ------------- |
| `FileSystemProvider` | Production | Filesystem with UUID naming |
| `DatabaseProvider` | Planned | SQL/NoSQL database storage |
| `S3Provider` | Planned | AWS S3 cloud storage |

## Related Managers

- [ConfigurationManager](ConfigurationManager.md) - Configuration settings
- [RenderingManager](RenderingManager.md) - Content rendering
- [SearchManager](SearchManager.md) - Page indexing and search
- [BackupManager](BackupManager.md) - Backup/restore operations

## Developer Documentation

For complete API reference, provider implementation details, and troubleshooting:

- [PageManager-Complete-Guide.md](PageManager-Complete-Guide.md)
