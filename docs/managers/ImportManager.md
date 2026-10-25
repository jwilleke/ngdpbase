---
name: ImportManager
description: The ICE engine — imports through shims into receivers' own doors; the folder, URL and takeout imports
dateModified: '2026-10-25'
category: managers
code: src/managers/ImportManager.ts
---

# ImportManager

ImportManager is the ICE engine ([#1979](https://github.com/jwilleke/ngdpbase/issues/1979)): one core manager that brings data in through format-specific __shims__ and hands the results to __receivers__. The design and its decisions are [ice-planing.md](../planning/ice-planing.md); this page is the reference for what is built. It also still holds the admin folder import, the URL import and the private-store takeout import.

## The engine

```text
upload (zip or files)
  └─ unzip ─ noise filter ─ SHA-256 fingerprint ─ skip unchanged
       └─ shim ─(chain)─ shim ─▶ receiver's own door (as the user / the job)
            per-file status + fingerprints ─▶ the engine's ledger
```

- __Shims__ know one outside format (D2). Each declares its direction (`in`, `out`, `both`), what it accepts (extensions, media types, kinds from another shim, and a "can I read this?" check), what it produces, and the receivers it may hand to (D3, D7). Types: `src/ice/types.ts`.
- __Receivers__ are doors that already exist (D4). The engine hands each result to the receiver's `receive(item, ctx, info)` and never writes content itself. The receiver checks its own existing permission with `ctx` (D5): there is no import permission.
- __Chaining__ (D9): a shim's output goes to the next shim that accepts its kind, until the item is a kind the receiver takes, from a shim that lists that receiver. DOCX → HTML → NCM → pages is one.
- __Duplicates__: a shim says which kind applies. `file` (the default): a file whose fingerprint its scope already imported is `unchanged` and skipped. `item`: the file is read again and each item whose `itemKey` the scope has seen is skipped.
- __The original__ (D11): the run's `original` is `cite` (each item carries a citation the receiver renders; pages get a footnote), `keep` (the receiver's own `keepOriginal`, else the `core.files` upload door, both as the user; refused means nothing is imported), or `none`. An original is kept once per fingerprint, scope and keeping door: the ledger records its reference as soon as it is kept, and a later run of the same bytes (a retry after a failed conversion or a refusal, or a per-item shim reading the file again) reuses it instead of keeping another copy.
- __Keeping into an encrypted store__ ([#2034](https://github.com/jwilleke/ngdpbase/issues/2034)): a receiver whose `keepOriginal` writes into an encrypted store (phr's vault) says so with `keepsEncrypted: true`. A background run carries a job context, which never holds the user's key, so such a keep cannot happen in the run. Instead `enqueueUpload(request, ctx)` keeps each original during the upload with `ctx`, the request's own context, while the key is in it, then queues the run with the job context derived from it: the bytes and the store's sealed index entry are written then. Each one is recorded in the ledger as the keep-once record, so the run reuses it and never keeps again; signing out right after the upload changes nothing. The files are chosen exactly as the run chooses them (`keepOriginalsAtUpload` and the run share `planFile`): zip members each, never noise, a file too large, one nothing reads or one already imported. A keep refused (or failing) at upload throws `ImportUploadRefused`, naming the file, and nothing is queued; originals kept before it stay recorded for the next try. Keeps through `core.files`, or a receiver without `keepsEncrypted`, still happen in the run.
- __Media types__ ([#2061](https://github.com/jwilleke/ngdpbase/issues/2061)): every file the engine unpacks from a zip carries a `mediaType`, from its extension (`MEDIA_TYPE_BY_EXTENSION` in `src/ice/fileHandling.ts`, the one table, which the folder import uses too), checked against its bytes: JSON must start with `{` or `[`, NDJSON with `{`, XML with `<`, else it is `application/octet-stream`; then the upload door's own rule (`resolveUploadMime`), so bytes that show a type decide (XML with an `<?xml` prolog is `text/xml`) and the type a receiver is handed is the type the door stores. A file uploaded on its own keeps the type its request gave it. The table is code, not configuration: it says what a format is; which types a site takes is its attachment allow-list.
- __The types a receiver keeps__ ([#2061](https://github.com/jwilleke/ngdpbase/issues/2061)): a receiver may declare `originals.types`, exact media types (a wildcard is refused at registration). For each keep at upload the engine opens an `OriginalKeep` (`src/ice/originalKeep.ts`) for that receiver, that user and that one `keepOriginal` call, hands it to the call, and closes it when the call returns. The receiver passes it to `uploadAttachment` as the `keep` option. The door honours only an open one, and only for a file going into that user's own vault of a system-category the receiver's add-on declares (`StoreKind.owner`): there the declared types are allowed beyond `ngdpbase.attachment.allowedtypes`, and the file is marked a download. Anywhere else (the shared pool, another vault, an ordinary upload, another receiver, a copy of the object, after the call) it changes nothing, and undeclared types and size limits are as always. Keeps in the run (`core.files`, a receiver without `keepsEncrypted`) get no `OriginalKeep`.
- __The original choices a receiver offers__ ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021)): a receiver may declare `originals: { allowed, default }`. Without it all three are offered. A run that chooses nothing gets the receiver's default (else `default-original` when allowed, else the first allowed); a run asking for one the receiver does not offer is refused.
- __Off the request path__: `enqueueImport` (or `enqueueUpload`, for a user's upload) queues the run for the background job `import.engine-run` and returns its id at once. `runImport` runs and waits, for code already off the request path.

### Core shims and receivers

| Id | What it is |
| --- | --- |
| `core.jspwiki`, `core.html`, `core.markdown` | Today's converters as shims (D8): NCM for `core.pages`. `core.html` also accepts `html` from another shim |
| `core.docx` | Produces `html`, which chains into `core.html` |
| `core.pages` | PageManager's save door. Checks `page-create`. A title that exists is a duplicate. Fix steps and the NCM footnote step run as for the folder import |
| `core.files` | AttachmentManager's upload door, which checks `asset-upload`. Also keeps originals for receivers that do not keep their own. Offers only `none` for the original: the file stored is the original |

Every registered converter is also a shim, `core.<formatId>`; `registerConverter` still works.

### API

| Method | What it does |
| --- | --- |
| `registerShim(owner, shim)` | Registers `<owner>.<shim.name>`. Add-ons call `host.registerShim(shim)` instead |
| `registerReceiver(owner, receiver)` | Registers `<owner>.<receiver.name>`. Add-ons call `host.registerReceiver(receiver)` |
| `listShims()` | Every shim, with whether it is on |
| `receiversFor(ctx)` | The receivers this user may use, each answering with its own permission, with the original choices each offers |
| `enqueueImport(request, jobCtx)` | Queue a run as background work; returns the run id |
| `enqueueUpload(request, ctx)` | A user's upload, with the request's context: keeps originals into an encrypted store first (#2034), then queues the run as `jobContextFromRequest(ctx)`; throws `ImportUploadRefused` when one cannot be kept, queuing nothing |
| `runImport(request, ctx)` | Run now and wait; returns the report |
| `getImportRun(runId, ctx)` | The run's report, to the user it ran as |
| `importRunsFor(ctx)` | The runs this process holds for that user, newest first; never anyone else's |

A request is `{ source: { type: 'upload', files }, receiver, shim?, original?, scope? }`. Each file's report has its status: `imported`, `partial` (a shim's partial note, or some items refused), `unchanged`, `duplicate`, `noise`, `unreadable` (no shim reads it for that receiver), `refused` (the receiver's permission said no), or `failed`. A file's `message` carries what the receiver said of what it stored (`ReceiveOutcome.message`, such as "12 new, 0 updated, 0 unchanged"), before any partial note and refusal; when several items say different things it shows the first and how many more, so the per-file status at /import stays short.

### Where fingerprints and status live

The engine's own ledger (`src/ice/ledger.ts`), behind the `IceLedger` interface: one JSON file per scope under `ngdpbase.import.engine.ledger-dir`, holding each file's name, fingerprint, size, status, message, time, the receiver's references and the kept original's reference with the door that kept it, and the item keys seen. Never the content. A scope is `<receiver>/<username>` unless the caller names one. The application database is off by default, so this is the first store; a table implements the same interface when it is on.

### Configuration

| Key | Default | |
| --- | --- | --- |
| `ngdpbase.import.engine.noise` | `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*` | `dir/` a directory segment; `x*` / `*x` a name prefix or suffix; else an exact name |
| `ngdpbase.import.engine.zip-max-entries` | 10000 | Per archive |
| `ngdpbase.import.engine.zip-max-bytes` | 268435456 | Per archive, inflated |
| `ngdpbase.import.engine.zip-max-depth` | 3 | Zips inside zips |
| `ngdpbase.import.engine.max-file-bytes` | 104857600 | One file |
| `ngdpbase.import.engine.max-chain-depth` | 5 | Shims one file may pass through |
| `ngdpbase.import.engine.default-original` | `none` | `cite`, `keep` or `none` |
| `ngdpbase.import.engine.ledger-dir` | `${FAST_STORAGE}/import-ledger` | |
| `ngdpbase.import.engine.ledger-max-entries` | 10000 | Files and item keys kept per scope |
| `ngdpbase.import.engine.max-kept-runs` | 100 | Run reports held in memory |
| `ngdpbase.import.engine.upload-max-files` | 20 | Files in one upload on `/import` |
| `ngdpbase.import.engine.upload-max-bytes` | 268435456 | One upload on `/import`, all files together. Ships equal to `zip-max-bytes`, so the screen takes any archive the engine would |
| `ngdpbase.import.shims.<shim id>.enabled` | `true` | Switches a shim (D6), for the engine and the folder import |
| `ngdpbase.import.shims.<shim id>.options` | `{}` | Handed to the shim as `tools.options` |

## The import screen (/import)

Any user's screen onto the engine ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021)), in `WikiRoutes` (`importPage`, `importUpload`, `importRunStatus`) and `views/import.ejs`. Gated by `profile-manage`, which every user holds, so an anonymous visitor is sent to sign in; there is no import permission (D5).

- `GET /import` offers the receivers `receiversFor` gives this user, and their runs from `importRunsFor`. `?receiver=<id>` preselects one, only when it is among them. With none, the screen says there is nothing they can import into.
- `POST /import` (multipart: `files`, `receiver`, `original`; sent with `csrfFetch`) checks the receiver is one of theirs and the original choice one it offers, then calls `enqueueUpload` with the request's own context, which keeps originals into an encrypted store (#2034) and queues the run with `jobContextFromRequest`. The request is built from those fields only, never a client's `scope` or `shim`. It answers 202 with the run id at once. Over `upload-max-files` or `upload-max-bytes` is a 413, refused before anything is queued. An original that could not be kept in an encrypted store is a 403 whose `error` says which file and why; nothing is queued.
- `GET /import/runs/:runId` returns the run's report to the user it ran as; anyone else gets 404.

The end-user help page is [Importing Files](../../required-pages/979ca807-b5fd-4993-a101-d619fe9b6362.md).

## The folder import (/admin/import)

Unchanged for the user using it: preview, import (streamed), conflict policy, attachments from `-att/` folders, keyword registration, run summaries. Its conversion step now runs the converter's shim (and the DOCX → HTML chain) through the same code the engine runs. Gated by `admin-system`, as before.

## Known gaps

- [#2061](https://github.com/jwilleke/ngdpbase/issues/2061): only a keep at upload (`keepsEncrypted`) carries an `OriginalKeep`; a receiver that keeps in the run into an unencrypted vault of its own still meets the site's allow-list. An original kept through `core.files` is an ordinary attachment, shown inline (sandboxed) like any other.

- [#1979](https://github.com/jwilleke/ngdpbase/issues/1979): export (`out` shims), feeds (D10), the takeout import and the URL import are not on the engine yet.
- [#2021](https://github.com/jwilleke/ngdpbase/issues/2021): the import screen shows every file name in a run's status; a receiver cannot hide them yet (health-record exports often name the user). After a restart the screen lists no earlier runs, though the ledger still holds each file's last status.
- `core.pages` does not register JSPWiki categories as keywords, as the folder import does: that writes the site's keyword catalogue, which `page-create` does not cover.
- Run reports live in memory (`max-kept-runs`); the ledger keeps per-file status across restarts.
- One background job run drains every queued import; its audit record names the first user in the queue. Each import still runs as its own user.
