# Plan: ngdp Compatible Markdown

Issue: [#728](https://github.com/jwilleke/ngdpbase/issues/728)
Status: Draft spec — not implemented
Date: 2026-05-17
Related: [#501](https://github.com/jwilleke/ngdpbase/issues/501) (JSON→ngdp-MD serializer — consumer), [#685](https://github.com/jwilleke/ngdpbase/issues/685) (data-ingestion framework — consumer), [#599](https://github.com/jwilleke/ngdpbase/issues/599) (showdown ReDoS — why no raw-HTML sink)

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
| **Tables** | GFM pipe tables | showdown (GFM tables) |
| **Links** | `[text](url)` for external; `[Text\|PageName]` for wiki links | MarkupParser link handling |
| **Footnotes** | `[^id]` reference + `[^id]: text` definition (single-line and multi-paragraph) | `FootnoteManager`, `showdown-footnotes-fixed`, `MarkupParser` steps 3.5/3.6 |
| **Embedded images** | `![alt](attachment-ref)` — the image is downloaded and stored as an **attachment**; the source URL/data-URI is replaced with the local attachment reference | `AttachmentManager`, `ImportManager.importPageAttachments()` |
| **Plugins / variables** | `[{PluginName param='…'}]`, `[{$variable}]` | `PluginManager`, `VariableManager` |
| **Frontmatter** | YAML via `gray-matter`, incl. the taxonomy fields (`system-category`, `user-keywords`, `system-keywords`) — see §3.2 | existing page contract |

> Note: the #728 issue's "Badges" line is **not** an NCM body construct. Page-top category badges and search/page keyword "chips" are *rendered product* — produced by the view/plugin layer (`header.ejs`, `view.ejs`, `SearchPlugin`) from the three taxonomy **frontmatter** fields, not authored in Markdown. NCM has no badge/chip syntax; its only obligation is to preserve those fields faithfully (§3.2). Inventing a `[{Badge}]` body token would create a second, conflicting taxonomy path.

### 2.2 Image → attachment rule (precise)

On conversion, for every embedded image whose source is a remote URL or a `data:` URI:

1. Fetch/decode the bytes (size/type limits enforced — see Open Questions).
2. Store via `AttachmentManager` against the target page (reuse `ImportManager.importPageAttachments()` semantics).
3. Rewrite the Markdown image to reference the stored attachment.
4. **Exclude ad/tracking images** (the issue's "NOT Ads"): images matching a deny-list of ad/tracker hosts/patterns are dropped, not attached. Deny-list is config-driven.

Rationale: pages must not hot-link or embed remote/data-URI binaries — provenance, offline integrity, and no remote-fetch-on-render.

### 2.3 Explicitly OUT of NCM

- **Raw/embedded HTML** in page body — stripped or escaped on normalization. (The single biggest reason for this spec.)
- **Remote-hosted images / `data:` URIs** left as-is — always converted to attachments (§2.2) or dropped (ads).
- `<script>`, `<style>`, `<iframe>`, event-handler attributes — never.
- Anything that triggers a render-time outbound fetch.

## 3. The converter / normalizer contract

NCM extends the **existing** `IContentConverter` registry — no new parallel system.

- **`toNgdpMarkdown(input, sourceFormat) → ConversionResult`** — a normalizer that takes content in any registered source format (HTML, JSPWiki, raw Markdown, JSON-via-#501) and emits NCM. Returns the existing `ConversionResult { content, metadata, warnings }` shape.
- **New/extended converters** register in `src/converters/` exactly as today (`formatId`, `formatName`, `fileExtensions`, `convert()`, `canHandle()`).
- **"Convert an existing page" action** — admin/page action: load page → run through `toNgdpMarkdown` (HTML/JSPWiki/loose-MD → NCM) → save. Idempotent (NCM in ⇒ NCM out, byte-identical).
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

## 4. Consumers (locked relationships)

- **#501 — JSON → NCM serializer.** Re-scoped from "JSON→HTML". A `json + template → NCM` serializer registered as an `IContentConverter`. Standalone surface (InterWiki/plugin rendering a JSON URL) is a thin consumer of that serializer.
- **#685 — data-ingestion framework.** Consumes the **#501 serializer** for record→page-body materialization, **not** #501's render-time fetch path. #685 owns fetch/schedule/state/change-detection; NCM owns the body format. Two consumers of one serializer; they do not share fetch/scheduling.

Sequencing: **#728 spec (this doc) → #728 normalizer → #501 (re-scoped serializer) → #685.** #501 and #685 are blocked on the normalizer.

## 5. Open questions (decide before implementation)

1. **Image attachment limits** — max bytes, allowed MIME types, fetch timeout, and the **ad/tracker deny-list** source (config key name + default list).
2. **HTML-in-body policy** — strip silently, escape, or convert-then-strip-unknown? Proposal: convert known HTML→MD via `turndown`, strip the rest, emit a `warnings[]` entry.
3. **Lossy-conversion reporting** — surface `ConversionResult.warnings` to the user on "convert existing page" and on import.
4. **Versioning of the NCM profile** — a `ncmVersion` so the normalizer can evolve without silently rewriting every page.

> The former Q1 "Badge syntax" was removed 2026-05-17 — badges/chips are rendered product from taxonomy frontmatter, not an NCM construct; see §2.1 note and §3.2.

## 6. Implementation phases

1. **This spec** + sign-off on §5 open questions. (No code.)
2. **NCM profile + `toNgdpMarkdown` normalizer** on the existing converter registry; HTML→NCM and JSPWiki→NCM paths; determinism/idempotence tests.
3. **"Convert existing page" action** + `ImportManager` / `mcp-server.ts` hookup.
4. **Image→attachment** rule (with ad deny-list); **taxonomy frontmatter preservation** (§3.2) wired into every converter path.
5. Unblocks **#501** (JSON→NCM serializer), then **#685** (uses it for body materialization).

## 7. Acceptance criteria

- [ ] NCM profile is precisely specified (constructs, OUT list, image rule)
- [ ] `toNgdpMarkdown` is idempotent and deterministic (NCM-in ⇒ byte-identical NCM-out); covered by tests
- [ ] Taxonomy frontmatter (`user-keywords`/`system-keywords`/`system-category`) preserved per §3.2 — `user-keywords` never overwritten by ingestion; round-trips byte-identically
- [ ] HTML and JSPWiki sources normalize to NCM with no raw-HTML sink remaining
- [ ] Embedded remote/data-URI images become attachments; ad/tracker images dropped
- [ ] `ImportManager` and `mcp-server.ts` route through the normalizer
- [ ] "Convert an existing page" action available and idempotent
- [ ] Lossy conversions reported via `warnings[]`
- [ ] #501 and #685 documented as consumers of the normalizer/serializer (done — see issue cross-comments 2026-05-17)
