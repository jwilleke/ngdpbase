# NCM developer guide

Status: Phase 1 + Phase 2 shipped (v3.18.0; [#728](https://github.com/jwilleke/ngdpbase/issues/728) closed).

## Standing rules

- NCM is the only on-disk page-content format. Import, MCP, paste, convert, and ingest emit NCM. Nothing writes HTML or a bespoke format into pages.
- The editor `/save` path is outside the NCM funnel. A save runs only the fix steps that are safe on save (§3.5): they rewrite text that is not Markdown, the author is told, and the previous version keeps the original.
- A new ingestion path must go through the normalizer and be added to `converters/ncm/__tests__/funnelCoverage.test.ts`.
- Footnote transfer has one implementation: `FootnoteManager.transferFromContent`. Convert, ingest, and import delegate to it.
Code: `src/converters/ncm/` · `src/utils/ncmNotify.ts` · wired into `ImportManager`, the `/admin/convert` tool, and `mcp-server.ts`.
Related: [#501](https://github.com/jwilleke/ngdpbase/issues/501) (JSON→NCM serializer — consumer) · [#685](https://github.com/jwilleke/ngdpbase/issues/685) (data-ingestion framework — consumer) · [#599](https://github.com/jwilleke/ngdpbase/issues/599) (showdown ReDoS — why no raw-HTML sink) · [#737](https://github.com/jwilleke/ngdpbase/issues/737) (Phase-2 image transcoding — open follow-up) · [#738](https://github.com/jwilleke/ngdpbase/issues/738) (conversion metrics — open follow-up).

---

## 1. Purpose & contract

__NCM is the single canonical on-disk page-content format.__ Any path that produces page content — import, MCP, paste, JSON conversion (#501), scheduled feed ingestion (#685), "convert an existing page" — emits NCM. Nothing writes HTML or a bespoke format into pages.

```
import / paste / MCP   ─┐
JSON source   (#501)   ─┼─► normalize ─► ngdp Compatible Markdown ─► the ONE sanitized render pipeline ─► HTML
external feed (#685)   ─┘
```

Why one format:

- __Security/consistency__ — one renderer, one sanitizer; no parallel raw-HTML injection sink (directly relevant to the unpatched showdown ReDoS #599 and the XSS/CSRF posture).
- __Round-trippable__ — every page can be re-emitted as NCM: "convert existing page", deterministic re-serialization, clean versioned-page diffs.
- __One consumer contract__ — plugin/import/ingestion authors target one format, not N.

NCM is a *profile* + a *normalization pass* layered on the existing machinery (`src/converters/` `IContentConverter` registry, `turndown`/`showdown`, the `MarkupParser` 7-phase render pipeline, `gray-matter` frontmatter, `AttachmentManager`). The render pipeline is __unchanged__ by NCM — NCM is the write-side normalizer.

## 2. What NCM is

NCM = __CommonMark/GFM core__ (as rendered by the existing showdown config) __plus__ the ngdp wiki extensions supported by `MarkupParser`, constrained to a sanitizable, deterministic subset.

The author-facing summary of what renders, and the house style NCM output follows, is the shipped help page __Markdown as we use it__ ([`required-pages/960066eb-27b4-4fac-a016-a4e1d64b645c.md`](../../required-pages/960066eb-27b4-4fac-a016-a4e1d64b645c.md)). The reasons behind each rule are in the [#1271 decision log](https://github.com/jwilleke/ngdpbase/issues/1271#issuecomment-5617541677).

### 2.1 Constructs

| Construct | NCM form | Backed by |
|---|---|---|
| Headings, emphasis, lists, code | CommonMark, written in the house style: `#` headings, `__bold__` / `*italic*`, hyphen bullets, 2-space nesting (3 under a numbered item), numbered steps as `- 1 words`, ```` ```lang ```` fences. Output does not follow it everywhere yet ([#1332](https://github.com/jwilleke/ngdpbase/issues/1332)) | showdown |
| Line breaks | A single newline is a break; `\\` forces one mid-line, `\\\` also clears floats. Raw `<br>` is refused on save | `MarkupParser` (Step 0.6), `SecurityFilter` `no-raw-br` |
| Strikethrough, sub/superscript | `~~text~~`; `H~2~O`, `X^2^` (no spaces inside), `%%sub … /%` / `%%sup … /%` for longer spans | showdown options / extension, `MarkupParser` inline styles |
| Emoji | `:shortcode:` | `MarkupParser` (Step 0.7) |
| Style blocks | `%%class … /%` blocks, `%%(css) … /%` inline | `MarkupParser`, `JSPWikiPreprocessor` |
| Section links | `[Text\|Page#section=Heading Text]`; heading IDs come from the plain heading text (`SectionUtils.headingSlug`) | `LinkParser`, `DOMLinkHandler` |
| __Tables__ | __Up-convert (NCM v2).__ GFM pipe tables are rewritten on normalization to the rich JSPWiki canonical form — `\|\|Header\|\|`/`\|cell\|` rows wrapped in the configured style blocks (default `%%table-fit`/`-bordered`/`-striped`/`-hover`/`sortable`), giving imported tables fit/border/zebra/hover + client-side sorting. Style classes are operator-configurable via `ngdpbase.markdown.ncm.table.default-classes` (set `[]` for no wrapper). Up-convert only — there is no down-convert. Idempotent: the styled form has no GFM separator row, so re-normalizing converts nothing. Existing JSPWiki tables in a body are never matched/re-wrapped. *(v1 left both forms as passthrough; the v1→v2 profile bump is applied to new normalizations only — existing pages migrate explicitly, never silently on read.)* | `converters/ncm/tables.ts`, `JSPWikiPreprocessor`, `public/js/tableSort.js` |
| __Links__ | JSPWiki form (see §2.4): internal `[Display\|PageName]`, external `[Display\|https://url\|target="_blank"]`, InterWiki `[Display\|Site:Ref]` — __not__ CommonMark `[text](url)` | `LinkParserHandler` |
| __Footnotes__ | `[^id]` reference + `[^id]: text` definition (single- and multi-paragraph). __Conversion transfers definitions to the sidecar footnote list__ ([#1125](https://github.com/jwilleke/ngdpbase/issues/1125)): the convert-existing path moves `[^id]: text` into `FootnoteManager` records (id preserved verbatim — refs must keep resolving), leaves the refs in the body, and appends `[{FootnotesPlugin}]` when absent. A colliding sidecar id keeps the body definition and warns. The extraction (`converters/ncm/footnotes.ts`) is pure; the sidecar write lives with the caller, mirroring the §2.2 image split. | `FootnoteManager`, `FootnotesPlugin`, `showdown-footnotes-fixed` |
| __Embedded images__ | `![alt](attachment-ref)` — image downloaded and stored as an attachment; the source URL / `data:` URI is replaced with the local attachment ref | `AttachmentManager`, `ImportManager.importPageAttachments()` |
| Plugins / variables | `[{PluginName param='…'}]`, `[{$variable}]` | `PluginManager`, `VariableManager` |
| Frontmatter | YAML via `gray-matter`, incl. the taxonomy fields (§3.2) | existing page contract |

> Category badges and keyword "chips" are __not__ NCM body constructs. They are *rendered product* produced by the view/plugin layer (`header.ejs`, `view.ejs`, `SearchPlugin`) from the three taxonomy __frontmatter__ fields. NCM has no badge/chip syntax; its only obligation is to preserve those fields faithfully (§3.2).

### 2.2 Image → attachment rule

On conversion, for every embedded image whose source is a remote URL or a `data:` URI:

1. __Fetch__ with the global outbound timeout `ngdpbase.fetch-timeout-ms` (default `30000`; governs *our own* outbound HTTP, not third-party clients like ES/OTLP).
2. __Magic-byte sniff__ the fetched bytes — classify by content, not the URL extension or `Content-Type` (polyglot/spoof defense).
3. __Strict raster allowlist__ (tighter than the attachment store's `image/*`): accept only `image/jpeg, image/png, image/gif, image/webp`. `image/svg+xml` is __excluded__ (XSS vector); RAW/HEIC excluded (not browser-renderable). NCM tightens, never loosens, the attachment policy.
4. __Size cap__ reuses `ngdpbase.attachment.maxsize` (default 10 MB) — no parallel image-limit namespace.
5. __Ad/tracker deny-list__ — a fetch whose host matches `ngdpbase.markdown.ncm.image.ad-deny-list` (host/glob array, seeded with a sane default) is dropped, not attached.
6. __Accepted__ → stored via `AttachmentManager`; the Markdown is rewritten to the local attachment ref.
7. __Any drop__ (over cap, type not allowed, sniff/Content-Type mismatch, ad host) → a structured `warnings[]` entry (§3) __and__ an in-body placeholder (§3.3). Nothing vanishes silently.

Transcoding/re-encoding fetched images (decode-bomb defense, EXIF/payload stripping, format normalization) is __out of MVP__ — tracked as __#737__ (config-gated, default off).

> Config note: `ngdpbase.attachment.*` is the enforced policy NCM builds on. `ngdpbase.features.images.*` is __out of NCM scope__ and largely a config ghost (only `default-alt`/`default-class` are read, by `ImagePlugin`) — pre-existing config-hygiene debt, neither used nor fixed by NCM.

### 2.3 Explicitly OUT of NCM

- __Raw/embedded HTML__ in page body — converted or stripped at conversion time (§5); the stored page never depends on `ngdpbase.translator-reader.allow-html`.
- __Remote-hosted images / `data:` URIs__ left as-is — always converted to attachments (§2.2) or dropped.
- `<script>`, `<style>`, `<iframe>`, event-handler attributes — never.
- Anything that triggers a render-time outbound fetch.

### 2.4 Links (internal vs external)

NCM uses the existing `LinkParserHandler` JSPWiki forms — __not__ CommonMark `[text](url)`:

| Kind | NCM form | Render behaviour |
|---|---|---|
| Internal (wiki) | `[Display\|PageName]` (or `[PageName]`) | resolves to `/view/<page>`; red-link if absent |
| External | `[Display\|https://example.com\|target="_blank"]` | new tab; renderer adds `rel="noopener noreferrer"` |
| InterWiki | `[Display\|Wikipedia:Article]` | expands via `ngdpbase.interwiki.*` |

Normalizer rules: absolute `http(s)://` target → external form (`target="_blank"`); a target resolving to a wiki page → `[Display|PageName]` (never hardcode `/view/…`); `[{$pagename}]` etc. are variables, not links; bare URLs auto-link but the explicit external form is preferred so `target`/`rel` apply.

## 3. The normalizer contract

NCM extends the __existing__ `IContentConverter` registry — no parallel system. Binary sources ([#1131](https://github.com/jwilleke/ngdpbase/issues/1131)) join through the optional `convertBuffer(Buffer)` contract: the converter produces intermediate HTML (a full document, not a fragment) and `ImportManager` routes it through the same html→NCM path as any HTML import — `DocxConverter` (mammoth) is the first. Known docx limitation: Word footnotes arrive as mammoth's anchor/list HTML, not `[^id]` markdown, so they survive as ordinary links rather than sidecar records. Public API (`src/converters/ncm/`, barrel `index.ts`):

| Export | Role |
|---|---|
| `normalizeToNcm` | Normalize content in a registered source format (HTML, JSPWiki, raw Markdown, JSON-via-#501) to NCM. |
| `normalizeExistingPageToNcm` | Convert an already-stored page to NCM (the "convert existing page" / MCP path). |
| `normalizeLinks` | §2.4 link normalization (matches only `[…](…)`, never `\|\|`/`%%`). |
| `localizeNcmImages` | §2.2 image→attachment localization. |
| `ncmToConversionResult` | Bridge NCM warnings → the `ConversionResult` contract (lossless). |
| `formatDroppedPlaceholder` / `isDroppedPlaceholderLine` | Build / recognise the §3.3 placeholder. |
| `fix/` (`runFixes`, `FIX_STEPS`) | The Markdown fix steps (§3.5), called through `PageManager.normalizePageContent`. |

- __Structured warnings.__ `ConversionResult.warnings` is `Array<{ kind: string; detail: string }>`. `kind` is a stable code (e.g. `html-dropped:<tag>`, `img-attached`, `img-rejected:type|size|adhost|sniff-mismatch`, `link-externalized`, `placeholder-inserted`) — the prerequisite for conversion metrics (__#738__) and for §3.1 determinism (enum > prose).
- __`ncmVersion` stamp.__ The normalizer writes integer `ncmVersion` to frontmatter (__current value: `NCM_VERSION = 2`__ — v2 added the §2.1 GFM-table up-convert). Idempotent within a version. A profile change bumps the version; existing pages are re-normalized __only__ via an explicit, opt-in migration — __never__ silently on read/edit. Protects versioned-page git history and gives provenance for free.
- __Interactive single-item ops (single-page import, convert-existing-page) preview-and-confirm before write__ — the user sees exactly what will change/drop, then confirms. Never a silent in-place rewrite of authored content.
- __Bulk import, #685 ingestion, MCP__ cannot gate on a human → they rely on structured `warnings[]` + the in-body placeholder (§3.3) __plus__ a `NotificationManager.addNotification(...)` summary surfaced in `/admin/notifications` as the durable signal.
- __Hookup points:__ `ImportManager` (all html/jspwiki/markdown/docx file imports and Import from URL normalize to NCM, and pages into the live store save through PageManager — [#1337](https://github.com/jwilleke/ngdpbase/issues/1337) moved the URL import off its raw file write), the `/admin/convert` admin tool + the per-page editor entry ([#1127](https://github.com/jwilleke/ngdpbase/issues/1127)), `POST /api/page/ingest` (agent ingest), and `mcp-server.ts` (MCP `create_page`/`update_page` normalize to NCM, returning `ncmVersion` + `ncmWarnings`). __The funnel is enforced by test__ ([#1126](https://github.com/jwilleke/ngdpbase/issues/1126), `converters/ncm/__tests__/funnelCoverage.test.ts`): each entry point must reach NCM through `PageManager.convertPageToNcm` and no route or MCP tool may call the normalizer or the fix module itself, the footnote transfer must keep its one implementation (`FootnoteManager.transferFromContent`) with convert/ingest/import as delegating adopters, and adding a new ingestion path means adding it to the enumeration — the review moment the funnel needs. The editor `/save` path is deliberately outside the funnel. It runs only the save-safe fix steps (§3.5), and tells the author.

### 3.1 Determinism (hard requirement — for #685)

`normalizeToNcm` is __deterministic__: identical input ⇒ byte-identical output, with stable ordering (frontmatter keys, footnote numbering, attachment naming). NCM-in ⇒ NCM-out is a fixed point (idempotent). #685's change-detection hashes the normalized record, so unstable serialization would churn versioned-page git history.

### 3.2 Taxonomy frontmatter preservation

The normalizer carries these three fields through every path without corrupting human intent:

| Field | Origin | Rule |
|---|---|---|
| `user-keywords` | Human-authored | __Never overwrite or drop.__ Preserve verbatim. #501/#685 must not write this field. |
| `system-keywords` | Machine / ES auto-tags | Ingestion (#685/#501) may populate/replace. Convert-existing-page preserves it. |
| `system-category` | Single admin-controlled value | Preserve. Ingestion must not fabricate a category; an implied one goes to `system-keywords`. |

Absent fields stay absent (never empty-string or guessed). Convert-existing-page reproduces all three byte-identically (part of §3.1).

### 3.3 Dropped-content placeholder

When the normalizer drops content (stripped HTML, rejected/over-cap/ad image, anything lossy) it replaces it with a deterministic, explanatory in-body marker so a later reader sees *that* and *why* something was removed — the durable signal where there is no preview (bulk import, #685, MCP).

- __Form:__ a fixed NCM-valid blockquote — `> ⚠️ NCM-DROPPED [<tag>]: <reason>` (regex `^> ⚠️ NCM-DROPPED \[[^\]\r\n]*\]: .+$`, trailing-space tolerant). Built by `formatDroppedPlaceholder`, recognised by `isDroppedPlaceholderLine`. __Not__ an HTML comment (stripped by the no-HTML rule), __not__ a plugin (no new render path).
- Always paired with a structured `warnings[]` entry of matching `kind`.
- __Idempotence (hard rule):__ the normalizer recognises its own placeholder and passes it through byte-identical on re-run — re-converting/re-ingesting a page that already contains one must not re-wrap, duplicate, or mutate it.

## 3.4 Render profiles — trust decides composition (#1123)

The render pipeline was designed for __trusted page authors__: raw HTML survives by configuration, `[{Plugin}]` and `[{$variable}]` execute, and the SecurityFilter allow-list admits `<iframe>`/`<img>` because an author-written one is refused at save. Content from authors who are __not__ trusted — comments today; any user-of-user surface tomorrow — must not be piped through that composition, and must never get a parallel renderer either (the #599/#1032 lesson). So one engine, two profiles:

| Profile | Used for | Composition |
|---|---|---|
| `trusted-page` | Page bodies | Full pipeline: MarkupParser (plugins, variables, wiki links), showdown, filter chain per site config |
| `untrusted-inline` | Comments (`renderUntrustedInline`, `src/utils/renderUntrustedInline.ts`) | Same showdown core (CommonMark only — plugin/variable/wiki-link syntax inert __by construction__, MarkupParser never runs); same SecurityFilter with its config __forced on__ (not site-configurable — an operator toggling render filtering must not change what commenters can inject) and a tightened tag list (no `iframe`, no `img`); the #1000 ReDoS guard on input; escape-everything fallback on any failure — degraded is safe, never open |

A future surface with untrusted authors adopts `untrusted-inline` rather than re-deciding; wiki-link support inside it (with viewer-context resolution, per the #1116 rule) is a possible extension, deliberately not in the first cut — a red-link in a comment is a page-creation lure and an existence probe.

### 3.5 Markdown fix steps (#1332)

Every rewrite of page text toward the house style lives in `src/converters/ncm/fix/`, one small step per file. Each step is pure and idempotent, reads the page through a block map built from markdown-it's parser (`buildBlockMap`: code and HTML lines, lists and their items, from the source line range on every block token), and edits only the lines it must. Code lines are the union of markdown-it's code and MarkupParser Step 0's fenced blocks, so a step never edits what either treats as code.

- __Safe on save__ steps rewrite text that is not Markdown at all (JSPWiki `{{{ }}}` code markers, JSPWiki `**` bullets). __Convert only__ steps change valid Markdown to the house style (`-` markers, tight lists).
- `jspwiki-code-markers` runs first, so later steps see the examples inside a `{{{ }}}` block as code. A ```` ``` ```` block opened right under a `%%` style line and ended by `}}}` plus `/%` (an old import's half-converted `%%prettify` block) is closed at the `}}}`; any other `}}}` inside ```` ``` ```` code is left alone. Inside a new inline code span, `[[{` becomes `[{`, which is what the reader saw between the braces. It leaves alone a `{{{` that opens mid-line and closes on a later line; a page with an unclosed `{{{` block is not changed at all.
- `PageManager.normalizePageContent(body, { mode: 'save' | 'convert' })` runs them and returns the new body and what each step changed. App code reaches it two ways:
  - `savePageWithContext` runs `save` mode on every save, before validation, and returns `{ content, fixes }`. The editor route sends the author to `/view/<page>?fixed=<step ids>`, and the view shows each step's summary (the words come from the registry, never the URL).
  - `convertPageToNcm(raw)` runs `convert` mode and then `normalizeExistingPageToNcm`, for Convert to NCM (preview and apply), `POST /api/page/ingest` and the MCP `create_page` / `update_page` tools. Each step that changed something is also a `converter-note` warning.
- Routes and the MCP server never call the fix module or the NCM normalizers themselves (`funnelCoverage.test.ts` enforces it). `ImportManager` runs `convert` mode on every file import in an NCM format (HTML, JSPWiki, Markdown, docx) and on URL imports, through `normalizePageContent`, with each step as a `converter-note` warning in the import preview and run notification.
- `scripts/fix-page-markdown.ts` runs the same steps across a page store (dry run by default, `--apply` writes one `system` version per page and keeps `lastModified`).
- A new step: add a file with a `FixStep`, register it in `FIX_STEPS` (order matters), test it in `fix/__tests__/steps.test.ts` including idempotence, and dry-run it over a real page store before shipping.

The house style itself is recorded in the decision log on [#1271](https://github.com/jwilleke/ngdpbase/issues/1271) and, for authors, on the "Markdown as we use it" page.

## 4. Consumers

- __#501 — JSON → NCM serializer.__ A `json + template → NCM` serializer registered as an `IContentConverter`. The standalone surface (InterWiki/plugin rendering a JSON URL) is a thin consumer of it.
- __#685 — data-ingestion framework.__ Consumes the #501 serializer for record→page-body materialization; #685 owns fetch/schedule/state/change-detection, NCM owns the body format.

Sequencing: NCM normalizer (done) → #501 (re-scoped serializer) → #685.

## 5. Key resolved decisions

1. __Remote-image fetch:__ ad/tracker deny-list (`ngdpbase.markdown.ncm.image.ad-deny-list`, seeded); global `ngdpbase.fetch-timeout-ms` (default 30000, not an NCM-scoped key); size/MIME reuse `ngdpbase.attachment.*` with a stricter raster allowlist on top (§2.2).
2. __HTML-in-body:__ convert-known → strip-rest + warn — `turndown` converts structural HTML with a clean MD equivalent; `script/style/iframe`/unknown dropped with a structured warning + placeholder. `<img>` is intercepted by the §2.2 rule, not turndown.
3. __Lossy-conversion reporting:__ the structured `ConversionResult.warnings` channel (rendered by `admin-import.ejs`); preview+confirm on interactive single-item ops; non-preview paths (bulk import / #685 / MCP) additionally push a per-event summary to `/admin/notifications`. Distinct from __#738__ (aggregate metrics/trend = "fix-if-many").
4. __Profile versioning:__ `ncmVersion` frontmatter stamp + explicit-migration only, never silent rewrite-on-read.

__No auto-migration guarantee:__ `PageManager` save/load is untouched by the NCM conversion; a save applies only the save-safe fix steps (§3.5). There is no batch/loop/startup/cron/on-read normalization path — every NCM invocation is an explicit single item (import, admin-convert Apply, MCP create/update). (Known accepted caveat: MCP `update_page` with metadata-only still NCM-normalizes that one page's body — explicit-per-page, not bulk.)

## Known gaps

- [#501](https://github.com/jwilleke/ngdpbase/issues/501)
- [#737](https://github.com/jwilleke/ngdpbase/issues/737)
- [#738](https://github.com/jwilleke/ngdpbase/issues/738)
