# Plan: Generic Accounting Add-on (#486)

## Context

GitHub issue #486 — "[FEATURE] ADD-ON Generic for Accounting" — asks to create a Plan-level Generic Add-on for Accounting with typical accounting functions, and to investigate integrating an open-source royalty-free implementation.

Related: #570 ("Perhaps we could use this for the Units within The Fairways" — `/Volumes/hd2A/workspaces/github/fairways-base/data/fairways/units.json`).

This plan is being built __incrementally through conversation__ with the user. Each item from the issue will be discussed before being committed to the plan.

## Codebase orientation (background)

- __Add-ons__ live in `/addons/<name>/` with an `index.ts` exporting an `AddonModule` (`name`, `version`, async `register(engine, config)`); enabled via `config/app-custom-config.json` and loaded by `AddonsManager` at startup. Reference implementations: `addons/journal/`, `addons/calendar/`, `addons/forms/`, `addons/elasticsearch/`.
- __No existing accounting code.__ Prior planning doc at `docs/planning/Business-packages/business-addon-mvp.md` already proposes a `financial-ledger` addon and names __Medici__ (Node.js double-entry library) as the royalty-free candidate.
- __Fairways__ is a sibling ngdpbase instance at `/Volumes/hd2A/workspaces/github/fairways-base` (port 2121). `units.json` holds condominium units with owners/addresses/parcel IDs — a candidate domain for the accounting add-on (HOA dues, assessments).

## Items to discuss with user

The issue contains two items plus one related thread. Status of each is tracked here as we chat:

### Item 1 — "Create Plan Generic Add-on for Accounting with feature of adding a typical accounting functions"

- __Status:__ *in progress*
- __Decision (2026-04-30):__ Use a __generic Standard Chart of Accounts (SCoA)__ based on GAAP. Five top-level categories with conventional numeric ranges:
  - __1000s — Assets__ (Cash, Accounts Receivable, Inventory, …)
  - __2000s — Liabilities__ (Loans, Accounts Payable, …)
  - __3000s — Equity__ (owners' residual claim)
  - __4000s — Revenue__ (income from operations)
  - __5000s — Expenses__ (Rent, Salaries, …)
  - Stay generic — no industry-specific USOA (hotel/utility) variants in v1.
  - Domain-specific extensions (e.g., Fairways HOA dues) layer on top via seed data, not by changing the framework.
- __MVP scope (2026-04-30):__ Layer 2 — __Ledger + AR/AP__.
  - Ledger: chart of accounts, double-entry journal entries, trial balance.
  - AR: customers, invoices, customer payments.
  - AP: vendors, bills, vendor payments.
  - Reports (Balance Sheet, Income Statement) deferred to a later layer.
- __Identity model (2026-04-30, in discussion):__ "People are people." A `Person` is canonical and unduplicated; relationships to `Organization`s carry a "Member Type" — which maps cleanly to schema.org __`OrganizationRole`__ (`roleName`, `startDate`, `endDate`). Customer/vendor in accounting should be a __reference to a Person or Organization__, not a new identity record.
  - Current state: ngdpbase already syncs users to schema.org `Person` (UserManager) and uses `memberOf` / `worksFor` / `memberOfStartDate`. No `OrganizationRole` / Membership entity exists yet — roles are string arrays on User.
  - Likely prior thread: __#157 (person-contacts add-on)__ + `docs/planning/Business-packages/business-addon-mvp.md`. (Note: #158 is the AddonsManager framework, not this topic.)
  - __Decision (2026-04-30):__ Build a separate __`addons/person-contacts/`__ addon that owns the rich Person/Organization/OrganizationRole model. The accounting addon declares it as a dependency (`dependencies: ['person-contacts']`) — a pattern AddonsManager already supports natively (`src/managers/AddonsManager.ts:41,554-565` — topological sort, fails fast on missing/disabled deps). UserManager continues to own `users.json` (auth + basic identity); person-contacts merges/enriches that data with full schema.org Person and OrganizationRole records. Other future addons (CRM, dues, etc.) share the same foundation.
  - __Sequencing (2026-04-30):__ __Split into two issues.__ Open a new `[FEATURE]` issue for `person-contacts` (Person + Organization + OrganizationRole + UserManager merge); mark #486 as blocked-by that new issue. Each ships independently; person-contacts becomes reusable by other future addons.

#### Draft `[FEATURE] person-contacts` issue body (pending approval; file with `--template feature_request.md` after exiting plan mode)

```markdown
## ✨ Feature Description

Add an optional `addons/person-contacts/` add-on that owns rich
schema.org-aligned identity records: `Person`, `Organization`, and a new
`OrganizationRole` join entity. UserManager continues to own `users.json`
(auth/basic identity); person-contacts merges/enriches that data with full
schema.org fields and typed memberships.

## 🎯 Problem/Use Case

The accounting add-on (#486) and other future add-ons (CRM, dues, member
directories) need a shared, reusable identity foundation. Today ngdpbase
only has user roles as flat string arrays — no first-class membership
records, no per-org role names, no historical role timelines, and no
"primary org" concept for multi-org installs.

## 💡 Proposed Solution

- `Person` records (canonical identity; no duplication).
- `Organization` records.
- `OrganizationRole` records — the Person↔Organization join, with
  `roleName`, `startDate`, `endDate`, `status`. A Person can have many.
- New install-anchor config keys identify *this install's* primary org:
  - `ngdpbase.install.organization.path`
  - `ngdpbase.install.organization.identifier`
- Permission checks resolve against `OrganizationRole` rows where
  `memberOf = <install's anchor identifier>`.
- UserManager merges `users.json` entries with their person-contacts
  Person record at read time.

## 🔄 Alternative Solutions

- Couple identity into the accounting add-on. Rejected: would duplicate
  identity per add-on and block other use cases (CRM, dues).
- Build into core. Rejected: keeps optional; aligns with addon model.

## 📋 Implementation Ideas

- Follow existing addon pattern (`addons/journal/`, `addons/calendar/`):
  `index.ts` exporting `AddonModule`, `register(engine, config)`,
  optional `routes.js`, `views/`, `public/`.
- Storage via Manager+Provider pattern (mirrors PageProvider, etc.):
  `BasePersonContactsProvider` interface; ship a JSON-file or
  better-sqlite3 default provider.
- AddonsManager already supports `dependencies: string[]` with
  topological sort — `accounting` will declare
  `dependencies: ['person-contacts']`.

## 🧪 Testing Considerations

- [ ] Unit tests for OrganizationRole CRUD + lifecycle (create / end /
      query active / query history).
- [ ] Unit tests for the install-anchor resolution.
- [ ] Integration test: UserManager merges user with Person record.
- [ ] Manual: verify a Person with multiple OrganizationRoles in
      different orgs renders correctly in the schema.org JSON-LD output.

## Blocks / Related

- Blocks #486 (Generic Accounting Add-on).
- Related #570 (Fairways units integration).
```

- Open: do we plan/build person-contacts as part of this same issue (#486 grows in scope), or split it into a sibling issue that #486 formally blocks on?

#### Schema.org findings (what we're building on)

__Direct properties__ (relationship without metadata):

- `Person.memberOf` ↔ `Organization.member`
- `Person.worksFor` (employment-flavored)
- `Person.affiliation` (loose — clubs, teams)
- `Person.alumniOf` ↔ `Organization.alumni`
- `Organization.employee` / `.founder` / `.parentOrganization` / `.subOrganization` / `.department`

__Reified relationship via `Role`__ (the powerful pattern):

- `Role` is a wrapper that attaches context (`roleName`, `startDate`, `endDate`) to a relationship.
- __`OrganizationRole`__ (subclass of Role) — for roles within organizations; adds `numberedPosition`.
- __`EmployeeRole`__ (subclass of OrganizationRole) — adds `baseSalary`, `salaryCurrency`.
- The relationship property is __repeated inside the Role__ to reach the Organization:

  ```json
  { "@type": "Person",
    "memberOf": {
      "@type": "OrganizationRole",
      "memberOf": { "@type": "Organization", "name": "Sunset HOA" },
      "roleName": "Treasurer",
      "startDate": "2024-01-01"
    } }
  ```

- One Person can hold multiple OrganizationRoles in the same or different Organizations.

__Gaps in schema.org we have to fill ourselves:__

- No first-class `Member` type (it's only a property).
- `ProgramMembership` / `MemberProgramTier` are loyalty-program specific — wrong tool for HOA-style memberships.
- `roleName` is open text — addon should curate a controlled vocabulary (e.g., `unit-owner`, `board-member`, `treasurer`, `customer`, `vendor`).
- No "primary organization" concept — that's our policy.

__Mapping to accounting AR/AP:__

- Customer = Person/Organization + `OrganizationRole.roleName = "customer"` of the accounting tenant.
- Vendor = same shape, `roleName = "vendor"`.
- Fairways HOA: unit-owner Person with `roleName = "unit-owner"` in the HOA Organization, also `roleName = "customer"` for assessment billing.

__person-contacts addon would own:__ `Person`, `Organization`, and the new `OrganizationRole` join entity.

__Install-anchor config (decided 2026-04-30):__ to identify the Organization this install is authoritative over, add two keys to `app-default-config.json` (sibling to the existing `ngdpbase.install.organization.*` block at lines 27-34):

- `ngdpbase.install.organization.path` — path to the organizations data file (e.g., `./data/users/organizations.json`).
- `ngdpbase.install.organization.identifier` — the `identifier` of the record in that file that represents this install (e.g., `fairways-condos`).
Both required when the install operates on schema.org Organization records. This lets membership/permission queries answer "is X a member of *our* org?" without ambiguity when a Person belongs to multiple orgs.

__"Primary org" definition (decided 2026-04-30):__

- Schema.org has no native "primary org" concept; we define it ourselves.
- Primary org is __per-install, not per-Person__. Every install has exactly one primary org — the Organization identified by `ngdpbase.install.organization.path` + `ngdpbase.install.organization.identifier`.
- Permission checks like "can Jane do X *here*?" resolve against `OrganizationRole` rows where `memberOf = <install's anchor identifier>`.
- Memberships a Person holds in *other* organizations are visible/exportable but grant no rights within this install.
- __No `primary: true` flag on `OrganizationRole` rows.__ Primacy is answered by config, not per-row data.
- "Primary X within an org" (e.g., "primary unit owner of unit 4B") is a separate, role-specific attribute on a particular `OrganizationRole` row — not the same concept and not addressed by the install anchor.

__`OrganizationRole` record — what it is:__ a standalone record (its own JSON row / DB table row) representing one Person↔Organization relationship with context. Not nested inside the Person. Each record has: `identifier`, `person` ref, `memberOf` ref to Organization, `roleName`, `startDate`, `endDate`, `status`. A Person has zero-or-many such records.

__How it's used:__

- Permission checks ("is Jane treasurer of fairways-condos right now?") — single-row lookup.
- AR/AP billing runs — query by `memberOf` + `roleName` to enumerate customers/vendors.
- Membership history — query by `person` for a timeline of past + current roles.
- Adding a role — insert a new row; never mutate Person.
- Ending a role — set `endDate` + `status=expired`; never delete (preserves audit trail).
- Multiple simultaneous roles for one Person in one Org — supported by design (three rows: `unit-owner`, `customer`, `board-member`).
- Schema.org JSON-LD export — fold active rows back under `memberOf`/`worksFor`/`affiliation` of the Person for canonical output.

Mental model: the Person↔Organization __join table with attributes__ (roleName, dates, status). Without it, Person records get bloated and history is lost.

- Still open:
  - __Persistence__ (resolved by Item 2 → hand-roll on better-sqlite3 via SqliteLedgerProvider).
  - __UI surface__ (proposed for v1, pending user confirmation):
    - __Admin pages (required)__ — full CRUD for accounts, journal entries, customers, vendors, invoices, bills, payments; assessment-run wizard. Lives under its own __`/accounting`__ section. Entry point is a __card on the admin dashboard__ following the existing Bootstrap-card pattern in `views/admin-dashboard.ejs` (card-header title + card-body links). Card visibility role-gated.
    - __Reports (v1 minimum)__ — trial balance + AR aging. Balance sheet / income statement deferred unless cheap.
    - __Per-unit billing tab (Fairways-aware, admin-facing)__ — on a unit page, a tab showing that unit's AR history. Treasurer/admin convenience for looking at one unit; gated by admin/treasurer role. (Owner's own view lives on "My Account", not here.)
    - __Email integration__ — send invoices/receipts/statements via the existing EmailManager (no new infra).
    - __Owner self-service (v1, decided 2026-04-30):__ logged-in owner can __view__ their own AR balance and invoice history on a dedicated __"My Account" page__. Linked from the user-menu dropdown below the profile entry. Visible only when authenticated. Online payment deferred to v1.x.
    - __Deferred to v1.x:__ vendor portal, dashboard widget.
  - __Auth/role gating:__ admin views need `OrganizationRole.roleName ∈ {treasurer, bookkeeper, admin}` in the install's anchor org; owner self-service / per-unit visibility needs `roleName = unit-owner`. If `person-contacts` (OrganizationRole) isn't ready when accounting ships, fall back temporarily to the existing `User.roles` string array.
  - __UI mechanics:__ follow the existing addon pattern (`addons/journal/`, `addons/calendar/`) — `routes.js` registered via `register(engine)`, templates in `views/`, static assets in `public/`.

### Item 2 — "Look into integrating with open source royalty free implementations"

- __Status:__ *in progress*
- __Royalty/license note:__ all serious candidates surveyed are MIT/GPL/BSD-family — the "royalty-free" constraint from #486 is satisfied by every option below; no candidate is excluded on that basis.
- __Candidate landscape (surveyed 2026-04-30):__

  __A. Embed a Node.js double-entry library:__
  - __Medici__ (`flash-oss/medici`, MIT, v7.2.0) — de-facto Node ledger primitive. __MongoDB+Mongoose only__ — major infra cost since ngdpbase has no Mongo today.
  - __ALE__ (`CjS77/ale`, MIT) — Sequelize-based (PG/MySQL/__SQLite__), older, smaller community, "inspired by Medici", can run as module or microservice.
  - __ledgerstack-core__ (Mar 2026 release) — multi-DB SQL, multi-tenant, cache-based reports. Brand new, unproven.
  - All three deliver only the ledger primitive (accounts, journal entries, debit=credit invariant, balances). AR/AP/invoices we write ourselves regardless.

  __B. Wrap plain-text accounting (Beancount/hledger/Ledger):__
  - Beancount has a Python library API; hledger/Ledger are primarily CLI.
  - Strong reporting and accountant-grade correctness, but adds a non-Node runtime + child-process boundary. Overkill for HOA-dues-scale AR/AP.

  __C. Wrap a full self-hosted app via REST (Firefly III, Akaunting, ERPNext/Frappe):__
  - Mature UI and feature set, but each owns its own data and UI — we'd be building a thin proxy. Conflicts with the "addon ships in ngdpbase" pattern.

  __D. Hand-roll on `better-sqlite3` (already in ngdpbase):__
  - Schema is small: `accounts`, `journal_entries`, `entry_lines` (≥2 per entry), `CHECK sum(debits)=sum(credits)` invariant.
  - Most upfront work for the primitive; cleanest fit with existing ngdpbase persistence; zero new infra.

- __Read:__ the two viable contenders are __(A) ALE on SQLite__ or __(D) hand-roll on better-sqlite3__. Medici's reputation is real, but the MongoDB tax is too high for ngdpbase unless Mongo arrives for other reasons. Plain-text and full-app-wrapping don't fit the addon model.

- __Maintenance check (2026-04-30):__
  - __Medici__ ✅ active — v7.2.0 released 2025-07-11; regular release cadence since 2023; MIT; 344★. Healthy.
  - __ALE__ ❌ __archived__ — last commit 2021-01-07, real activity stopped in 2018. __Removed from candidate list.__
  - __ledgerstack-core__ ⚠️ — all three versions (0.1.0–0.1.2) published on 2026-03-18 by a single author; npm metadata's GitHub URL returns 404; pre-1.0. __Not a defensible production bet.__
  - __Firefly III / Akaunting / ERPNext / Beancount / hledger__ all actively maintained as of 2026-04-30 but their architectural mismatches stand (Akaunting's license is "NOASSERTION" — would need a separate verification it's still FOSS).

- __Narrowed fork:__ with ALE dead and ledgerstack-core too immature, the realistic accounting-engine choice for #486 is:
  - __(A′) Medici__ — actively maintained, MIT-licensed, well-known ledger primitive. Cost: ngdpbase grows a MongoDB runtime dependency.
  - __(D) Hand-roll on `better-sqlite3`__ — stays on the existing stack; we own ongoing maintenance; no third-party engine that can be abandoned out from under us.

- __Open:__ which path — A′ (Medici + MongoDB) or D (hand-roll on better-sqlite3)? Drives Item 1 persistence.

- __Constraints raised by user (2026-04-30):__
  - Memory overhead is a real concern; current page response times already creeping up.
  - Target audience: __small organizations, often non-profits__ — likely deployed on small VPS-class hardware.
  - __Current ngdpbase scalability is unknown__ — no baseline measurements; should track separately, not block #486.

- __Memory-cost comparison for small-org scale:__
  - `better-sqlite3` (hand-roll): __~0 MB extra__ — in-process Node addon, already in ngdpbase. Data on disk, paged by OS.
  - MongoDB (Medici): ~100 MB minimum, typically 300-500 MB warm; separate process; WiredTiger cache configurable but the daemon itself is the cost.
  - Beancount sidecar: ~30-50 MB per Python process.
  - Firefly III / Akaunting / ERPNext: 200-600 MB+ (full apps with workers + own DB).
  - Audience-scale data volume: ~600 transactions/year for a 50-unit HOA → measured in __KB__, not MB. Engine throughput is irrelevant; runtime overhead dominates.

- __Direction (2026-04-30):__ combined constraints (memory pressure + small-org audience + tiny data volumes) point strongly at __D — hand-roll on `better-sqlite3`__. Medici's value (proven ledger primitive) doesn't justify a 300+ MB Mongo runtime for KB-scale data on a non-profit's VPS.

- __Decision (2026-04-30): Manager+Provider pattern for the ledger__ — to keep the back-end swappable later. This matches the dominant ngdpbase pattern (PageManager+FileSystemProvider, SearchManager+Lunr/Elasticsearch, CacheManager+Node/Redis/Null, AuditManager+File/Database/Cloud/Null, etc.). Config-driven selection via `ngdpbase.<area>.provider` + `.default` keys (e.g., `config/app-default-config.json:41-48`).

  __Proposed structure:__

  ```
  addons/accounting/
  ├── index.ts                          # AddonModule entry point
  ├── managers/
  │   └── LedgerManager.ts              # extends BaseManager; AR/AP business logic + report algorithms
  ├── providers/
  │   ├── BaseLedgerProvider.ts         # interface — the seam
  │   └── SqliteLedgerProvider.ts       # better-sqlite3 implementation (v1 default; only one shipped)
  ```

  Future providers (only built when actually needed): `MediciLedgerProvider` (Mongo), `InMemoryLedgerProvider` (tests).

  __Config keys (sibling to existing provider keys):__

  ```json
  "ngdpbase.accounting.ledger.provider.default":     "sqliteledgerprovider",
  "ngdpbase.accounting.ledger.provider":             "sqliteledgerprovider",
  "ngdpbase.accounting.ledger.provider.sqlite.path": "${SLOW_STORAGE}/accounting/ledger.db"
  ```

  __Provider interface (sketch):__
  - `getAccounts() / createAccount(account) / updateAccount(account)`
  - `postJournalEntry({ description, date, lines: [{accountId, debit, credit}, ...] })` — enforces Σdebits = Σcredits.
  - `getEntries({ filters })`, `getBalance(accountId, asOfDate?)`, `getTrialBalance(asOfDate?)`
  - AR/AP records (invoices, customers, vendors, payments) live in the __same provider__ so they share atomic storage with the journal entries they reference — splitting would force distributed-transaction issues.

  __Stays in LedgerManager (not pluggable):__ report algorithms, AR/AP business logic, schema.org JSON-LD emission. Calls into the provider for storage operations. If a future provider is added, all of this ports unchanged.

- __Sibling work (not part of #486):__ open a separate issue to __establish baseline ngdpbase performance / memory profile__ so the response-time creep can be measured rather than guessed.

### Related — #570 Fairways units integration

- __Status:__ *in progress*
- __Important context (2026-04-30):__ Fairways is a __condominium association__ (`legalName: "The Fairways Condominium Association"`), not a generic HOA. Condo ownership is split:
  - __Association owns:__ building structure (foundation, roof, structural elements — often booked as Fixed Asset 1500s), common elements (lobby, hallways, mechanicals — sometimes booked, sometimes only maintenance liability is tracked), operating cash, AR, equipment, reserves.
  - __Unit owner owns:__ "studs-in" — interior space, windows, doors, interior fixtures.
  - __Common elements__ are technically tenant-in-common by all unit owners; Association maintains and insures.

- __Direction (2026-04-30):__ the accounting addon needs to handle __two distinct accounting concerns__ simultaneously:

  1. __Association-owned property as GAAP Assets.__ Structure (where booked), common elements (where booked), equipment, cash, reserves all belong in 1000s/1500s Asset accounts. Standard journal-entry treatment: capital improvements, depreciation, disposal.

  2. __Units as billable subjects (subledger).__ Unit interiors are not Association property and don't belong on the Asset ledger. Units are nonetheless first-class billable entities for assessment billing:
     - GL summary account `1100 — Assessments Receivable`.
     - Subledger keyed by `unit.identifier`; per-unit balances always reconcile to `1100`.
     - Unit records live in `data/fairways/units.json` (or a future Fairways extension of `person-contacts`); the accounting addon references units by identifier, never owns or duplicates them.

  3. __Assessment allocation is pluggable.__ While `percentageInterest` is the legally-pure driver, many associations don't bill by raw percentage — they round, tier by unit type, or use simpler structured plans. The addon must support multiple methods:
     - __Pure percentage interest__ — `monthly = budget × unit.pctInterest`.
     - __Rounded percentage__ — same formula, rounded to whole/half % or fixed-dollar; may not sum to 100%.
     - __Tiered by unit type/category__ — lookup table (1BR=$X, 2BR=$Y, …).
     - __Tiered by square footage / bedroom count__ — bracketed.
     - __Equal shares__ — `budget ÷ count(units)`.
     - __Hybrid__ — flat base + variable (`base + pctInterest×variable`).
     - __Manual override per unit per run__ — special arrangements, settlements.

     Architecturally this is a __strategy / pluggable allocator__: `BaseAssessmentAllocator` interface alongside `BaseLedgerProvider`. Allocator takes `(budget, units[], method, overrides)` → per-unit charge map. Ship the common methods, document how to add custom.

  4. __Unit attributes needed to support all methods:__ `percentageInterest`, `unitType`/`category`, `bedroomCount`, `squareFeet`, `assessmentTier`, plus a per-run `manualOverride` slot. Schema.org's `Accommodation`/`Apartment` types don't define `percentageInterest` directly — represent via custom property or `additionalProperty`. Other fields (`floorSize`, `numberOfRooms`) map to existing schema.org slots.

  5. __Audit trail:__ each generated invoice records the allocator name + parameters that produced it, so historic charges can be reconstructed.

- __Open:__ terminology in the #570 comment — confirmed: "billable subjects + subledger for unit AR" + "Association property (structure/common elements/equipment) as GAAP Assets" + "per-unit `percentageInterest` drives allocation".

#### Draft comment for #570 (pending approval; post after exiting plan mode)

```markdown
Cross-linking to #486 (Generic Accounting Add-on) — design discussion 2026-04-30.

The Fairways is a **condominium association**, so the accounting add-on scoped
in #486 needs to handle two distinct concerns side-by-side:

### 1. Association-owned property — real GAAP Assets

The Association legitimately owns the building structure, common elements (per
the declaration; usually held tenant-in-common by all unit owners but
maintained/insured by the Association), equipment, operating cash, AR, and
reserves. These belong in the chart of accounts as Assets:

- 1000s — Current Assets (cash, AR, prepaids)
- 1500s — Fixed Assets (structure where booked, equipment, common-element
  improvements where booked)

Standard journal treatment applies: capital improvements, depreciation,
disposal.

### 2. Units as billable subjects — subledger, not Assets

Unit *interiors* ("studs-in", windows, doors, interior fixtures) are owned by
the unit owner, not the Association. Units themselves are therefore **not**
Association balance-sheet Assets. They are, however, first-class **billable
entities** for assessment billing:

- General ledger summary account: `1100 — Assessments Receivable`.
- Per-unit AR tracked in a **subledger** keyed by `unit.identifier`; per-unit
  balances always reconcile back to `1100`.
- Unit records continue to live in `data/fairways/units.json` (or, once the
  planned `person-contacts` foundation lands, in a Fairways-specific extension).
  The accounting add-on **references** units by identifier; it does not own
  or duplicate them.
- Unit ownership flows through `OrganizationRole`: a unit owner = Person with
  `roleName: "unit-owner"` linked to the unit identifier.

### 3. Assessment allocation — pluggable

`percentageInterest` (a/k/a ownership share, common-element interest) is the
legally-pure driver, but in practice many associations don't bill by raw
percentage — they round, tier by unit type, or use other structured plans.
The add-on supports multiple allocation methods, selectable per association
and per assessment run:

- **Pure percentage interest** — `monthly = budget × unit.pctInterest`
- **Rounded percentage** — same formula, rounded to whole/half % or
  fixed-dollar; may not sum to 100%
- **Tiered by unit type / category** — lookup table (1BR=$X, 2BR=$Y, …)
- **Tiered by square footage or bedroom count** — bracketed
- **Equal shares** — `budget ÷ count(units)`
- **Hybrid** — flat base + variable (`base + pctInterest × variable`)
- **Manual override per unit per run** — special arrangements, settlements

This is implemented as a pluggable `BaseAssessmentAllocator` strategy
(alongside the storage `BaseLedgerProvider`). Allocator takes
`(budget, units[], method, overrides)` → per-unit charge map. Each generated
invoice records the allocator + parameters that produced it, so historic
charges can be reconstructed.

### 4. Unit attributes

The unit record needs enough attributes to support whichever allocator is
chosen: `percentageInterest`, `unitType`/`category`, `bedroomCount`,
`squareFeet`, `assessmentTier`. Schema.org's `Accommodation`/`Apartment`
types don't define `percentageInterest` directly — represent it as a
custom property or via `additionalProperty`. Other fields map to existing
schema.org slots (`floorSize`, `numberOfRooms`).

### Net

#486 will support both: real Assets for what the Association owns, plus a
per-unit AR subledger driven by `percentageInterest` for assessment billing.
Logging the requirement here so it isn't lost as #486 progresses.
```

## Defaults locked in (small, can be revisited during implementation)

- __Addon name:__ `accounting`.
- __Currency:__ single-currency per install; default `USD`; amounts stored as integer minor units (cents) to avoid float drift; symbol/locale configurable.
- __Fiscal year:__ configurable; default = calendar year.
- __Single set of books per install__ for v1 (no multi-entity).
- __Auth/role gating:__ admin views require `OrganizationRole.roleName ∈ {treasurer, bookkeeper, admin}` in the install's anchor org; owner self-service requires `roleName ∈ {unit-owner, member, customer}`. Until person-contacts ships, fall back to existing `User.roles` string array.

## Critical files

__New (created by this work, in #486 PR):__

- `addons/accounting/index.ts` — `AddonModule` entry point; declares `dependencies: ['person-contacts']`; calls `register(engine, config)`.
- `addons/accounting/managers/LedgerManager.ts` — extends `BaseManager`; AR/AP business logic, report algorithms, schema.org JSON-LD emission. Calls into the provider for storage.
- `addons/accounting/managers/AssessmentManager.ts` — assessment-run wizard logic; selects allocator, applies overrides, posts resulting journal entries via LedgerManager.
- `addons/accounting/providers/BaseLedgerProvider.ts` — provider interface (accounts, journal entries, balances, AR/AP records).
- `addons/accounting/providers/SqliteLedgerProvider.ts` — `better-sqlite3` implementation; v1 default.
- `addons/accounting/allocators/BaseAssessmentAllocator.ts` — strategy interface for assessment allocation.
- `addons/accounting/allocators/{Pure,Rounded,Tiered,EqualShare,Hybrid}AssessmentAllocator.ts` — concrete allocators.
- `addons/accounting/routes.js` — Express routes for `/accounting/*` admin pages and `/my-account`.
- `addons/accounting/views/` — EJS templates (admin pages, "My Account" page, per-unit billing tab partial).
- `addons/accounting/public/` — static assets (any addon-specific CSS/JS).
- `addons/accounting/__tests__/` — unit + integration tests.
- `addons/accounting/seed/default-coa.json` — seed Standard Chart of Accounts (1000s–5000s).
- `addons/accounting/README.md` — addon-level docs (interface contract, config keys, allocator extension).

__Modified:__

- `config/app-default-config.json` — add:
  - `ngdpbase.install.organization.path` and `ngdpbase.install.organization.identifier` (install-anchor; sibling to existing `ngdpbase.install.organization.*` block at lines 27-34).
  - `ngdpbase.accounting.ledger.provider`, `.default`, `.sqlite.path`.
  - `ngdpbase.accounting.currency`, `.fiscal-year-start-month`.
- `views/admin-dashboard.ejs` — add an Accounting Bootstrap-card (header + body of admin links); role-gated for `treasurer/bookkeeper/admin`.
- The user-menu dropdown view (wherever the profile dropdown is rendered) — add a "My Account" link, visible only when authenticated.
- `addons/README.md` — append the `accounting` addon to the list.

__Reused (existing patterns, no changes):__

- `src/managers/AddonsManager.ts:41,554-565` — addon dependency declaration + topological load order.
- `src/managers/EmailManager.ts` — invoice/receipt/statement delivery.
- `src/managers/UserManager.ts` — basic identity (auth/users.json); enriched at read time once `person-contacts` lands.

## Verification

__Unit (Jest):__

- Double-entry invariant: `postJournalEntry` rejects entries where Σdebits ≠ Σcredits.
- Each concrete allocator with representative inputs produces the expected per-unit charge map.
- Balance queries (`getBalance`, `getTrialBalance`) match hand-computed expectations on a small fixture.
- AR aging buckets correct for fixture invoices spanning current / 30 / 60 / 90+.

__Integration:__

- Enable addon (with stub `person-contacts` if not yet shipped) → addon initializes, default CoA seeds, no errors.
- Post a journal entry through `LedgerManager` → `SqliteLedgerProvider` persists; query reproduces the entry; balances update.
- Run an assessment via `AssessmentManager` against a fixture units list → expected invoices created; per-unit subledger reconciles to `1100`.
- Trial balance and AR aging reports return correct shapes.

__Manual UI walkthrough:__

- Log in as treasurer → admin dashboard shows Accounting card → click → CRUD accounts, post journal entry, manage customers/vendors, run assessment.
- Log in as unit-owner → user-menu shows "My Account" → page shows current balance + invoice history; admin views are not reachable.
- Render a Fairways unit page → as admin, Billing tab visible with that unit's AR; as owner of a *different* unit, the Billing tab is not visible.
- Send an invoice email → arrives via `EmailManager` with correct content.

__Performance:__

- Confirm addon enabled adds < 5 MB resident memory at idle.
- Page response times unchanged on pages that don't touch accounting.

## Follow-up actions (post-plan-mode)

These are blocked by plan mode and will be performed once we exit:

1. __File new `[FEATURE] person-contacts` issue__ using the draft body in this plan, via `gh issue create --template feature_request.md`. Capture the issue number.
2. __Mark #486 blocked-by__ the new person-contacts issue (comment + label).
3. __Comment on #570__ with the draft comment in this plan (cross-link + condo accounting accommodations).
4. __File a separate `[FEATURE]` issue: "Establish ngdpbase baseline performance / memory profile"__ (sibling work — not blocking #486, but informs ongoing decisions about overhead).
5. Begin implementation only after person-contacts is merged or has a stable interface to depend on.
