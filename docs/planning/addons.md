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

**Proposal:** the seeder stamps `access: { edit: ['admin'] }` on seeded pages, defaulting only when the addon source doesn't declare its own `access` (same pattern `system-category` already uses, so a domain addon can deliberately ship a community-editable page).

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
