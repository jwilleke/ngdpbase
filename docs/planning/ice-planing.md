# ICE — Import, Convert, Export

Epic: [#1979](https://github.com/jwilleke/ngdpbase/issues/1979)

The source of truth for the ICE epic: one engine that brings data in, converts it, and sends it out, with add-ons supplying the format-specific pieces ("shims"). Decisions here are the operator's; development follows this page. Change it when a decision changes, in the same change that ships the code.

Status: design agreed (2026-10-21/22). First slice merged in PR [#1981](https://github.com/jwilleke/ngdpbase/pull/1981) (2026-10-23): the engine, the shim registry and today's converters as shims. The user-facing import screen, `/import`, is built ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021), 2026-10-24). The operator accepted its answers to the open questions it needed (2026-10-23); they are now decisions (see [Open questions](#open-questions)). A plugin as a receiver and how export is picked stay open.

## Where this came from

- yourPHR needs parsers whose output is health records, not pages: FHIR JSON/NDJSON and C-CDA (via `@medplum/ccda`) now, CCR later. The records must go through phr's own manager (PhrManager), never straight to storage. phr built a temporary engine of its own (unzip, noise filter, SHA-256 fingerprints, skipping unchanged files, per-file status, a `phr_source_files` table) and will drop it once ICE exists.
- The operator asked to decide the design directly, and chose the DirXML engine model: a core engine with small connectors ("shims") for each outside format. Reference: [DirXML Engine](https://ldapwiki.com/wiki/Wiki.jsp?page=DirXML%20Engine).

## What exists today

Four separate ways data comes in, each with its own plumbing:

| Path | What it does | Where |
|---|---|---|
| ImportManager converters | JSPWiki, HTML, Markdown and DOCX files into NCM pages. Admin-only (`/admin/import`, gated by admin view access) | `src/managers/ImportManager.ts` (`registerConverter`, `canHandle`) |
| Feeds adapters | GeoJSON, REST/JSON, XML, CSV, RSS/Atom and XML-index sources fetched on a schedule into feed records | `addons/feeds/src/adapters/`, `FeedScheduler` |
| Vault takeout import | A takeout imported into its owner's private store | `store-import` |
| phr's own engine | FHIR / C-CDA files into health records | the yourphr repository (temporary) |

Each solves fingerprinting, skipping unchanged input and per-file status separately, or not at all. More are coming: PDF in and out (#1974), likely accounting bank statements (CSV/OFX), and CCR for phr.

## Decisions

- __D1 — One import/convert/export engine (operator, 2026-10-22, option B).__ A single core manager owns moving data in and out:
  - sources (an upload, a URL fetched on a schedule, a folder);
  - running shims, including chains;
  - duplicate handling;
  - status and history;
  - keeping originals;
  - handing results to receivers;
  - export the other way.

  Not two engines sharing parsers: that would still build duplicate handling, status and fetching twice. The engine keeps the name `ImportManager` (decided 2026-10-23).
- __D2 — The DirXML model: core is the engine, add-ons supply shims (2026-10-22).__ A shim knows one outside format and nothing else. Everything else is the engine's.
- __D3 — A shim may be two-way; most are inbound only (2026-10-22).__ PDF is the example: one shim can import a PDF or output one (ties to #1974). A shim declares its direction: `in`, `out` or `both`.
- __D4 — Results go to a declared receiver (2026-10-22).__ Receivers:
  - pages (PageManager);
  - files and media (the files layer, #1851);
  - an add-on's manager, e.g. PhrManager storing health records through its own door;
  - possibly a plugin. Still open, since plugins display rather than store; it may fit only for previews.

  The engine hands each result to the receiver's own door. It never writes storage itself.
- __D5 — No new permissions (2026-10-22).__ The import or export runs as the person who started it (or the job's context for a scheduled source), and each receiver checks its existing permission for that person:

  | Receiver | Import checks | Export checks |
  |---|---|---|
  | Pages | creating pages there | `page-export` |
  | Files / media | `asset-upload` | reading the file |
  | A vault | `store-import` | reading the vault |
  | An add-on manager | the add-on's own rule (phr: your own health record only) | the add-on's own read rule |

  The engine has no "importer" permission of its own. The import screen shows a person only the receivers they may use. No one uploads anonymously; a username is always present (operator, earlier #1851 decision).
- __D6 — Shims are code, registered when their add-on loads; configuration only switches them (2026-10-22).__ The add-on's code registers its shims at load, the same way it registers managers. The add-on's manifest declares which shims it provides, as it declares its databases (and as #1966's manifest schema will check). Site configuration turns a shim on or off and sets its options. It never holds code.
- __D7 — What a shim declares (2026-10-22).__
  - its direction (D3);
  - what it accepts: file types or media types, plus a "can I read this?" check on the content;
  - what it produces: pages (NCM), files, or a named record kind such as health records;
  - which receivers it may hand to.
- __D8 — Today's converters become shims, and NCM becomes one (2026-10-22).__ JSPWiki, HTML, Markdown and DOCX become shims that produce NCM, with pages as the receiver. Converting to NCM stays optional, as decided earlier (#1851).
- __D9 — Shims chain (earlier #1851 decision, confirmed).__ The output of one shim can be the input of the next, e.g. DOCX to HTML to NCM to pages, or a zip to its files to C-CDA to health records.
- __D10 — Feed adapters become shims; FeedManager keeps only what's about feeds (2026-10-22).__ A feed is "a scheduled URL source, plus shims, into FeedManager":
  - fetching on a schedule is the engine's source, using the outbound HTTP rules from #1959 (User-Agent, per-source headers and timeouts);
  - parsing is the shim;
  - FeedManager stays the receiver for feed items, holds the feed settings, and shows them.

  One CSV shim then serves feeds, accounting's bank statements and page import alike.
- __D11 — The original file (earlier #1851 decision, confirmed).__ The person who imports chooses one of:
  - a citation to the origin (a footnote);
  - keeping the original file;
  - neither.

  phr keeps originals; that is phr's choice as the caller.

## Design rules that follow

- __Duplicate handling has two kinds.__ Files are recognised by a fingerprint (SHA-256), and an unchanged file is skipped. Feed items are recognised per item, by the item's own id or time. The engine supports both, and a shim says which applies.
- __Follow-up fetches go through the engine.__ A shim that must fetch more (the XML-index adapter reads a list, then each item) asks the engine to fetch, so every outbound request takes the one guarded path (`guardedFetch`, #1139).
- __Every call carries a context (P1).__ An upload carries the person's context; a scheduled source carries its job's context with a stated reason.
- __Work runs off the request path.__ Large files and chains run as background jobs (BackgroundJobManager), never on the request that started them. Scheduled sources use BackgroundJobManager too, not a bare timer; FeedScheduler's `setInterval` is a known gap today.
- __Values are configuration.__ Size limits, timeouts, schedules and retry counts are configuration keys with defaults.

## First slice

The smallest piece that proves the engine:

- 1 The engine and the shim registry, with the engine's file handling: unzip, noise filter, fingerprints, skipping unchanged files, per-file status, and keeping the original.
- 2 phr's FHIR and C-CDA parsers as the first add-on shims, handing to PhrManager. phr's C-CDA reader already has the right shape: `xmlKind(text)` is the "can I read this?" check, and `readCcda(xml)` returns records plus an optional partial note.
- 3 Today's converters (JSPWiki, HTML, Markdown, DOCX) wrapped as NCM shims into pages.

### What the first slice built (PR [#1981](https://github.com/jwilleke/ngdpbase/pull/1981))

- 1 __The engine__ is ImportManager (`src/managers/ImportManager.ts`) with `src/ice/`: the shim and receiver registry, `runImport` (one run), the file handling (`fileHandling.ts`: unzip through the existing zip reader, the noise filter, SHA-256 fingerprints) and the ledger (`ledger.ts`: fingerprints, per-file status and item keys per scope). An unchanged file is skipped; a shim with per-item duplicates skips items by their own key instead. Each file gets a status: `imported`, `partial`, `unchanged`, `duplicate`, `noise`, `unreadable`, `refused` or `failed`. The original is cited, kept or neither (D11): `keep` goes through the receiver's own `keepOriginal`, else the files receiver's upload door. The ledger records the kept original's reference by fingerprint, so a retry after a failed conversion reuses it instead of keeping another copy (#2011). `enqueueImport` runs it as the background job `import.engine-run`, each import as the person (or job) that asked. Every limit is a key under `ngdpbase.import.engine.`.
- 2 __The shim interface fits phr__, proven by a test fixture add-on in this repository (`src/managers/__tests__/__fixtures__/ice-fixture-addon`): a C-CDA shim with phr's reader shape (`xmlKind(text)` as "can I read this?", `readCcda(xml)` returning records and a partial note), a FHIR shim with per-item duplicates, and a receiver that is the add-on's own manager's door, checking its own rule and keeping originals itself. phr itself is not changed.
- 3 __Today's converters are shims__ `core.jspwiki`, `core.html`, `core.markdown` and `core.docx` (DOCX → HTML → NCM chains), into the receiver `core.pages` (PageManager's save door, checking `page-create`). `core.files` (AttachmentManager's upload door, checking `asset-upload`) is the other core receiver. /admin/import runs the same shim code and works as before; `tests/e2e/admin-import.spec.ts` proves it.
- __Host and manifest__: `host.registerShim(shim)` and `host.registerReceiver(receiver)` register as `<slug>.<name>`, only names the manifest's `shims` / `receivers` declare. Site configuration switches a shim with `ngdpbase.import.shims.<id>.enabled`.
- Not built, as decided for this slice: feeds onto the engine, the takeout import, export (`out` shims are declared, not run) and PDF.

### The import screen ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021), built 2026-10-24)

- `/import` is open to any user, not under `/admin` (operator, 2026-10-24). An anonymous visitor is sent to sign in; contacts never sign in. There is no new permission (D5): the screen offers each user only what `receiversFor` returns, and each receiver checks its own permission. A user who may use none is told so.
- A receiver's owner links to it preselected: `/import?receiver=phr.health-records`. The preselection is ignored for a receiver the user may not use.
- The upload (files or a zip) goes to `enqueueImport` with the user's own job context, never a client-supplied scope, and returns at once. The screen does no file handling.
- D11 on the screen: a receiver states the original choices it offers, `originals: { allowed, default }` on `IceReceiver`; the engine refuses any other. `core.files` offers only `none`.
- Status: each run's per-file report from `getImportRun`, refreshing until done, to its own user only; the screen lists the user's runs this process holds (`importRunsFor`).
- Limits: `ngdpbase.import.engine.upload-max-files` (20) and `upload-max-bytes` (256 MB, equal to `zip-max-bytes`).
- Still open from the issue: whether a receiver may hide file names from the status view, and a "your recent imports" list from the ledger across restarts.

Later, once the engine has proven itself:

- feeds moved onto it (D10);
- the vault takeout import;
- export, including PDF (#1974);
- accounting's statement imports.

## Open questions

Answers marked __decided__ were proposed by the first slice (PR [#1981](https://github.com/jwilleke/ngdpbase/pull/1981)) and accepted by the operator on 2026-10-23 ([#1979](https://github.com/jwilleke/ngdpbase/issues/1979)). The rest are still open.

- The engine's name: keep `ImportManager`, or rename it since it also exports.
  - __Decided (operator, 2026-10-23): keep `ImportManager`.__ Renaming touches every caller, route and doc for no behaviour; export can live on it, or a rename can come with export.
- A plugin as a receiver (D4): previews only, or not at all. (Not needed by the first slice; still open.)
- Where the engine keeps fingerprints and per-file status (a core database table, or the files layer), and how phr's existing `phr_source_files` history moves over.
  - __Decided (operator, 2026-10-23): the engine's own ledger behind an `IceLedger` interface__, first stored as one JSON file per scope under `ngdpbase.import.engine.ledger-dir` (FAST_STORAGE). The application database is off by default (`ngdpbase.database.provider: none`), and the files layer (#1851) has no write door yet. A database table implements the same interface when the database is on. A scope is `<receiver>/<username>` unless the caller names one (phr can pass its source id). phr's `phr_source_files` rows map one to one onto a ledger entry (name, SHA-256, size, status, message, time, references), so moving them over is a one-time copy into phr's scope.
- How a shim is registered on `host` (the exact call and types), and how the manifest declares it (with #1966).
  - __Decided (operator, 2026-10-23):__ `host.registerShim(shim: IceShim): string` and `host.registerReceiver(receiver: IceReceiver): string`, registering `<slug>.<name>`, types in `@jwilleke/ngdpbase-types` (`src/ice/types.ts`). The manifest declares names on the existing `AddonManifest`: `"ngdpbase": { "shims": ["ccda", "fhir"], "receivers": ["health-records"] }`; the host refuses any other name. #1966's schema should check the same two fields.
- Keeping originals through the files layer (D11).
  - __Decided (operator, 2026-10-23):__ `keep` goes to the receiver's own `keepOriginal` when it has one (phr stores the original in its encrypted database beside the records); otherwise the original becomes an ordinary attachment on what was created, under the normal upload rules, through the `core.files` receiver, which is AttachmentManager's upload door today because FileManager (#1851) only reads so far. It moves to FileManager's write door when that exists.
- Export: how a person picks what to export, and to which shim. (Not needed by the first slice; still open.)

## Related

- #1851 — one file layer (the files/media receiver; the original #1851 decisions on chained parsers, the toNCM option and keeping originals).
- #1974 — HTML→PDF export (the first two-way shim).
- #1959 — outbound HTTP options used by scheduled sources.
- #1966 — the add-on manifest schema that will declare shims.
- #1823 — access control for add-on records (the add-on manager as the door).
