# Addon Page Handling

> See also: [`addons-developer-guide.md` → Seed Wiki Pages](../guides/addons-developer-guide.md#seed-wiki-pages) for the how-to, and [`addon-architecture.md`](./addon-architecture.md) for load order. This document is the reference for __where addon pages live, how they're named, and what does (and does not) sync__ to a running instance.

---

## Two locations — don't conflate them

An addon page exists in two distinct places with different rules:

| | Path | Naming | Mutability |
|---|---|---|---|
| __Source__ (ships with the addon) | `addons/<addon>/pages/*.md` | __Name-based__ (`geohazardwatch-about.md`, `Landslides.md`) | Read-only seed material; edited in the addon repo |
| __Runtime__ (in the instance) | `<data>/pages/{uuid}.md` (a vault page → `<data>/pages/vaults/{owner}/{vault}/{uuid}.md`) | __UUID-based, always__ | The live page; operator-editable |

`<data>` is the instance pages directory (`ngdpbase.page.provider.filesystem.storagedir`, under `SLOW_STORAGE`). It is the __same store as every other page__ — addon pages are not kept in the addon directory at runtime.

### Why the two naming schemes

- __Source files are name-based__ purely for human readability in the addon repo. The seeder ignores the filename entirely — it reads the frontmatter `uuid` and `slug`. A source file could be UUID-named too; there's just no benefit.
- __Runtime files are UUID-named__ because `FileSystemProvider.resolvePageFilePath()` returns `{uuid}.md` unconditionally, and the page index / slug resolution / routing all key on UUID.

> __A name-based file inside `<data>/pages/` is never indexed__ — it's an orphan. If you find `data/pages/Landslides.md` alongside `data/pages/{uuid}.md`, something copied source files into the data volume *outside* the seed pipeline. That's the class of bug tracked in [#908](https://github.com/jwilleke/ngdpbase/issues/908) (ngdpbase side) and [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) (deployment side). See [Orphans](#orphans--name-based-files-in-datapages) below.

## The seed pipeline

`AddonsManager.seedAddonPages()` runs inside `loadAddon()` on __every server boot__, right after the addon's `register()`. For each `addons/<addon>/pages/*.md`:

Since [#1406](https://github.com/jwilleke/ngdpbase/issues/1406) the addon seed hands each folder to `PageManager.seedShippedPages()`, the same seeder required pages use:

1. Parse frontmatter — a valid __`uuid`__ (the 8-4-4-4-12 hex form, not only UUID v4), a __`title`__ and a __`slug`__ are required, and two files may not share a uuid; otherwise the file is reported (an error for a domain addon, a warning otherwise, plus an admin notification).
2. __Lookup by uuid__ — a page this site holds under that uuid first gets its `addon-source-hash` backfilled if it has none and its text matches the source ([#1408](https://github.com/jwilleke/ngdpbase/issues/1408); a metadata-only save that keeps `lastModified` and writes no version). A page with no stamp whose text differs is left unstamped and logged. The page is then left to the addon's own steps (the #971 / #1003 metadata tidy-ups and nothing that changes its text: see [Updating seeded pages](#updating-seeded-pages-920-2389)), then re-indexed for search by title.
3. __Seeded once per site__ — the site's record, `${FAST_STORAGE}/seeded-shipped-pages.json` (source `addon:<name>`), lists every page it has seeded. A recorded page that is no longer live was removed on this site and is not seeded again, whatever the provider. A uuid in the trash is recorded and skipped. A site without a record starts it from its live and trashed pages.
4. Otherwise `pageManager.savePage(title, content, metadata)` writes `<data>/pages/{uuid}.md` with `addon`, `system-category` (`addon` if absent), `addon-source-category`, a default `access` for the category, `addon-source-hash`, `created` and `lastModified`, and indexes it for search by title.

The lookup is by uuid only. A source page whose __slug__ or __title__ is already used by a page with a __different uuid__ is not treated as seeded: the save is refused as a conflict. Since [#1412](https://github.com/jwilleke/ngdpbase/issues/1412) that is a status, not a boot failure — it is logged at info as `Shipped pages could not be seeded: <title> (<file>): <reason>`, with no notification, and the page shows as __UUID Mismatch__ in Required Pages Sync. An admin can reconcile it there or click __Don't Seed Here__, which records the uuid as declined for that source in `${FAST_STORAGE}/seeded-shipped-pages.json`; the seeder then skips it until the decline is undone or the page is synced explicitly.

Seeding is __boot-time only__ — there is no file-watcher and no install-event trigger. A __restart is required__ for any seed pass to run.

## What syncs to an existing instance

On restart, comparing the addon's current `pages/` against an already-seeded instance:

| Change to `addons/<addon>/pages/` | Synced? | Why |
|---|---|---|
| __New__ page (new UUID, never seeded here) | ✅ __Yes__ | Not live and not in the site's seeded record → `savePage` seeds it |
| __Updated__ content of a seeded page | 🖐 Admin | Never at start-up. Shows as Update ready in Required Pages Sync; Sync All or the row's Update button applies it to a page nobody edited here — see [Updating seeded pages](#updating-seeded-pages-920-2389) |
| __Deleted__ source page | ❌ No | There is no removal logic; the instance copy persists indefinitely ([#920](https://github.com/jwilleke/ngdpbase/issues/920) discusses a gated policy) |
| __Renamed slug__ (same UUID) | ❌ No (skipped) | The UUID guard matches — the page keeps its old slug |
| Instance page __deleted by an operator__ | ❌ No (skipped) | The site's record says it was seeded, so it was removed on purpose — also after the trash purges it, and with `filesystemprovider`, which has no trash ([#1403](https://github.com/jwilleke/ngdpbase/issues/1403), [#1405](https://github.com/jwilleke/ngdpbase/issues/1405)). It comes back through a restore from the trash or an admin's Sync in Required Pages Sync |

So __additions always flow; updates flow only when an admin presses Sync All (unedited pages) or Use shipped version; deletions and renames do not.__

Purging a trash entry whose uuid is also a live page removes only the trash file and entry; the version folder belongs to the live page and is kept ([#1403](https://github.com/jwilleke/ngdpbase/issues/1403)).

### Updating seeded pages (#920, #2389)

Every seeded page carries an __`addon-source-hash`__ in frontmatter — the trimmed SHA-256 of the body it was seeded or last synced with. __Start-up never replaces a page the site already holds.__ It adds pages that are not on the site yet, stamps a page that already matches the source ([#1408](https://github.com/jwilleke/ngdpbase/issues/1408)), and fixes metadata (category drift, author) without touching the text. A newer addon page reaches the site only through __Required Pages Sync__.

The stamp is written with a release label ([#2389](https://github.com/jwilleke/ngdpbase/issues/2389), slice 3): `addon-source-release` holds the add-on's version, and core pages carry `required-source-release` with the ngdpbase version. A stamped page whose text matches the source gets the label at boot, once (a metadata-only save that keeps `lastModified`). A stamped page that is behind gets none. The label is display only: Required Pages Sync shows "Your copy: v…" on each row and "This release: v…" once in each section header, or "an earlier release" for a copy with no label, and the text hash alone decides the state.

The state of each page is one function, `shippedPageState()` in `src/utils/addonPageSync.ts`, the same for core and addon pages ([#2389](https://github.com/jwilleke/ngdpbase/issues/2389)):

| State | Meaning | Sync All |
| --- | --- | --- |
| Same as shipped | The text matches the source and nobody edited the page here | nothing to do |
| Update ready | The source changed and the page was never edited here | replaces it |
| Edited here, not confirmed | The page was changed on this site: saved in the editor (`user-modified`, even if only the title or keywords changed), has no stamp, or its text no longer matches its stamp | leaves it |
| Edited here, and a newer version is available | Edited here, and the source also changed | leaves it |
| Kept for this site | An admin chose __Keep edited version__ in the Review dialog, and the page still calls the same plugins and has the same behaviour settings as when it was kept | leaves it |
| Kept, needs your review | Kept, but the shipped page now has a different plugin call, or a different behaviour front-matter key (such as `system-category`, `slug`, `version` or `requires-setting`), than when it was kept | leaves it |

A page with no `addon-source-hash` is never replaced: its edit state cannot be proven, so it reads Edited here, not confirmed. Since #1408 a legacy page whose text already matches the source is stamped at boot, so only legacy pages that differ remain, and an admin chooses __Use shipped version__ on each.

__Keep edited version__ is a checkbox in the Review dialog (opened from the Review button on an edited row). The dialog is titled __Review: page name__ and lists what changes how the page works above the diff. Ticking the box saves at once (the dialog says so) and writes three front-matter keys through the page door, without changing the page text or its last-modified date: `kept-edited: true`, `kept-shipped-hash` (the source version the admin looked at) and `kept-working-parts` (the plugin calls and behaviour settings on the page at that moment). The check compares those parts, not the wording, so rewording a kept page never raises a flag. When the source later changes, a kept page shows a quiet "A newer version is available" note. When the page's own plugin calls or behaviour settings change, it moves to __Kept, needs your review__ and lists each change in plain sentences ("The shipped page now shows a page total.") and ends with "Review it to decide whether to keep your version.". On a __Kept, needs your review__ page the dialog shows a __Keep edited version (I've reviewed this)__ button; it rewrites the kept baseline, the same save as ticking the box again, and the row then reads Kept for this site. If a content rule refuses the page's text, the page is not kept, and the dialog says so in one message that also says trying again will not help. The diff in the dialog leaves those three keys out, since ticking the box is not an edit. Unticking the box removes the three keys and the page reads Edited here again. Sync All never replaces a kept page, even if the request names it; the server reports it as protected. The summary chips at the top count __Kept, needs your review__ under __Edited here__ (the chip says so when you hover it); __Kept for this site__ has its own chip. A page a content filter refuses cannot be kept; nothing is written. The route is `POST /admin/required-pages/keep` and needs the `admin-system` permission; anyone else is told only a site administrator can do this.

__`ngdpbase.addons.page-reseed` is retired.__ It used to refresh unedited addon pages at every restart (default `false`). It now does nothing; boot logs *"ngdpbase.addons.page-reseed is retired; add-on pages update through Admin › Required Pages Sync"* when it is `true`. A site that had it on now sees those pages as __Update ready__ until an admin presses __Sync All__ at `/admin/required-pages` ([#513](https://github.com/jwilleke/ngdpbase/issues/513)). The status table is the preview, and the row's __Update__ button or __Sync All__ applies it on demand, no restart. __Use shipped version__ replaces an edited page, after a confirm; the edited version stays in the page history. There is no dedicated `POST /admin/addons/:addonName/reseed` REST route — Required Pages Sync is the entry point.

[#920](https://github.com/jwilleke/ngdpbase/issues/920) is __closed__, along with both follow-ups it had been holding open:

- __Removed-source-page policy__ ([#930](https://github.com/jwilleke/ngdpbase/issues/930)) — see [Source-removed pages](#source-removed-pages-930) below.
- __Unified modified-detection__ ([#931](https://github.com/jwilleke/ngdpbase/issues/931)) — the core list, the addon list and Sync all call `shippedPageState()` in `src/utils/addonPageSync.ts` ([#2389](https://github.com/jwilleke/ngdpbase/issues/2389)), so one surface cannot report a page differently from another.

### Source-removed pages (#930)

When an addon stops shipping a page it previously seeded, the instance copy is __left in place and flagged__ — nothing is deleted automatically. `AddonsManager.findOrphanedAddonPages()` narrows candidates via the indexed `system-category: addon`, attributes each to its addon through the `addon` frontmatter stamp, and diffs against that addon's current source UUID set. Detection is best-effort: with no search index available it returns `[]` rather than guessing, because a detection bug must never become a deletion.

Removal is __opt-in, per page, from Required Pages Sync__. The server re-verifies that each selected page is still genuinely source-removed before acting — the client's list is never trusted — and deletes through `PageManager` so a revertable version is kept. Pages the operator has edited are reported with `userModified` set so the flag can be weighed before removing anything.

> __Containerized instances:__ editing `addons/*/pages/` in a git repo does nothing to a running pod until the image is rebuilt/redeployed *and* the container restarts. For an image like geohazardwatch, that means bumping the addon/base-image version so the new `.md` is present, then restarting.

### Why updates default to frozen

The idempotency guard exists so an addon upgrade can never clobber a page the operator edited in-app. Updates therefore don't propagate at start-up. [Required Pages Sync](#updating-seeded-pages-920-2389) lifts this __for unedited pages only__ (Sync All) — edited pages are always left alone until an admin chooses Use shipped version. Removals still never propagate.

## A deleted instance copy is not seeded again

Start-up never replaces a page's text, and a page needs an `addon-source-hash` stamp to ever count as unedited (see the bootstrap note above).

__Try the admin surface first.__ For an unedited page, Required Pages Sync at `/admin/required-pages` updates it on demand with no restart and no config change — see [Updating seeded pages](#updating-seeded-pages-920-2389) above.

Deleting the instance file and restarting does __not__ seed it again: the site's seeded-pages record treats a removed page as removed on purpose. Bring it back from Required Pages Sync, or restore it from the trash. Operator-edited pages: start-up leaves them in place, and so does the sync surface. Deleting the source file does __not__ remove the instance copy.

## Orphans — name-based files in `<data>/pages/`

Seeding only ever writes `{uuid}.md` with the auto-set fields. A __name-based__ file in the data pages directory that lacks `addon`/`created`/`lastModified` did __not__ come through the seed pipeline — it was copied in out-of-band (a manual `cp`, a backup/restore, a volume mount, or a pre-fix image). Such files are inert (the UUID-keyed index never sees them) but clutter the store and confuse audits.

- Diagnosis: on the live instance, `inotifywait -m <data>/pages` across one restart+seed will name whatever writes them.
- Cleanup: a name-based file that has a matching `{uuid}.md` (same `uuid` in frontmatter) is safe to delete — nothing serves it.

See [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) for the canonical write-up and the addon-side handling rules (ship pages only in `addons/*/pages/`; never copy them into the data volume).

## Related

- [`addons-developer-guide.md` → Seed Wiki Pages](../guides/addons-developer-guide.md#seed-wiki-pages) — the how-to (UUID requirement, auto-set fields).
- [#442](https://github.com/jwilleke/ngdpbase/issues/442) — original first-boot seeding (shipped, closed).
- [#908](https://github.com/jwilleke/ngdpbase/issues/908) — seed idempotency + orphan investigation.
- [#920](https://github.com/jwilleke/ngdpbase/issues/920) — content-aware reseed + removal policy (closed; the start-up reseed was retired by #2389).
- [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) — addon-side orphan handling.
