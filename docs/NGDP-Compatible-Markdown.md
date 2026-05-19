# ngdp Compatible Markdown (NCM)

Status: **Implemented and released** (Phase 1 + Phase 2, shipped v3.18.0; [#728](https://github.com/jwilleke/ngdpbase/issues/728) closed).
Code: `src/converters/ncm/` · `src/utils/ncmNotify.ts` · wired into `ImportManager`, the `/admin/convert` tool, and `mcp-server.ts`.
Related: [#501](https://github.com/jwilleke/ngdpbase/issues/501) (JSON→NCM serializer — consumer) · [#685](https://github.com/jwilleke/ngdpbase/issues/685) (data-ingestion framework — consumer) · [#599](https://github.com/jwilleke/ngdpbase/issues/599) (showdown ReDoS — why no raw-HTML sink) · [#737](https://github.com/jwilleke/ngdpbase/issues/737) (Phase-2 image transcoding — open follow-up) · [#738](https://github.com/jwilleke/ngdpbase/issues/738) (conversion metrics — open follow-up).

---

## 1. Purpose & contract

**NCM is the single canonical on-disk page-content format.** Any path that produces page content — import, MCP, paste, JSON conversion (#501), scheduled feed ingestion (#685), "convert an existing page" — emits NCM. Nothing writes HTML or a bespoke format into pages.

```
import / paste / MCP   ─┐
JSON source   (#501)   ─┼─► normalize ─► ngdp Compatible Markdown ─► the ONE sanitized render pipeline ─► HTML
external feed (#685)   ─┘
```

Why one format:

- **Security/consistency** — one renderer, one sanitizer; no parallel raw-HTML injection sink (directly relevant to the unpatched showdown ReDoS #599 and the XSS/CSRF posture).
- **Round-trippable** — every page can be re-emitted as NCM: "convert existing page", deterministic re-serialization, clean versioned-page diffs.
- **One consumer contract** — plugin/import/ingestion authors target one format, not N.

NCM is a *profile* + a *normalization pass* layered on the existing machinery (`src/converters/` `IContentConverter` registry, `turndown`/`showdown`, the `MarkupParser` 7-phase render pipeline, `gray-matter` frontmatter, `AttachmentManager`). The render pipeline is **unchanged** by NCM — NCM is the write-side normalizer.

## 2. What NCM is

NCM = **CommonMark/GFM core** (as rendered by the existing showdown config) **plus** the ngdp wiki extensions supported by `MarkupParser`, constrained to a sanitizable, deterministic subset.

### 2.1 Constructs

| Construct | NCM form | Backed by |
|---|---|---|
| Headings, emphasis, lists, code | CommonMark | showdown |
| **Tables** | **Passthrough — NCM does NO table conversion** in either direction. JSPWiki `%%table-fit/-bordered/-striped/-hover/sortable/…` wrapping `\|\|Header\|\|`/`\|cell\|` is the rich canonical form; GFM pipe tables also render (plain). Both pass through unchanged — no down-convert and no up-convert. | `JSPWikiPreprocessor`, showdown `tables:true`, `WikiTableHandler` |
| **Links** | JSPWiki form (see §2.4): internal `[Display\|PageName]`, external `[Display\|https://url\|target="_blank"]`, InterWiki `[Display\|Site:Ref]` — **not** CommonMark `[text](url)` | `LinkParserHandler` |
| **Footnotes** | `[^id]` reference + `[^id]: text` definition (single- and multi-paragraph) | `FootnoteManager`, `showdown-footnotes-fixed` |
| **Embedded images** | `![alt](attachment-ref)` — image downloaded and stored as an attachment; the source URL / `data:` URI is replaced with the local attachment ref | `AttachmentManager`, `ImportManager.importPageAttachments()` |
| Plugins / variables | `[{PluginName param='…'}]`, `[{$variable}]` | `PluginManager`, `VariableManager` |
| Frontmatter | YAML via `gray-matter`, incl. the taxonomy fields (§3.2) | existing page contract |

> Category badges and keyword "chips" are **not** NCM body constructs. They are *rendered product* produced by the view/plugin layer (`header.ejs`, `view.ejs`, `SearchPlugin`) from the three taxonomy **frontmatter** fields. NCM has no badge/chip syntax; its only obligation is to preserve those fields faithfully (§3.2).

### 2.2 Image → attachment rule

On conversion, for every embedded image whose source is a remote URL or a `data:` URI:

1. **Fetch** with the global outbound timeout `ngdpbase.fetch-timeout-ms` (default `30000`; governs *our own* outbound HTTP, not third-party clients like ES/OTLP).
2. **Magic-byte sniff** the fetched bytes — classify by content, not the URL extension or `Content-Type` (polyglot/spoof defense).
3. **Strict raster allowlist** (tighter than the attachment store's `image/*`): accept only `image/jpeg, image/png, image/gif, image/webp`. `image/svg+xml` is **excluded** (XSS vector); RAW/HEIC excluded (not browser-renderable). NCM tightens, never loosens, the attachment policy.
4. **Size cap** reuses `ngdpbase.attachment.maxsize` (default 10 MB) — no parallel image-limit namespace.
5. **Ad/tracker deny-list** — a fetch whose host matches `ngdpbase.markdown.ncm.image.ad-deny-list` (host/glob array, seeded with a sane default) is dropped, not attached.
6. **Accepted** → stored via `AttachmentManager`; the Markdown is rewritten to the local attachment ref.
7. **Any drop** (over cap, type not allowed, sniff/Content-Type mismatch, ad host) → a structured `warnings[]` entry (§3) **and** an in-body placeholder (§3.3). Nothing vanishes silently.

Transcoding/re-encoding fetched images (decode-bomb defense, EXIF/payload stripping, format normalization) is **out of MVP** — tracked as **#737** (config-gated, default off).

> Config note: `ngdpbase.attachment.*` is the enforced policy NCM builds on. `ngdpbase.features.images.*` is **out of NCM scope** and largely a config ghost (only `default-alt`/`default-class` are read, by `ImagePlugin`) — pre-existing config-hygiene debt, neither used nor fixed by NCM.

### 2.3 Explicitly OUT of NCM

- **Raw/embedded HTML** in page body — converted or stripped at conversion time (§5); the stored page never depends on `ngdpbase.translator-reader.allow-html`.
- **Remote-hosted images / `data:` URIs** left as-is — always converted to attachments (§2.2) or dropped.
- `<script>`, `<style>`, `<iframe>`, event-handler attributes — never.
- Anything that triggers a render-time outbound fetch.

### 2.4 Links (internal vs external)

NCM uses the existing `LinkParserHandler` JSPWiki forms — **not** CommonMark `[text](url)`:

| Kind | NCM form | Render behaviour |
|---|---|---|
| Internal (wiki) | `[Display\|PageName]` (or `[PageName]`) | resolves to `/view/<page>`; red-link if absent |
| External | `[Display\|https://example.com\|target="_blank"]` | new tab; renderer adds `rel="noopener noreferrer"` |
| InterWiki | `[Display\|Wikipedia:Article]` | expands via `ngdpbase.interwiki.*` |

Normalizer rules: absolute `http(s)://` target → external form (`target="_blank"`); a target resolving to a wiki page → `[Display|PageName]` (never hardcode `/view/…`); `[{$pagename}]` etc. are variables, not links; bare URLs auto-link but the explicit external form is preferred so `target`/`rel` apply.

## 3. The normalizer contract

NCM extends the **existing** `IContentConverter` registry — no parallel system. Public API (`src/converters/ncm/`, barrel `index.ts`):

| Export | Role |
|---|---|
| `normalizeToNcm` | Normalize content in a registered source format (HTML, JSPWiki, raw Markdown, JSON-via-#501) to NCM. |
| `normalizeExistingPageToNcm` | Convert an already-stored page to NCM (the "convert existing page" / MCP path). |
| `normalizeLinks` | §2.4 link normalization (matches only `[…](…)`, never `\|\|`/`%%`). |
| `localizeNcmImages` | §2.2 image→attachment localization. |
| `ncmToConversionResult` | Bridge NCM warnings → the `ConversionResult` contract (lossless). |
| `formatDroppedPlaceholder` / `isDroppedPlaceholderLine` | Build / recognise the §3.3 placeholder. |

- **Structured warnings.** `ConversionResult.warnings` is `Array<{ kind: string; detail: string }>`. `kind` is a stable code (e.g. `html-dropped:<tag>`, `img-attached`, `img-rejected:type|size|adhost|sniff-mismatch`, `link-externalized`, `placeholder-inserted`) — the prerequisite for conversion metrics (**#738**) and for §3.1 determinism (enum > prose).
- **`ncmVersion` stamp.** The normalizer writes integer `ncmVersion` to frontmatter (**current value: `NCM_VERSION = 1`**). Idempotent within a version. A profile change bumps the version; existing pages are re-normalized **only** via an explicit, opt-in migration — **never** silently on read/edit. Protects versioned-page git history and gives provenance for free.
- **Interactive single-item ops (single-page import, convert-existing-page) preview-and-confirm before write** — the user sees exactly what will change/drop, then confirms. Never a silent in-place rewrite of authored content.
- **Bulk import, #685 ingestion, MCP** cannot gate on a human → they rely on structured `warnings[]` + the in-body placeholder (§3.3) **plus** a `NotificationManager.addNotification(...)` summary surfaced in `/admin/notifications` as the durable signal.
- **Hookup points:** `ImportManager` (all html/jspwiki imports normalize to NCM), the `/admin/convert` admin tool, and `mcp-server.ts` (MCP `create_page`/`update_page` normalize to NCM, returning `ncmVersion` + `ncmWarnings`).

### 3.1 Determinism (hard requirement — for #685)

`normalizeToNcm` is **deterministic**: identical input ⇒ byte-identical output, with stable ordering (frontmatter keys, footnote numbering, attachment naming). NCM-in ⇒ NCM-out is a fixed point (idempotent). #685's change-detection hashes the normalized record, so unstable serialization would churn versioned-page git history.

### 3.2 Taxonomy frontmatter preservation

The normalizer carries these three fields through every path without corrupting human intent:

| Field | Origin | Rule |
|---|---|---|
| `user-keywords` | Human-authored | **Never overwrite or drop.** Preserve verbatim. #501/#685 must not write this field. |
| `system-keywords` | Machine / ES auto-tags | Ingestion (#685/#501) may populate/replace. Convert-existing-page preserves it. |
| `system-category` | Single admin-controlled value | Preserve. Ingestion must not fabricate a category; an implied one goes to `system-keywords`. |

Absent fields stay absent (never empty-string or guessed). Convert-existing-page reproduces all three byte-identically (part of §3.1).

### 3.3 Dropped-content placeholder

When the normalizer drops content (stripped HTML, rejected/over-cap/ad image, anything lossy) it replaces it with a deterministic, explanatory in-body marker so a later reader sees *that* and *why* something was removed — the durable signal where there is no preview (bulk import, #685, MCP).

- **Form:** a fixed NCM-valid blockquote — `> ⚠️ NCM-DROPPED [<tag>]: <reason>` (regex `^> ⚠️ NCM-DROPPED \[[^\]\r\n]*\]: .+$`, trailing-space tolerant). Built by `formatDroppedPlaceholder`, recognised by `isDroppedPlaceholderLine`. **Not** an HTML comment (stripped by the no-HTML rule), **not** a plugin (no new render path).
- Always paired with a structured `warnings[]` entry of matching `kind`.
- **Idempotence (hard rule):** the normalizer recognises its own placeholder and passes it through byte-identical on re-run — re-converting/re-ingesting a page that already contains one must not re-wrap, duplicate, or mutate it.

## 4. Consumers

- **#501 — JSON → NCM serializer.** A `json + template → NCM` serializer registered as an `IContentConverter`. The standalone surface (InterWiki/plugin rendering a JSON URL) is a thin consumer of it.
- **#685 — data-ingestion framework.** Consumes the #501 serializer for record→page-body materialization; #685 owns fetch/schedule/state/change-detection, NCM owns the body format.

Sequencing: NCM normalizer (done) → #501 (re-scoped serializer) → #685.

## 5. Key resolved decisions

1. **Remote-image fetch:** ad/tracker deny-list (`ngdpbase.markdown.ncm.image.ad-deny-list`, seeded); global `ngdpbase.fetch-timeout-ms` (default 30000, not an NCM-scoped key); size/MIME reuse `ngdpbase.attachment.*` with a stricter raster allowlist on top (§2.2).
2. **HTML-in-body:** convert-known → strip-rest + warn — `turndown` converts structural HTML with a clean MD equivalent; `script/style/iframe`/unknown dropped with a structured warning + placeholder. `<img>` is intercepted by the §2.2 rule, not turndown.
3. **Lossy-conversion reporting:** the structured `ConversionResult.warnings` channel (rendered by `admin-import.ejs`); preview+confirm on interactive single-item ops; non-preview paths (bulk import / #685 / MCP) additionally push a per-event summary to `/admin/notifications`. Distinct from **#738** (aggregate metrics/trend = "fix-if-many").
4. **Profile versioning:** `ncmVersion` frontmatter stamp + explicit-migration only, never silent rewrite-on-read.

**No auto-migration guarantee:** `PageManager` save/load is untouched by NCM. There is no batch/loop/startup/cron/on-read normalization path — every NCM invocation is an explicit single item (import, admin-convert Apply, MCP create/update). (Known accepted caveat: MCP `update_page` with metadata-only still NCM-normalizes that one page's body — explicit-per-page, not bulk.)

## 6. Open follow-ups (separate issues, not part of #728)

- **#737** — Phase-2 image transcoding/re-encoding hardening (decode-bomb defense, EXIF stripping, format normalization). Config-gated, default off; do when a real driver appears.
- **#738** — conversion-metrics aggregation by structured `kind` (trend, "fix-if-many"). Unblocked by the structured-warnings work; an observability follow-up, distinct from the per-event `/admin/notifications` alerts.
