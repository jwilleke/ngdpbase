# ICE — Import, Convert, Export

Epic: [#1979](https://github.com/jwilleke/ngdpbase/issues/1979)

The source of truth for the ICE epic: one engine that brings data in, converts it, and sends it out, with add-ons supplying the format-specific pieces ("shims"). Decisions here are the operator's; development follows this page. Change it when a decision changes, in the same change that ships the code.

Status: design agreed (2026-10-21/22). First slice merged in PR [#1981](https://github.com/jwilleke/ngdpbase/pull/1981) (2026-10-23): the engine, the shim registry and today's converters as shims. The user-facing import screen, `/import`, is built ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021), 2026-10-24). Every file kept as a file is vetted and cleaned by the engine ([#2149](https://github.com/jwilleke/ngdpbase/issues/2149), 2026-10-30). Export runs on the engine, from a page ([#2120](https://github.com/jwilleke/ngdpbase/issues/2120), 2026-10-30). The operator accepted its answers to the open questions it needed (2026-10-23); they are now decisions (see [Open questions](#open-questions)). Every open question is now decided (operator, 2026-10-28).

## Where this came from

- yourPHR needs parsers whose output is health records, not pages: FHIR JSON/NDJSON and C-CDA (via `@medplum/ccda`) now, CCR later. The records must go through phr's own manager (PhrManager), never straight to storage. phr built a temporary engine of its own (unzip, noise filter, SHA-256 fingerprints, skipping unchanged files, per-file status, a `phr_source_files` table) and will drop it once ICE exists.
- The operator asked to decide the design directly, and chose the DirXML engine model: a core engine with small connectors ("shims") for each outside format. Reference: [DirXML Engine](https://ldapwiki.com/wiki/Wiki.jsp?page=DirXML%20Engine).

## What exists today

Four separate ways data comes in, each with its own plumbing:

| Path | What it does | Where |
|---|---|---|
| ImportManager converters | JSPWiki, HTML, Markdown and DOCX files into NCM pages. Admin-only (`/admin/import`, gated by admin view access) | `src/managers/ImportManager.ts` (`registerConverter`, `canHandle`) |
| Feeds adapters | GeoJSON, REST/JSON, XML, CSV, RSS/Atom and XML-index sources fetched on a schedule into feed records. On the engine since [#2109](https://github.com/jwilleke/ngdpbase/issues/2109) (see [Feeds on the engine](#feeds-on-the-engine-2109-built-2026-10-29)) | core's record shims `src/ice/shims/`, the feeds add-on's job `feeds.poll` |
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

  The engine has no "importer" permission of its own; it asks the receiver's own rule (`mayUse`) before any work of a run (#2012). The import screen shows a person only the receivers they may use. No one uploads anonymously; a username is always present (operator, earlier #1851 decision).
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
- The upload (files or a zip) goes to `enqueueUpload` with the request's context (since #2034; the run gets the user's own job context), never a client-supplied scope, and returns at once. The screen does no file handling.
- D11 on the screen: a receiver states the original choices it offers, `originals: { allowed, default }` on `IceReceiver`; the engine refuses any other. `core.files` offers only `none`.
- Status: each run's per-file report from `getImportRun`, refreshing until done, to its own user only. A run still queued or running is listed from what the process holds (`importRunsFor`); finished files are in the recent list below.
- Limits: `ngdpbase.import.engine.upload-max-files` (20) and `upload-max-bytes` (256 MB, equal to `zip-max-bytes`).
- A receiver cannot hide file names from the status view: only the user who uploaded sees it, and they need the names to see which file failed. The audit log keeps the file name, except for an encrypted destination, where it records the file's id (operator, 2026-10-29). When the destination is encrypted (a sealed vault, e.g. health records), application logs, notices and admin screens do not show it to anyone else (operator, 2026-10-28; narrowed to encrypted destinations 2026-10-29); other imports log file names as before. Built ([#2110](https://github.com/jwilleke/ngdpbase/issues/2110), 2026-10-29): a destination is encrypted when its receiver keeps into a sealed store (`keepsEncrypted`), and no receiver can declare itself so otherwise (`isConfidential`). The engine's and `/import`'s catch-all error logs give such an import's run and the error's class, never its message; a sealed store's upload door already logged by id. A unit test drives a distinctive file name through every way a confidential run can end and fails if any log line or notice holds it.
- "Your recent imports" is read from the ledger, so it survives a restart: the user's own recent files, newest first, with each file's result and what it went into. How many it shows is a configuration key with a default (operator, 2026-10-28). Built ([#2110](https://github.com/jwilleke/ngdpbase/issues/2110), 2026-10-29): `recentImportsFor(ctx)` reads the user's own bound scope in each receiver `receiversFor` gives them, merged newest first, at most `ngdpbase.import.engine.recent-imports` (25). Each entry links to what it created when the receiver's optional `linkFor(ref, ctx)` says the user may open it (`core.pages` asks PageManager's read decision).
- The user names what a single upload becomes (operator, 2026-10-29): one name field, pre-filled with the file's own name; a zip or several files keep their own names. Built ([#2130](https://github.com/jwilleke/ngdpbase/issues/2130), 2026-10-29): a receiver opts in with `names: 'title' | 'file'`; the name travels as the upload file's `givenName` and reaches the receiver as `ReceiveInfo.givenName`, checked by the engine's one rule (`src/ice/givenName.ts`) on the route and again in the run, and only as a name, never a location. A given name the location has is refused, not replaced (the #1855 warning cannot be asked mid-run). The ledger, the status, recent imports and the doors' audit records (`importedFrom`) keep both names; a sealed store's records stay by id.

### Keeping an original in an encrypted vault ([#2034](https://github.com/jwilleke/ngdpbase/issues/2034), built 2026-10-24)

- __Decided (operator, 2026-10-24): keep at upload.__ When the user chose to keep the original and the receiver keeps it in an encrypted store (yourPHR's vault), it is kept during the upload request, with the request's context, while the user's key is live. A file exists in a vault only through its entry in the store's sealed `files-index.json`, so that entry is written then too. Not chosen: a timed key copy for the run, or the job carrying the key; both keep a key on the server past the request.
- A receiver says its keeps need the key with `keepsEncrypted: true` on `IceReceiver`. `POST /import` calls `enqueueUpload` with the request's context, which keeps each original (`keepOriginalsAtUpload`) and records it in the ledger as the keep-once record (#2011) before queuing. The run reuses each one and needs no key, so signing out right after the upload is fine.
- A keep refused at upload refuses the upload, saying which file and why, and nothing is queued.
- Keeps through `core.files`, and through a receiver without `keepsEncrypted`, stay in the run.
- A zip is unpacked once for the keeps and again by the run: the same bounded work (`zip-max-*`), done twice only for these uploads.

### Kept types, media types and downloads ([#2061](https://github.com/jwilleke/ngdpbase/issues/2061), built 2026-10-25)

- __Decided (operator, 2026-10-25, option a):__ a receiver declares the media types it keeps, `originals: { allowed, default, types }`. Core allows exactly those types, only into that receiver's own vault, for a keep at upload; the site's attachment allow-list is unchanged for every other upload. Not chosen: (b) no type check for a user's own encrypted vault; (c) keep the site's list and have phr default to `none`.
- The exemption is an `OriginalKeep` the engine opens for one receiver, one user and one `keepOriginal` call, passed on by the receiver as the upload's `keep` option and closed when the call returns. The upload door honours it only for that user's own vault of a system-category the receiver's add-on declares. A wildcard type is refused at registration.
- The engine sets the media type of every file it unpacks from a zip, by extension, checked against the bytes where cheap (JSON, NDJSON, XML), then by the upload door's own sniffing rule, so receivers never label files themselves. The extension table is code (`MEDIA_TYPE_BY_EXTENSION`), not configuration: what a format is is not a site's choice; which types a site takes already is.
- Kept originals are always served as downloads (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`), never inline: the store's index marks them `download`.

### Vetting a file kept as a file ([#2149](https://github.com/jwilleke/ngdpbase/issues/2149), built 2026-10-30)

Uploads are imports (operator, 2026-10-30, [planning/files.md](files.md)). FileManager's Upload file dialog hands each file to ICE, and ICE returns control to FileManager, which keeps it in the place the user chose.

- __Vetting is the engine's stage, run for every file FileManager keeps__ (`ImportManager.vetFile`, `src/ice/vet.ts`): the type is read from the bytes (#1624), then the shim for that type cleans it. The cleaned copy is the one kept, and the notes (one per kind, counts only, never content) go back to the user and onto the upload's audit record.
- __A format shim cleans its own kind__ with `clean(input)` beside, or instead of, `read`: `core.csv` takes HTML out of cells and gives a formula cell (`= + - @`, not a plain number) a leading `'`; `core.svg`, a cleaning-only shim, never patches with patterns: `core.svg` parses the SVG (sanitize-html on htmlparser2, the HTML policy's parser, in XML mode) and rebuilds it from an allow-list of SVG elements and attributes, removing scripts, `foreignObject` and other embedded content, `on…` handlers, unsafe links (`javascript:`, `vbscript:`, `data:text/html` anywhere in a value, a `values` list included; a link is kept only as a fragment, a relative path, http(s) or an embedded raster image), animations that set a link, a DOCTYPE or processing instruction, and any other element or attribute a picture does not use. A CSV is cleaned in its own encoding and written back in it: UTF-8, UTF-16 with a byte-order mark, and any other bytes one to one (Latin-1, Windows-1252), so no byte outside the cleaned cells changes. A shim with only `clean` is never picked for a run. The cleaner is chosen by the type the bytes show, and by extension only when the bytes show no type of their own (CSV). Configuration switches it like any shim (`ngdpbase.import.shims.<id>.enabled`).
- __A cleaner that fails refuses the file__ (`IceVetRefused`): what could not be checked is not kept.
- __Not a run.__ The dialog's upload does not go through `runImport`: it is kept during its request (a sealed vault needs the user's key then, as #2034 decided for kept originals), the same file may go to two places (a run's ledger would skip it the second time as unchanged), and the dialog answers at once. Vetting is one linear pass over a file within the upload limit.
- `core.files` now puts into the public place through `FileManager.put`, so an `/import` into Files is vetted the same way and its status says what was cleaned.
- Which types a site takes is still `ngdpbase.attachment.allowedtypes`, site-wide, checked where the bytes are stored.
- Not cleaned yet: formulas inside `.xlsx`/`.ods`, HTML files, PDFs and Office documents; they are kept as uploaded and served sandboxed, as before.

### Fixes from the v5.27.0 review ([#2010](https://github.com/jwilleke/ngdpbase/issues/2010), [#2012](https://github.com/jwilleke/ngdpbase/issues/2012), [#2013](https://github.com/jwilleke/ngdpbase/issues/2013), built 2026-10-28)

- __The receiver's permission comes first (#2012).__ The engine asks the receiver's own `mayUse(ctx)` before any work of a run, so a refused user costs no unzip, no shim, no keep and no fetch. Each uploaded file is reported and recorded `refused`; a file already taken keeps its entry, and its references and kept original's reference are carried. The check stays the receiver's (D5): `mayUse` is its existing rule, `receive` still checks each item, and the receiver interface needed no new door.
- __The scope is the caller's (#2013).__ The engine binds each run's ledger scope to the receiver and to the user the run is for, by identity `@id` (else the username, as #2041 does): `ice2/<receiver>/<owner>[/<sub>]`. A request's `scope` only narrows within it (phr's source id). One user's entries never skip, mark duplicate or reveal another's files, and a reused username inherits nothing. The username is used only when the identity store answers that there is no record; when it cannot answer, the run does not start and nothing is recorded ("try again shortly"), rather than land in a scope the user's other runs do not use (review of PR [#2103](https://github.com/jwilleke/ngdpbase/pull/2103)).
- __Existing ledger entries belong to nobody (#2013).__ They were written under scopes any caller could name, so none is trusted as a user's history: a ledger file without the new form marker is read as empty, and its files are imported once more. Receivers' own duplicate checks (a page title, per-item keys) catch what they already hold. The old files are left on disk, unread.
- __Partial and failed files are retried (#2010).__ Done is `imported`, `duplicate` (every item already held) and `unchanged`; `partial`, `failed`, `refused` and `unreadable` files are read again on the next run, so refused items are offered again. Items of such a file already stored are skipped by the engine's own key for them (fingerprint, chain and a hash of the item's content, never its position, so a shim that changes its output order cannot skip the wrong item), recorded while the file is not done, so a receiver is never handed one twice. A retry that finds every item already stored, with nothing refused, is `unchanged` and done, so a shim's "could not read this part" note costs one more read, not one per upload.

### Feeds on the engine ([#2109](https://github.com/jwilleke/ngdpbase/issues/2109), built 2026-10-29)

D10 is built: a feed is a URL source fetched by the engine, read by a core shim, into FeedManager. All six adapters moved in one change; none is left on the old path. The feeds add-on keeps only what is about feeds: the receiver `feeds.items`, the job `feeds.poll`, the settings and the display.

- __Shims are core's__ (decided, operator, 2026-10-29: generic work goes to core). `core.geojson`, `core.rest-json`, `core.xml`, `core.csv`, `core.rss-atom` and `core.xml-index` (`src/ice/shims/`) are registered by ImportManager, so any add-on uses them without the feeds add-on enabled (accounting's bank statements, [#2121](https://github.com/jwilleke/ngdpbase/issues/2121)). A source's `adapter` names its shim. Each produces core's `record` kind (`data` is `{ id, properties }`), per-item duplicates, and hands to any receiver that takes records: a shim's `receivers` may be `'*'` (`ANY_RECEIVER`), and each receiver still decides with its own permission (D5, D7). Nothing in them is about feeds: the parse settings (`itemsPath`, `recordIdField`, `map`, `delimiter`, `skipLines`, `linkPattern`, `maxItems`) are the run's `options`, so `core.csv` reads a bank statement with a preamble and a semicolon delimiter as it reads a FIRMS feed. XML parsing (`fast-xml-parser`) moved into core's dependencies with them; the feeds add-on no longer parses anything.
- __Receiver.__ FeedManager's `feeds.items` keeps the feed settings and shows them (records, the catalog, `toMarqueeText`), as before. It checks an existing permission, `config-manage`: feed sources are site configuration (D5, no new permission). It takes no uploads (`uploads: false`): the import screen never offers it.
- __Fetching.__ The engine fetches the source's URL (a new `url` source) through `guardedFetch` with the site's egress policy and default User-Agent and the source's own headers and timeout (#1959), at most `ngdpbase.import.engine.fetch-max-bytes`. The xml-index shim asks the engine for each item document (`tools.fetch`); the source's headers and timeout apply to those too.
- __Scheduling.__ The routine background job `feeds.poll` (every minute; `ngdpbase.jobs.feeds.poll.schedule` changes it) replaces FeedScheduler's `setInterval`. Each run starts the due sources, each fetch under the job's context with its own reason (`fetch feed '<id>' on its schedule`), and does not wait for them, so one source hanging to its timeout never holds back the next run's other sources (#1955). Cadence (`intervalMinutes`, `dailyAt`), back-off, the stale-feed warning and `max-concurrent-ingests` are unchanged.
- __Duplicates.__ The engine skips an item whose key it has seen; the key is the item's own id with its content's hash, the same hash the record store keeps, so an item revised under the same id is not skipped. A feed's store is a snapshot of its source, so the receiver gets every item of the fetch at `fileDone`, those skipped included, and stores the whole source there, shaped by `dedupeBy` / `maxAgeHours` and dropping what the source no longer holds, as an ingest always has.
- __Carry-over.__ Record stores are unchanged on disk, and the receiver's own duplicate check compares the stored hash, so the first fetch after the upgrade finds every unchanged record unchanged: nothing is re-added or dropped. A test copies stores written by the old adapters and proves it for CSV, RSS/Atom and GeoJSON.
- __Known gaps.__ The feeds' back-off multiplier, staleness window and the 100-item xml-index default are code defaults, as before (the last can be set per site with `ngdpbase.import.shims.core.xml-index.options.maxItems`). A fetch through the engine binds its ledger scope to the system principal's identity, so while the identity store cannot answer, feeds are not fetched ("try again shortly", #2013). While the application database is configured but unavailable, BackgroundJobManager holds every job, `feeds.poll` included (#1892).

### Export through the engine ([#2120](https://github.com/jwilleke/ngdpbase/issues/2120), built 2026-10-30)

Export starts from the thing being exported, and there is no general export screen (operator, 2026-10-28). Built for pages; search results and add-on lists are the follow-up. The reference is [ImportManager.md § Export](../managers/ImportManager.md#export-2120).

- __A source per owner.__ The owner of the data registers an export source: the kind of items it yields, whether a user may export a thing (an affordance, for offering the action) and the door that reads it for export with the user's context. The engine has no export permission of its own (D5); the source asks its owner's existing one. `core.pages` yields `ncm` and asks `page-export` (in the vault for a vault page), then reads through the page door, which decides `page-read`; it records `page-export` with the format.
- __Only the formats that fit.__ The Export action lists the `out` shims that make a file and can be reached from the source's kind through other `out` shims (D9), each by its shortest chain: NCM as stored, HTML, Markdown (from the rendered page) and PDF for a page. A shim a site switches off, or PDF with no provider chosen, is not offered.
- __The PDF provider is the first `out` shim__ (#1974): `core.pdf`, HTML → PDF through `ExportManager.htmlToPdf`, after `core.ncm-html` renders the page. It is `out` only; reading a PDF in is not built.
- __Off the request path.__ The thing is read in the request, so step-up and a vault's key apply as on any read; the shims run in the engine's background job as the user's job context. The file is held in memory for that user only, never written to disk, and let go after a configured time. Size limits and retention are configuration keys under `ngdpbase.export.engine.` with defaults.
- __Decided here, conservatively, and open for the operator__: the engine's page export asks `page-export` on top of read, as D5 says, while the existing single-page `/export/html` and `/export/markdown` routes stay gated on read only (#1060); the general `/export` screen is left in place, not removed; an export is for signed-in users only, since a run is held for its user.

Later, once the engine has proven itself:

- the vault takeout import;
- export of search results and add-on lists (#2120's follow-up);
- accounting's statement imports.

## Open questions

Answers marked __decided__ were proposed by the first slice (PR [#1981](https://github.com/jwilleke/ngdpbase/pull/1981)) and accepted by the operator on 2026-10-23 ([#1979](https://github.com/jwilleke/ngdpbase/issues/1979)); the rest were decided on 2026-10-28.

- The engine's name: keep `ImportManager`, or rename it since it also exports.
  - __Decided (operator, 2026-10-23): keep `ImportManager`.__ Renaming touches every caller, route and doc for no behaviour; export can live on it, or a rename can come with export.
- A plugin as a receiver (D4): previews only, or not at all.
  - __Decided (operator, 2026-10-28): not at all, for now.__ Plugins display and never store, and the ledger and retries assume a receiver stores. A preview can come later if asked for.
- Where the engine keeps fingerprints and per-file status (a core database table, or the files layer), and how phr's existing `phr_source_files` history moves over.
  - __Decided (operator, 2026-10-23): the engine's own ledger behind an `IceLedger` interface__, first stored as one JSON file per scope under `ngdpbase.import.engine.ledger-dir` (FAST_STORAGE). The application database is off by default (`ngdpbase.database.provider: none`), and the files layer (#1851) has no write door yet. A database table implements the same interface when the database is on. A scope is bound to the receiver and the user (by identity `@id`) since [#2013](https://github.com/jwilleke/ngdpbase/issues/2013); a caller's own scope (phr's source id) narrows within it. phr's `phr_source_files` rows map one to one onto a ledger entry (name, SHA-256, size, status, message, time, references), so moving them over is a one-time copy into phr's scope.
- How a shim is registered on `host` (the exact call and types), and how the manifest declares it (with #1966).
  - __Decided (operator, 2026-10-23):__ `host.registerShim(shim: IceShim): string` and `host.registerReceiver(receiver: IceReceiver): string`, registering `<slug>.<name>`, types in `@jwilleke/ngdpbase-types` (`src/ice/types.ts`). The manifest declares names on the existing `AddonManifest`: `"ngdpbase": { "shims": ["ccda", "fhir"], "receivers": ["health-records"] }`; the host refuses any other name. #1966's schema should check the same two fields.
- Keeping originals through the files layer (D11).
  - __Decided (operator, 2026-10-23):__ `keep` goes to the receiver's own `keepOriginal` when it has one (phr stores the original in its encrypted database beside the records); otherwise the original becomes an ordinary attachment on what was created, under the normal upload rules, through the `core.files` receiver, which is AttachmentManager's upload door today because FileManager (#1851) only reads so far. It moves to FileManager's write door when that exists.
- Export: how a user picks what to export, and to which shim.
  - __Decided (operator, 2026-10-28): export starts from the thing being exported.__ A page, a search result or an add-on's list (health records, the ledger) offers an Export action listing only the `out` shims that can produce from that kind of data. The owner of the data checks the user's existing read permission (D5). There is no general export screen.

## Related

- #1851 — one file layer (the files/media receiver; the original #1851 decisions on chained parsers, the toNCM option and keeping originals).
- #1974 — HTML→PDF export (the first two-way shim).
- #1959 — outbound HTTP options used by scheduled sources.
- #1966 — the add-on manifest schema that will declare shims.
- #1823 — access control for add-on records (the add-on manager as the door).
