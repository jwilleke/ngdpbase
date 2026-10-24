---
name: ImportManager
description: The ICE engine — imports through shims into receivers' own doors; the folder, URL and takeout imports
dateModified: '2026-10-24'
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
- __The original__ (D11): the run's `original` is `cite` (each item carries a citation the receiver renders; pages get a footnote), `keep` (the receiver's own `keepOriginal`, else the `core.files` upload door, both as the user; refused means nothing is imported), or `none`.
- __The original choices a receiver offers__ ([#2021](https://github.com/jwilleke/ngdpbase/issues/2021)): a receiver may declare `originals: { allowed, default }`. Without it all three are offered. A run that chooses nothing gets the receiver's default (else `default-original` when allowed, else the first allowed); a run asking for one the receiver does not offer is refused.
- __Off the request path__: `enqueueImport` queues the run for the background job `import.engine-run` and returns its id at once. `runImport` runs and waits, for code already off the request path.

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
| `runImport(request, ctx)` | Run now and wait; returns the report |
| `getImportRun(runId, ctx)` | The run's report, to the user it ran as |
| `importRunsFor(ctx)` | The runs this process holds for that user, newest first; never anyone else's |

A request is `{ source: { type: 'upload', files }, receiver, shim?, original?, scope? }`. Each file's report has its status: `imported`, `partial` (a shim's partial note, or some items refused), `unchanged`, `duplicate`, `noise`, `unreadable` (no shim reads it for that receiver), `refused` (the receiver's permission said no), or `failed`.

### Where fingerprints and status live

The engine's own ledger (`src/ice/ledger.ts`), behind the `IceLedger` interface: one JSON file per scope under `ngdpbase.import.engine.ledger-dir`, holding each file's name, fingerprint, size, status, message, time and the receiver's references, and the item keys seen. Never the content. A scope is `<receiver>/<username>` unless the caller names one. The application database is off by default, so this is the first store; a table implements the same interface when it is on.

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
- `POST /import` (multipart: `files`, `receiver`, `original`; sent with `csrfFetch`) checks the receiver is one of theirs and the original choice one it offers, then calls `enqueueImport` with `jobContextFromRequest`. The request is built from those fields only, never a client's `scope` or `shim`. It answers 202 with the run id at once. Over `upload-max-files` or `upload-max-bytes` is a 413, refused before anything is queued.
- `GET /import/runs/:runId` returns the run's report to the user it ran as; anyone else gets 404.

The end-user help page is [Importing Files](../../required-pages/979ca807-b5fd-4993-a101-d619fe9b6362.md).

## The folder import (/admin/import)

Unchanged for the user using it: preview, import (streamed), conflict policy, attachments from `-att/` folders, keyword registration, run summaries. Its conversion step now runs the converter's shim (and the DOCX → HTML chain) through the same code the engine runs. Gated by `admin-system`, as before.

## Known gaps

- [#1979](https://github.com/jwilleke/ngdpbase/issues/1979): export (`out` shims), feeds (D10), the takeout import and the URL import are not on the engine yet.
- [#2021](https://github.com/jwilleke/ngdpbase/issues/2021): the import screen shows every file name in a run's status; a receiver cannot hide them yet (health-record exports often name the user). After a restart the screen lists no earlier runs, though the ledger still holds each file's last status.
- `core.pages` does not register JSPWiki categories as keywords, as the folder import does: that writes the site's keyword catalogue, which `page-create` does not cover.
- Run reports live in memory (`max-kept-runs`); the ledger keeps per-file status across restarts.
- One background job run drains every queued import; its audit record names the first user in the queue. Each import still runs as its own user.
