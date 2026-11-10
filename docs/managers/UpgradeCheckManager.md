---
name: UpgradeCheckManager
description: Run-once checks for each release; what an update left for an administrator to decide becomes an item on "After updating" in Admin, with one button that fixes it (#2301)
dateModified: '2026-11-10'
category: managers
code: src/managers/UpgradeCheckManager.ts
---

# UpgradeCheckManager

UpgradeCheckManager owns one fact: __which checks a release asked for and what each found__ ([#2301](https://github.com/jwilleke/ngdpbase/issues/2301)). Upgrade steps used to be one-offs (database migrations, the page-store migrations) and managers' own needs-attention banners, written for developers. A check puts what needs a decision in front of the administrator as a to-do in plain words.

## Why this manager

[Manager-SOT](Manager-SOT.md): one fact, one owner. A check's result is neither a migration (it changes nothing by itself) nor a manager's state (`markNeedsAttention` is for a subsystem that is working but needs something). No existing manager holds "what did the last update leave", so this one does.

## A check

A release registers checks in `src/upgradeChecks/index.ts`. Each has:

| Field | What it is |
| --- | --- |
| `id`, `since` | A stable id (kept in the record, never shown) and the version it shipped in. A site older than `since` skips it. |
| `detect(ctx)` | Looks for what the release affects. Returns the names affected (empty means nothing is) and one line for developers. |
| `item(affected, version)` | What `viewer` is told, as `{ text, link }`: one sentence ("7 pages can't be edited after the update to 5.43.0.") and where to go from it ("See the pages"). `null` when nothing is left to decide. It names no page. |
| `list(affected, viewer, page)` | One page (50 titles) of the list the link opens: `{ total, pages, page, pageCount, note, button }`, worked out afresh each time, or `null` when nothing is left. |
| `fix(affected, ctx)` | The button. It changes things through the normal checked and audited route for that change (for a setting, `ConfigurationManager.setProperty` with the person's context, which writes the `config-change` audit record). |

## When it runs, and what is recorded

`runAtBoot()` runs each check once on the first start under a version: the result is written to `upgrade-checks.json` in the instance data folder (`id`, version, time, names affected, and when it was fixed). A later start under the same version does not run it. A different version, whether an update, a restore of older data, or a downgrade, runs it again. A prerelease such as `5.43.0-beta.1` is a valid version but is older than `5.43.0`, so a check that shipped in `5.43.0` skips it; it runs when the site reaches `5.43.0`. A check that throws is logged and left unrecorded, so the next start tries it again. `runAtBoot` never throws: a record that is missing a part, truncated or not JSON is treated as empty (with a warning, so the checks run again), and a site version that is not a release number (such as `dev`) skips the checks with a warning. The record is written to a temporary file with a random name and renamed into place. If that write fails after a fix has been made, it is logged and the fix still counts as done.

Nothing affected: one log line (`[UPGRADE] <id> (<since>): …`) and nothing in Admin. Something affected: the same line as a warning, and an item.

## Once per version, and its limits

A run-once check looks at the site on the first start under a version, and not again under that version. So something that changes later is not seen until the next version: a category that loses its last edit policy after the check ran is found at the next version, and a page list read at start is not trusted later (see below). A start under a version the record already holds does nothing, even if the site has changed.

## Live to-dos

A `LiveUpgradeCheck` (`registerLive`) is not recorded and not run at start-up: it is worked out from the site's set-up each time Admin is shown, so it appears when the thing it looks at is there and goes when that is changed. It has no button. The one shipped is `open-write-rules`: for each allow rule that lets `anyone` (signed-out visitors) or `authenticated` (every signed-in user) do more than read, or gives page writes to a role other than admin, an item says in plain words what it allows ("The rule 'X' lets signed-out visitors edit pages in General."), with a link straight to the access policies row in Admin → Configuration. Actions other than page ones read in plain verbs ("see", "add files to") and vaults and shared folders by name. It comes from `openWriteRules` in `src/utils/pageWritePolicies.ts`. Deny rules are not in it. The "Access policies need review" item on the dashboard leaves out the allow rules this to-do lists, so a rule is shown once; it still reports denies and everything else, and the log keeps every line. A change saved in Configuration shows on the next look, with no restart.

## What Admin shows

- The dashboard shows one notice, linking to `/admin/upgrade`, while any item is open.
- `/admin/upgrade` ("After updating to X.Y.Z") lists the open items, each a sentence and a link. Anyone who may view admin screens sees it.
- `/admin/upgrade/pages/:id` is the list an item links to: each page's name as a link (`pageUrl`), 50 to a page with Previous and Next, so a thousand pages work. It is worked out when opened and names only pages the viewer may see. The button is here; it needs `config-manage` and asks for a fresh sign-in as the configuration screen does.
- `POST /admin/upgrade/fix` runs the fix, closes the item without a restart and redirects to `/admin/upgrade?result=<fixed|already|failed>`. The address carries only that key, never a page title; the page writes the words.

## Wording

An item talks about pages and what to do. It never mentions categories, policies, permissions, configuration keys, issue numbers, `docs/` paths or logs. The list page names only pages the viewer may see. (The to-do for open rules does name the rule by its id, since that is what the administrator looks for.) `src/upgradeChecks/__tests__/uneditablePages.test.ts` runs every registered check and fails if its text or button contains `#<digits>`, `docs/`, `ngdpbase.` "log", "vault" or "private". A new check adds its pages to the stand-in engine in `src/test-support/upgradeChecks.ts` so the test reaches its text.

## First check: pages nobody can edit

`pages-nobody-can-edit` (#2299) replaces the "Access policies need review after the #2255 upgrade" notice for stored categories. It finds each stored system category that no policy grants `page-edit` or `pushed-pages-edit` on (an add-on's category while the add-on is off is not a gap) and counts its public pages with `PageManager.listCategoryPages`. Pages in vaults are not counted or listed: they are their owners', and an administrator is not told about them. No pages: a log line only. Pages: the item is a count and "See the pages" ("7 pages can't be edited after the update to 5.43.0."). The count reuses the names read for up to a minute; the list page reads them afresh, so a page deleted or moved since is not named. The button, on the list page, adds the policy `admins-edit-pages-no-one-could` (`page-edit` for administrators on those categories), after the same policy checks as a configuration-screen save, and clears the item. `fix` resolves to the number of pages it opened up, and `0` when no page was left in an uncovered category (nothing is saved then); the route answers "fixed" with that count ("Administrators can now edit the 62 pages that couldn't be edited.") and otherwise with the "already fixed" message.

## Known gaps

- A fix that applies itself, for a change that is safe and certain, is not built; every fix is a button.
- Checks run at start-up only, once the add-ons have loaded their categories into configuration.
