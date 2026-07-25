# Domain Addons — Planning Notes

Working notes on the "Domain addon" concept: what it is, how its pages are identified, and who may edit them. Not yet an implementation plan — decisions and open questions, captured as they settle.

For the implemented addon subsystem see [`../platform/addon-architecture.md`](../platform/addon-architecture.md). For slug rules see [`../platform/addon-identity-contract.md`](../platform/addon-identity-contract.md).

---

## 1. What a Domain addon is

A **Domain addon** is a specific packaging of ngdpbase plus **industry-specific addons that do not exist in ngdpbase core**. It is a *distribution*, not a single module — `geohazardwatch` (volcano/geology) and a condo-management build are the shape.

Consequence: "addon pages" on a domain site span **several addon names**, not one. Any ownership or ACL rule should therefore key on "page was seeded by an addon", with per-addon override available — not on a single addon identity.

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
