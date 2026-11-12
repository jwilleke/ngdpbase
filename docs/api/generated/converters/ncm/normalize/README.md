[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/normalize

# converters/ncm/normalize

NCM normalizer — Phase 2 Slice 1 (#728)

- `ncm` / `markdown` (S1): parse frontmatter, stamp `ncmVersion` if absent
  (preserve an existing value — migration is a separate explicit step,
  never silent rewrite-on-read), re-emit with deterministic (sorted)
  frontmatter key order; body passed through unchanged. Placeholder lines
  therefore round-trip byte-identical.
- `html` / `jspwiki` (S2): delegate to the existing `HtmlConverter` /
  `JSPWikiConverter` registry (the spec says NCM *extends* the registry,
  not reinvents it), map their `string[]` warnings to structured
  `NcmWarning`, normalize CommonMark links to NCM §2.4 forms, then run the
  assembled doc through the S1 fixed point so determinism/version/order
  live in exactly one place.

The guarantee S1 establishes (painful to retrofit):
`normalize(normalize(x)) === normalize(x)` byte-identical, and an existing
`ncmVersion` is never silently changed.

## Interfaces

- [NcmNormalizeOptions](interfaces/NcmNormalizeOptions.md)

## Functions

- [normalizeToNcm](functions/normalizeToNcm.md)
