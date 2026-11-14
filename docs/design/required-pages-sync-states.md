# Required Pages Sync: six plain states, and a "kept" mark

Design for [#2389](https://github.com/jwilleke/ngdpbase/issues/2389). It builds exactly the requirements R1–R8 agreed on that issue (Jim, 2026-11-14). Nothing here is built yet.

## Prior work

Searched on 2026-11-14 at master `4e2902a9`: `docs/` (guides, design, architecture), `gh pr list` and `gh issue list` with `--state all --search "required pages"`, and `git grep` for `required-source-hash`, `addon-source-hash`, `user-modified`, `bulkOutdated`, `pushToSource` and `isRequiredPage` in `src/`, `views/` and the tests.

What exists, and what it covers:

| Where | What it gives us | Covers |
| --- | --- | --- |
| #1395 (closed), `src/utils/addonPageSync.ts` | `pageSourceHash` and the `required-source-hash` stamp. `evaluateSeededAddonPage` compares source, live body and stamp | The inputs R1 needs: live hash, stamped hash, shipped hash. Not the six states |
| #920, #931, `AddonsManager.seedAddonPage` | The same stamp for add-on pages, as `addon-source-hash`. The boot pass and the admin screen share one evaluator | The add-on half of the same inputs |
| #920, `AddonsManager.reconcileSeededAddonPage`, config key `ngdpbase.addons.page-reseed` (default `false`) | The add-on start-up reseed: when the key is on, a page whose source changed and whose live copy matches its stamp (or has no stamp) is replaced at boot, with no admin action | The path Q2 removes. Replacing pages moves to Required Pages Sync |
| #1408, `PageManager.backfillShippedPageStamp` | Stamps an unstamped page only when its body equals the source. A metadata-only save that keeps `lastModified` | The pattern for writing R3's label and R2's mark without a new version |
| #1871, #1872, `WikiRoutes.markBulkOutdated` | Sync All skips `userModified` rows, and the button counts only what it will sync | Part of R5. Today's rule is "not user-edited", not "Update ready" |
| #1918, #1919, `views/_sync-button.ejs`, `syncRowState` | One status word per row (`current` / `modified` / `new`), Force Sync with a confirm | The row UI R1 replaces. Force Sync is the "Use shipped" action |
| #1412 | A site can decline a shipped page it will not take | Separate feature; unchanged |
| `WikiRoutes.savePage` (~4300–4420) | A save of a shipped copy sets `user-modified` and notifies admins ("Required page edited in wiki UI") | The trigger for R7's "edited here". Keeps working as is |
| `views/_basicEditor.ejs` lines 14–21 | The banner R8 replaces | R8's starting text |
| #1464 (open) | A door for re-identifying a page | Unrelated |

Not found anywhere: a "kept" mark, a release label, any working-parts comparison, or any check that the site runs from a source checkout. __No requirement already exists, so the design goes ahead.__

Three places where today's code conflicts with the agreed requirements or Jim's design answers. All are changed here:

1. __A page with no stamp counts as reseedable today.__ `evaluateSeededAddonPage` returns `outdated` when there is no stamp and the body differs. Both the add-on boot pass and the core Sync All then replace it. R7 says such a page is "Edited here, not confirmed" and is never replaced automatically. The shared evaluator changes (slice 1).
2. __`user-modified` does not block the add-on boot pass for a page whose body matches its stamp.__ R7 says any page flagged `user-modified` is not confirmed and never replaced. The new evaluator reads the flag. Core Sync All already skips `user-modified` pages, so this fixes the add-on side of it, and Q1 (decided, below) confirms the rule.
3. __The add-on start-up pass replaces pages on its own__ (when `ngdpbase.addons.page-reseed` is on; it defaults to off). Jim's Q2 answer (2026-11-14): add-on pages are handled exactly like required pages, inside Required Pages Sync, so start-up stops replacing pages, including unedited ones. The replacing branch of `reconcileSeededAddonPage` is deleted (slice 1). See "What start-up does".

Out of scope: shipped forms (#1909, #1919). They have their own sync rows. R1 covers pages, core and add-on.

## Data flow

```mermaid
flowchart LR
  subgraph SHIPPED["Shipped with the software (read-only to the site)"]
    REQ["required-pages/ (core pages, release = ngdpbase version)"]
    ADD["add-on pages/ (release = add-on version)"]
  end

  subgraph SITE["This site's live pages (data/pages)"]
    LIVE["live page body"]
    STAMP["front-matter stamps:<br/>required-source-hash / addon-source-hash<br/>required-source-release / addon-source-release"]
    KEPT["front-matter 'kept' mark:<br/>kept-edited, kept-shipped-hash,<br/>kept-working-parts"]
    FLAG["user-modified flag (set by an editor save)"]
  end

  subgraph SERVER["Server: one state function, shared by the screen and Sync"]
    STATE["shippedPageState(): six states"]
    WORK["workingParts(): plugin calls, forms, page settings"]
    BOOT["Start-up seeding: adds pages not on the site yet,<br/>stamps pages that already match. Never replaces a page"]
  end

  subgraph BROWSER["Admin's browser (admin-system permission)"]
    LIST["Required Pages Sync list + summary line"]
    DLG["Review dialog: diff, 'Keep edited version' checkbox"]
    USE["Use shipped version (asks first)"]
    ALL["Sync All"]
  end

  REQ --> STATE
  ADD --> STATE
  REQ --> WORK
  ADD --> WORK
  REQ --> BOOT
  ADD --> BOOT
  LIVE --> STATE
  STAMP --> STATE
  KEPT --> STATE
  FLAG --> STATE
  KEPT --> WORK
  STATE --> LIST
  WORK --> LIST
  LIST --> DLG
  LIST --> USE
  LIST --> ALL

  BOOT -- "new pages only, plus stamps on pages that already match" --> LIVE
  DLG -- "tick or untick: writes the kept mark only" --> KEPT
  USE -- "replaces body, clears kept mark and user-modified, restamps" --> LIVE
  ALL -- "only rows in state Update ready, core and add-on alike; the server checks each again" --> LIVE
  ALL -. "never touches Kept, Edited here, Both changed" .-> LIVE
  LIVE -. "Push to Source: only when required-pages/ is in a git work tree" .-> REQ
```

Trust boundaries:

- The shipped folders are written only by a release, or by Push to Source on a source checkout (R6). An installed site never writes to them.
- The live pages are written by editor saves (which set `user-modified`), by Sync (core and add-on pages alike), by start-up seeding for pages that are not on the site yet, and by the new Keep action, which changes front-matter only. Start-up never replaces the body of a page that exists. That is the one write path Q2 removes.
- Every change from the browser goes through the admin route, which requires `admin-system`, a CSRF token, and a re-check of each page's state on the server. The browser's idea of a row's state is never trusted.

What __Sync All__ may touch: only pages whose server-computed state is __Update ready__ at the moment of the request. What it may not touch: Same as shipped (nothing to do), Kept for this site, Kept needs your review, Edited here not confirmed, Both changed. Pages that are not on the site yet (__New__) keep their existing separate __Sync All New__ button.

## One state function

Today three places decide "is this page edited?" with slightly different rules: the core list, the add-on list (both through `syncRowState`) and `PageManager.syncShippedPages`. The add-on boot pass is a fourth. They get one function, in `src/utils/addonPageSync.ts`, replacing `syncRowState`. The boot pass stops being a caller: it no longer replaces pages, so it has no state to decide (see "What start-up does"):

```ts
shippedPageState({
  shippedBody, liveBody,
  stamp,            // required-source-hash / addon-source-hash, or undefined
  userModified,     // front-matter user-modified === true
  kept,             // front-matter kept-edited === true
  keptShippedHash,  // front-matter kept-shipped-hash
  keptParts,        // front-matter kept-working-parts
  shippedParts      // workingParts() of the shipped page
}): { state, newerAvailable, workingChanges }
```

The core list, the add-on list, `syncShippedPages` (non-force) and the unit tests all call it, so they cannot drift (the lesson of #931). Core and add-on pages go through the same call with the same inputs. Only the stamp key (`required-source-hash` or `addon-source-hash`) and the release label's source differ.

## R1: the six states

Inputs, per page that exists both on the site and in the shipped folder:

- __L__ — hash of the live body (`pageSourceHash`, trimmed).
- __T__ — the stamped source hash, or none.
- __S__ — hash of the current shipped body.
- __K__ — the kept mark is present.
- __U__ — `user-modified` is true.
- __W__ — for a kept page: the shipped page's working parts differ from the parts recorded when it was kept (R4).

Derived: __E__ (edited here) = U, or T is none, or L ≠ T. __C__ (shipped changed) = T exists and S ≠ T. With no stamp, C is false: we cannot know, and R7 wants "Edited here, not confirmed" for it.

Rows are evaluated top to bottom; the first match wins.

| # | Condition | State | In Sync All | In the summary count |
| --- | --- | --- | --- | --- |
| 1 | L = S and not U | __Same as shipped__ | no | no |
| 2 | K and W | __Kept, needs your review__ | no | yes |
| 3 | K and not W | __Kept for this site__ (quiet "newer version available" when S ≠ the kept shipped hash) | no | no |
| 4 | E and C | __Both changed__ | no | yes |
| 5 | E and not C | __Edited here, not confirmed__ | no | yes |
| 6 | C (so not E) | __Update ready__ | __yes__ | no |

The table is complete. A page that reaches row 6 is not U, has a stamp (E is true without one), and has L = T. It did not match row 1, and U is false, so L ≠ S. That forces S ≠ T, which is C. No seventh case exists.

Notes:

- __Decided (Q1, Jim, 2026-11-14): a page saved with only its title or keywords changed is "Edited here, not confirmed".__ Its text still matches what shipped (L = S), but the editor save set `user-modified` (U), so row 1 does not match. It lands in row 5, or row 4 when a newer version also shipped, and is never replaced without an admin. This is why row 1 reads "L = S and not U". An earlier draft of this table had plain "L = S", which would have shown such a page as Same as shipped. Only U separates the two, so U is what the evaluator must read.
- What the admin does with such a page: tick __Keep edited version__ (it becomes Kept for this site), or press __Use shipped version__ (title and keywords go back to what shipped, and the flag clears). The Review dialog has no text difference to show, so it shows the front-matter difference instead ("Title: …", "Keywords: …").
- A kept page (K) is checked before E, so a kept page whose body equals the shipped body, with `user-modified` set, reads Kept for this site. With `user-modified` not set it reads Same as shipped (row 1). The mark stays either way, so a later edit is still a kept page.
- Add-on pages and core pages use the same function and the same table. An add-on page in Update ready is never replaced at start-up. It changes only through Sync All or its row's button, like a core page (Q2, decided).
- A live copy with malformed front-matter keeps today's behaviour: it is shown as Update ready so a re-sync heals it. That is the one row not derived from the table.
- __New__ and __UUID mismatch__ (the page is not on the site, or its name is taken) are not part of the six. They stay as they are, with their own buttons.

## R2: "Keep edited version"

Stored on the live page's front-matter, three flat keys (flat, so search indexing and the editor carry-forward need no change):

```yaml
kept-edited: true
kept-shipped-hash: <pageSourceHash of the shipped body the admin saw when ticking>
kept-working-parts: [ ...canonical strings from workingParts() of that shipped body... ]
```

Who and when are not stored on the page. They are in the audit entry and page history, because the write goes through the page door.

- __Written__ by a new route, `POST /admin/required-pages/keep`, body `{ source, uuid, keep: boolean }`. The page door saves it with `rawFrontmatter: true` and `preserveLastModified: true`, the way `backfillShippedPageStamp` does: front-matter only, no new version, and Recent Changes stays quiet. It is audited as an edit.
- __Guard:__ the same permission as the rest of the screen, `admin-system`, plus CSRF. Page-level permissions do not matter: the body is not touched.
- __Survives syncs and upgrades.__ The editor's save carries forward all front-matter it does not manage (`WikiRoutes.savePage`, "step 1"), so editing a kept page keeps it kept. A normal Sync never touches a kept page: `syncShippedPages` without `force` protects every row except Update ready (and Same as shipped, which has nothing to change), using `shippedPageState`. A release upgrade replaces nothing on its own, and neither does start-up, for core or add-on pages (Q2), so nothing but an admin's Sync can reach a kept page.
- __Undone__ by unticking the box and saving the choice (`keep: false` deletes the three keys), or by __Use shipped version__. `saveShippedPage` builds the page from the shipped front-matter, so the kept keys and `user-modified` are gone after it.
- Ticking again after a "needs your review" flag rewrites `kept-shipped-hash` and `kept-working-parts` from the current shipped page. That is what clears the flag (D3).

## R3: release label

Display only. The content hash still decides the state.

| Page | Key on the live copy | Value |
| --- | --- | --- |
| Core required page | `required-source-release` | `ngdpbase.version` at the time of the write, e.g. `5.45.0` |
| Add-on page | `addon-source-release` | that add-on's own version from its manifest |

- __Written__ wherever the stamp is written: `PageManager.saveShippedPage` (start-up seeding of a new page, Sync All, a row's Update, Use shipped). Add-on pages go through the same function (`addonPagesSource`), and the old add-on reseed branch that wrote the stamp itself is gone (Q2). One helper returns `{ stampKey, releaseKey, release }` per source.
- __Backfilled__ for pages already on a site: `backfillShippedPageStamp` already runs for present pages. It also writes the label when the page is Same as shipped (its body equals the shipped body, so the release it matches is the current one). A stamped page that is behind gets no label, and the screen says "an earlier release".
- __Shown__ as "Your copy: v5.43.0 · This release: v5.45.0", or "Your copy: an earlier release" when there is no label. No commit hash.

## R4: detecting a working change

Used for kept pages only. A kept page is compared against the shipped page as it was when kept (`kept-working-parts`), not against the live page. That avoids flagging a page forever for the edits the admin deliberately kept.

__Parser.__ The tokens are the ones the renderer already uses: `PluginSyntaxHandler` matches `(?<!\[)\[\{(\w+)\s*([^}]*)\}\]` and has `parsePluginParameters`. The regex and the parameter parser move into a small shared module, `src/utils/pluginCalls.ts`, and the handler imports them. A second copy would drift from the renderer. `workingParts(shippedBody, shippedFrontmatter)` returns a sorted list of canonical strings:

1. __Plugin calls and form elements.__ Every `[{Name params}]` in the body. Form elements (`[{FormOpen ...}]`, `FormInput`, `FormButton`, etc.) have the same shape, so one scan covers both. ACL markup (`[{ALLOW ...}]`, `[{DENY ...}]`) has that shape too and counts: it changes who can see the page. String: `plugin:Name key="value" key="value"`, keys sorted, whitespace collapsed.
2. __Front-matter keys that change behaviour.__ A named list, `WORKING_FRONTMATTER_KEYS`, in the same module: `system-category`, `audience`, `requires-setting`, `version`, `effective`, `private`, `status`, `author-lock`, `slug`, `acl`. String: `setting:key=value`. A second list, `WORDING_FRONTMATTER_KEYS`, names the keys that do not matter (`title`, `description`, `user-keywords`, `system-keywords`, `author`, `editor`, `created`, `lastModified`, the stamps, the kept mark).

__False positives, and how they are avoided:__

- Calls inside fenced code blocks and inline code, and escaped `[[{...}]`, are shown to a reader, not run. They are stripped before the scan, as the renderer does.
- Variables `[{$name}]` are text substitution, not working parts, and the regex's `\w` does not match `$`.
- Order does not matter (sorted), and neither does whitespace or parameter order.
- Presentation-only parameters are ignored: `class`, `style`, `width`, `height`, `alt`. The list is one constant, kept short.
- Body text between `[{Name}]` and `[{/Name}]` is wording. Only the opening call counts.
- __A test makes a missing classification fail the build.__ It reads every front-matter key in `required-pages/` and in each add-on's `pages/` and fails if one is in neither list, so a new behaviour key cannot slip through as "wording".

__Showing the change.__ "Kept, needs your review" lists the parts added, removed or changed, in plain words: "This page now calls Calendar with calendars=family." A kept page with only wording changes shows only "Newer version available (v5.45.0)".

__Known limit.__ A page kept before this ships has no baseline, because nothing starts kept (R7). The first time an admin ticks the box, the baseline is written. No back-computation is needed.

## R5: the summary line, and what Sync All does

At the top, one line, counting core and add-on pages together:

- "__2 pages need a decision.__ Sync All updates only pages marked Update ready (3). Pages edited on this site are never changed by Sync All."
- With none: "Nothing needs a decision. Sync All updates the 3 pages marked Update ready."
- With none at all: "Everything matches what shipped."

The count is rows in states 2, 4 and 5 of the table (Kept needs your review, Both changed, Edited here not confirmed). Same as shipped, Kept for this site and Update ready do not count.

__Sync All__ replaces "Sync All Outdated". It sends only the uuids the server marked Update ready (`bulkOutdated` becomes `state === 'update-ready'`). The server re-evaluates each uuid with `shippedPageState` and skips (reports as protected) any that is no longer Update ready. A forged request cannot overwrite an edited page. The existing `data-testid="sync-all-outdated"` stays for the E2E tests.

## R6: Push to Source only from a source checkout

- __Detection.__ `isSourceCheckout(requiredDir)` in a new `src/utils/sourceCheckout.ts`: true when the directory *containing* `required-pages/` has a `.git` entry (a folder, or a file for a git worktree). The parent only, not any ancestor, so an installed copy under a project's `node_modules` inside someone's repo is not mistaken for a checkout. No `git` binary is needed, and none is spawned. It is a cheap `stat`, checked on each request, so tests need no restart. If `requiredpagesdir` is moved elsewhere the result is "no": hiding is the safe error.
- __Screen.__ The page's render data carries `canPushToSource`. When false, neither Push to Source button shows (the row button and the "not in the shipped set" list), and the help text about Push to Source is removed.
- __Route.__ `adminSyncRequiredPages` refuses a request with a non-empty `pushToSource` when `isSourceCheckout` is false: HTTP 403, `"This site is not running from a source checkout, so there is no shipped copy to change. Nothing was changed."` The whole request is refused, like the existing "A page id is not valid" refusal.
- __Where it shows,__ the button is unchanged apart from a one-line confirm (`data-confirm`): "Make this site's text the version every release ships?" R6 asks only for hiding and refusing; the confirm is a single attribute and is the only addition.

## R7: upgrade path

No data migration. The states are derived on every read, so on the first start after upgrade:

- A page with `user-modified`, or with no stamp and a body that differs from the shipped one, lands in __Edited here, not confirmed__, or __Both changed__ when a newer version also shipped. It is shown once, with its diff. Welcome and Request access on The Fairways are the cases Jim named.
- Nothing starts as Kept. No kept key is written by the upgrade.
- Nothing is replaced automatically. The two code paths that could are changed in slice 1: core Sync no longer treats "no stamp" as replaceable, and the add-on start-up pass no longer replaces any page (Q2).
- A page with no stamp whose body equals the shipped body (and no `user-modified` flag) is still stamped by the existing `backfillShippedPageStamp`, and now also gets its release label. It reads Same as shipped.
- A page saved with only its title or keywords changed reads Edited here, not confirmed (Q1, decided), not Same as shipped.
- The existing notification ("Required page edited in wiki UI") keeps working. It links to the same screen.

## What start-up does, and no longer does (Q2)

Jim's answer: add-on pages are handled exactly like required pages, inside Required Pages Sync. Start-up seeding (`PageManager.seedShippedPages`, run for core pages at boot and for each add-on by `AddonsManager.seedAddonPages`) keeps its first-time job and loses its replacing job.

Still does:

- __Adds a page that is not on the site yet__, from the core `required-pages/` folder or an add-on's `pages/` folder, with its stamp (and, in slice 3, its release label). This is the only case where start-up writes a page body.
- __Stamps a page that already matches__ what shipped, with no stamp (`backfillShippedPageStamp`, #1408). Metadata only, no new version. It never clears `user-modified`, so a flagged page stays Edited here, not confirmed (Q1).
- __Leaves alone__ a page the site deleted or declined (#1403, #1412). Unchanged.
- __Fixes add-on page metadata, never the body__: `system-category` drift (#1003) and the author re-stamp (#2255), each done once through one metadata-only save. These stay as they are. They change how a page is filed, not what it says, and the body hash does not move.

No longer does:

- __Replace a page's body or front-matter from the shipped copy__, whatever its state, unedited pages included. The branch of `reconcileSeededAddonPage` that runs `savePage` with the shipped body, and the `lastReseedCount` it feeds, are deleted. A newer add-on page now shows as __Update ready__ and changes only through Sync All or its row's Update button.
- __Read `ngdpbase.addons.page-reseed`.__ The key no longer does anything. It stays readable so an old config does not fail, boot logs a one-line warning when it is `true` ("page-reseed is retired; add-on pages update through Admin › Required Pages Sync"), and the docs that describe it (`docs/platform/addon-page-handling.md`, `docs/guides/addons-developer-guide.md`, `docs/platform/deployment/how-to-deploy.md`, `docs/planning/addons.md`) are updated in slice 1.
- __Log "update available … locally modified"__ per page per boot. The screen shows it.

Consequence to say plainly: a site that had `page-reseed` on (the key defaults to off, so most do not) used to get unedited add-on pages refreshed at every restart. After this change those pages show Update ready until an admin presses Sync All. The summary line (R5) counts only rows that need a decision, and Update ready is not one, so the top of the screen should tell the admin how many pages are ready ("Sync All updates the 3 pages marked Update ready"). It does.

## R8: the editor banner

Replaces `views/_basicEditor.ejs` lines 14–21 (text for a person who is not a developer; no file paths, no issue numbers):

> __This page came with the software.__ Your changes stay on this site: an update will not replace them. An admin will see this page in the list at [Admin › Required Pages Sync](/admin/required-pages) and confirm that the change was meant. If it was a mistake, the admin can put the original back.

## Plain-language text

State labels and the line under each. A page's release label goes after it: "Your copy: v5.43.0 · This release: v5.45.0".

| State | Label | Line under the label | Buttons |
| --- | --- | --- | --- |
| Same as shipped | Same as shipped | (none) | (none) |
| Update ready | Update ready | A newer version came with this release. This page has not been changed on this site. | __Update__ |
| Kept for this site | Kept for this site | This site keeps its own version. *When newer:* A newer version is available (v5.45.0). | __See changes__, __Use shipped version__ |
| Kept, needs your review | Kept, needs your review | The newer version changes how this page works: *(list)*. Your kept version does not have that. | __Review changes__, __Use shipped version__ |
| Edited here, not confirmed | Edited here, not confirmed | This page was changed on this site. Choose whether to keep your version. | __Review changes__, __Use shipped version__ |
| Both changed | Edited here, and a newer version is available | This page was changed on this site, and a newer version also shipped. Choose what to do. | __Review changes__, __Use shipped version__ |

__Review dialog__ (the existing diff modal, extended). Title: "Review: *page name*". It shows the diff, and above it the list of working changes if there are any ("Changes how the page works"). Then:

- Checkbox: __Keep edited version__. Help: "This site keeps its own version. Updates will not replace it. You will be told if a later release changes how this page works." Ticked at the start for a kept page.
- For a page whose text matches what shipped but is flagged as edited (Q1), the dialog says "The text is the same as what shipped. Only the page's title or keywords were changed on this site." and shows those differences.
- Buttons: __Save choice__, __Use shipped version__, __Cancel__.
- __Use shipped version__ asks: "Replace the changes made to "*page name*" on this site with the shipped version? Your version stays in the page history." (existing Force Sync question, reworded). The button was "Force Sync".

__Not used on screen:__ "Modified", "Force Sync", "user-edited", `required-pages/`, issue numbers, hash and key names. The Same as shipped state's old word was "Current".

## Tests: what proves each Verified-when item

Unit tests (Vitest, next to `WikiRoutes.requiredPagesSourceHash.test.ts` and `syncPartialsView.test.ts`):

- `addonPageSync.state.test.ts`: the decision table above, one case per row, plus each edge in the notes (flag with a body equal to the shipped body reads Edited here, not confirmed (Q1), flag with a body equal to its stamp, no stamp, kept with L = S with and without the flag, malformed front-matter). Each case runs once with the core stamp key and once with the add-on stamp key, with the same answer.
- `pluginCalls.test.ts`: `workingParts` — reordered params are equal, a changed param differs, a call in a code fence is ignored, `[{$var}]` is ignored, an added `[{Calendar}]` differs, a changed `system-category` differs, a changed `title` does not, and the classification test over every key in `required-pages/` and add-on `pages/`.
- `sourceCheckout.test.ts`: temp dirs for a checkout (`.git` folder, `.git` file), an installed folder, and a folder inside a repo's `node_modules`.
- `PageManager.syncShippedPages` tests: a kept page, a flagged page with unchanged text and an unstamped differing page are protected from Sync All; Use shipped clears the kept keys. The same cases for an add-on page source.
- `AddonsManager` start-up tests (`AddonsManager.test.ts`, the `#920` block). The cases that expect a reseed (reseeds an unmodified page, reseeds a legacy page) are replaced by their opposite: with `page-reseed` on or off, a page whose source changed is __not__ saved at boot, whatever its state (unedited, edited, legacy, flagged). Kept: a missing page is still seeded with its stamp, an unstamped matching page is still stamped, the category and author fixes still run, and a `page-reseed: true` config logs the retirement warning once. The "reseeds" tests are written first as failing tests against today's code (red), then the branch is deleted (green).

Route tests:

- `WikiRoutes.requiredPagesStates.test.ts`: the list shows the right state for a never-edited page, an edited page, an edited-and-kept page, a kept page with a changed plugin call, and a no-stamp page.
- The keep route: needs `admin-system` (403 otherwise), writes the three keys, `keep: false` removes them, no body change, no new version.
- Sync All with a forged uuid list that includes a kept page changes nothing for it.
- Push to Source on a non-checkout: 403, nothing written to the shipped folder.

E2E (`tests/e2e/admin-required-pages-states.spec.ts`, Playwright, as the other `admin-*.spec.ts` files):

| Verified when (issue #2389) | Test |
| --- | --- |
| Welcome edited shows "Edited here, not confirmed" with its release label; after ticking Keep it shows "Kept for this site" and Sync All does not change its body | Edit Welcome as admin, open the list, check the label and release text, open the dialog, tick, save, check the label, press Sync All, read the page body |
| A never-edited page with a changed shipped body shows "Update ready" and Sync All updates it | Change a shipped page in a fixture add-on, restart or rescan, check the label, __read the page body and see it did not change at start-up (Q2)__, press Sync All, read the page body again |
| A kept page whose new shipped version changes a plugin call shows "Kept, needs your review" | Keep a page, change a plugin call in the fixture shipped page, check the label and the listed change |
| On an installed site, no Push to Source button, and the route refuses it | The E2E instance is an installed layout: assert no button, and a direct `POST` returns 403 |

## Slicing

Four slices, in build order. Each can ship alone, and the screen is never left half-changed.

1. __The state function and the safe defaults__ (R1 minus the kept mark, R7, R5's rule). `shippedPageState` without K and W. Core list, add-on list and `syncShippedPages` all call it. The four states that need no new data (Same as shipped, Update ready, Edited here not confirmed, Both changed) show with the new labels, and the summary line and Sync All use it. No-stamp pages stop being replaced, and a `user-modified` page with unchanged text reads Edited here, not confirmed (Q1). __The add-on start-up reseed is removed in this slice (Q2):__ the replacing branch of `reconcileSeededAddonPage`, `lastReseedCount`, and the `page-reseed` flag's effect, with the retirement warning and the four docs that describe the flag. It belongs here, not later, because the slice makes the add-on rows' Update button and Sync All the only way to update an add-on page. Removing the reseed any later would leave two paths that can replace an add-on page, and slice 1's own promise (Sync All is the only thing that changes an Update ready page) would be untrue for add-ons. Unit and route tests, written red first (see Tests). *Verified when:* a page never edited with a changed shipped body shows Update ready and Sync All updates it; an edited page shows Edited here, not confirmed and Sync All leaves it; a page saved with only its title changed shows Edited here, not confirmed; a changed add-on page is not replaced by a restart, shows Update ready, and is replaced by Sync All.
2. __Keep edited version__ (R2, R4, rows 2 and 3). The keep route, the three front-matter keys, the Review dialog with the checkbox, `pluginCalls.ts` and `workingParts`, and the two kept states with the review list. *Verified when:* tick Keep, see Kept for this site, Sync All leaves it; change a plugin call in the shipped page, see Kept, needs your review.
3. __Release label and editor banner__ (R3, R8). The release keys, written with the stamp and backfilled, shown on the rows. The new banner. *Verified when:* a row shows "Your copy: v… · This release: v…"; editing Request access shows the new banner.
4. __Push to Source on source checkouts only__ (R6). `isSourceCheckout`, the hidden buttons, the 403, the confirm. Independent of the others, so it can go first if Jim wants The Fairways cleaned up sooner. *Verified when:* on an installed site there is no Push to Source button and a direct request is refused.

Slice 4 touches different files from 1–3 and can be built in parallel. Slices 1 → 2 → 3 are in order: 2 needs the state function, and 3 shows a label on rows that 1 defines.

The slice plan still stands: four slices, same order, same dependencies. Only slice 1 grew, by the start-up change and the Q1 rule. Slice 4 is still independent of the rest.

## Decided

Both questions the requirements left open were answered by Jim on 2026-11-14 and are built into the text above.

- __Q1: yes (2026-11-14).__ A required page saved with only its title or keywords changed, so its text still matches what shipped (`user-modified` set), is Edited here, not confirmed. It is never replaced without an admin. Declined: treating it as unchanged and letting Sync replace it. Built into: row 1 of the decision table (L = S and not U), the R7 upgrade path, the Review dialog text, the tests, and slice 1.
- __Q2: add-on pages are handled exactly like required pages, inside Required Pages Sync (2026-11-14).__ They get the same states, the same Keep edited version and the same Sync All, with no separate path. The add-on start-up reseed stops replacing pages on its own, including unedited ones. Start-up still seeds pages not on the site yet and stamps matching pages. A newer add-on page shows as Update ready and changes only through Sync All or its row's button. Declined: keeping the automatic replacement at start-up for unedited add-on pages. Built into: the data-flow diagram, "What start-up does, and no longer does", the state function's callers, the tests and slice 1.
