# Plan: OrganizationRole — Person↔Organization relationship model

## Context

ngdpbase has two concepts that share the word "role" and have been conflated:

- __Permission-role__ — already exists, working. Defined in `config/app-default-config.json` under `ngdpbase.roles.definitions` (`admin`, `user-admin`, `editor`, `contributor`, `reader`, `member`, `anonymous`); driven by `User.roles: string[]`; consumed by `ACLManager` for permission checks. __Out of scope for this plan.__
- __Person↔Organization role-records__ — do not exist yet. Model the *enduring* relationships between a [Person](https://schema.org/Person) and an [Organization](https://schema.org/Organization): employment, membership, board position, unit-ownership, etc. Membership/relationship semantics, not permission semantics.

A user can simultaneously be an `admin` (permission-role) AND a `Treasurer` (role-record on a board) AND a `Unit Owner` (role-record on a condo association). None of these constrain the others.

Three open/historical sources were trying to address this together; this plan unifies them and keeps the permission system untouched:

- __#154 (Schema.org with RBAC)__ — conflated permission-role and role-records. Will be __closed as superseded by #602__.
- __#602 (person-contacts addon)__ — already filed today; will be __updated__ to be the canonical entry point, with the data-model below.
- __`docs/planning/Persons and relationships.md`__ — pre-existing exploration; correct directionally. Its "Policy Overlay" / per-attribute access-control content belongs to a future permission-role concern, not here.

The permission-role nit (`ngdpbase.auth.google-oidc.default-roles: ["occupant"]` is a misnomer) is __out of scope__ — track separately if desired.

## What schema.org actually does — and the corrected model

Schema.org doesn't model every Person↔Organization link the same way. Two distinct families:

### Enduring role-records (live on the Person side)

| Use case | Schema.org type | How it's hung off the Person |
|---|---|---|
| Employment | [EmployeeRole](https://schema.org/EmployeeRole) (with [worksFor](https://schema.org/worksFor)) | [Person.hasOccupation](https://schema.org/hasOccupation) |
| Membership / loyalty / club | [ProgramMembership](https://schema.org/ProgramMembership) (with [hostingOrganization](https://schema.org/hostingOrganization)) | [Person.memberOf](https://schema.org/memberOf) |
| Board position / unit-owner / generic affiliation | [OrganizationRole](https://schema.org/OrganizationRole) | [Person.memberOf](https://schema.org/memberOf) or [Person.affiliation](https://schema.org/affiliation) |

These are real entities with `identifier`, `startDate`, `endDate`, `status`. They're what this plan stores.

### Transaction-derived references (live on the transaction, NOT in person-contacts)

| Use case | Where schema.org puts it |
|---|---|
| Customer | On the [Invoice](https://schema.org/Invoice) ([Invoice.customer](https://schema.org/customer)) and on the [Order](https://schema.org/Order) ([Order.customer](https://schema.org/customer)) — just a [Person](https://schema.org/Person) reference, no role-record |
| Vendor / supplier / seller | On the [Order](https://schema.org/Order) ([Order.seller](https://schema.org/seller)), the [Invoice](https://schema.org/Invoice) ([Invoice.broker](https://schema.org/broker)), or accounting bill records — just a [Person](https://schema.org/Person)/[Organization](https://schema.org/Organization) reference |

"Who are our customers?" is answered by `SELECT DISTINCT customer FROM invoices` in the accounting addon (#486). Same for vendors via bills. No role-records needed.

__This is the corrected model.__ The earlier draft of this plan invented a `relationshipType` discriminator to lump customer and vendor in with employment and membership. That was wrong: they don't belong in the same store because schema.org doesn't model them as enduring relationships.

## Decisions (locked)

1. __Layered architecture.__ Core ngdpbase owns canonical [Person](https://schema.org/Person) and [Organization](https://schema.org/Organization) records (delivered by #617 — `PersonManager` + `OrganizationManager`, file-per-record under `ngdpbase.application.{persons,organization}.storagedir`). Person-contacts addon owns the role-records on top. Disabling the addon removes addon-created records but leaves Person/Organization untouched. The disable cascade is already implemented at `AddonsManager.canDisable()` (`src/managers/AddonsManager.ts`, returns `{ ok: false, blockedBy: [...] }` for any enabled dependent) — person-contacts will be blocked from disable while accounting (or any other dependent) is enabled. No new code needed there.
2. __Three role-record families, named for their schema.org `@type`:__ [EmployeeRole](https://schema.org/EmployeeRole), [ProgramMembership](https://schema.org/ProgramMembership), [OrganizationRole](https://schema.org/OrganizationRole). The storage `@type` IS the schema.org type — no invented discriminator.
3. __Customer and vendor are not role-records.__ They emerge from accounting (#486) transactions ([Invoice.customer](https://schema.org/customer), [Order.seller](https://schema.org/seller), bill suppliers). Person-contacts has nothing to say about them.
4. __Physical-thing ownership uses [OwnershipInfo](https://schema.org/OwnershipInfo).__ Lives in the units module (e.g., `data/fairways/units.json`), NOT in person-contacts. Carries [owner](https://schema.org/owner) → Person, [typeOfGood](https://schema.org/typeOfGood) → Unit, [ownedFrom](https://schema.org/ownedFrom)/[ownedThrough](https://schema.org/ownedThrough), and [additionalProperty](https://schema.org/additionalProperty) → [PropertyValue](https://schema.org/PropertyValue) for ownership percentage.
5. __HOA-style "unit-owner" membership is derived, not stored.__ When the system emits an [Organization](https://schema.org/Organization)'s JSON-LD, it walks active [OwnershipInfo](https://schema.org/OwnershipInfo) records and emits a member [OrganizationRole](https://schema.org/OrganizationRole) (`roleName: "unit-owner"`) for each owner. __No persisted record duplicates this fact.__ Special positions (Treasurer, Secretary, etc.) DO get their own persisted [OrganizationRole](https://schema.org/OrganizationRole) records.
6. __One unified collection, discriminated by `@type`.__ All role-records live in a single store; each row's `@type` ∈ {`EmployeeRole`, `ProgramMembership`, `OrganizationRole`} drives both query branches and JSON-LD emission. Storage shape = JSON-LD shape (no mapping table).
7. __Close #154__ as superseded; #602 is the entry point.
8. __Permission-roles unchanged.__ `User.roles[]` stays. ACLManager stays. Org-scoped permission checks are a __follow-up__ issue, not this work.
9. __Anchor-org filename is URL-derived, name as fallback.__ The on-disk filename for the anchor org JSON-LD file at `${FAST_STORAGE}/organizations/<file>` is derived from the install form's `orgUrl` (host + non-default port/path), not the `orgName`. Domain names are guaranteed unique by registry, so URL-derived filenames give a strong uniqueness anchor when one is provided. Algorithm: strip scheme, lowercase, replace dots and other non-`[a-z0-9]` chars with `-`, trim, cap 80 chars, append `.json`. Examples: `https://fairwayscondos.org/` → `fairwayscondos-org.json`; `www.fairwayscondos.org` → `www-fairwayscondos-org.json`. If `orgUrl` is absent or slugifies to empty, fall back to slug of `orgName`; if both fail, fall back to literal `organization.json`. The org's `@id` continues to use the full URL (with scheme), with the existing fallback chain `orgUrl` → `ngdpbase.base-url` → `urn:ngdpbase:org:<slug>`.
10. __Filename and `@id` MUST be unique within an install.__ The provider seam (`FileOrganizationProvider.create`) is responsible for enforcing this: it MUST refuse and throw when (a) a file already exists at the target path, OR (b) any existing file in the storage dir has the same `@id`. The seed path (`OrganizationManager.seedFromConfig`) is exempt from the file-existence check — it remains idempotent (returns the existing file unchanged) so re-running install doesn't error. The uniqueness invariant fires on real `create` calls (e.g., adding a second org for multi-org installs).

### Bootstrap at install time (when the addon is enabled)

The addon seeds exactly one record:

- One [OrganizationRole](https://schema.org/OrganizationRole) record tying the admin Person ↔ the base Organization (`roleName: "Administrator"`). The base Organization is the anchor org JSON-LD file written by `OrganizationManager` at install time (located via `ngdpbase.application.organization.file` under `…storagedir`). The admin Person is sourced from the core Person record managed by `PersonManager` (#617).

When the addon is disabled, that record is removed under the cascade rule below.

### Addon-disable cascade

person-contacts records are owned by the addon and removed when the addon is disabled — with two safeguards:

- __Operator confirmation.__ Disable shows a count of records that will be removed and requires explicit confirmation.
- __Dependency check via AddonsManager (already implemented).__ AddonsManager supports `dependencies: string[]` on the `AddonModule` interface, with topological-sort load order in `resolveLoadOrder()` and a disable-time invariant check in `canDisable()` (`src/managers/AddonsManager.ts`). If any *enabled* addon (e.g., accounting #486) declares `dependencies: ['person-contacts']`, `canDisable()` returns `{ ok: false, blockedBy: ['accounting', ...] }` and the operator is required to disable the dependent first. The addon's disable handler reuses this check — no new code needed.

### Concrete shape of the unified collection

The provider stores role-records in a single file (or collection): `data/person-contacts/role-records.json`. Each entry is a self-contained JSON-LD object with the fields specified in the per-type schemas below. Reading "all of Jane's roles" is one filter on `person.@id`; reading "all formal positions in fairways-condos" is one filter on `memberOf.@id` (or `hostingOrganization.@id` for [ProgramMembership](https://schema.org/ProgramMembership)). The JSON-LD export folds matched records under [hasOccupation](https://schema.org/hasOccupation) / [memberOf](https://schema.org/memberOf) on the Person at emit time.

## Data model

### Person record

Stored in `addons/person-contacts/` (provider-controlled location). Canonical fields:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "urn:uuid:<uuid>",
  "identifier": "<username>",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "address": { "@type": "PostalAddress", ... },
  "contactPoint": [...],
  "knowsLanguage": [...]
}
```

`identifier` matches `User.username` so existing auth records link cleanly.

__No embedded role-records.__ Roles live in their own family records (or as nested arrays, depending on storage shape) and are folded into the Person's [hasOccupation](https://schema.org/hasOccupation) / [memberOf](https://schema.org/memberOf) / [affiliation](https://schema.org/affiliation) at JSON-LD export time.

### Organization record

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://fairways.example.com/",
  "name": "The Fairways",
  "legalName": "The Fairways Condominium Association",
  "url": "https://fairways.example.com/",
  "address": { "@type": "PostalAddress", ... },
  "contactPoint": [...]
}
```

`@id` is the organization's canonical URL (Schema.org-native), not a synthetic urn. The install's anchor org is identified by `ngdpbase.application.organization.file` — the filename under `ngdpbase.application.organization.storagedir` that holds the anchor org. The org's metadata (`name`, `url`, `address`, etc.) lives in the JSON-LD file itself, NOT in config. `OrganizationManager` (core) owns reads/writes; multi-org is supported by additional files in the same directory. Filename derivation rule: see locked decision #9. Uniqueness invariant: see locked decision #10.

### EmployeeRole record

```json
{
  "@context": "https://schema.org",
  "@type": "EmployeeRole",
  "@id": "urn:role:<uuid>",
  "identifier": "EMP-001",
  "roleName": "Senior Analyst",
  "startDate": "2024-01-01",
  "endDate": null,
  "status": "active",
  "person":   { "@id": "urn:uuid:<person-uuid>" },
  "worksFor": { "@id": "urn:org:<identifier>" }
}
```

Native [EmployeeRole](https://schema.org/EmployeeRole) carries `baseSalary`, `salaryCurrency`, etc. as needed.

### ProgramMembership record

```json
{
  "@context": "https://schema.org",
  "@type": "ProgramMembership",
  "@id": "urn:role:<uuid>",
  "identifier": "MEM-777",
  "membershipNumber": "MEM-777",
  "startDate": "2024-01-01",
  "status": "active",
  "member":              { "@id": "urn:uuid:<person-uuid>" },
  "hostingOrganization": { "@id": "urn:org:<identifier>" }
}
```

### OrganizationRole record (board, unit-owner, affiliate)

```json
{
  "@context": "https://schema.org",
  "@type": "OrganizationRole",
  "@id": "urn:role:<uuid>",
  "identifier": "or-2024-jane-fairways-treasurer",
  "roleName": "Treasurer",
  "startDate": "2024-01-01",
  "endDate":   "2026-12-31",
  "status":    "active",
  "person":   { "@id": "urn:uuid:<person-uuid>" },
  "memberOf": { "@id": "https://fairways.example.com/" },
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "unitId", "value": "4B" },
    { "@type": "PropertyValue", "name": "percentageInterest", "value": 1.85 }
  ]
}
```

Use `roleName` to distinguish "Treasurer" from "Unit Owner" from "Board Member" within the [OrganizationRole](https://schema.org/OrganizationRole) family. Use `additionalProperty` for type-specific extras (unit ID, percentage interest, etc.).

## Schema.org JSON-LD export

Already trivial: each role-record's storage `@type` is its export `@type`. Folding into a Person's JSON-LD:

- All [EmployeeRole](https://schema.org/EmployeeRole) records where `person.@id` matches → emit under [Person.hasOccupation](https://schema.org/hasOccupation).
- All [ProgramMembership](https://schema.org/ProgramMembership) records → emit under [Person.memberOf](https://schema.org/memberOf).
- All [OrganizationRole](https://schema.org/OrganizationRole) records → emit under [Person.memberOf](https://schema.org/memberOf) or [Person.affiliation](https://schema.org/affiliation) (configurable; default `memberOf`).

No mapping table needed. No invented discriminator.

## Critical files

__New (the #602 implementation):__

- `addons/person-contacts/index.ts` — `AddonModule` entry point.
- `addons/person-contacts/managers/PersonContactsManager.ts` — extends `BaseManager`. Public API: CRUD on Person/Organization/each role-record family, `exportPersonJsonLd(personId)`.
- `addons/person-contacts/providers/BasePersonContactsProvider.ts` — interface (storage seam).
- `addons/person-contacts/providers/FilePersonContactsProvider.ts` — JSON files in the configured data dir; v1 default.
- `addons/person-contacts/types/{Person,Organization,EmployeeRole,ProgramMembership,OrganizationRole}.ts` — TS types matching the schema.org shapes above.
- `addons/person-contacts/utils/jsonLdExport.ts` — assembles a Person's JSON-LD by folding in their role-records.
- `addons/person-contacts/routes.js` — read endpoints (e.g., `GET /api/persons/:identifier`, `GET /api/organizations/:identifier/members`, JSON-LD export).
- `addons/person-contacts/__tests__/*.test.ts` — unit + integration coverage for storage, queries, and export.
- `addons/person-contacts/seed/install-admin-org-role.json` — bootstraps the [OrganizationRole](https://schema.org/OrganizationRole) tying the admin Person ↔ the base Organization (`roleName: "Administrator"`), per the Bootstrap section above.

__Modified:__

- `config/app-default-config.json` — adds the addon's own config block (`ngdpbase.addons.person-contacts.*`). The core-side `ngdpbase.application.organization.*` and `ngdpbase.application.persons.*` keys (`storagedir`, `file`, `provider*`) already exist as of #617 and are NOT changed by this addon. Note: org metadata (`name`, `url`, `address-*`, etc.) lives in the JSON-LD file at `<storagedir>/<file>`, NOT in config.
- `addons/README.md` — register `person-contacts` in the addon roster.

__Explicitly NOT modified in this plan:__

- `src/managers/UserManager.ts` — UserManager-to-Person linkage at sync time is a follow-up issue.
- `src/managers/ACLManager.ts` — org-scoped permission checks are a follow-up issue.
- `src/types/User.ts` — `User.roles[]` stays as-is.
- The permission-role catalog in `config/app-default-config.json` — untouched.

## Verification

1. __Typecheck:__ `npm run typecheck` clean.
2. __Unit:__ Each storage method per role-record family; the JSON-LD export per family; the `endDate`/`status` lifecycle.
3. __Integration:__ Enable the addon. Seed an admin Person + the install Organization + a [ProgramMembership](https://schema.org/ProgramMembership) for that admin. Query the Person, assert the JSON-LD output contains the membership under [memberOf](https://schema.org/memberOf) with `@type: ProgramMembership`. Query the Organization's members, assert it returns the Person.
4. __Manual:__ Boot a Fairways instance whose anchor org is configured via `ngdpbase.application.organization.file: fairwayscondos-org.json` (the JSON-LD file under `${FAST_STORAGE}/organizations/` holds `name`, `url`, etc.). Create a unit-owner [OrganizationRole](https://schema.org/OrganizationRole) for an existing user. Confirm the Person's JSON-LD output and the org's member-list both reflect it.
5. __Permission-role regression:__ Existing ACL tests pass unchanged — proof that this work is orthogonal to the permission system.

## Follow-up actions (post-plan-mode)

1. __Finish #617 (Core Person/Organization refactor) and close it.__ Core work has landed (commits `2bea3db0` "feat(#617): core Person/Organization refactor" and `49a791fd` "fix(#617): seed install org during headless install for docker/k8s"): `PersonManager`, `OrganizationManager`, `FilePersonProvider`, `FileOrganizationProvider`, the `application.organization.*` / `application.persons.*` config namespace, and the `AddonsManager.canDisable()` disable-cascade. Remaining work before #617 closes:
   - Land the in-flight diff that strips org metadata (`name`, `url`, `legal-name`, `description`, `founding-date`, `contact-email`, `address-*`) from config and makes the JSON-LD file the single source of truth (`config/app-default-config.json`, `src/services/InstallService.ts`, `src/types/Config.ts`).
   - Alongside the strip, remove `OrganizationManager.readSeedFromConfig()` and the no-args fallback branch of `seedFromConfig()`; rework `InstallService.#seedOrganizationFromConfigIfNamed()` (it was the headless seed path that read those keys) so it either requires explicit form data or is removed.
   - Switch the anchor-org filename rule to URL-first per locked decision #9 (`filenameFromOrgName` in `src/services/InstallService.ts`; the slugify fallback in `FileOrganizationProvider.create`).
   - Add the uniqueness guards in `FileOrganizationProvider.create()` per locked decision #10 (file-existence + `@id`-duplicate, with tests).
   - Close #617 once the above is in.
2. __Update #602's body__ to reflect this plan: layered architecture (this addon sits on top of the core Person/Organization layer), three role-record families typed for their schema.org `@type`, no invented discriminator, customer/vendor handled by accounting, [OwnershipInfo](https://schema.org/OwnershipInfo) handled by the units module, HOA-membership derived at emit time. Mark #602 as `blocked-by` #617.
3. __Close #154__ with a comment explaining the role-vs-OrganizationRole distinction, pointing at #602 as the OrganizationRole tracker, and noting the permission-role catalog (including the `occupant` rename) is a separate concern.
4. __File new `[FEATURE] UserManager → Person link at user sync`__ — replaces today's hardcoded `'ngdpbase-platform'` Organization. Depends on #617.
5. __File new `[FEATURE] ACLManager org-scoped permission checks`__ — extend permission evaluation to ask "does this user hold an [OrganizationRole](https://schema.org/OrganizationRole) of `roleName='Treasurer'` in the install's anchor org?"; depends on person-contacts; unblocks #486's admin views.
6. __Optional: file `[CHORE] Rename`occupant`permission-role`__ — the user's noted nit. Permission-role concern, not OrganizationRole.
