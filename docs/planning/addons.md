# Domain Addons — Planning Notes

Working notes on the "Domain addon" concept: what it is, how its pages are identified, and who may edit them. Not yet an implementation plan — decisions and open questions, captured as they settle.

For the implemented addon subsystem see [`../platform/addon-architecture.md`](../platform/addon-architecture.md). For slug rules see [`../platform/addon-identity-contract.md`](../platform/addon-identity-contract.md).

---

## 1. What a Domain addon is

A __Domain addon__ is a specific packaging of ngdpbase plus __industry-specific addons that do not exist in ngdpbase core__. It is a *distribution*, not a single module — `geohazardwatch` (volcano/geology) and a condo-management build are the shape.

Consequence: "addon pages" on a domain site span __several addon names__, not one. Any ownership or ACL rule should therefore key on "page was seeded by an addon", with per-addon override available — not on a single addon identity.

### The two addon types

Every addon is exactly one of two types, declared in its `package.json` `ngdpbase` manifest:

```jsonc
{ "ngdpbase": { "type": "domain" } }   // or "additive" — the default when unset
```

| | __Domain__ | __Additive__ |
|---|---|---|
| Purpose | __Is__ the site's identity and reason for existing | __Augments__ a site that already has its own identity |
| Answers | "What *is* this site?" | "What else can this site do?" |
| Per instance | __Exactly one__, permanently (decision below) | Any number |
| Examples | `geohazardwatch` (volcano/geology), a condo-management build | `calendar`, `forms`, `journal`, `elasticsearch` |
| Ownership | Its own repo and release cadence | Ships with the platform, or independently |
| Removing it | Leaves a generic wiki with orphaned content | Leaves the site intact, minus one capability |

The clearest test: __remove the addon and ask what is left.__ Remove `calendar` from The Fairways and it is still The Fairways. Remove `geohazardwatch` from geohazardwatch.com and there is no site — just an empty platform.

A Domain addon is a *distribution*: ngdpbase plus the industry-specific addons that do not exist in core. So "the domain addon's pages" on a real instance may span several addon names, which is why ownership rules key on "was seeded by an addon" rather than on one addon identity (see §2).

__Distribution model is orthogonal.__ `bundled` / `drop-in` / `packaged` describes *how the code arrives*; `domain` / `additive` describes *what it means to the site*. A domain addon may be bundled, drop-in or packaged — geohazardwatch is packaged (npm), while all four bundled addons are additive. The platform makes no trust distinction between models.

### What `type: 'domain'` actually does today

Being honest about the gap between the concept and its current mechanics — three behaviours, all in `src/managers/AddonsManager.ts`:

1. __Single-domain guard__ (~L998). The first addon declaring `type: 'domain'` is recorded as `domainAddonName`. A second is __downgraded to `additive` with a `logger.warn`__ and loads anyway. See the decision below for why that failure mode is now wrong.
2. __`domainDefaults` injection__ (~L1086). Manifest config keys are applied via `setRuntimeProperty` before `register()`, skipping any key the operator has explicitly set. Ephemeral — this boot only, never written to disk.
3. __Identity-mismatch severity__ (~L524). When an addon's module `name` disagrees with its canonical slug, a domain addon logs at __error__ while an additive one logs at __warn__ — on the reasoning that a domain addon's identity *is* the site's identity.

Two caveats worth knowing before leaning on the type:

- __`domainDefaults` is not type-gated.__ `applyDomainDefaults` checks only that the key exists, so an *additive* addon shipping `domainDefaults` has them applied identically. The name implies a restriction the code does not enforce.
- __Theme deployment is not type-gated either.__ Any addon shipping `theme/theme.json` gets it copied on first load (#443).

So `type: 'domain'` currently earns a guard, a log level, and a config-injection hook that additive addons can also use. It is closer to a __declaration of intent__ than an enforced capability. That is worth knowing when deciding whether to build on it: if a future rule needs to distinguish the two, it will mostly need writing from scratch rather than hooking into existing enforcement.

### DECISION (2026-07-25): one Domain addon per site, permanently

There will never be two domain addons in the same site. This is a product decision, not a defensive guess.

__Implication for enforcement.__ `AddonsManager` currently *downgrades* a second `type: 'domain'` addon to `additive` and logs a warning (see addon-architecture §2c step 1, §12). That is the wrong failure mode now that the constraint is firm:

- It repeats the silent-misconfig shape that caused the 2026-05-10 `geohazardwatch.com` outage (#671), which we fixed by making `assertConfiguredAddonsExist` __refuse to boot__ (#672).
- A warning in a boot log is not seen.

__Proposed:__ a second domain addon should refuse to start, consistent with #672. Same argument applies to discovery's "first occurrence wins" on duplicate slugs, which is also silent today.

---

## 2. Defining an "addon page"

### Use `addon`, not `system-category`

`AddonsManager` stamps every seeded and reseeded page (`src/managers/AddonsManager.ts` ~L775):

```js
addon: addonName,
'system-category': (parsed.data)['system-category'] ?? 'addon',
'addon-source-hash': pageSourceHash(parsed.content)
```

`addon` is set __unconditionally__ and is a declared first-class field in `src/types/Page.ts:82` — *"Name of the add-on that originally seeded this page, if any"*. That is the reliable discriminator.

__`system-category` is NOT reliable.__ It only defaults to `'addon'` when the source doesn't declare one, and a shipped page already overrides it:

| Page source | `system-category` |
|---|---|
| `addons/forms/pages/af15d030-….md` | `documentation` |
| calendar ×4, journal ×2, elasticsearch ×2 | `addon` |

Keying an ACL on `system-category` would silently leave that forms page unprotected.

### Open question: is `addon` server-owned?

If page metadata is editable through the UI, the field must be re-stamped on save or held in a protected-key set — otherwise the marker can be removed. Largely self-limiting once admin-only edit is in place (a non-admin can't edit the page to strip its own protection), but it matters for __legacy pages__: pages seeded before the stamp existed may carry no `addon` field at all, and the reseed path only re-stamps when reseed is enabled *and* status is `outdated`. Those would be silently unprotected and need a one-time backfill keyed on UUID match against addon sources.

---

## 3. Admin-only editing of addon pages

__Goal:__ admins may edit addon pages; nobody else.

### Do not use page ACLs

JSPWiki-style `[{ALLOW edit admin}]` embedded in page content is __deprecated__ — operator decision 2026-05-22 ("we will no longer support Page ACLs"), migrated 2026-05-24. Frontmatter `audience` / `access` is the sole Tier 1 surface (see `docs/architecture-threads.md:224`).

Embedding markup in the body would also have broken the #920 reseed comparison: `pageSourceHash` hashes the __body only__, so an injected ACL makes live content differ from source, marking every page `locally-modified` and stopping reseed forever.

### Use frontmatter `access` — no evaluator change needed

`src/types/Page.ts:100` already defines per-action principal lists:

```ts
/** Per-action principal lists — overrides audience for the named action */
access?: { view?: string[]; edit?: string[]; delete?: string[]; [key: string]: string[] | undefined }
```

The 3-tier evaluator in `ACLManager.checkPagePermissionWithContext`:

- __Tier 0__ — `private` (hard constraint, not overridable)
- __Tier 0.5__ — author-lock (`edit` only; denies, never grants)
- __Tier 1__ — frontmatter `audience` / `access`; __overrides global policies__ and returns directly
- __Tier 2__ — global policies via `PolicyEvaluator` (fallback only when no frontmatter audience set)

> __REINSTATED 2026-07-26.__ Briefly marked superseded by §8 in favour of category-based policy;
> that was a reasoning error, corrected in §8 below. Category policy answered a *different*
> question (anonymous __read__ of system pages) and was itself abandoned as #945 `wontfix`. The
> argument below is unrefuted and this remains the mechanism.

__Proposal:__ the seeder stamps `access: { edit: ['admin'] }` on seeded pages, defaulting only when the addon source doesn't declare its own `access` (same pattern `system-category` already uses, so a domain addon can deliberately ship a community-editable page).

Why this is the right mechanism:

- __No `PolicyEvaluator` change.__ Policy resources match only a slug glob — `PolicyEvaluator.ts:255`, `micromatch.isMatch(pageName, resource.pattern)` — and addon slugs share no prefix (`myjournal`, `upcomingevents`, `calendar`, `makeareservation`, `using-formplugin`, `externalassetsearch`). The rule is inexpressible as a policy today. Frontmatter sidesteps that entirely.
- __Hash-neutral.__ `pageSourceHash` covers the body, so adding *metadata* does not disturb the #920 reseed logic.
- __Per-action.__ Stamping `edit` leaves `view` to fall through to audience/Tier 2 — pages stay publicly readable.
- __No body pollution__, and not the deprecated surface.

---

## 4. Dropped idea: a dedicated page class for Domain addons

Originally considered giving domain addons their own page type/class. __Leaning against it.__ `addon` already carries provenance and `access` already carries policy — a dedicated class duplicates both and adds a concept to keep in sync. Pages stay pages; ownership is metadata.

---

## 5. The one-way door (unchanged by the above)

Seeding is skip-if-exists, matched by UUID first (survives slug rename, #908) then slug. Operator edits are never clobbered. `ngdpbase.addons.page-reseed` (flat key, default `false`) opts into edit-preserving reseed: a page refreshes only when the source changed __and__ the live copy is byte-identical to what was last seeded.

So __editing a seeded page silently opts it out of all future upstream content updates__ — it becomes `locally-modified` and is skipped thereafter.

Admin-only editing narrows this to a small, informed audience, which makes it far more defensible. `evaluateSeededAddonPage` is already shared with the Required Pages Sync admin surface (#931), so boot and UI agree on status — that surface is the natural place to warn "editing this stops future addon updates".

---

## 6. Open questions

1. Is page metadata user-writable, and is `addon` protected? (§2)
2. Backfill strategy for legacy seeded pages lacking `addon` / `addon-source-hash`. (§2)
3. Should the second-domain-addon guard and duplicate-slug collision both become boot failures? (§1)
4. Does `capabilities[]` in `AddonManifest` do anything today? It is declared but appears unused — candidate home for "which platform surfaces this domain addon takes over" (home route, site identity, nav, theme, search scope).
5. Domain addons ship drop-in/packaged with their own repos, so the platform has no test signal on them. A conformance kit (contract tests an addon repo runs in its own CI) plus a manifest `requiresNgdpbase: ">=3.67"` boot check would close it — packaged gets version pinning free via npm, drop-in has nothing.

---

## 7. Open decisions (checklist)

Live list. Tick as they settle. Recommendations are mine; override freely.

### Blocking — operator call

> __geohazardwatch items (1, 2) are being handled separately by the operator__ and are not
> blocking anything in this document. They are retained for context only; nothing here waits
> on them.

- [x] __3. Is geohazardwatch's data volume real?__ RESOLVED 2026-07-25 — it is a `hostPath`
  (`/mnt/tank/jims/data/systems/geohazardwatch`, `type: DirectoryOrCreate`) mounted at `/app/data`
  on the single-node `deby` k3s cluster. Not a PVC, not an `emptyDir`. 175 pages on disk. Page
  edits persist across pod restarts and image bumps, so admin-only editing is worth building.
- [~] __1. (OPERATOR — handled separately) Turn on `ngdpbase.addons.page-reseed` for geohazardwatch?__ Currently unset, so its 14
  addon pages (incl. `geohazardwatch-home`, `left-menu-content`, `footer-content`) have been frozen
  since first boot — source changes never reach the live site. Turning it on is a real content
  change to a production site. Check `findOrphanedAddonPages` / Required Pages Sync first to see
  which are already `locally-modified`.
- [~] __2. (OPERATOR — handled separately) GeoHazardWatch pod version skew.__ A stray rebuild during the v3.67.1 release staged
  3.67.1 on disk while the process runs 3.66.0. Restart deliberately, revert its `dist/`, or leave
  it to the next Renovate redeploy.

### Design — admin-only editing of addon pages

> __DECIDED 2026-07-26: yes, only admins may edit addon pages__ — principal `admin`, __no new role__.
> §3 is reinstated as the mechanism (§8's supersession was a reasoning error — see the correction
> there). All of items 4–9 are now settled.
>
> The role ladder already expresses the intent, so nothing new is needed:
>
> | Role | Ordinary pages | Addon pages |
> |---|---|---|
> | `reader` | read | read |
> | `contributor` — *the content-admin* | read, create, edit | read only |
> | `editor` | + delete, rename | read only |
> | `admin` — unrestricted | everything | __edit__ |
>
> The point of the stamp is precisely to hold `contributor` and `editor` out of addon pages while
> leaving them full authority over ordinary content. `view` stays open to everyone (item 8), so
> addon pages remain readable — they are simply not editable below `admin`.

- [x] __4. Discriminator__ — use the `addon` field (unconditionally stamped, `Page.ts:82`),
  NOT `system-category` (unreliable — see §2).
- [x] __5. Mechanism__ — seeder stamps `access: { edit: ['admin'] }`. __Reinstated 2026-07-26__: the
  §8 supersession in favour of category matching was a reasoning error, and that route was abandoned
  anyway (#945 `wontfix`). An admin-only-edit rule is inexpressible as a global policy —
  `PolicyEvaluator.ts:255` matches a slug glob and addon slugs share no prefix — so frontmatter is
  the only surface that can express it. Tier 1 overrides global policies, is hash-neutral, and is
  per-action.
- [x] __6. Addon override allowed?__ Recommend yes — stamp only when the source is silent, mirroring
  how `system-category` defaults, so a domain addon can ship a deliberately community-editable page.
- [x] __7. Which principal? — `admin`. DECIDED 2026-07-26: no new role.__ The existing ladder already covers it — `contributor` *is* the content-admin for ordinary pages, and full `admin` is unrestricted ("god"). Inventing a `content-admin` /
  site-owner role distinct from full admin?
- [x] __8. Does `view` stay open?__ Recommend yes — `access` is per-action, so `view` falls through
  to audience/Tier 2 and pages stay publicly readable.
- [x] __9. Backfill existing seeded pages?__ Recommend yes, one-time, keyed on UUID match against
  addon sources. Otherwise pages seeded before the stamp existed are silently unprotected.

### Consistency — turns warnings into boot failures

- [ ] __10. Second domain addon → refuse to boot__ instead of warn-and-downgrade (§1).
- [ ] __11. Duplicate addon slug → refuse to boot__ instead of first-occurrence-wins.
- [ ] __17. Data-dir preflight → refuse to boot__ if the mounted data dir looks empty/unmounted.
  `DirectoryOrCreate` on a NAS path silently creates an empty local dir when the mount is down; the
  app then boots, re-seeds addon pages, and looks fine while 175 pages are invisible. Same family as
  deferred #645. All three are the #672 fail-fast precedent.

### Triage

- [x] __18. Policy category resources never match__ — filed as __#945__ (bug/security/P1). Blocks the
  category-based model in §8.
- [ ] __12. File the orphan-detector hole as a bug.__ `findOrphanedAddonPages` narrows candidates via
  `searchManager.searchByCategory('addon')`, so a seeded page whose `system-category` is not `addon`
  (e.g. the `forms` page declaring `documentation`) can never be reported as orphaned. Also
  `no search ⇒ no detection`. Same root cause as §2.
- [ ] __13. Priority of #940__ (inline code spans leak a raw placeholder) relative to this work.

### Seeded-page classification (§9)

- [x] __19. Feature UI pages are `system`__ — infrastructure, not content.
- [x] __20. Domain content is `general`, instance-owned from day one__ — "purely seeded"; the addon provides a starting corpus then lets go.
- [x] __21. Help/docs pages are `documentation`.__
- [x] __22. Demo/showcase treated as content__ — `general`, instance-owned.
- [ ] __23. Legal__ — `documentation` or `system`. Narrowed to two; identical `storageLocation: required` either way, so labelling only.
- [x] __24. Site chrome is `system`__ — RESOLVED: already a core concept. Core ships `leftmenu`/`footer` as required pages categorised `system`; the addon pages are a slug-convention *override*. No new category needed.
- [x] __26. Chrome override should be explicit config, not slug convention__ — filed as __#952__ (bug/P1). `ngdpbase.chrome.left-menu-page` / `.footer-page`, set by a domain addon via `domainDefaults`. Filed as a bug rather than an enhancement because the current behaviour actively misleads: an operator edits `LeftMenu`, the save succeeds, and nothing changes because `left-menu-content` silently wins. Unlike #950 it needs __no trigger__ — it is live today wherever an addon ships chrome pages.
- [x] __27. Chrome fragments are ACL-evaluated as destinations__ — filed as __#950__ (bug/P2). A permission decision on a fragment blanks the sidebar/footer site-wide, silently (`WikiRoutes.ts:779`, `:829`). Latent — needs a trigger, and the default catalog has no deny rules — hence P2 rather than P1.
- [ ] __25. Feature-UI fragility__ — `myjournal` *is* the journal screen and nothing regenerates it if deleted. Leave as pages / promote to routes / regenerate-if-missing.

### Page identity (§10)

- [x] __28. uuid in frontmatter, slug in the source filename, uuid in the instance store__ — the two are separate questions. Seeder ignores filenames, so uuid source filenames cost readability for no functional gain. `geohazardwatch` has the right convention; the bundled addons are the outliers.
- [x] __29. The addon owns the uuid and it stays mandatory__ — identity must be stable and global, decided by the publisher. Platform-generated uuids would be instance-local and unmatched across installs.
- [x] __30. Page-level seeding failures are too quiet__ — filed as __#951__ (bug/P2), covering both the undetected duplicate uuid and the type-blind missing-uuid warning.
- [x] __31. Missing uuid should be type-aware, not fail-fast__ — folded into __#951__. Skipping the page is correct; failing boot because a *third-party* addon shipped one malformed file would turn an authoring typo into an outage. The #672 fail-fast precedent does not transfer — that was the operator's own config, which the operator can fix. Instead: `error` for `type: 'domain'`, `warn` for additive, matching the existing `:524` identity-mismatch precedent.
- [ ] __32. Scaffolder should stamp uuids__ (#675) and CI should assert `basename(file) === frontmatter.slug`.

### Parked unless revisited

- [ ] __14. `capabilities[]`.__ The "never two domain addons" decision substantially weakens the case —
  it was pitched to detect conflicting claims between two domain addons. Only earns its keep as a
  description of which surfaces the single domain addon owns.
- [ ] __15. Conformance kit + `requiresNgdpbase` boot check.__ Real gap (drop-in addons have no
  version pinning), but infrastructure rather than user-facing value. Park until version skew bites.
- [ ] __16. Is page metadata user-writable / is `addon` protected?__ Cheap to verify; gates whether
  #4 is sufficient on its own.

### Settled

- [x] One domain addon per site, permanently (2026-07-25) — see §1.
- [x] No dedicated page class for domain addons — see §4.
- [x] Page ACLs deprecated; frontmatter `audience`/`access` is the only Tier 1 surface — see §3.

---

## 8. Course correction: addon pages are just system pages (2026-07-25)

Operator challenge: *"I am just not sure we need to make these any different than regular pages … they could just be system pages with a different provenance. Am I missing something?"*

__Correct, and the shipped config already assumes exactly that model.__ Of the 9 default policies in
`ngdpbase.access.policies`, eight target `{type:'page', pattern:'*'}` by role. Exactly one carries a
class distinction, and it does so by __category__:

```json
{ "id": "deny-anonymous-system-pages", "priority": 90, "effect": "deny",
  "subjects": [{ "type": "role", "value": "anonymous" }],
  "resources": [{ "type": "category", "value": "system" },
                { "type": "category", "value": "admin" }] }
```

Pages stay pages; the access distinction rides on category. No special page class — which is also why
§4 (dedicated page class) was already dropped.

### But it does not work — filed as #945

`PolicyEvaluator.matchesResource` handles only `type: 'page'`. A category resource carries `.value`,
not `.pattern`, so the loop skips it and returns false. That deny is the only one in the whole set, so
`anonymous-read-only` (prio 50, allow, `*`) wins. Verified live on jimstest: anonymous gets HTTP 200
and a full 101 KB render of `wiki-documentation` (`system-category: system`).

### CORRECTION (2026-07-26): §8 conflated two different questions

The conclusions below were partly wrong and are corrected here rather than silently edited.

| Question | Mechanism | Status |
|---|---|---|
| Should __anonymous__ *read* system-category pages? | category deny policy | Answered — no such rule wanted. #945 closed `wontfix`, dead policy deleted. |
| Should only __admins__ *edit* addon pages? | per-page edit restriction | __DECIDED 2026-07-26: yes.__ Untouched by the above. |

`deny-anonymous-system-pages` was a __read__ deny for __anonymous__. It could never have delivered
admin-only __editing__ for __all non-admins__. The two were solutions to different problems, not
alternatives to one — so category matching never "superseded" the frontmatter stamp, and its
cancellation leaves the stamp intact.

§3's own argument also still stands, unrefuted: policy resources match only a slug glob
(`PolicyEvaluator.ts:255`) and addon slugs share no common prefix, so an admin-only-edit rule is
__inexpressible as a global policy__. Frontmatter is the only surface that can express it.

### Consequences for this plan

- __§3 is reinstated__ as the mechanism for admin-only editing. The work item is the seeder stamp,
  not category resource matching.
- What remains genuinely unique to addon pages is __provenance and the upstream lifecycle__ — reseed, the
  `locally-modified` one-way door, orphan detection. That is content *sync*, not *access*. Access is
  ordinary page/category policy.
- Settled shape: __addon pages = system pages + `addon` provenance__; end-user addon documentation =
  `documentation` category (which `addons/forms` already does).

### Interaction to watch

Do not simply switch the seeder default from `system-category: addon` to `system` —
`findOrphanedAddonPages` queries `searchByCategory('addon')` and would stop finding anything. Either keep
`addon` as its own category and add it to the deny policy alongside `system`/`admin`, or make orphan
detection key on the `addon` field, which also fixes the `documentation`-page hole in §2 / item 12.

---

## 9. What seeded pages actually are — a taxonomy (2026-07-26)

Addon-seeded pages are not one thing. Enumerating all 23 across the four bundled addons and `geohazardwatch` gives six distinct purposes — and __"explain the addon" is the minority use, 4 of 23.__

| Purpose | Count | Examples |
|---|---|---|
| __Feature UI__ — the page *is* the app screen | 5 | `myjournal` (`[{Journal}]`), `calendar`, `makeareservation` (`[{ReservationFormPlugin}]`), `upcomingevents`, `externalassetsearch` |
| __Domain content__ — editorial subject matter | 8 | `earthquakes`, `volcanoes`, `tsunamis`, `landslides`, `volcano-activity` |
| __Help / docs__ | 4 | `calendarhelp`, `journalhelp`, `using-formplugin`, `externalassetsearchadmin` |
| __Site chrome__ | 2 | `footer-content`, `left-menu-content` |
| __Demo / showcase__ | 2 | `geology-demo`, `geohazardwatch-plugins` |
| __Legal__ | 1 | `attribution` |

### The root problem

The taxonomy exists in reality, but the platform has __one label for all of it__: the seeder defaults every page to `system-category: addon` (`AddonsManager.ts` ~L775) unless the source declares otherwise. Six kinds of page with six sensible policies get flattened into one bucket — which is why update, ownership and edit rules have been so hard to reason about.

Fixing the classification is therefore upstream of fixing the update mechanism.

### DECISION (2026-07-26): category per purpose

| Purpose | `system-category` | Ownership | Notes |
|---|---|---|---|
| Feature UI | __`system`__ | platform/addon | Infrastructure, not content. See the fragility note below. |
| Domain content | __`general`__ | __instance__, from day one | "Purely seeded" — the addon provides a starting corpus and then lets go. |
| Help / docs | __`documentation`__ | addon | End-user documentation, exactly as the existing category describes. |
| Demo / showcase | __`general`__ | __instance__ | Same treatment as domain content. |
| Legal | __`documentation`__ | addon | Settled 2026-07-27 — see below. |
| Site chrome | __OPEN__ | — | No decision yet. Analysis below. |

All four target categories already exist in the `ngdpbase.system-category` catalog, so this needs no new category — only correct assignment at the source. Note `system` and `documentation` both carry `storageLocation: required`, while `general` is `regular`; that is a real storage consequence of the mapping, not just a label change.

### RESOLVED (2026-07-27): Legal is `documentation`

__Operator decision: `documentation`.__

`attribution` is a single page and could reasonably have been either. `documentation` reads it as user-facing reference; `system` would have treated it as infrastructure the operator must not casually delete. Both carry `storageLocation: required`, so the practical difference is nil — it was a labelling question, not a behavioural one, and it had already cost more attention than the decision was worth.

`documentation` is also the more honest description: `attribution` is something a reader is meant to *read*, which is what the category says, whereas `system` is reserved for pages that are infrastructure rather than content.

This closes the last open item in §9. The only remaining undecided question in this document is tracked elsewhere; §9 itself is now fully settled.

### RESOLVED (2026-07-26): Site chrome is already core, and is `system`

The question "should site chrome be folded into ngdpbase?" turns out to be already answered — __it is.__ Core ships both pages as required pages:

```text
title: Footer     system-category: system   slug: footer
title: LeftMenu   system-category: system   slug: leftmenu
```

and `WikiRoutes` resolves chrome as an __override chain__:

```js
getPage('left-menu-content') ?? getPage('LeftMenu')   // WikiRoutes.ts:762
getPage('footer-content')    ?? getPage('Footer')     // WikiRoutes.ts:809
```

So chrome is a core concept that core already categorises `system`, and the `geohazardwatch` pages are an *override*, not the primary. __Item 24 closes: chrome is `system`.__ An earlier draft of this document leaned toward inventing a `template`/`chrome` category; that was reasoning about the addon pages in isolation without checking that core already owned the concept.

#### But the override mechanism is a trap

The override is a __slug convention__ — implicit, undiscoverable, and silently authoritative. The failure mode:

> An operator edits `LeftMenu` — the page core ships, categorised `system`, which looks authoritative — and nothing changes on the site, because `left-menu-content` exists and wins. No warning, no indication, two pages for one job.

That is live today on geohazardwatch. It is arguably a worse trap than anything in the update story, because the operator's action appears to succeed.

__Filed as #952 (bug/P1).__ Make the override explicit configuration rather than convention.

```jsonc
"ngdpbase.chrome.left-menu-page": "leftmenu",   // core default
"ngdpbase.chrome.footer-page": "footer"
```

A domain addon points these at its own pages via `domainDefaults` — which exists precisely so an addon can set instance config the operator can still override. That gives one page per job, a discoverable setting, a way to point back at core's version, and an admin surface that can say "LeftMenu is overridden by left-menu-content (geohazardwatch)".

Rated P1 — higher than #950 — because it needs no trigger. #950 is latent (it requires someone to restrict a chrome page, and the default catalog has no deny rules); this one is live on any instance running an addon that ships chrome pages, `geohazardwatch` included. The two are the same two pages with unrelated causes.

#### Separate concern: fragments run through the full ACL evaluator

Independent of ownership, both chrome pages are permission-checked as if they were destinations, and blank on denial:

```js
const canViewLeftMenu = leftMenuCtx !== null
  && await aclManager.checkPagePermissionWithContext(leftMenuCtx, 'view');   // :779
…
} else { templateData.leftMenu = ''; }
```

The footer path is identical (`:829`). So a permission decision on a *fragment* silently empties the sidebar or footer on __every page of the site__, for whichever users are affected — the failure mode found while investigating #945.

It needs a trigger (frontmatter `audience`/`access` on the chrome page, `private: true`, or a custom deny policy — the default catalog now contains no deny rules), so it is latent rather than currently firing. But when it fires it is site-wide, silent, and presents as "the nav disappeared for some users" with nothing pointing at a permissions cause.

Filed as __#950__ (bug/P2) — deliberately P2 rather than P1 because it is latent: it needs a trigger, and the default policy catalog contains no deny rules since #945 removed the only one. The issue records both the narrow fix (fail soft and log) and the broader design question it contains: whether fragments should be audience-gated at all.

### Note on an earlier draft

This section originally argued for inventing a `template`/`chrome` category, on the grounds that these pages are the only seeded pages *rendered into* other pages rather than visited. That observation is still true and is why the fragment-ACL concern above is real — but it does not need a new category, because core already ships `leftmenu`/`footer` as `system`. The lesson: check whether the platform already owns a concept before designing around the addon's copy of it.

### Fragility note: Feature UI pages

Classifying them `system` is right, but does not by itself fix the underlying problem: __`myjournal` *is* the journal screen.__ If a user edits it badly or deletes it, the feature has no front door and nothing regenerates it. It looks like content and behaves like infrastructure.

Options, not yet decided:

- leave as pages (status quo — fragile)
- promote to real routes/templates (robust, but loses "the user can rearrange their own screen")
- keep as pages but __regenerate if missing__ — self-healing without ever overwriting an edit, which fits the instance-owns-its-pages model

### Incidental finding

`system-category` is inconsistent in the `geohazardwatch` source — some pages declare `addon`, several declare nothing at all. Since `findOrphanedAddonPages` narrows candidates via `searchByCategory('addon')`, any page not carrying that exact category is invisible to orphan detection. Re-categorising per this decision would make that hole worse, not better, which is a further argument for keying orphan detection on the `addon` field instead (§7 item 12).

---

## 10. Page identity: uuid and filenames (2026-07-26)

Two decisions that are easy to conflate but are not the same question.

### DECISION: uuid in frontmatter, slug in the filename

| | Convention | Audience |
|---|---|---|
| __Identity__ | frontmatter `uuid`, supplied by the addon author | machines |
| __Addon source filename__ | `<slug>.md` | humans reviewing a git repo |
| __Instance store filename__ | `<uuid>.md` | machines |

The instance store is machine-managed, so uuid filenames are right there: stable across renames, collision-free, never needing a rename when a slug changes. That is settled and unchanged.

Addon source is __human-authored and code-reviewed__, so slug filenames are right there:

- a PR diff showing `geohazardwatch-home.md` is reviewable; one showing `4bf246b9-ebcc-4774-8175-427c275d407c.md` is not
- `git log --follow left-menu-content.md` is meaningful history; on a uuid filename it is meaningless
- blame, merge conflicts and directory listings all degrade to opacity under uuids

And critically, __the seeder ignores filenames entirely__ — it globs `*.md` and keys on frontmatter `uuid`, falling back to `slug`. Uuid filenames in source therefore buy nothing functional.

This makes `geohazardwatch` the correct convention and the four bundled addons the outliers, which is the opposite of the initial framing of "addons seed pages which are not uuid". Identity is already uuid-governed everywhere; only the *filename* differs.

Note #908 ("orphaned slug-named files") was about the __instance store__, not addon source, so it does not argue for uuid source filenames.

### DECISION: the addon owns the uuid, and it stays mandatory

`AddonsManager` already requires a valid frontmatter `uuid` and skips pages without one (~L698). That is correct and should stay.

The uuid is the page's identity __across every instance that installs the addon__, which is what makes the update model possible at all:

- reseed needs "this page, the one I shipped last time" — matched by uuid so a slug rename does not orphan it
- orphan detection compares the source uuid set against instance pages' uuids
- one page shipped to fifty instances stays *the same page* everywhere

The alternative — platform generates a uuid on first seed — sounds friendlier but is strictly worse: the uuid becomes instance-local, the same page acquires fifty identities, and nothing can be matched across them. That forces a fallback to slug matching, which breaks on rename.

The right analogy is a package name: the __publisher__ owns it, decides it once, and never changes it.

### Gaps in enforcement

The design is right; the enforcement is too quiet.

1. __No duplicate-uuid guard.__ The seed loop has none. Two source pages sharing a uuid — the obvious copy-paste mistake when creating a page — means the second matches the first's already-seeded page and is silently skipped or reseeded over. One page simply never appears, and the only trace is a `debug` line phrased as normal operation. With reseed enabled it is worse: the two files fight over one page and the winner depends on filesystem ordering. Cross-addon collisions have the same shape and are worse still, since neither addon knows about the other.
2. __A missing uuid is type-blind and only a `logger.warn`.__ Better than (1) — it names the file and the reason — but a domain addon's home page failing to seed is a broken site, while the same failure in an additive addon is a missing help page. `AddonsManager.ts:524` already draws exactly that distinction for identity mismatch (`error` for domain, `warn` otherwise); page seeding should follow it. A boot-time warn is also invisible afterwards.

Both are the same defect — __the seeder's page-level failures are too quiet__ — with the same fix site, so they are tracked together in __#951__ rather than as separate issues.

__Explicitly rejected: fail-fast on boot.__ Refusing to start because a third-party addon shipped one malformed page turns an authoring typo into an outage. The #672 precedent does not transfer: that was the operator's *own* config naming a nonexistent addon, which the operator can fix. A vendor's malformed file is not in the operator's control. Skip the page, report loudly, surface it after boot.
3. __No tooling to generate one.__ Authors hand-roll uuids, which is exactly why copy-paste duplicates happen. The addon scaffolder (#675) should stamp a fresh uuid into every generated page — the real fix for both problems above, since it removes the manual step.

### Guardrail

With slug filenames, the filename can drift from frontmatter `slug` after a rename. A CI or scaffolder check asserting `basename(file) === frontmatter.slug` keeps the human-legible convention honest without giving up uuid identity.
