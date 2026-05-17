# Plan: ngdp Compatible Markdown

Issue: [#728](https://github.com/jwilleke/ngdpbase/issues/728)
Status: Draft spec — open questions resolved 2026-05-17; not yet implemented
Date: 2026-05-17
Related: [#501](https://github.com/jwilleke/ngdpbase/issues/501) (JSON→ngdp-MD serializer — consumer), [#685](https://github.com/jwilleke/ngdpbase/issues/685) (data-ingestion framework — consumer), [#599](https://github.com/jwilleke/ngdpbase/issues/599) (showdown ReDoS — why no raw-HTML sink), [#737](https://github.com/jwilleke/ngdpbase/issues/737) (Phase-2 image transcoding — split out), [#738](https://github.com/jwilleke/ngdpbase/issues/738) (conversion metrics — depends on the structured `kind` codes here)

---

## 1. Purpose & the contract decision

**ngdp Compatible Markdown (NCM)** is the single canonical on-disk page-content format. Operator decision (2026-05-17): *any* path that produces page content — import, MCP, paste, JSON conversion (#501), scheduled feed ingestion (#685), "convert an existing page" — must emit NCM. Nothing emits HTML or a bespoke format into pages.

```
import / paste / MCP   ─┐
JSON source   (#501)   ─┼─► normalize ─► ngdp Compatible Markdown ─► the ONE sanitized render pipeline ─► HTML
external feed (#685)   ─┘
```

Why a single format:

- **Security/consistency** — one renderer, one sanitizer. No parallel raw-HTML injection sink (directly relevant to the unpatched showdown ReDoS #599 and the XSS/CSRF posture).
- **Round-trippable** — every page can be re-emitted as NCM, enabling "convert existing page", deterministic re-serialization, and clean versioned-page diffs.
- **One consumer contract** — plugin/import/ingestion authors target one format, not N.

This is **not greenfield**. The platform already has the machinery; NCM is a *profile* + a *normalization pass* layered on it:

- `src/converters/` — `IContentConverter` registry (`JSPWikiConverter`, `HtmlConverter`, `MarkdownConverter`) consumed by `ImportManager`.
- `turndown` (HTML→MD) and `showdown` (MD→HTML) already deps.
- `MarkupParser` 7-phase pipeline (escaped-syntax → variables → plugins → … → footnotes) — the render side, **unchanged** by this spec.
- `gray-matter` frontmatter, `FootnoteManager` + `showdown-footnotes-fixed`, `AttachmentManager` + `ImportManager.importPageAttachments()`.

## 2. What NCM *is*

NCM = **CommonMark/GFM core** (as rendered by the existing showdown config) **plus** the ngdp wiki extensions already supported by `MarkupParser`, constrained to a sanitizable, deterministic subset.

### 2.1 Required constructs (from #728)

| Construct | NCM form | Backed by |
|---|---|---|
| **Headings, emphasis, lists, code** | CommonMark | showdown |
| **Tables** | **Passthrough — NCM does NO table conversion** (resolved 2026-05-17). JSPWiki `%%table-fit/%%table-bordered/%%table-striped/%%table-hover/%%sortable/%%table-sort/%%table-filter/…` wrapping `\|\|Header\|\|`/`\|cell\|` is the rich canonical form (sortable/striped/etc.); GFM pipe tables also render but plain. Both pass through **unchanged** — no down-convert (JSPWiki→GFM) and no up-convert (GFM/HTML→JSPWiki). | `JSPWikiPreprocessor` (`%%table-*` + `\|\|`/`\|`), showdown `tables:true` (GFM); `WikiTableHandler` |
| **Links** | JSPWiki form (see §2.4): internal `[Display\|PageName]`, external `[Display\|https://url\|target="_blank"]`, InterWiki `[Display\|Site:Ref]` — **not** CommonMark `[text](url)` | `LinkParserHandler` |
| **Footnotes** | `[^id]` reference + `[^id]: text` definition (single-line and multi-paragraph) | `FootnoteManager`, `showdown-footnotes-fixed`, `MarkupParser` steps 3.5/3.6 |
| **Embedded images** | `![alt](attachment-ref)` — image downloaded and stored as an **attachment** (subject to existing `ngdpbase.attachment.maxsize` / `ngdpbase.attachment.allowedtypes`); source URL/`data:` URI replaced with the local attachment ref | `AttachmentManager`, `ImportManager.importPageAttachments()` |
| **Plugins / variables** | `[{PluginName param='…'}]`, `[{$variable}]` | `PluginManager`, `VariableManager` |
| **Frontmatter** | YAML via `gray-matter`, incl. the taxonomy fields (`system-category`, `user-keywords`, `system-keywords`) — see §3.2 | existing page contract |

**Tables (resolved 2026-05-17, decision b):** NCM never transforms tables in either direction. The S1/S2/S5a body is passthrough and `normalizeLinks` only matches `[…](…)` (never `||`/`%%`), so this is **already honored with no code change** — recorded so a future implementer does not add GFM↔JSPWiki table conversion. Authors who want sortable/striped/etc. write the JSPWiki `%%table-* … || … /%` form by hand; legacy GFM tables keep rendering plain.

> Note: the #728 issue's "Badges" line is **not** an NCM body construct. Page-top category badges and search/page keyword "chips" are *rendered product* — produced by the view/plugin layer (`header.ejs`, `view.ejs`, `SearchPlugin`) from the three taxonomy **frontmatter** fields, not authored in Markdown. NCM has no badge/chip syntax; its only obligation is to preserve those fields faithfully (§3.2). Inventing a `[{Badge}]` body token would create a second, conflicting taxonomy path.

### 2.2 Image → attachment rule (MVP — resolved 2026-05-17)

On conversion, for every embedded image whose source is a remote URL or a `data:` URI:

1. **Fetch** with the global outbound-fetch timeout `ngdpbase.fetch-timeout-ms` (default `30000` — promoted from `ImportManager`'s previously hardcoded 30 s `AbortSignal`; governs *our own* outbound HTTP, not third-party clients like ES/OTLP that own their timeouts).
2. **Magic-byte sniff** the fetched bytes — classify by content, **not** the URL extension or `Content-Type` header (polyglot/spoof defense).
3. **Strict raster allowlist** (tighter than the attachment store's `image/*`): accept only `image/jpeg, image/png, image/gif, image/webp`. **`image/svg+xml` is excluded** (XSS vector). RAW/HEIC excluded (not browser-renderable; the embedded-JPEG-vs-real-JPEG distinction is a MediaManager/DAM concern — NCM never introspects RAW). NCM **tightens, never loosens**, on top of the attachment policy.
4. **Size cap** reuses the existing `ngdpbase.attachment.maxsize` (default 10 MB) — no parallel image-limit namespace.
5. **Ad/tracker deny-list**: a fetch whose host matches the deny-list is dropped, not attached. New config key `ngdpbase.markdown.ncm.image.ad-deny-list` (host/glob array), **seeded** with a sane default in `config/app-default-config.json` (`doubleclick.net`, `googlesyndication.com`, `google-analytics.com`, `facebook.com/tr`, `scorecardresearch.com`).
6. **Accepted** → store via `AttachmentManager` (reuse `ImportManager.importPageAttachments()` semantics) and rewrite the Markdown to the local attachment ref.
7. **Any drop** (over cap, type not in allowlist, sniff/Content-Type mismatch, ad/tracker host) → emit a structured `warnings[]` entry (§3) **and** leave an in-body placeholder (§3.3). Nothing vanishes silently.

Transcoding/re-encoding fetched images (decode-bomb defense, EXIF/payload stripping, format normalization) is **out of MVP** — split to **#737** (Phase-2 hardening, config-gated, default off).

Rationale: pages must not hot-link or embed remote/`data:` binaries — provenance, offline integrity, no remote-fetch-on-render; and the auto-fetch path from untrusted content must be stricter than the general attachment policy.

> Config-source-of-truth note: `ngdpbase.attachment.*` (10 MB, `image/*,text/*,application/pdf`) is the **enforced** attachment policy NCM builds on. The separate `ngdpbase.features.images.*` block (5 MB, jpeg/png/gif/webp, `./public/images`) is **out of scope** for NCM and largely a config ghost — only `default-alt`/`default-class` are read (by `ImagePlugin`); `max-size`/`allowed-types`/`upload-dir`/`enabled` are declared but referenced nowhere in `src`. Flagged here as pre-existing config-hygiene debt; #728 neither uses nor fixes it.

### 2.3 Explicitly OUT of NCM

- **Raw/embedded HTML** in page body — the platform already defaults to no-HTML via `ngdpbase.translator-reader.allow-html: false` (`config/app-default-config.json`). NCM normalization is the *write-side* counterpart: HTML is converted/stripped at conversion time (see §5 Q2) so the stored page never depends on `allow-html`.
- **Remote-hosted images / `data:` URIs** left as-is — always converted to attachments (§2.2) or dropped (ads).
- `<script>`, `<style>`, `<iframe>`, event-handler attributes — never.
- Anything that triggers a render-time outbound fetch.

### 2.4 Links (internal vs external)

NCM uses the existing `LinkParserHandler` JSPWiki forms — **not** CommonMark `[text](url)`:

| Kind | NCM form | Render behaviour |
|---|---|---|
| Internal (wiki) | `[Display\|PageName]` (or `[PageName]`) | resolves to `/view/<page>`; red-link if the page is absent |
| External | `[Display\|https://example.com\|target="_blank"]` | opens in a new tab; the renderer adds `rel="noopener noreferrer"` |
| InterWiki | `[Display\|Wikipedia:Article]` | expands via `ngdpbase.interwiki.*` site config |

Rules for the normalizer / ingestion:

- A link whose target is an absolute `http(s)://` URL is **external** → emit the `target="_blank"` attribute form (renderer adds `rel="noopener noreferrer"`; attribute allow-list is enforced by `LinkParserHandler`).
- A link whose target resolves to a wiki page name is **internal** → emit `[Display|PageName]`. Do not hardcode `/view/...` paths; let the resolver own routing.
- `[{$pagename}]` etc. are **variables**, not links — never emitted by ingestion as a link form.
- Bare URLs are auto-linked (`ngdpbase.translator-reader.plain-uris: true`) but the normalizer should still prefer the explicit external form so `target`/`rel` are applied.

## 3. The converter / normalizer contract

NCM extends the **existing** `IContentConverter` registry — no new parallel system.

- **`toNgdpMarkdown(input, sourceFormat) → ConversionResult`** — a normalizer that takes content in any registered source format (HTML, JSPWiki, raw Markdown, JSON-via-#501) and emits NCM.
- **Structured warnings (resolved 2026-05-17).** `ConversionResult.warnings` becomes `Array<{ kind: string; detail: string }>` rather than `string[]`. `kind` is a stable enum — e.g. `html-dropped:<tag>`, `img-attached`, `img-rejected:type|size|adhost|sniff-mismatch`, `link-externalized`, `placeholder-inserted`. Free text alone is not aggregatable; the stable code is the prerequisite for the conversion-metrics work (**#738**) and tightens §3.1 determinism (enum > prose). Same retrofit asymmetry as `ncmVersion` — cheap now, painful later.
- **`ncmVersion` stamp (resolved 2026-05-17).** The normalizer writes an integer `ncmVersion` to frontmatter. Idempotent *within* a version; a profile change bumps the version and existing pages are re-normalized **only** via an explicit, opt-in migration command — **never** silently on read/edit. Protects versioned-page git history (a profile change must not smear reformat-diffs across every unrelated edit) and gives provenance for free.
- **New/extended converters** register in `src/converters/` exactly as today (`formatId`, `formatName`, `fileExtensions`, `convert()`, `canHandle()`).
- **"Convert an existing page" action** — admin/page action: load page → run through `toNgdpMarkdown` → save. **Interactive single-item ops (single-page import, convert-existing-page) preview-and-confirm before write** (the user sees exactly what will change/drop, then confirms — never a silent in-place rewrite of authored content). **Bulk import, #685 scheduled ingestion, MCP** cannot gate on a human → they rely on structured `warnings[]` + the in-body placeholder (§3.3) **plus a `NotificationManager.addNotification(...)` summary surfaced in `/admin/notifications`** (§5 #3) as the durable signal.
- **Hookup points** (named in #728): `ImportManager` (all imports normalize to NCM) and `mcp-server.ts` (MCP page create/update normalizes to NCM).

### 3.1 Determinism (hard requirement — for #685)

`toNgdpMarkdown` **must be deterministic**: identical input ⇒ byte-identical output, with stable ordering (frontmatter keys, table column order, footnote numbering, attachment naming). #685's change-detection hashes the *normalized record*, not rendered Markdown — but the NCM serialization must be stable or unchanged upstream data still churns versioned-page git history. NCM-in ⇒ NCM-out must be a fixed point (idempotent).

### 3.2 Taxonomy frontmatter preservation (replaces the "Badges" misread)

Badges/chips are rendered by the view/plugin layer from three frontmatter fields; NCM does not author them. The normalizer's obligation is to carry these fields through every path **without corrupting human intent**:

| Field | Origin | Normalizer / ingestion rule |
|---|---|---|
| `user-keywords` | Human-authored | **Never overwrite or drop.** Preserve verbatim across convert/import. #501/#685 must not write this field. |
| `system-keywords` | Machine / ES auto-tags | Ingestion (#685/#501) **may populate/replace** this. Convert-existing-page preserves it. |
| `system-category` | Single, admin-controlled value | Preserve. Ingestion must not fabricate a category; if a source implies one it goes to `system-keywords`, not here. |

- If a source format has no concept of these fields, the normalizer leaves them **absent**, never empty-string or guessed.
- Round-trip rule: convert-existing-page must reproduce all three fields byte-identically (part of the §3.1 idempotence guarantee).
- The badge/chip *rendering* (`header.ejs` page-badge config, `view.ejs` keyword chips, `SearchPlugin`) is existing presentation and is **out of #728 scope** — this spec only guarantees the inputs it consumes.

### 3.3 Dropped-content placeholder (resolved 2026-05-17)

When the normalizer drops content (stripped HTML, rejected/over-cap/ad image, anything lossy) it replaces it with a deterministic, explanatory in-body marker — so a reader of the page later sees *that* and *why* something was removed, not a silent gap. This is the durable signal where there is no preview (bulk import, #685, MCP).

- Form: a **fixed-format NCM-valid blockquote**, e.g. `> ⚠️ NCM-DROPPED [iframe]: raw HTML not permitted`. **Not** an HTML comment (stripped by the no-HTML rule → invisible, defeats the purpose). **Not** a new plugin (avoids a new render path).
- Always paired with a structured `warnings[]` entry of matching `kind` (§3) — placeholder is in-body, the warning is the machine signal.
- **Idempotence (hard rule, ties to §3.1):** the normalizer must **recognise its own placeholder format and pass it through byte-identical** on re-run. Re-converting / re-ingesting a page that already contains a placeholder must not re-wrap, duplicate, or mutate it — otherwise convert-existing-page and #685 re-runs would churn version history. The placeholder is itself valid NCM at the current `ncmVersion`.

## 4. Consumers (locked relationships)

- **#501 — JSON → NCM serializer.** Re-scoped from "JSON→HTML". A `json + template → NCM` serializer registered as an `IContentConverter`. Standalone surface (InterWiki/plugin rendering a JSON URL) is a thin consumer of that serializer.
- **#685 — data-ingestion framework.** Consumes the **#501 serializer** for record→page-body materialization, **not** #501's render-time fetch path. #685 owns fetch/schedule/state/change-detection; NCM owns the body format. Two consumers of one serializer; they do not share fetch/scheduling.

Sequencing: **#728 spec (this doc) → #728 normalizer → #501 (re-scoped serializer) → #685.** #501 and #685 are blocked on the normalizer.

## 5. Resolved decisions (2026-05-17)

All open questions were worked through with the operator and resolved. (The original Q1 "Badge syntax" was struck earlier the same day — badges/chips are rendered product from taxonomy frontmatter, not an NCM construct; see §2.1 note and §3.2.)

1. **Remote-image fetch — RESOLVED.** (a) Ad/tracker deny-list: new key `ngdpbase.markdown.ncm.image.ad-deny-list`, **seeded** default; dropped ad images emit a `warnings[]` entry (never silent). (b) Timeout: a **global** `ngdpbase.fetch-timeout-ms` (default `30000`, promoted from `ImportManager`'s hardcoded value), **not** an NCM-scoped key — governs our own outbound HTTP; third-party clients (ES/OTLP) keep their own. Size/MIME reuse `ngdpbase.attachment.*`; NCM adds a stricter raster allowlist on top (§2.2).
2. **HTML-in-body conversion — RESOLVED.** Convert-known → strip-rest + warn: `turndown` converts structural HTML with a clean MD equivalent; `script/style/iframe`/unknown dropped with a structured `warnings[]` entry + placeholder (§3.3). `<img>` is intercepted by the §2.2 image→attachment rule, **not** turndown.
3. **Lossy-conversion reporting — RESOLVED (extended 2026-05-17).** Reuse the existing `ConversionResult.warnings` channel (now structured, §3) — `admin-import.ejs` already renders it. **Preview+confirm** on interactive single-item ops only. **Bulk import, #685 scheduled ingestion, MCP** (no human preview) → in addition to warnings + the in-body placeholder (§3.3), the conversion summary is pushed to the existing **`/admin/notifications`** centre via `NotificationManager.addNotification(...)` (the same subsystem `MediaManager` already feeds) so admins get an actionable per-event alert (e.g. "Imported X: 3 images dropped, 1 HTML block stripped"). This is the operator's intent of "add to notifications". Distinct from **#738** (aggregate metrics/trend = "fix-if-many"); notifications = per-event actionable admin alert.
4. **NCM profile versioning — RESOLVED.** `ncmVersion` frontmatter stamp + explicit-migration only, never silent rewrite-on-read (§3).

## 6. Implementation phases

1. **This spec** — decisions resolved (§5). No code. ✓
2. **NCM profile + `toNgdpMarkdown` normalizer** on the existing converter registry; HTML→NCM + JSPWiki→NCM; structured `{kind,detail}` warnings; `ncmVersion` stamp; determinism/idempotence tests (incl. placeholder pass-through §3.3).
3. **"Convert existing page" action** with **preview+confirm** (interactive single-item) + `ImportManager` / `mcp-server.ts` hookup; add the global `ngdpbase.fetch-timeout-ms` key.
4. **Image→attachment MVP** (§2.2: sniff + strict allowlist + cap + seeded ad-deny-list + placeholder); **taxonomy frontmatter preservation** (§3.2) wired into every converter path.
5. **`/admin/notifications` wiring** — non-preview NCM conversions (bulk import, #685, MCP) push a `NotificationManager.addNotification(...)` summary (§5 #3). Tables: nothing to build — passthrough already honors decision **b** (§2.1).
6. Unblocks **#501** (JSON→NCM serializer), then **#685** (uses it for body materialization).
7. Follow-ups (separate issues, not MVP): **#737** image transcoding hardening; **#738** conversion-metrics aggregation (gated on the structured `kind` codes from phase 2).

## 7. Acceptance criteria

- [ ] NCM profile is precisely specified (constructs, OUT list, image rule, link forms §2.4)
- [ ] Links normalized to `LinkParserHandler` forms — external links carry `target="_blank"` (+ renderer `rel="noopener noreferrer"`), internal links emit `[Display\|PageName]` (no hardcoded `/view/` paths)
- [ ] Image→attachment reuses existing `ngdpbase.attachment.maxsize` / `ngdpbase.attachment.allowedtypes` (no parallel limit namespace)
- [ ] `toNgdpMarkdown` is idempotent and deterministic (NCM-in ⇒ byte-identical NCM-out); covered by tests
- [ ] Taxonomy frontmatter (`user-keywords`/`system-keywords`/`system-category`) preserved per §3.2 — `user-keywords` never overwritten by ingestion; round-trips byte-identically
- [ ] HTML and JSPWiki sources normalize to NCM with no raw-HTML sink remaining
- [ ] Embedded remote/data-URI images become attachments; ad/tracker images dropped
- [ ] `ImportManager` and `mcp-server.ts` route through the normalizer
- [ ] "Convert an existing page" action available and idempotent, with **preview+confirm** before write (interactive single-item ops only)
- [ ] `ConversionResult.warnings` is structured `{kind,detail}` with a stable `kind` enum; lossy conversions reported via it
- [ ] Dropped content leaves a deterministic in-body placeholder (§3.3) that round-trips byte-identical (normalizer recognises its own placeholder)
- [ ] `ncmVersion` written to frontmatter; no silent rewrite-on-read; profile bump migrates only via explicit command
- [ ] Image MVP: magic-byte sniff + strict raster allowlist (SVG/RAW excluded) + `ngdpbase.attachment.maxsize` cap + seeded `ngdpbase.markdown.ncm.image.ad-deny-list`
- [ ] Global `ngdpbase.fetch-timeout-ms` (default 30000) added and used by NCM image fetch + ImportManager URL import
- [ ] `ngdpbase.features.images.*` flagged as out-of-scope dead-key duplication (not used, not fixed by #728)
- [ ] Tables: NCM performs **no** table conversion either direction (JSPWiki `%%table-*`+`||` and GFM both pass through unchanged) — verified by passthrough; no GFM↔JSPWiki transform exists
- [ ] Non-preview conversions (bulk import / #685 / MCP) push a summary to `/admin/notifications` via `NotificationManager.addNotification(...)`
- [ ] #501 and #685 documented as consumers; #737 (transcoding) and #738 (metrics) split out and linked
