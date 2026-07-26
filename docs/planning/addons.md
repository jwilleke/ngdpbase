# Domain Addons — Planning Notes

Working notes on the "Domain addon" concept: what it is, how its pages are identified, and who may edit them. Not yet an implementation plan — decisions and open questions, captured as they settle.

For the implemented addon subsystem see [`../platform/addon-architecture.md`](../platform/addon-architecture.md). For slug rules see [`../platform/addon-identity-contract.md`](../platform/addon-identity-contract.md).

---

## 1. What a Domain addon is

A **Domain addon** is a specific packaging of ngdpbase plus **industry-specific addons that do not exist in ngdpbase core**. It is a *distribution*, not a single module — `geohazardwatch` (volcano/geology) and a condo-management build are the shape.

Consequence: "addon pages" on a domain site span **several addon names**, not one. Any ownership or ACL rule should therefore key on "page was seeded by an addon", with per-addon override available — not on a single addon identity.

### The two addon types

Every addon is exactly one of two types, declared in its `package.json` `ngdpbase` manifest:

```jsonc
{ "ngdpbase": { "type": "domain" } }   // or "additive" — the default when unset
```

| | **Domain** | **Additive** |
|---|---|---|
| Purpose | **Is** the site's identity and reason for existing | **Augments** a site that already has its own identity |
| Answers | "What *is* this site?" | "What else can this site do?" |
| Per instance | **Exactly one**, permanently (decision below) | Any number |
| Examples | `geohazardwatch` (volcano/geology), a condo-management build | `calendar`, `forms`, `journal`, `elasticsearch` |
| Ownership | Its own repo and release cadence | Ships with the platform, or independently |
| Removing it | Leaves a generic wiki with orphaned content | Leaves the site intact, minus one capability |

The clearest test: **remove the addon and ask what is left.** Remove `calendar` from The Fairways and it is still The Fairways. Remove `geohazardwatch` from geohazardwatch.com and there is no site — just an empty platform.

A Domain addon is a *distribution*: ngdpbase plus the industry-specific addons that do not exist in core. So "the domain addon's pages" on a real instance may span several addon names, which is why ownership rules key on "was seeded by an addon" rather than on one addon identity (see §2).

**Distribution model is orthogonal.** `bundled` / `drop-in` / `packaged` describes *how the code arrives*; `domain` / `additive` describes *what it means to the site*. A domain addon may be bundled, drop-in or packaged — geohazardwatch is packaged (npm), while all four bundled addons are additive. The platform makes no trust distinction between models.

### What `type: 'domain'` actually does today

Being honest about the gap between the concept and its current mechanics — three behaviours, all in `src/managers/AddonsManager.ts`:

1. **Single-domain guard** (~L998). The first addon declaring `type: 'domain'` is recorded as `domainAddonName`. A second is **downgraded to `additive` with a `logger.warn`** and loads anyway. See the decision below for why that failure mode is now wrong.
2. **`domainDefaults` injection** (~L1086). Manifest config keys are applied via `setRuntimeProperty` before `register()`, skipping any key the operator has explicitly set. Ephemeral — this boot only, never written to disk.
3. **Identity-mismatch severity** (~L524). When an addon's module `name` disagrees with its canonical slug, a domain addon logs at **error** while an additive one logs at **warn** — on the reasoning that a domain addon's identity *is* the site's identity.

Two caveats worth knowing before leaning on the type:

- **`domainDefaults` is not type-gated.** `applyDomainDefaults` checks only that the key exists, so an *additive* addon shipping `domainDefaults` has them applied identically. The name implies a restriction the code does not enforce.
- **Theme deployment is not type-gated either.** Any addon shipping `theme/theme.json` gets it copied on first load (#443).

So `type: 'domain'` currently earns a guard, a log level, and a config-injection hook that additive addons can also use. It is closer to a **declaration of intent** than an enforced capability. That is worth knowing when deciding whether to build on it: if a future rule needs to distinguish the two, it will mostly need writing from scratch rather than hooking into existing enforcement.

### DECISION (2026-07-25): one Domain addon per site, permanently

There will never be two domain addons in the same site. This is a product decision, not a defensive guess.

**Implication for enforcement.** `AddonsManager` currently *downgrades* a second `type: 'domain'` addon to `additive` and logs a warning (see addon-architecture §2c step 1, §12). That is the wrong failure mode now that the constraint is firm:

- It repeats the silent-misconfig shape that caused the 2026-05-10 `geohazardwatch.com` outage (#671), which we fixed by making `assertConfiguredAddonsExist` **refuse to boot** (#672).
- A warning in a boot log is not seen.

**Proposed:** a second domain addon should refuse to start, consistent with #672. Same argument applies to discovery's "first occurrence wins" on duplicate slugs, which is also silent today.

---

## 2. Defining an "addon page"

### Use `addon`, not `system-category`

`AddonsManager` stamps every seeded and reseeded page (`src/managers/AddonsManager.ts` ~L775):

```js
addon: addonName,
'system-category': (parsed.data)['system-category'] ?? 'addon',
'addon-source-hash': pageSourceHash(parsed.content)
```

`addon` is set **unconditionally** and is a declared first-class field in `src/types/Page.ts:82` — *"Name of the add-on that originally seeded this page, if any"*. That is the reliable discriminator.

**`system-category` is NOT reliable.** It only defaults to `'addon'` when the source doesn't declare one, and a shipped page already overrides it:

| Page source | `system-category` |
|---|---|
| `addons/forms/pages/af15d030-….md` | `documentation` |
| calendar ×4, journal ×2, elasticsearch ×2 | `addon` |

Keying an ACL on `system-category` would silently leave that forms page unprotected.

### Open question: is `addon` server-owned?

If page metadata is editable through the UI, the field must be re-stamped on save or held in a protected-key set — otherwise the marker can be removed. Largely self-limiting once admin-only edit is in place (a non-admin can't edit the page to strip its own protection), but it matters for **legacy pages**: pages seeded before the stamp existed may carry no `addon` field at all, and the reseed path only re-stamps when reseed is enabled *and* status is `outdated`. Those would be silently unprotected and need a one-time backfill keyed on UUID match against addon sources.

---

## 3. Admin-only editing of addon pages

**Goal:** admins may edit addon pages; nobody else.

### Do not use page ACLs

JSPWiki-style `[{ALLOW edit admin}]` embedded in page content is **deprecated** — operator decision 2026-05-22 ("we will no longer support Page ACLs"), migrated 2026-05-24. Frontmatter `audience` / `access` is the sole Tier 1 surface (see `docs/architecture-threads.md:224`).

Embedding markup in the body would also have broken the #920 reseed comparison: `pageSourceHash` hashes the **body only**, so an injected ACL makes live content differ from source, marking every page `locally-modified` and stopping reseed forever.

### Use frontmatter `access` — no evaluator change needed

`src/types/Page.ts:100` already defines per-action principal lists:

```ts
/** Per-action principal lists — overrides audience for the named action */
access?: { view?: string[]; edit?: string[]; delete?: string[]; [key: string]: string[] | undefined }
```

The 3-tier evaluator in `ACLManager.checkPagePermissionWithContext`:

- **Tier 0** — `private` (hard constraint, not overridable)
- **Tier 0.5** — author-lock (`edit` only; denies, never grants)
- **Tier 1** — frontmatter `audience` / `access`; **overrides global policies** and returns directly
- **Tier 2** — global policies via `PolicyEvaluator` (fallback only when no frontmatter audience set)

> **SUPERSEDED 2026-07-25 — see §8.** Category-based policy is the better mechanism and is already the
> intended design; this frontmatter stamp is retained only as the way to express *per-page exceptions*.

**Proposal (superseded):** the seeder stamps `access: { edit: ['admin'] }` on seeded pages, defaulting only when the addon source doesn't declare its own `access` (same pattern `system-category` already uses, so a domain addon can deliberately ship a community-editable page).

Why this is the right mechanism:

- **No `PolicyEvaluator` change.** Policy resources match only a slug glob — `PolicyEvaluator.ts:255`, `micromatch.isMatch(pageName, resource.pattern)` — and addon slugs share no prefix (`myjournal`, `upcomingevents`, `calendar`, `makeareservation`, `using-formplugin`, `externalassetsearch`). The rule is inexpressible as a policy today. Frontmatter sidesteps that entirely.
- **Hash-neutral.** `pageSourceHash` covers the body, so adding *metadata* does not disturb the #920 reseed logic.
- **Per-action.** Stamping `edit` leaves `view` to fall through to audience/Tier 2 — pages stay publicly readable.
- **No body pollution**, and not the deprecated surface.

---

## 4. Dropped idea: a dedicated page class for Domain addons

Originally considered giving domain addons their own page type/class. **Leaning against it.** `addon` already carries provenance and `access` already carries policy — a dedicated class duplicates both and adds a concept to keep in sync. Pages stay pages; ownership is metadata.

---

## 5. The one-way door (unchanged by the above)

Seeding is skip-if-exists, matched by UUID first (survives slug rename, #908) then slug. Operator edits are never clobbered. `ngdpbase.addons.page-reseed` (flat key, default `false`) opts into edit-preserving reseed: a page refreshes only when the source changed **and** the live copy is byte-identical to what was last seeded.

So **editing a seeded page silently opts it out of all future upstream content updates** — it becomes `locally-modified` and is skipped thereafter.

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

- [x] **3. Is geohazardwatch's data volume real?** RESOLVED 2026-07-25 — it is a `hostPath`
  (`/mnt/tank/jims/data/systems/geohazardwatch`, `type: DirectoryOrCreate`) mounted at `/app/data`
  on the single-node `deby` k3s cluster. Not a PVC, not an `emptyDir`. 175 pages on disk. Page
  edits persist across pod restarts and image bumps, so admin-only editing is worth building.
- [ ] **1. Turn on `ngdpbase.addons.page-reseed` for geohazardwatch?** Currently unset, so its 14
  addon pages (incl. `geohazardwatch-home`, `left-menu-content`, `footer-content`) have been frozen
  since first boot — source changes never reach the live site. Turning it on is a real content
  change to a production site. Check `findOrphanedAddonPages` / Required Pages Sync first to see
  which are already `locally-modified`.
- [ ] **2. GeoHazardWatch pod version skew.** A stray rebuild during the v3.67.1 release staged
  3.67.1 on disk while the process runs 3.66.0. Restart deliberately, revert its `dist/`, or leave
  it to the next Renovate redeploy.

### Design — admin-only editing of addon pages

- [ ] **4. Discriminator** — use the `addon` field (unconditionally stamped, `Page.ts:82`),
  NOT `system-category` (unreliable — see §2).
- [ ] **5. Mechanism** — ~~seeder stamps `access: { edit: ['admin'] }`~~ **SUPERSEDED (§8)**: implement
  category resource matching in `PolicyEvaluator` (#945) and govern by category. Frontmatter `access`
  remains for per-page exceptions only.
- [ ] **6. Addon override allowed?** Recommend yes — stamp only when the source is silent, mirroring
  how `system-category` defaults, so a domain addon can ship a deliberately community-editable page.
- [ ] **7. Which principal?** Recommend role `admin`. Open: do domain sites need a `content-admin` /
  site-owner role distinct from full admin?
- [ ] **8. Does `view` stay open?** Recommend yes — `access` is per-action, so `view` falls through
  to audience/Tier 2 and pages stay publicly readable.
- [ ] **9. Backfill existing seeded pages?** Recommend yes, one-time, keyed on UUID match against
  addon sources. Otherwise pages seeded before the stamp existed are silently unprotected.

### Consistency — turns warnings into boot failures

- [ ] **10. Second domain addon → refuse to boot** instead of warn-and-downgrade (§1).
- [ ] **11. Duplicate addon slug → refuse to boot** instead of first-occurrence-wins.
- [ ] **17. Data-dir preflight → refuse to boot** if the mounted data dir looks empty/unmounted.
  `DirectoryOrCreate` on a NAS path silently creates an empty local dir when the mount is down; the
  app then boots, re-seeds addon pages, and looks fine while 175 pages are invisible. Same family as
  deferred #645. All three are the #672 fail-fast precedent.

### Triage

- [x] **18. Policy category resources never match** — filed as **#945** (bug/security/P1). Blocks the
  category-based model in §8.
- [ ] **12. File the orphan-detector hole as a bug.** `findOrphanedAddonPages` narrows candidates via
  `searchManager.searchByCategory('addon')`, so a seeded page whose `system-category` is not `addon`
  (e.g. the `forms` page declaring `documentation`) can never be reported as orphaned. Also
  `no search ⇒ no detection`. Same root cause as §2.
- [ ] **13. Priority of #940** (inline code spans leak a raw placeholder) relative to this work.

### Seeded-page classification (§9)

- [x] **19. Feature UI pages are `system`** — infrastructure, not content.
- [x] **20. Domain content is `general`, instance-owned from day one** — "purely seeded"; the addon provides a starting corpus then lets go.
- [x] **21. Help/docs pages are `documentation`.**
- [x] **22. Demo/showcase treated as content** — `general`, instance-owned.
- [ ] **23. Legal** — `documentation` or `system`. Narrowed to two; identical `storageLocation: required` either way, so labelling only.
- [ ] **24. Site chrome** — OPEN. `system`, a new `template`/`chrome` category, or move to the theme layer. Leaning toward a new category: fragments are embedded everywhere and never a destination, unlike every other kind.
- [ ] **25. Feature-UI fragility** — `myjournal` *is* the journal screen and nothing regenerates it if deleted. Leave as pages / promote to routes / regenerate-if-missing.

### Parked unless revisited

- [ ] **14. `capabilities[]`.** The "never two domain addons" decision substantially weakens the case —
  it was pitched to detect conflicting claims between two domain addons. Only earns its keep as a
  description of which surfaces the single domain addon owns.
- [ ] **15. Conformance kit + `requiresNgdpbase` boot check.** Real gap (drop-in addons have no
  version pinning), but infrastructure rather than user-facing value. Park until version skew bites.
- [ ] **16. Is page metadata user-writable / is `addon` protected?** Cheap to verify; gates whether
  #4 is sufficient on its own.

### Settled

- [x] One domain addon per site, permanently (2026-07-25) — see §1.
- [x] No dedicated page class for domain addons — see §4.
- [x] Page ACLs deprecated; frontmatter `audience`/`access` is the only Tier 1 surface — see §3.

---

## 8. Course correction: addon pages are just system pages (2026-07-25)

Operator challenge: *"I am just not sure we need to make these any different than regular pages … they could just be system pages with a different provenance. Am I missing something?"*

**Correct, and the shipped config already assumes exactly that model.** Of the 9 default policies in
`ngdpbase.access.policies`, eight target `{type:'page', pattern:'*'}` by role. Exactly one carries a
class distinction, and it does so by **category**:

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

### Consequences for this plan

- The work item is **implement category resource matching**, not invent an addon-page mechanism.
  Smaller, more general, and it fixes a live security-shaped bug rather than routing around it.
- §3's `access: { edit: ['admin'] }` seeder stamp is **superseded as the primary mechanism**. Frontmatter
  `access` keeps its place for per-page exceptions.
- What remains genuinely unique to addon pages is **provenance and the upstream lifecycle** — reseed, the
  `locally-modified` one-way door, orphan detection. That is content *sync*, not *access*. Access is
  ordinary page/category policy.
- Settled shape: **addon pages = system pages + `addon` provenance**; end-user addon documentation =
  `documentation` category (which `addons/forms` already does).

### Interaction to watch

Do not simply switch the seeder default from `system-category: addon` to `system` —
`findOrphanedAddonPages` queries `searchByCategory('addon')` and would stop finding anything. Either keep
`addon` as its own category and add it to the deny policy alongside `system`/`admin`, or make orphan
detection key on the `addon` field, which also fixes the `documentation`-page hole in §2 / item 12.

---

## 9. What seeded pages actually are — a taxonomy (2026-07-26)

Addon-seeded pages are not one thing. Enumerating all 23 across the four bundled addons and `geohazardwatch` gives six distinct purposes — and **"explain the addon" is the minority use, 4 of 23.**

| Purpose | Count | Examples |
|---|---|---|
| **Feature UI** — the page *is* the app screen | 5 | `myjournal` (`[{Journal}]`), `calendar`, `makeareservation` (`[{ReservationFormPlugin}]`), `upcomingevents`, `externalassetsearch` |
| **Domain content** — editorial subject matter | 8 | `earthquakes`, `volcanoes`, `tsunamis`, `landslides`, `volcano-activity` |
| **Help / docs** | 4 | `calendarhelp`, `journalhelp`, `using-formplugin`, `externalassetsearchadmin` |
| **Site chrome** | 2 | `footer-content`, `left-menu-content` |
| **Demo / showcase** | 2 | `geology-demo`, `geohazardwatch-plugins` |
| **Legal** | 1 | `attribution` |

### The root problem

The taxonomy exists in reality, but the platform has **one label for all of it**: the seeder defaults every page to `system-category: addon` (`AddonsManager.ts` ~L775) unless the source declares otherwise. Six kinds of page with six sensible policies get flattened into one bucket — which is why update, ownership and edit rules have been so hard to reason about.

Fixing the classification is therefore upstream of fixing the update mechanism.

### DECISION (2026-07-26): category per purpose

| Purpose | `system-category` | Ownership | Notes |
|---|---|---|---|
| Feature UI | **`system`** | platform/addon | Infrastructure, not content. See the fragility note below. |
| Domain content | **`general`** | **instance**, from day one | "Purely seeded" — the addon provides a starting corpus and then lets go. |
| Help / docs | **`documentation`** | addon | End-user documentation, exactly as the existing category describes. |
| Demo / showcase | **`general`** | **instance** | Same treatment as domain content. |
| Legal | `documentation` *or* `system` | addon | **Narrowed, not settled** — see below. |
| Site chrome | **OPEN** | — | No decision yet. Analysis below. |

All four target categories already exist in the `ngdpbase.system-category` catalog, so this needs no new category — only correct assignment at the source. Note `system` and `documentation` both carry `storageLocation: required`, while `general` is `regular`; that is a real storage consequence of the mapping, not just a label change.

### Open: Legal

`attribution` is a single page and could reasonably be either. `documentation` if it is read as user-facing reference; `system` if it is treated as a required page the operator must not casually delete. The `storageLocation: required` value is identical for both, so the practical difference is small — it is a labelling question, not a behavioural one.

### Open: Site chrome — the genuinely hard one

`footer-content` and `left-menu-content` do not fit any existing category, and the reason is structural: **they are the only seeded pages that are rendered *into* other pages rather than visited.** Nobody navigates to `/view/left-menu-content` to read it.

That difference has real consequences today:

- `WikiRoutes.ts` (~L759) loads `left-menu-content` per request and runs it through the full ACL evaluator; on denial it sets `templateData.leftMenu = ''`. A permissions decision on a *fragment* silently empties the sidebar for that user — the failure mode found while investigating #945.
- They are content-editable, which is desirable (operators want to edit their own nav), but they are also load-bearing, which is not (a broken edit degrades every page on the site).

Three candidate resolutions:

1. **`system`** — matches "infrastructure, not content", reuses an existing category. But conflates platform config pages with view fragments.
2. **A new `template` / `chrome` category** — honest about the distinct property, and would let the platform treat fragments correctly: skip audience evaluation, fail soft when missing, exclude from search and page listings. Costs a catalog entry and a migration.
3. **Not pages at all** — move into the theme layer. Most robust, but forfeits the ability for an operator to edit their own navigation through the wiki, which is arguably the point of the platform.

Leaning toward (2): the defining property — embedded everywhere, never a destination — is genuinely unlike the other five, and (1) would hide that inside a category that already means something else.

### Fragility note: Feature UI pages

Classifying them `system` is right, but does not by itself fix the underlying problem: **`myjournal` *is* the journal screen.** If a user edits it badly or deletes it, the feature has no front door and nothing regenerates it. It looks like content and behaves like infrastructure.

Options, not yet decided:

- leave as pages (status quo — fragile)
- promote to real routes/templates (robust, but loses "the user can rearrange their own screen")
- keep as pages but **regenerate if missing** — self-healing without ever overwriting an edit, which fits the instance-owns-its-pages model

### Incidental finding

`system-category` is inconsistent in the `geohazardwatch` source — some pages declare `addon`, several declare nothing at all. Since `findOrphanedAddonPages` narrows candidates via `searchByCategory('addon')`, any page not carrying that exact category is invisible to orphan detection. Re-categorising per this decision would make that hole worse, not better, which is a further argument for keying orphan detection on the `addon` field instead (§7 item 12).
