[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/existing

# converters/ncm/existing

Convert an existing page to NCM (#728 Phase 2 Slice 5a)

"Convert existing page" is distinct from importing a Markdown file (which
stays on `MarkdownConverter`). An existing wiki page is loose Markdown that
should become NCM — so unlike the S1 `'markdown'` fixed point (which only
stamps/sorts), this also applies the §2.4 link normalization to the body,
then runs the S1 fixed point so determinism / `ncmVersion` stay
single-sourced. Idempotent: a page already in NCM round-trips byte-identical.

Image localization is intentionally NOT done here — it needs real
fetch/AttachmentManager wiring and is the immediate follow-up micro-slice
(S5a-ii). Embedded images survive as Markdown image syntax until then.

## Functions

- [normalizeExistingPageToNcm](functions/normalizeExistingPageToNcm.md)
