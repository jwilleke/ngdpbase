---
name: UpgradeCheckManager
description: Run-once checks for each release; what an update left for an administrator to decide becomes an item on "After updating" in Admin, with one button that fixes it (#2301)
dateModified: '2026-11-07'
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
| `item(affected, viewer)` | What `viewer` is told, as `{ text, button }`, or `null` when nothing is left to decide. |
| `fix(affected, ctx)` | The button. It changes things through the normal checked and audited route for that change (for a setting, `ConfigurationManager.setProperty` with the person's context, which writes the `config-change` audit record). |

## When it runs, and what is recorded

`runAtBoot()` runs each check once on the first start under a version: the result is written to `upgrade-checks.json` in the instance data folder (`id`, version, time, names affected, and when it was fixed). A later start under the same version does not run it. A different version, whether an update, a restore of older data, or a downgrade, runs it again. A check that throws is logged and left unrecorded, so the next start tries it again.

Nothing affected: one log line (`[UPGRADE] <id> (<since>): …`) and nothing in Admin. Something affected: the same line as a warning, and an item.

## What Admin shows

- The dashboard shows one notice, linking to `/admin/upgrade`, while any item is open.
- `/admin/upgrade` ("After updating to X.Y.Z") lists the open items, each with its button. Anyone who may view admin screens sees it; the button needs `config-manage` and asks for a fresh sign-in as the configuration screen does.
- `POST /admin/upgrade/fix` runs the fix and closes the item without a restart.

## Wording

An item talks about pages, by title, and what to do. It never mentions categories, policies, permissions, configuration keys, issue numbers, `docs/` paths or logs, and names only pages the viewer may see, counting the rest. `src/upgradeChecks/__tests__/uneditablePages.test.ts` runs every registered check and fails if its text or button contains `#<digits>`, `docs/`, `ngdpbase.` or "log". A new check adds its pages to the stand-in engine in `src/test-support/upgradeChecks.ts` so the test reaches its text.

## First check: pages nobody can edit

`pages-nobody-can-edit` (#2299) replaces the "Access policies need review after the #2255 upgrade" notice. It finds each stored system category that no policy grants `page-edit` or `pushed-pages-edit` on (an add-on's category while the add-on is off is not a gap) and counts its pages with `PageManager.listCategoryPages`: public pages and the pages in the category's vault. No pages: a log line only. Pages: the item lists the titles the viewer may see (at most ten), and counts the rest ("and 2 private pages"). The button adds the policy `admins-edit-pages-no-one-could` (`page-edit` for administrators on those categories), after the same policy checks as a configuration-screen save.

## Known gaps

- A page in a vault sealed at start-up (its owner's key is not available) is not counted, so a category whose only pages are sealed shows nothing.
- A fix that applies itself, for a change that is safe and certain, is not built; every fix is a button.
- Checks run at start-up only, once the add-ons have loaded their categories into configuration.
