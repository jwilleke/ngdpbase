# Addon Page Handling

> See also: [`addon-development-guide.md`](./addon-development-guide.md) for the how-to, and [`addon-architecture.md`](./addon-architecture.md) for load order. This document is the reference for **where addon pages live, how they're named, and what does (and does not) sync** to a running instance.

---

## Two locations — don't conflate them

An addon page exists in two distinct places with different rules:

| | Path | Naming | Mutability |
|---|---|---|---|
| **Source** (ships with the addon) | `addons/<addon>/pages/*.md` | **Name-based** (`geohazardwatch-about.md`, `Landslides.md`) | Read-only seed material; edited in the addon repo |
| **Runtime** (in the instance) | `<data>/pages/{uuid}.md` (private → `<data>/pages/private/{creator}/{uuid}.md`) | **UUID-based, always** | The live page; operator-editable |

`<data>` is the instance pages directory (`ngdpbase.page.provider.filesystem.storagedir`, under `SLOW_STORAGE`). It is the **same store as every other page** — addon pages are not kept in the addon directory at runtime.

### Why the two naming schemes

- **Source files are name-based** purely for human readability in the addon repo. The seeder ignores the filename entirely — it reads the frontmatter `uuid` and `slug`. A source file could be UUID-named too; there's just no benefit.
- **Runtime files are UUID-named** because `FileSystemProvider.resolvePageFilePath()` returns `{uuid}.md` unconditionally, and the page index / slug resolution / routing all key on UUID.

> **A name-based file inside `<data>/pages/` is never indexed** — it's an orphan. If you find `data/pages/Landslides.md` alongside `data/pages/{uuid}.md`, something copied source files into the data volume *outside* the seed pipeline. That's the class of bug tracked in [#908](https://github.com/jwilleke/ngdpbase/issues/908) (ngdpbase side) and [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) (deployment side). See [Orphans](#orphans--name-based-files-in-datapages) below.

## The seed pipeline

`AddonsManager.seedAddonPages()` runs inside `loadAddon()` on **every server boot**, right after the addon's `register()`. For each `addons/<addon>/pages/*.md`:

1. Parse frontmatter — a valid **`uuid`** (UUID v4) and **`slug`** are required, else the file is skipped with a warning.
2. **Idempotency guard** — skip if a page already exists by that `slug` (`pageExists`) **or** by that `uuid` (`getPageByUUID`, added in [#908](https://github.com/jwilleke/ngdpbase/issues/908) to catch renamed-slug re-seeds).
3. Otherwise `pageManager.savePage(slug, content, metadata)` → writes `<data>/pages/{uuid}.md` with auto-set frontmatter (`addon`, `created`, `lastModified`, and `system-category: addon` if absent).

Seeding is **boot-time only** — there is no file-watcher and no install-event trigger. A **restart is required** for any seed pass to run.

## What syncs to an existing instance

On restart, comparing the addon's current `pages/` against an already-seeded instance:

| Change to `addons/<addon>/pages/` | Synced? | Why |
|---|---|---|
| **New** page (new UUID + slug, never seeded) | ✅ **Yes** | Neither guard matches → `savePage` seeds it |
| **Updated** content of a seeded page | ⚙️ Opt-in | Skipped by default; reseeded when the reseed flag is on **and** the page is unmodified (or a legacy no-hash page) — see [Content-aware reseed](#content-aware-reseed-920) |
| **Deleted** source page | ❌ No | There is no removal logic; the instance copy persists indefinitely ([#920](https://github.com/jwilleke/ngdpbase/issues/920) discusses a gated policy) |
| **Renamed slug** (same UUID) | ❌ No (skipped) | The UUID guard matches — the page keeps its old slug |

So **additions always flow; updates flow only with reseed enabled on an unmodified page; deletions and renames do not.**

### Content-aware reseed (#920)

Every seeded page carries an **`addon-source-hash`** in frontmatter — the trimmed SHA-256 of the body it was seeded with. On a later boot, `seedAddonPages` compares:

- `sha(current instance body)` vs the stored `addon-source-hash` → whether the operator has edited the page since seeding;
- stored hash vs `sha(current addon source body)` → whether the source changed.

When `ngdpbase.addons.page-reseed` is **`true`** (config-gated, **default `false`** so existing deployments are unaffected) and the source changed **and** the instance page is byte-identical to what was seeded (never operator-edited), the page is refreshed from source via `savePage` (UUID preserved, a revertable version recorded, hash re-stamped). If the page was locally modified, it is **skipped** and logged as *"update available … locally modified"*. Unchanged source is a no-op.

**Legacy pages (no `addon-source-hash`).** Pages seeded *before* this feature landed carry no stamp, so their edit-state can't be proven. Because addon pages are addon-owned content the operator opted to sync, a legacy page whose body differs from the current source **is reseeded from source** on the first enabled pass (adopting source authority) and then stamped — its prior content is kept as a revertable version, so a pre-hash hand-edit is recoverable. A legacy page already identical to source is a no-op. From the second pass on, every page is hashed and fully edit-preserving (a divergent hashed page is treated as an operator edit and skipped). If you want a legacy page to *keep* a local edit through the first enabled pass, stamp it first or leave `page-reseed` off until after you've reviewed.

**On-demand reseed (admin UI).** Beyond the boot-time pass, addon pages are surfaced in **Required Pages Sync** at `/admin/required-pages` (shipped in [#513](https://github.com/jwilleke/ngdpbase/issues/513)): an "Addon Pages" section lists each page's status (`new` / `modified` / `current`), the status table **is** the dry-run/preview, and per-status / per-selection buttons apply on demand — no restart, no persistent `page-reseed` flag. Operator-edited pages are protected and skipped there too. There is no dedicated `POST /admin/addons/:addonName/reseed` REST route — the Required Pages Sync surface is the entry point.

[#920](https://github.com/jwilleke/ngdpbase/issues/920) is **closed**, along with both follow-ups it had been holding open:

- **Removed-source-page policy** ([#930](https://github.com/jwilleke/ngdpbase/issues/930)) — see [Source-removed pages](#source-removed-pages-930) below.
- **Unified modified-detection** ([#931](https://github.com/jwilleke/ngdpbase/issues/931)) — the boot pass and the sync UI both call `evaluateSeededAddonPage()` in `src/utils/addonPageSync.ts`, so a page cannot be reported `modified` by one surface and `current` by the other.

### Source-removed pages (#930)

When an addon stops shipping a page it previously seeded, the instance copy is **left in place and flagged** — nothing is deleted automatically. `AddonsManager.findOrphanedAddonPages()` narrows candidates via the indexed `system-category: addon`, attributes each to its addon through the `addon` frontmatter stamp, and diffs against that addon's current source UUID set. Detection is best-effort: with no search index available it returns `[]` rather than guessing, because a detection bug must never become a deletion.

Removal is **opt-in, per page, from Required Pages Sync**. The server re-verifies that each selected page is still genuinely source-removed before acting — the client's list is never trusted — and deletes through `PageManager` so a revertable version is kept. Pages the operator has edited are reported with `userModified` set so the flag can be weighed before removing anything.

> **Containerized instances:** editing `addons/*/pages/` in a git repo does nothing to a running pod until the image is rebuilt/redeployed *and* the container restarts. For an image like geohazardwatch, that means bumping the addon/base-image version so the new `.md` is present, then restarting.

### Why updates default to frozen

The idempotency guard exists so an addon upgrade can never clobber a page the operator edited in-app. By default updates therefore don't propagate. The [content-aware reseed](#content-aware-reseed-920) above lifts this **for unmodified pages only** when explicitly enabled — operator-edited pages are always left alone. Removals still never propagate.

## Forcing a re-seed manually

The boot-time auto-reseed only touches unmodified pages and needs an `addon-source-hash` stamp (see the bootstrap note above).

**Try the admin surface first.** For an unmodified page, Required Pages Sync at `/admin/required-pages` reseeds on demand with no restart and no config change — see [On-demand reseed](#content-aware-reseed-920) above.

The manual route below is for the case the admin surface deliberately refuses: forcing an **operator-edited** page back to source. To force any page to re-seed from current source, including one you want to reset:

1. Delete the instance copy — `<data>/pages/{uuid}.md` (or `<data>/pages/private/{creator}/{uuid}.md` for a private page).
2. Restart the server. `seedAddonPages` re-seeds the current source on the next boot.

This discards any operator edits to that page (that's the point of deleting it). Deleting the source file instead does **not** remove the instance copy.

## Orphans — name-based files in `<data>/pages/`

Seeding only ever writes `{uuid}.md` with the auto-set fields. A **name-based** file in the data pages directory that lacks `addon`/`created`/`lastModified` did **not** come through the seed pipeline — it was copied in out-of-band (a manual `cp`, a backup/restore, a volume mount, or a pre-fix image). Such files are inert (the UUID-keyed index never sees them) but clutter the store and confuse audits.

- Diagnosis: on the live instance, `inotifywait -m <data>/pages` across one restart+seed will name whatever writes them.
- Cleanup: a name-based file that has a matching `{uuid}.md` (same `uuid` in frontmatter) is safe to delete — nothing serves it.

See [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) for the canonical write-up and the addon-side handling rules (ship pages only in `addons/*/pages/`; never copy them into the data volume).

## Related

- [`addon-development-guide.md` → Seed Wiki Pages](./addon-development-guide.md#seed-wiki-pages) — the how-to (UUID requirement, auto-set fields, cross-addon UUID conflicts).
- [#442](https://github.com/jwilleke/ngdpbase/issues/442) — original first-boot seeding (shipped, closed).
- [#908](https://github.com/jwilleke/ngdpbase/issues/908) — seed idempotency + orphan investigation.
- [#920](https://github.com/jwilleke/ngdpbase/issues/920) — content-aware reseed + removal policy + admin endpoint (open).
- [geohazardwatch#139](https://github.com/jwilleke/geohazardwatch/issues/139) — addon-side orphan handling.
