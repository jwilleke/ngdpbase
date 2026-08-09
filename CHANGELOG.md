# Changelog

All notable changes to ngdpbase will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned

- Future enhancements

## [4.8.1] - 2026-08-09

### Planned

- Future enhancements

## [4.8.0] - 2026-08-09

### Planned

- Future enhancements

## [4.7.0] - 2026-08-08

### Planned

- Future enhancements

## [4.6.2] - 2026-08-08

### Planned

- Future enhancements

## [4.6.1] - 2026-08-08

### Planned

- Future enhancements

## [4.6.0] - 2026-08-08

### Planned

- Future enhancements

## [4.5.2] - 2026-08-07

### Planned

- Future enhancements

## [4.5.1] - 2026-08-06

### Planned

- Future enhancements

## [4.5.0] - 2026-08-06

### Planned

- Future enhancements

## [4.4.0] - 2026-08-05

### Planned

- Future enhancements

## [4.3.0] - 2026-08-04

### Planned

- Future enhancements

## [4.2.0] - 2026-07-28

### Planned

- Future enhancements

## [4.1.0] - 2026-07-28

### Added

- **#999** — attachment metadata editing. `PATCH /attachments/api/:attachmentId` accepts the same `AssetMetadataPatch` body as the media route (`title` / `description` / `keywords` / `dateTimeOriginal`), under the same `asset-edit` permission, with the same contract: **a field absent means keep, an explicit `null` means clear.** Body parsing is now shared between the two routes so they cannot drift on that.

  **Attachment edits are stored beside the file, not written into it** — unlike media items, which write through to embedded EXIF/IPTC/XMP. Attachment IDs are content hashes (`<sha256>.<ext>` is the stored filename), so an embedded write would rewrite the bytes and the id would stop naming them, silently invalidating dedup and any integrity check. Re-keying on edit was the alternative and was rejected: the id *is* the URL, so every existing `[{ATTACH}]` reference would break.

  The practical consequence: after an edit, an attachment's ngdpbase metadata and its embedded metadata diverge, and a **download carries the file's original values**. If embedded fidelity matters for a given file, it belongs in the media library, which is not content-addressed and does write through.

### Changed

- `docs/platform/deployment/addon-packaged.md` now recommends the **two-stage build** for packaged addons — install the addon in a plain `node:alpine` stage, then `COPY --from=… /app/node_modules/. ./node_modules/` into the ngdpbase runtime stage. The image you deploy ends up with no npm at all, so the v3.70.3 removal holds end to end rather than only for ngdpbase's own image. The `-devtools` tag remains available as an escape hatch for builds that must run npm in the ngdpbase layer itself, but is no longer the recommendation: a derived image built from it inherits npm and ships its vendored CVEs.

## [4.0.1] - 2026-07-27

### Fixed

- **#1003** — `system-category` changes in an addon source now reach already-seeded pages. `evaluateSeededAddonPage` compares page *bodies*, so a category-only source edit never marked a page `outdated` and the reseed path never ran — categories set at first seed were frozen permanently. Adds a drift check independent of the body hash and of `reseed`, with a new `addon-source-category` marker (the category analogue of `addon-source-hash`) that makes the correction one-time-per-drift: once the addon's value has been applied, an operator who re-categorizes the page keeps their choice until the addon's own value changes again.
- **#1003** — the #971 `access` backfill resolved a page's category from the stale live value before the addon source's current one, while the reseed path resolved the same field source-first. Now source-first in both.

  **Operators upgrading with addon pages whose category was corrected upstream:** the two bugs compounded, so pages that should be instance-owned (`system-category: general`) may carry an `access: { edit: ['admin'] }` stamp derived from their stale category. This release clears such a stamp on next boot, but only when all of: the category actually drifted, the corrected category warrants no stamp, the addon source declares no `access` of its own, and the live value is byte-identical to what the stale category would have produced. An `access` value you set yourself is preserved — with one caveat worth knowing: a value you set that happens to equal `{ edit: ['admin'] }` exactly, on a page whose category also drifted, is indistinguishable from the machine's output and will be cleared.

### Changed

- `docs/planning/addons.md` §9 — the Legal purpose (the `attribution` page) is settled as `system-category: documentation`. §9 now has no open items.

## [4.0.0] - 2026-07-27

### ⚠️ BREAKING — the published Docker image no longer has npm

`ghcr.io/jwilleke/ngdpbase:X.Y.Z` cannot be built `FROM` any more. npm was removed from the runtime image in v3.70.3 (#956) so the deployed artifact stops carrying npm's vendored CVEs, and that stands — but it also broke the **packaged-addon deployment model**, where a derived image runs `npm install <addon>` on top of the base image.

**Migration:** derived builds change one line, to the new build-capable variant.

```diff
-FROM ghcr.io/jwilleke/ngdpbase:4.0.0
+FROM ghcr.io/jwilleke/ngdpbase:4.0.0-devtools
 RUN npm install @scope/my-addon@1.2.3
```

| Tag | npm | Use for |
|---|---|---|
| `:X.Y.Z` | no | **deploying** — unchanged, still npm-free |
| `:X.Y.Z-devtools` | yes | **building FROM** — derived images that install an addon |

An image built `FROM …-devtools` inherits npm; drop it again in your final stage if that matters for your scan posture. See `docs/platform/deployment/addon-packaged.md`.

**Why this is a major and v3.70.3 should have been one too.** Removing a documented capability from a published artifact is a breaking change to a public interface. Shipping it as a *patch* is what caused the outage: Renovate's auto-merge policy keys on bump type, so a patch base-image bump read as "safe, no review" and merged itself downstream, surfacing as a red release build (#1001). Deployments that only consume the runtime image are unaffected and can upgrade normally.

### Fixed

- **#1001** — `devtools` image variant restoring the derived-build path. Both build targets are now pinned explicitly; without that an untargeted build takes the Dockerfile's last stage and would have silently published the npm-carrying image as `:latest`. Adds assertions that the runtime image has *no* npm and that the devtools image can actually be built `FROM`.
- **#1000** — showdown ReDoS guard (CVE-2024-1899) now applied at *every* `makeHtml()` call site. #599 guarded only the primary render path; the parser-disabled fallback, the no-parser fallback, and the footnote extension's own `Converter` instance still passed raw text, and `POST /api/preview` reaches them with an arbitrary request body. Adds a structural test that fails on any unguarded call site. No upstream patch exists for the CVE.

### Added

- **#989** — `FeedManager` per-source record shaping: `dedupeBy` (keep the newest record per group key), `maxAgeHours` (discard stale records, applied after grouping so it means "not reissued"), and `dedupeDateField`. Adapter-agnostic. Also fixes `linkPattern` / `maxItems` / `delimiter` never reaching adapters through config parsing, which made `xml-index` sources unconfigurable.

## [3.71.0] - 2026-07-27

### Planned

- Future enhancements

## [3.70.3] - 2026-07-27

### Planned

- Future enhancements

## [3.70.2] - 2026-07-27

### Planned

- Future enhancements

## [3.70.1] - 2026-07-27

### Planned

- Future enhancements

## [3.70.0] - 2026-07-26

### Planned

- Future enhancements

## [3.69.0] - 2026-07-26

### Planned

- Future enhancements

## [3.68.3] - 2026-07-26

### Planned

- Future enhancements

## [3.68.2] - 2026-07-26

### Planned

- Future enhancements

## [3.68.1] - 2026-07-26

### Planned

- Future enhancements

## [3.68.0] - 2026-07-25

### Planned

- Future enhancements

## [3.67.1] - 2026-07-25

### Planned

- Future enhancements

## [3.67.0] - 2026-07-24

### Added

- `[DataFeed]` plugin: `exclude='column~pattern'` (#159) — drops any record whose column matches a case-insensitive regex, matching the existing `badge=`/`link=` declarative-param style. Motivated by geohazardwatch#159 (dropping VAAC bulletins re-published inside a general news feed).
- `[DataFeed]` plugin: `format='map'` (#162) — renders any feed source as a Leaflet map instead of only table/list. Vendors Leaflet into the `feeds` addon's own `public/` (served at `/addons/feeds/vendor/leaflet/`, same convention as `calendar`/`journal`/`forms`) so map rendering works for any consumer with zero per-consumer setup. `lat`/`lon` select coordinate columns, `sizeBy` linearly scales marker radius from a numeric column. Motivated by geohazardwatch#162 (wildfire map) — a generic capability rather than a bespoke plugin.

## [3.66.0] - 2026-07-24

### Planned

- Future enhancements

## [3.65.0] - 2026-07-24

### Added

- Canonical addon identity (#927/#928): `package.json` `ngdpbase.slug` is now the single authoritative addon identity, resolved the same import-free way in every layer (`AddonsManager` discovery/`isEnabled`/dedup, and `ConfigurationManager`'s boot-time validator) via a shared `resolveAddonSlug()`. Fixes the drift class behind #672, #924/#925, and the slug half of #926 — `module.name` is now a display label validated against the declared slug at load time, not the source of identity.

## [3.64.0] - 2026-07-24

### Planned

- Future enhancements

## [3.63.0] - 2026-07-23

### Planned

- Future enhancements

## [3.62.1] - 2026-07-23

### Planned

- Future enhancements

## [3.62.0] - 2026-07-23

### Planned

- Future enhancements

## [3.61.1] - 2026-07-23

### Planned

- Future enhancements

## [3.61.0] - 2026-07-22

### Planned

- Future enhancements

## [3.60.0] - 2026-07-22

### Planned

- Future enhancements

## [3.59.0] - 2026-07-22

### Planned

- Future enhancements

## [3.58.0] - 2026-07-22

### Planned

- Future enhancements

## [3.57.0] - 2026-07-22

### Planned

- Future enhancements

## [3.56.0] - 2026-07-21

### Planned

- Future enhancements

## [3.55.0] - 2026-07-21

### Planned

- Future enhancements

## [3.54.0] - 2026-07-20

### Planned

- Future enhancements

## [3.53.0] - 2026-07-20

### Planned

- Future enhancements

## [3.52.0] - 2026-07-20

### Planned

- Future enhancements

## [3.51.0] - 2026-07-17

### Planned

- Future enhancements

## [3.50.0] - 2026-07-16

### Planned

- Future enhancements

## [3.49.1] - 2026-07-16

### Planned

- Future enhancements

## [3.49.0] - 2026-06-08

### Planned

- Future enhancements

## [3.48.1] - 2026-06-03

### Planned

- Future enhancements

## [3.48.0] - 2026-06-02

### Planned

- Future enhancements

## [3.47.1] - 2026-06-02

### Planned

- Future enhancements

## [3.47.0] - 2026-06-01

### Planned

- Future enhancements

## [3.46.1] - 2026-06-01

### Planned

- Future enhancements

## [3.46.0] - 2026-05-30

### Planned

- Future enhancements

## [3.45.0] - 2026-05-28

### Planned

- Future enhancements

## [3.44.9] - 2026-05-28

### Planned

- Future enhancements

## [3.44.8] - 2026-05-28

### Planned

- Future enhancements

## [3.44.7] - 2026-05-28

### Planned

- Future enhancements

## [3.44.6] - 2026-05-28

### Planned

- Future enhancements

## [3.44.5] - 2026-05-28

### Planned

- Future enhancements

## [3.44.4] - 2026-05-28

### Planned

- Future enhancements

## [3.44.3] - 2026-05-28

### Planned

- Future enhancements

## [3.44.2] - 2026-05-28

### Planned

- Future enhancements

## [3.44.1] - 2026-05-27

### Planned

- Future enhancements

## [3.44.0] - 2026-05-27

### Planned

- Future enhancements

## [3.43.10] - 2026-05-27

### Planned

- Future enhancements

## [3.43.9] - 2026-05-26

### Planned

- Future enhancements

## [3.43.8] - 2026-05-26

### Planned

- Future enhancements

## [3.43.7] - 2026-05-26

### Planned

- Future enhancements

## [3.43.6] - 2026-05-26

### Planned

- Future enhancements

## [3.43.5] - 2026-05-26

### Planned

- Future enhancements

## [3.43.4] - 2026-05-26

### Planned

- Future enhancements

## [3.43.3] - 2026-05-26

### Planned

- Future enhancements

## [3.43.2] - 2026-05-26

### Planned

- Future enhancements

## [3.43.1] - 2026-05-26

### Planned

- Future enhancements

## [3.43.0] - 2026-05-26

### Planned

- Future enhancements

## [3.42.0] - 2026-05-25

### Planned

- Future enhancements

## [3.41.2] - 2026-05-25

### Planned

- Future enhancements

## [3.41.1] - 2026-05-25

### Planned

- Future enhancements

## [3.41.0] - 2026-05-24

### Planned

- Future enhancements

## [3.40.0] - 2026-05-24

### Planned

- Future enhancements

## [3.39.3] - 2026-05-23

### Planned

- Future enhancements

## [3.39.2] - 2026-05-23

### Planned

- Future enhancements

## [3.39.1] - 2026-05-23

### Planned

- Future enhancements

## [3.39.0] - 2026-05-23

### Planned

- Future enhancements

## [3.38.1] - 2026-05-23

### Planned

- Future enhancements

## [3.38.0] - 2026-05-22

### Planned

- Future enhancements

## [3.37.0] - 2026-05-22

### Planned

- Future enhancements

## [3.36.1] - 2026-05-22

### Planned

- Future enhancements

## [3.36.0] - 2026-05-22

### Planned

- Future enhancements

## [3.35.0] - 2026-05-22

### Planned

- Future enhancements

## [3.34.0] - 2026-05-22

### Planned

- Future enhancements

## [3.33.0] - 2026-05-22

### Planned

- Future enhancements

## [3.32.0] - 2026-05-21

### Planned

- Future enhancements

## [3.31.0] - 2026-05-21

### Planned

- Future enhancements

## [3.30.0] - 2026-05-21

### Planned

- Future enhancements

## [3.29.1] - 2026-05-21

### Planned

- Future enhancements

## [3.29.0] - 2026-05-21

### Planned

- Future enhancements

## [3.28.0] - 2026-05-21

### Planned

- Future enhancements

## [3.27.1] - 2026-05-21

### Planned

- Future enhancements

## [3.27.0] - 2026-05-20

### Planned

- Future enhancements

## [3.26.1] - 2026-05-20

### Planned

- Future enhancements

## [3.26.0] - 2026-05-20

### Planned

- Future enhancements

## [3.25.1] - 2026-05-20

### Planned

- Future enhancements

## [3.25.0] - 2026-05-19

### Planned

- Future enhancements

## [3.24.4] - 2026-05-19

### Planned

- Future enhancements

## [3.24.3] - 2026-05-19

### Planned

- Future enhancements

## [3.24.2] - 2026-05-19

### Planned

- Future enhancements

## [3.24.1] - 2026-05-19

### Planned

- Future enhancements

## [3.24.0] - 2026-05-19

### Planned

- Future enhancements

## [3.23.0] - 2026-05-19

### Planned

- Future enhancements

## [3.22.0] - 2026-05-19

### Planned

- Future enhancements

## [3.21.0] - 2026-05-18

### Planned

- Future enhancements

## [3.20.1] - 2026-05-18

### Planned

- Future enhancements

## [3.20.0] - 2026-05-18

### Planned

- Future enhancements

## [3.19.1] - 2026-05-18

### Planned

- Future enhancements

## [3.19.0] - 2026-05-17

### Planned

- Future enhancements

## [3.18.0] - 2026-05-17

### Planned

- Future enhancements

## [3.17.0] - 2026-05-17

### Planned

- Future enhancements

## [3.16.1] - 2026-05-16

### Planned

- Future enhancements

## [3.16.0] - 2026-05-16

### Planned

- Future enhancements

## [3.15.1] - 2026-05-16

### Planned

- Future enhancements

## [3.15.0] - 2026-05-16

### Planned

- Future enhancements

## [3.14.6] - 2026-05-15

### Planned

- Future enhancements

## [3.14.5] - 2026-05-14

### Planned

- Future enhancements

## [3.14.4] - 2026-05-14

### Planned

- Future enhancements

## [3.14.3] - 2026-05-14

### Planned

- Future enhancements

## [3.14.2] - 2026-05-14

### Planned

- Future enhancements

## [3.14.1] - 2026-05-13

### Planned

- Future enhancements

## [3.14.0] - 2026-05-12

### Planned

- Future enhancements

## [3.13.3] - 2026-05-12

### Fixed

- **Authenticated user dropdown no longer visually transparent** (#687). The `.dropdown-menu` rule in `public/css/style.css` set `background-color: var(--card-bg)`, which resolves to `var(--bs-body-bg)` — exactly the same color as the page body the dropdown sits over. With no shadow and a thin border, the dropdown looked like part of the page rather than a floating menu, creating confusion about clickable items "behind" it. Added explicit `border: 1px solid var(--border-color)` and a Bootstrap-standard `box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15)` so the dropdown is visually delineated regardless of theme. Background remains theme-driven via `var(--card-bg, #ffffff)` so light/dark themes still inherit the right base color; the shadow + border provide the contrast.

- **"Using FormPlugin" page no longer 404s — removed duplicate `required-pages/a4f9c2e1-…md` copy** (#653). The forms addon's `addons/forms/pages/af15d030-…md` is the canonical "Using FormPlugin" doc; a stale duplicate had been left in `required-pages/` with a different UUID and divergent content, both claiming `title: Using FormPlugin`.
- The title collision broke link resolution from the Form Definition Reference page (which renders `[Using FormPlugin]` markup) — visitors clicking the link got "Not Found". Removing the `required-pages/` duplicate leaves the forms addon's version as the only source of truth for new installs.
- Migration for existing instances: the duplicate may still exist in operator data (was seeded from required-pages on first install). Delete with `rm "$SLOW_STORAGE/pages/a4f9c2e1-7b3d-4a85-9e6f-1c2d3b4a5e6f.md"` and restart.
- Follow-up worth a separate issue: `Form Definition Reference` (`bb03859d`) is also a forms-addon doc but still lives in `required-pages/` — should migrate to `addons/forms/pages/` so the whole forms doc set lives with the addon.

- **Profile pages now carry `description`, `badge`, and `author-lock` metadata on both create and rename** (#661). `UserManager.createUserPage()` now writes `description: "{displayName}'s profile page"` and `badge: "Profile {displayName}"` alongside the pre-existing `author-lock: true`. The `/profile` rename path in `WikiRoutes.updateProfile` re-applies these three fields on the renamed page, so a profile page that was originally manually created (or had its metadata stripped) gets back-filled correctly when the user changes their `profilePage` setting. Two new tests in `UserManager.createUserPage.test.ts` cover the new fields.

- **Auto-created user profile pages now use `system-category: "general"` instead of the invalid `"User Pages"`** (#662). `UserManager.createUserPage()` was hardcoding `'User Pages'` as the category when seeding a profile page for a new user. `"User Pages"` is not in the configured set of valid categories (`general`, `system`, `documentation`, `developer`, `addon`).
- Any subsequent save of that profile page through the `/edit` UI returned **HTTP 400** with *"Invalid system-category: 'User Pages'. Valid categories are: addon, documentation, general, system"*. New profile pages now get `general`, which matches both the config's literal description ("General User pages") and the validator's silent-fallback default.
- Migration for existing instances: user pages already on disk still carry the legacy `'User Pages'` value. Either change the dropdown to `general` on next save, or one-liner across the storage dir: `find "$SLOW_STORAGE/pages" -name '*.md' -exec sed -i '' "s/^system-category: 'User Pages'$/system-category: 'general'/" {} +`

- **Test files no longer surface "Cannot find name 'describe'/'test'/'expect'" diagnostics in the IDE or in `tsc -b tsconfig.test.json`** (#667). `tsconfig.test.json` already had `"types": ["vitest/globals", "node"]`, but the TypeScript language server doesn't route test files there without a project-references link.
- Fixed by adding `composite: true` to `tsconfig.test.json` and `references: [{ path: "./tsconfig.test.json" }]` to `tsconfig.json`. Composite mode requires declaration emit, sent to a new gitignored `.tsbuildtest/` directory (`emitDeclarationOnly: true` skips JS emit). Test config `include` also narrowed to test-file patterns only (was overlapping with the main project's `src/**/*.ts`).
- No runtime change; `npm run build` and `npm run typecheck` still behave identically. Verified: `npx vitest run src/utils/__tests__/pluginFormatters.test.ts` → 79/79 pass; `tsc -b tsconfig.test.json | grep "Cannot find name '(describe|test|expect|...)'"` → 0 matches.

### Planned

- Future enhancements

## [3.13.2] - 2026-05-11

### Fixed

- **Seeded `request-access` page now categorised as `system` (was `documentation`) and links to `/contact`** for the contact path. The page is registration-closed UX scaffolding, not user-authored documentation, so `system` is the correct filter bucket for admin views (matches LeftMenu, Privacy Notice, Markdown Cheat Sheet). The body's `[Contact Us]` link previously resolved to `/view/Contact%20Us` (the seeded text page); it now uses JSPWiki's link-with-target syntax `[Contact Us|/contact]` so visitors who want access land on the form route. Updates the corresponding row in `docs/admin/Contact-Us.md` *Known limitations* — the composition gap with `ngdpbase.application.registration: false` is now closed at the seed level. New deployments inherit the fix; existing instances retain whatever copy lives on their persistent volume.

- **`POST /contact` returns HTTP 200 (not 400) on `EmailManager.sendTo` failure** (#677). Mail-send failure is a server-side relay problem, not a client validation error — the response now matches the documented state matrix in `docs/admin/Contact-Us.md` and the Phase B (#670) UX-honesty intent: visitor sees the form re-rendered with "We could not send your message right now." and an HTTP 200, instead of a misleading 400 that suggested the visitor's input was at fault. `renderForm` in `src/routes/WikiRoutes.ts` `processContact` gains an optional `httpStatus` override (default still derives from `formError`); the mail-failed call site passes `200` explicitly. Two existing tests in `src/routes/__tests__/WikiRoutes.contact.test.ts` updated from `toBe(400)` → `toBe(200)` (one of them carried a comment that explicitly documented the buggy behaviour as deferred — the deferral ends with this fix).

---

## [3.13.1] - 2026-05-10

### Added

- **`assertConfiguredAddonsExist` startup invariant** (#672, closes #672) — `ConfigurationManager.initialize()` now refuses to start if any `ngdpbase.addons.<id>.enabled = true` key references an `<id>` that has no matching addon directory in any configured `addons-path`. Mirrors `AddonsManager.scanAddonsDirectory()` discovery semantics (directory name + `index.js` or `index.ts` present), but without importing the modules — boot-time speed. Catches the silent-misconfig failure mode that caused the 2026-05-10 `geohazardwatch.com` outage (#671), where the deploy configmap had `ngdpbase.addons.ve-geology.enabled = true` but the on-disk addon was renamed to `geohazardwatch`.
- **Did-you-mean suggestions** for typo-class misconfigs — Levenshtein-distance match (≤ 2) against discovered addon names. The error message reads:

  ```
  [ConfigurationManager] Refusing to start: 'ngdpbase.addons.<id>.enabled = true'
  references unknown addon(s): "calandar" (did you mean "calendar"?). Available
  addons in ["./addons"]: calendar, elasticsearch, forms, journal. Either rename
  the config key to match a discovered addon, or remove the enabled key. (#672)
  ```

  Rename-class misconfigs (e.g., `"ve-geology"` → `"geohazardwatch"`, edit distance > 2) won't get a "did you mean" hint, but the *Available addons* list still tells the operator the right new name.

- 13 new tests in `src/managers/__tests__/ConfigurationManager.test.ts` covering happy paths (empty config, single match, multiple addons-path entries, `enabled: false` ignored), failure paths (typo with suggestion, rename without suggestion, multiple bad keys, dotfile/`shared`/no-index excluded from discovery), and the error message structure.

### Notes

- This is the safety-net for #671's class of bug: addon-rename refactors that update the source repo's directory but leave a downstream config repo's `ngdpbase.addons.<old-id>.enabled` key stale. Prior to this invariant, AddonsManager silently treated such configs as "addon disabled" — a misconfigured pod would boot fine, register no addon plugins/managers, and only surface the failure when a page using the addon was rendered (often hours later, via a user complaint).
- Patch bump because behaviour changes only on already-broken configs (a startup failure replaces a silent-and-broken runtime). Operators with valid configs see no change.
- Same shape as the existing startup invariants: `assertBaseUrlConfigured` (#642), `assertContactPageNotLoop` (#658), `assertContactRecipientWellFormed` (#670 Phase D).
- See `jwilleke/geohazardwatch#35` for the complementary dev-time check (CONTRIBUTING.md checklist + optional CI rename-detector). The two issues attack the same failure class from different ends — dev-time checklist prevents the bad commit, runtime invariant catches it on next boot.

## [3.13.0] - 2026-05-10

### Added

- **Configurable anti-spam for `/contact`** (#670 Phase E — closes #670) — the honeypot field and per-IP rate limit are now individually toggleable and tunable via four new config keys under `ngdpbase.mail.*`. Defaults preserve pre-3.13 behaviour (both on, 5 submissions / 15-minute window). The keys live under `mail.*` rather than `application.contact.*` because they're scoped to "mail-bearing public forms" — today only `/contact`, but future forms (re-enabled `/register`, magic-link request, password-reset, subscription) will read the same flags.
- **`ngdpbase.mail.honeypot.enabled`** (boolean, default `true`) — when `false`, the hidden `_website` field is no longer silently rejected; bots that fill it succeed normally. Useful when an upstream WAF or anti-bot layer is doing the work and you don't need a second check.
- **`ngdpbase.mail.rate-limit.enabled`** (boolean, default `true`) — when `false`, no submissions are 429'd; the rate-limiter counter is not consumed. Useful when a WAF / proxy upstream is throttling.
- **`ngdpbase.mail.rate-limit.max-submissions`** (number, default `5`) — max submissions per IP per `window-minutes` window before the 429 trips.
- **`ngdpbase.mail.rate-limit.window-minutes`** (number, default `15`) — rate-limit window length in minutes.
- **`SimpleRateLimiter.configure(opts)`** — runtime reconfiguration without resetting in-flight bucket state. Existing per-IP counters keep accruing under the new options. Shrinking `windowMs` may cause in-flight buckets to be treated as expired on the next consume — desired semantics so operators tightening the limiter don't have to wait out the old window.
- 7 new integration tests in `src/routes/__tests__/WikiRoutes.contact.test.ts` covering both toggles (default-on / explicitly-off), max-submissions tuning (`max=2` vs `max=10`), and `Retry-After` reflecting `window-minutes`. 3 new unit tests in `src/utils/__tests__/SimpleRateLimiter.test.ts` for `configure()` (max update, windowMs shrink, state preservation).

### Changed

- `src/routes/WikiRoutes.ts` `processContact` — reads the four new keys at the top of the handler, calls `contactRateLimiter.configure(...)` so config changes take effect on the next POST without restart, and gates each defense on its `enabled` toggle.
- `_comment_application_contact` in `config/app-default-config.json` left as-is; new `_comment_mail_anti_spam` block above the `mail.honeypot.*` / `mail.rate-limit.*` keys explains the cross-form scope.
- `docs/admin/Contact-Us.md` *Security & abuse defenses* section gains a *Tuning* subsection with the four-key matrix and two worked examples (loosen for WAF-backed deploys, tighten for high-spam ones); *Known limitations* table flips Phase E from "Fix planned" to "Fixed in v3.13.0"; *Roadmap* tick. With Phase E shipped, all five phases of the original review are complete.

### Notes

- This is Phase E of #670 — the umbrella issue is now closed (all five phases shipped). Future mail-bearing public forms should read the same `ngdpbase.mail.{honeypot,rate-limit}.*` keys rather than introducing per-form duplicates.

## [3.12.1] - 2026-05-10

### Added

- **Recipient list validation at startup** (#670 Phase D) — `ConfigurationManager.assertContactRecipientWellFormed` runs at boot and refuses to start if any segment of `ngdpbase.application.contact.recipient` is malformed. Splits on `,`, trims each segment, regex-checks the shape (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — same pragmatic check the form uses), and throws a clear error identifying the malformed segment(s) and pointing operators at the inline-CSV / single-address / empty options. Empty / whitespace-only `recipient` is a no-op (resolves at request time from the admin list, as before).
- **New *Recipient patterns* section** in `docs/admin/Contact-Us.md` documenting the three operator-facing patterns (single address / inline CSV / empty), including a decision matrix and a worked example of the startup error message. Both inline-CSV and distribution-list patterns are explicitly supported and explained.
- 10 new tests in `src/managers/__tests__/ConfigurationManager.test.ts` covering empty/whitespace recipients, single addresses, multi-address CSVs (with mixed spacing), various malformed shapes (no `@`, no TLD, garbage segment, trailing comma), and the error message's operator-facing copy.

### Changed

- `_comment_application_contact` in `config/app-default-config.json` extended to describe both recipient patterns and the new startup invariant.

### Notes

- This is Phase D of #670. Pre-3.12.1 operators with valid recipients see no change; pre-3.12.1 operators with a typo see a clear startup error rather than a runtime surprise on the next contact submission. Phase E (configurable anti-spam under `ngdpbase.mail.{honeypot,rate-limit}.*`) is the only remaining slice.

## [3.12.0] - 2026-05-10

### Added

- **Submission persistence for `/contact`** (#670 Phase C) — every legitimate `POST /contact` submission is now appended to a JSONL audit log, regardless of whether mail delivery succeeds. Survives mail failure, captures attempts on misconfigured deploys, and gives operators a durable record. Honeypot- and rate-limit-rejected submissions are NOT persisted (they're already in the warn log and would inflate the audit file); validation errors are NOT persisted (visitor mistakes, not attempted communications).
- **`ContactSubmissionLog`** (`src/utils/ContactSubmissionLog.ts`) — minimal append-only JSONL writer. Creates the parent directory if missing; failures to append are logged at error level but do NOT throw. Best-effort — persistence must not block the visitor-facing response. 6 unit tests in `src/utils/__tests__/ContactSubmissionLog.test.ts`.
- **`ngdpbase.application.contact.persist.enabled`** (boolean, default `true`) — toggle for persistence. Set to `false` to disable the audit log entirely (e.g., privacy concerns).
- **`ngdpbase.application.contact.persist.path`** (string, default `""`) — override the log file path. Empty defaults to `{instanceDataFolder}/contact-submissions.log` (resolves under `FAST_STORAGE` / `INSTANCE_DATA_FOLDER` / `./data`). Set to an absolute path to send the log to a mounted log volume off the data tree.
- **Audit entry shape** — one JSON object per line:

  ```json
  {
    "ts": "2026-05-10T12:34:56.789Z",
    "ip": "198.51.100.7",
    "userAgent": "Mozilla/...",
    "referer": "/view/contact-us",
    "name": "Alice",
    "email": "alice@example.com",
    "subject": "Hello",
    "message": "...",
    "recipient": "ops@example.com",
    "mailResult": "sent"
  }
  ```

- **Four `mailResult` values** — `"sent"` (sendTo succeeded), `"mail-failed"` (sendTo threw), `"mail-disabled"` (EmailManager unregistered or `mail.enabled=false`), `"no-recipient"` (resolver returned null). The recipient address is only present in the log file — never rendered to clients.
- 9 new integration tests in `src/routes/__tests__/WikiRoutes.contact.test.ts` covering each `mailResult` path, the no-persist-on-honeypot/rate-limit/validation invariants, the `persist.enabled=false` opt-out, and the recipient-in-log-but-not-in-response invariant.

### Changed

- `src/routes/WikiRoutes.ts` `processContact` — added an inline `persistSubmission(mailResult, recipient)` closure called from each branch that represents a legitimate submission attempt.
- `_comment_application_contact` in `config/app-default-config.json` extended to describe the two new `persist.*` keys.
- `docs/admin/Contact-Us.md` updated: new *Submission persistence* section; *Known limitations* table flips Phase C from "Fix planned" to "Fixed in v3.12.0"; Phase C ticked in *Roadmap*.

### Notes

- This is Phase C of #670. No log rotation in v1 — operators who expect significant volume should rotate externally (logrotate, etc.). Phase D (recipient list validation) and Phase E (configurable anti-spam) remain.

## [3.11.5] - 2026-05-10

### Fixed

- **Mail-disabled UX honesty** (#670 Phase B) — the `/contact` form no longer renders or accepts submissions when mail is unavailable. Closes a silent-fail bug where misconfigured production deploys returned "Message sent" to visitors while the server log warned no mail was sent. Both `GET /contact` and `POST /contact` now check `EmailManager` early:
  - `EmailManager` is not registered → render `state: 'not-configured'` and log at **error** level (was: GET rendered the form anyway; POST rendered not-configured but only after validation).
  - `ngdpbase.mail.enabled = false` → render `state: 'not-configured'` and log at **error** level (was: GET rendered the form; POST proceeded to call `sendTo` with a `console`-provider warning, then rendered "Message sent").
  - Recipient null (existing behaviour, unchanged) → render `state: 'not-configured'`.
- POST `/contact` short-circuits the mail check **before** field validation, so a misconfigured deploy returns the not-configured view immediately rather than after the visitor's input is parsed and validated. The post-validation `mailReady` invariant guard is kept as defense-in-depth — it should never fire under the new flow.

### Changed

- `views/contact.ejs` admin hint on the not-configured view extended to mention the `ngdpbase.mail.enabled: true` requirement alongside the existing recipient guidance, and points at `docs/admin/email-setup.md`.
- `docs/admin/Contact-Us.md` updated: state-matrix tables now reflect the mail-disabled branch; *Mail dependency* section rewritten to describe the new behaviour; Phase B ticked in *Roadmap*.

### Notes

- This is Phase B of #670. Phases C–E remain (submission persistence, recipient list validation, configurable anti-spam).

## [3.11.4] - 2026-05-10

### Added

- **Footer link to `/contact`** (#670 Phase A) — every page now renders a "Contact" link in the footer when the contact feature is fully available, i.e. `ngdpbase.application.contact.enabled = true` AND `ngdpbase.mail.enabled = true` AND a recipient resolves (explicit `contact.recipient` or first admin user with a non-sentinel email). When any of those is false, the link is suppressed — no advertised path that leads to a misconfigured form.
- **`ngdpbase.application.contact.footer.enabled`** config key (default `true`). Lets operators keep `/contact` reachable without advertising it in the footer (e.g., during a soft launch).
- **`contactAvailable` and `contactFooterEnabled`** plumbed through `WikiRoutes.getCommonTemplateData` so the footer view and any future header/menu chrome read the same single-source-of-truth boolean. The recipient resolver is only called when both `contact.enabled` and `mail.enabled` are true (short-circuit), so dormant deploys pay no per-render cost.
- New section in `docs/admin/Contact-Us.md` documenting the footer link, the `contactAvailable` derivation, and the new config key.

### Changed

- `views/footer.ejs` gains a `contactAvailable && contactFooterEnabled`-gated block rendering `<a href="/contact"><i class="fas fa-envelope"></i> Contact</a>`.
- `_comment_application_contact` in `config/app-default-config.json` extended to describe the new `footer.enabled` key.

### Notes

- This is Phase A of #670. Phase B (mail-disabled UX honesty), Phase C (submission persistence to JSONL), Phase D (recipient list validation), and Phase E (configurable anti-spam under `ngdpbase.mail.{honeypot,rate-limit}.*`) ship in subsequent patches/minor.

## [3.11.3] - 2026-05-09

## [3.11.2] - 2026-05-08

### Fixed

- **`npm run version:*` shortcuts** (#659) — pointed `version:show` /
  `version:patch` / `version:minor` / `version:major` / `version:help`
  in `package.json` at the working `src/utils/version.ts` (canonical per
  `AGENTS.md`) instead of the duplicate `scripts/version.ts`, which used
  CJS-style `__dirname` and crashed under ESM (`"type": "module"`) with
  `ReferenceError: __dirname is not defined in ES module scope`.
- Deleted `scripts/version.ts` so there is one and only one version
  script: `src/utils/version.ts`. AGENTS.md unchanged — already pointed
  at the canonical location. Workaround `npx tsx src/utils/version.ts
  <bump>` is no longer needed; the npm shortcuts work directly.

## [3.11.1] - 2026-05-08

### Added

- **`POST /contact`** handler (#658 iteration 3 — closes #658) — wires up
  the form preview shipped in 3.11.0. Pipeline:
  - kill switch check (`contact.enabled = false` → 404)
  - operator-redirect check (`contact.page` set → 405)
  - per-IP rate limit (5 submissions / 15-minute rolling window) → 429
  - honeypot (`_website` field; bots fill, humans don't) → 200 silent
    success without sending mail
  - input validation (name 1-100, email 1-254 + format, optional subject
    ≤200, message 1-5000) — re-renders form with error on failure (HTTP 400)
  - recipient resolution via `UserManager.getContactRecipient` — null →
    render not-configured branch (no mail, no leak)
  - mail send via existing `EmailManager.sendTo()` → 200 with success view
- **`SimpleRateLimiter`** (`src/utils/SimpleRateLimiter.ts`) — minimal
  in-memory per-key rate limiter, ~80 lines. Module-scope per pod;
  distributed deployments get per-replica counters, not a shared budget.
  Documented in `docker/HEADLESS-DEPLOYMENT-NOTES.md` §9 with guidance to
  run a real WAF / proxy upstream for cross-replica protection.
  7 unit tests in `src/utils/__tests__/SimpleRateLimiter.test.ts`.
- **`views/contact.ejs`** updated — submit button enabled, "iteration 3
  coming" banner removed, real `<form action="/contact" method="POST">`
  with required fields, honeypot input, value-preserving form re-render
  on validation error, success view ("Message sent — we typically respond
  within a few days") for `state: 'submitted'`.
- 14 new POST tests in `src/routes/__tests__/WikiRoutes.contact.test.ts`
  covering kill switch, redirect, happy path, default-subject fallback,
  honeypot silent success, all validation paths, dormant recipient,
  EmailManager failure, rate limit (429 + Retry-After), and the
  "recipient never appears in response body" invariant.
- `docker/HEADLESS-DEPLOYMENT-NOTES.md` §9 — operator guide for
  activating the contact feature: set admin email off the install-default
  sentinel OR set `contact.recipient` explicitly; configure
  `ngdpbase.mail.*` for actual delivery; `contact.page` override path.

### Known limitation

- POST `/contact` does **not** validate CSRF tokens. The codebase has no
  app-wide CSRF middleware (`csurf` is in `package.json` but never
  imported); existing POST routes (`/register`, `/admin/*`) also skip
  the check. Adding it only for `/contact` would be inconsistent. The
  honeypot + rate limit + recipient sentinel cover the realistic abuse
  cases for this unauthenticated form. The CSRF gap is tracked as #663
  and affects all POST routes equally.

## [3.11.0] - 2026-05-08

### Added

- **`GET /contact`** route (#658 iteration 2) — built-in contact endpoint with
  a four-state behavior matrix:
  - `contact.enabled = false` → 404 (kill switch)
  - `contact.page = "<slug>"` → 302 → `/view/<slug>` (operator-owned override)
  - `contact.page = ""` + recipient resolved → render form preview view
  - `contact.page = ""` + no routable admin email → render
    "Contact form is not configured" view
- Three new config keys, all under `ngdpbase.application.contact.*`:
  - **`ngdpbase.application.contact.enabled`** (boolean, default `true`) —
    kill switch.
  - **`ngdpbase.application.contact.page`** (string, default `""`) — slug to
    redirect `/contact` to instead of rendering the built-in form. Cannot
    equal `"contact"` — a redirect loop, rejected at startup with a clear
    error message (`ConfigurationManager.assertContactPageNotLoop`).
  - **`ngdpbase.application.contact.recipient`** (string, default `""`) —
    explicit recipient address (or list/alias). When empty, recipient is
    resolved at request time to the first user with the `admin` role whose
    email is non-empty AND not the install-default sentinel
    `admin@localhost`. The sentinel rule keeps the contact feature dormant
    on fresh installs that haven't set a real admin email yet, instead of
    mailing into a black hole. The resolved address is **never rendered to
    clients** — server-side only.
- **`UserManager.getContactRecipient(override)`** — recipient resolution
  helper (11 unit tests in
  `src/managers/__tests__/UserManager.getContactRecipient.test.ts`).
- **`views/contact.ejs`** — branches on `state` (`form` | `not-configured`).
  In iteration 2 the form view shows the field layout with the submit button
  disabled and a banner ("Submission is not yet wired up — coming in #658
  iteration 3"). The actual POST handler, mail send, rate limit, honeypot,
  and CSRF wiring land in iteration 3.
- 9 route tests in `src/routes/__tests__/WikiRoutes.contact.test.ts` cover
  the full state matrix and the "recipient not rendered to client" invariant.
- 4 startup-invariant tests in `ConfigurationManager.test.ts` for the
  `contact.page === "contact"` loop guard (including whitespace-trim).

### Changed

- `ConfigurationManager.initialize()` now calls
  `assertContactPageNotLoop()` after `assertBaseUrlConfigured()` —
  refuses to start if `contact.page` is set to `"contact"`.

## [3.10.6] - 2026-05-08

### Added

- **`Contact Us`** required page (slug `contact-us`, system-category
  `documentation`) — generic operator-overridable copy referencing the
  `[{$applicationname}]` placeholder. Closes the redlinked `[Contact Us]`
  link from the v3.10.4 `request-access` page so visitors who follow it
  reach a real destination instead of an unresolved page-link.
  Iteration 1 of #658 — the `/contact` route, config keys
  (`ngdpbase.application.contact.{enabled,page,recipient}`), recipient
  resolution, and form mechanism are deferred to iterations 2 and 3.

## [3.10.5] - 2026-05-08

### Fixed

- `views/header.ejs` — replaced two hardcoded `/wiki/<slug>` URLs with the
  canonical `/view/<slug>`:
  - Line 134 (added by #654, v3.10.3): the **Request access** button rendered
    when `ngdpbase.application.registration: false`
  - Line 374 (added by #537): pinned-page links in the My Links sidebar
  Both were regressions against the #364 migration ("Renamed /wiki/ URL path
  to /view/ across all source, views, plugins, tests"). The legacy
  `/wiki/:page` route still 301-redirects to `/view/:page`
  (`WikiRoutes.ts:8566-8569`), so existing bookmarks and external links keep
  working. Per AGENTS.md ("Never Use the Word 'Wiki'") and the operator's
  documented preference, the canonical `/view/` path is the only one that
  should appear in newly-written or recently-added user-facing surface area.

## [3.10.4] - 2026-05-08

### Fixed

- Default `ngdpbase.application.registration.redirect-page` slug `request-access`
  pointed at no shipped page. Added `required-pages/<uuid>.md` (slug
  `request-access`, title "Request access") with generic operator-overridable
  copy referencing `[Contact Us]`. Existing installs pick up the new page on
  the next `./server.sh restart` — `VersioningFileProvider`'s boot scanner
  auto-loads required-pages whose UUID is not yet in the index. For ongoing
  required-page changes (modifications, title drift, UUID conflicts), admins
  can review and selectively sync via `/admin/required-pages` — the
  comparison UI shows per-page `new` / `modified` / `current` / `uuid-mismatch`
  status, supports force-sync, reconciliation, and addon-page diffing, and
  skips pages with `user-modified: true` so operator edits are preserved.
  Operators that already shipped their own page titled "Request access" keep
  theirs: the boot scanner skips on title collision
  (`VersioningFileProvider.ts:480`). Fixes #657 (introduced by #654 in 3.10.3).

## [3.10.3] - 2026-05-08

### Added

- **`ngdpbase.application.registration`** (boolean, default `true`) — operator
  switch to disable self-registration. When `false`:
  - `GET /register` and `POST /register` return HTTP 404
  - The header's "Register" button is replaced by a "Request access" link
    pointing at the wiki page named by
    `ngdpbase.application.registration.redirect-page` (default
    slug: `request-access`). Operators control that page's content via the
    wiki UI — drop in a `[{Form …}]` plugin invocation, contact text, etc.
  - OIDC auto-provisioning of brand-new users (`GoogleOIDCProvider`) is
    rejected — the existing `ngdpbase.auth.google-oidc.auto-provision` key
    is overridden when application-level registration is off
  - Login for existing users (password / magic-link / OIDC) is unaffected
  - Admin-driven user creation via `POST /admin/users` is unaffected — gated
    by the `user-create` permission, not this flag
- **`ngdpbase.application.registration.redirect-page`** (string, default
  `"request-access"`) — wiki slug the header button links to when
  registration is disabled.

### Changed

- `getCommonTemplateData()` now exposes `allowRegistration` (boolean) and
  `registrationRedirectPage` (string) to all views; `views/header.ejs`
  branches on the former to choose between Register and Request access.

## [3.10.2] - 2026-05-07

## [3.10.1] - 2026-05-07

## [3.10.0] - 2026-05-07

### Changed

- **#642** Iteration 3 (final): magic-link auth now derives its verify-link host from `ConfigurationManager.getBaseURL()` at runtime instead of reading a separate config key. New `ConfigurationManager.isBaseUrlExplicit()` accessor. `AuthManager.initialize()` refuses to register the magic-link provider unless `ngdpbase.application.base-url` is explicitly configured (via custom config or `NGDPBASE_BASE_URL`) — magic-link tokens are credentials embedded in URLs, so emitting them pointing at the unconfigured localhost default would leak credentials. `WikiRoutes` magic-link initiate handler simplified — no longer computes its own baseUrl. `AuthInitiateContext.baseUrl` field removed (no longer used).

### Removed

- `ngdpbase.auth.magic-link.base-url` config key (#642) — magic-link host is now derived from the canonical `ngdpbase.application.base-url` at runtime. **No migration shim** for this key — operators that previously set it can simply remove it; the canonical key is the single source of truth.
- `MagicLinkConfig.baseUrl` field (#642) — the provider reads it from the engine at runtime.
- `AuthInitiateContext.baseUrl` field (#642) — providers derive base URL from config, callers don't pass it in.

This closes #642. All three iterations shipped: canonical key + migration shim (3.9.2), startup invariant + delete example file (3.9.3), magic-link cleanup + security check (3.10.0).

## [3.9.3] - 2026-05-07

### Changed

- **#642** Iteration 2: hardening. Added startup invariant in `ConfigurationManager` that refuses to start when `.install-complete` exists but `ngdpbase.application.base-url` is not explicitly set in custom config or via `NGDPBASE_BASE_URL`. Deleted `config/app-custom-config.example` and removed the `copyExampleConfigs()` install path that consumed it — install now writes the custom config from the form data alone. Dockerfile no longer copies the template; headless install docs updated to note operators must provide their own config or env-var overrides.

### Removed

- `config/app-custom-config.example` (#642) — was the source of the camelCase key spread; superseded by the install form, k8s ConfigMaps, and env-var overrides.
- `InstallService.copyExampleConfigs()` (#642) — no longer needed.
- `HeadlessInstallResult.steps.configsCopied` field (#642) — always 0 now that example copying is gone.

## [3.9.2] - 2026-05-07

### Changed

- **#642** Iteration 1: unified `ngdpbase.base-url` and `ngdpbase.baseURL` onto canonical `ngdpbase.application.base-url`. Migration shim in `ConfigurationManager` copies legacy keys into the canonical one at load time with a deprecation warning. Forms addon, k8s configmap, Dockerfile comment, and docs all updated.

## [3.9.1] - 2026-05-07

### Added

- **#620** Identity-cache hit/miss telemetry. New OpenTelemetry counter `${prefix}_cache_lookups_total` with attributes `{manager, cache, result}` covers all seven cache lookup points in `RoleManager`, `PersonManager`, and `OrganizationManager`. No-op when telemetry is disabled. 8 new tests in `identityCaches.test.ts`.

## [3.9.0] - 2026-05-04

## [3.8.0] - 2026-05-03

## [3.7.0] - 2026-05-03

## [3.6.0] - 2026-05-02

## [3.5.4] - 2026-05-02

## [3.5.3] - 2026-05-02

## [3.5.2] - 2026-05-02

## [3.5.1] - 2026-05-02

## [3.5.0] - 2026-05-02

## [3.4.0] - 2026-05-01

## [3.3.7] - 2026-04-30

## [3.3.6] - 2026-04-23

## [3.3.5] - 2026-04-22

## [3.3.4] - 2026-04-21

## [3.3.3] - 2026-04-13

## [3.3.2] - 2026-04-13

## [3.3.1] - 2026-04-12

## [3.3.0] - 2026-04-08

## [3.1.4] - 2026-04-06

## [3.1.3] - 2026-04-06

## [3.1.1] - 2026-04-05

## [3.1.0] - 2026-04-05

## [3.0.15] - 2026-04-04

## [3.0.14] - 2026-04-04

## [3.0.13] - 2026-04-02

## [3.0.12] - 2026-04-02

## [3.0.11] - 2026-04-01

## [3.0.10] - 2026-03-30

## [3.0.9] - 2026-03-29

## [3.0.8] - 2026-03-26

## [3.0.7] - 2026-03-26

## [3.0.6] - 2026-03-24

## [3.0.5] - 2026-03-24

## [3.0.4] - 2026-03-24

## [3.0.3] - 2026-03-24

## [3.0.2] - 2026-03-24

## [3.0.1] - 2026-03-23

## [3.0.0] - 2026-03-23

## [2.0.11] - 2026-03-23

## [2.0.10] - 2026-03-23

## [2.0.9] - 2026-03-23

## [2.0.8] - 2026-03-23

## [2.0.7] - 2026-03-23

## [2.0.6] - 2026-03-23

## [2.0.5] - 2026-03-23

**See [docs/project_log.md](./docs/project_log.md) for detailed AI agent session logs and daily work history.**

## [1.5.9] - 2026-02-06

### Fixed

- server.sh stop race condition - delete from PM2 first (#231)
- ReferringPagesPlugin regex for page names with parentheses (#239)

### Added

- Thumbnail generation with Sharp library (#232)
- Insert from Browse Attachments when editing (#232)
- User-facing Attachments documentation page (#232)

### Changed

- ImagePlugin default display mode from 'float' to 'block' (#236)

---

## [1.5.2] - 2026-02-01

### Fixed

- Configuration Management save no longer redirects away from page (#227)
- Admin Dashboard layout updated (#227)
- User preferences not persisting due to query string nested parsing (#226)
- Create New Page defaults and system-category handling (#225)

---

## [1.5.0] - 2025-12-12

### BREAKING CHANGE - Data Directory Consolidation

All instance-specific data directories have been consolidated under `./data/` for simpler deployment and Docker volume mounting.

#### Migration Required

**Existing installations MUST run the migration script before upgrading:**

```bash
./scripts/migrate-to-data-dir.sh
```

Or with dry-run first:

```bash
./scripts/migrate-to-data-dir.sh --dry-run
```

#### New Directory Structure

See [Project Structure](ARCHITECTURE.md)

```
data/
├── pages/        - Wiki content (was ./pages)
├── users/        - User accounts (was ./users)
├── attachments/  - File attachments (unchanged)
├── logs/         - Application logs (was ./logs)
├── search-index/ - Search index (was ./search-index)
├── backups/      - Backup files (was ./backups)
├── sessions/     - Session files (was ./sessions)
└── versions/     - Page versions (unchanged)
```

#### Config Property Changes

| Property | Old Value | New Value |
| ---------- | ----------- | ----------- |
| `ngdpbase.page.provider.filesystem.storagedir` | `./pages` | `./data/pages` |
| `ngdpbase.user.provider.storagedir` | `./users` | `./data/users` |
| `ngdpbase.search.provider.lunr.indexdir` | `./search-index` | `./data/search-index` |
| `ngdpbase.logging.dir` | `./logs` | `./data/logs` |
| `ngdpbase.audit.provider.file.logdirectory` | `./logs` | `./data/logs` |
| `ngdpbase.backup.directory` | `./backups` | `./data/backups` |

### Added

- **Docker Support**: Simplified Docker deployment with single volume mount
  - Updated Dockerfile for consolidated data structure
  - Updated docker-compose.yml for single `./data` volume
  - Updated Docker documentation (README.md, DOCKER.md)
- **Migration Script**: `scripts/migrate-to-data-dir.sh` for existing installations
- **GitHub Issues**: #169 (LoggingProvider pattern), #170 (BackupProvider pattern)

### Changed

- Marked legacy config properties (`ngdpbase.directories.*`, `ngdpbase.jsonuserdatabase`, etc.)
- Docker now requires only one volume mount instead of multiple

### Documentation

- Updated AGENTS.md with current sprint status
- Updated docs/project_log.md with session details
- Updated docker/README.md and docker/DOCKER.md

## [1.4.0] - 2024-10-16

### Added - Version History Feature (Epic #124)

Complete page versioning system with JSPWiki-style version management.

#### Phase 1-2: Foundation & Core Provider

- **VersioningFileProvider**: File-based storage with complete version history
  - Delta storage using fast-diff algorithm (80-90% space savings)
  - Gzip compression for old versions
  - Checkpoint system every N versions for fast retrieval
  - LRU cache for recently accessed versions
  - Backward compatible with FileSystemProvider
- **DeltaStorage utility**: Efficient diff creation and application
- **VersionCompression utility**: Gzip compression/decompression

#### Phase 3: Version Retrieval & Restoration

- `getVersionHistory()` - Retrieve all versions for a page
- `getPageVersion()` - Get specific version content
- `compareVersions()` - Compare any two versions with diff
- `restoreVersion()` - Restore page to previous version (creates new version)
- Metadata tracking: author, date, change type, comment, content hash

#### Phase 4: Migration & Initialization

- Automatic migration from FileSystemProvider on first startup
- Creates v1 for all existing pages
- Builds centralized page-index.json
- Zero downtime deployment
- Manual migration script: `npm run migrate:versioning`

#### Phase 5: Maintenance & Optimization

- `purgeOldVersions()` - Clean up old versions with retention policies
- Configurable retention: maxVersions and retentionDays
- Milestone preservation (v1, every 10th version)
- Storage analytics and reporting
- CLI maintenance tool: `npm run maintain:*`
- Compression of old versions
- Integrity verification

#### Phase 6: UI Integration

- **REST API Endpoints**:
  - `GET /api/page/:identifier/versions` - List versions
  - `GET /api/page/:identifier/version/:version` - Get version
  - `GET /api/page/:identifier/compare/:v1/:v2` - Compare versions
  - `POST /api/page/:identifier/restore/:version` - Restore version
- **Page History View** (`/history/:page`):
  - Complete version list with metadata table
  - Visual indicators (current, checkpoints, compression)
  - View, compare, and restore actions
  - AJAX-powered version preview modal
- **Diff Viewer** (`/diff/:page`):
  - Unified and side-by-side comparison modes
  - Syntax highlighting (additions/deletions/unchanged)
  - Diff statistics
- **Page View Integration**:
  - Version info banner on all pages
  - Info dropdown → Page History link
  - Quick access to version features

#### Phase 7: Testing & Documentation

- **Comprehensive Test Suite**:
  - 28 API endpoint tests (100% coverage)
  - Unit tests for VersioningFileProvider
  - Integration tests for UI workflows
  - Edge case and security testing
- **User Documentation**:
  - Complete user guide (45+ pages)
  - Step-by-step instructions
  - FAQ and troubleshooting
- **API Documentation**:
  - Full REST API reference (25+ pages)
  - Request/response examples
  - Integration examples (React, Node.js)
- **Admin Documentation**:
  - Deployment guide
  - Configuration reference
  - Performance tuning
  - Backup and recovery procedures

### Configuration

New versioning configuration options:

```json
{
  "ngdpbase.page.provider": "versioningfileprovider",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10,
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

### Technical Details

**New Files**:

- `src/providers/VersioningFileProvider.js` - Main provider implementation
- `src/utils/DeltaStorage.js` - Diff algorithm wrapper
- `src/utils/VersionCompression.js` - Compression utilities
- `src/utils/VersioningMigration.js` - Migration utilities
- `scripts/migrate-to-versioning.js` - Migration CLI
- `scripts/maintain-versions.js` - Maintenance CLI
- `views/page-history.ejs` - History view template
- `views/page-diff.ejs` - Diff viewer template

**Modified Files**:

- `src/routes/WikiRoutes.js` - Added 4 API + 2 view routes
- `views/view.ejs` - Added version info banner
- `views/header.ejs` - Updated Page History link

**Tests**:

- `src/providers/__tests__/VersioningFileProvider.test.js`
- `src/providers/__tests__/VersioningFileProvider-Maintenance.test.js`
- `src/utils/__tests__/DeltaStorage.test.js`
- `src/utils/__tests__/VersionCompression.test.js`
- `src/routes/__tests__/WikiRoutes.versioning.test.js`

**Documentation**:

- `docs/user-guide/Using-Version-History.md`
- `docs/api/Versioning-API.md`
- `docs/admin/Versioning-Deployment-Guide.md`
- `docs/Versioning-Maintenance-Guide.md`
- `docs/Phase-6-Implementation-Summary.md`
- `docs/planning/Versioning-Implementation.md`

### Performance

- Version retrieval: <100ms for <50 versions
- Diff generation: <500ms for typical pages
- Storage overhead: 10-20% with delta storage + compression
- Memory overhead: ~2MB for 100-entry cache (average 20KB/page)

### Breaking Changes

None. VersioningFileProvider is opt-in and fully backward compatible.

### Migration

To enable versioning:

1. Update config: `"ngdpbase.page.provider": "versioningfileprovider"`
2. Restart application
3. Version history created automatically for all pages

To disable versioning:

1. Update config: `"ngdpbase.page.provider": "filesystemprovider"`
2. Restart application
3. Version data preserved for future re-enabling

### Dependencies

No new dependencies required. Uses existing:

- `fast-diff@1.3.0` (already installed in Phase 1)
- `pako@2.1.0` (already installed in Phase 1)
- `fs-extra@11.3.0` (existing)
- `uuid@9.0.0` (existing)

### Known Limitations

- No pagination for >100 versions per page (acceptable for most use cases)
- No version filtering by author/date in UI
- No bulk operations (restore multiple pages)
- No conflict resolution for concurrent edits during restore

### Future Enhancements

See issue #124 for planned Phase 7+ features.

---

## [1.3.2] - 2024-10-14

### Fixed

- Various bug fixes and improvements

### Documentation

- Enhanced project documentation structure
- Added comprehensive architecture guides

---

## [1.3.1] - 2024-10-10

### Added

- WikiDocument DOM parser
- Enhanced JSPWiki compatibility
- Improved test coverage

---

## [1.3.0] - 2024-10-01

### Added

- Policy-based access control
- Audit trail system
- Admin dashboard
- Time-based permissions

---

## [1.2.0] - 2024-09-15

### Added

- Advanced search functionality
- Multi-criteria filtering
- Category organization
- Plugin system

---

## [1.1.0] - 2024-09-01

### Added

- Image upload functionality
- Inline image support
- Attachment management

---

## [1.0.0] - 2024-08-15

### Added

- Initial release
- Basic wiki functionality
- Markdown support
- File-based storage
- JSPWiki-style links
- Bootstrap UI
- Three-state authentication

---

## Version Numbering

- **Major** (X.0.0): Breaking changes, major features
- **Minor** (1.X.0): New features, backward compatible
- **Patch** (1.0.X): Bug fixes, minor improvements

---

## Links

- [GitHub Repository](https://github.com/jwilleke/ngdpbase)
- [Documentation](./docs/)
- [Issue Tracker](https://github.com/jwilleke/ngdpbase/issues)

---

**Note**: This changelog was formalized starting with version 1.4.0. Previous version entries are abbreviated. For detailed git history, see commit logs.
