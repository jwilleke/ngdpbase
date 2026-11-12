[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/bridge

# converters/ncm/bridge

NCM → ConversionResult bridge (#728 Phase 2 Slice 5b)

Adapts an `NcmResult` to the shared `ConversionResult` shape so the import
path can route through `normalizeToNcm`. Since #728 S3 made
`ConversionResult.warnings` structured (`ConversionWarning {kind,detail}`),
this bridge is now __lossless__ — `NcmWarning` is an assignable subset:

- the NCM document's frontmatter → `metadata`
- the NCM body                  → `content`
- `NcmWarning[]`                → `warnings` (structured, unchanged)

## Functions

- [ncmToConversionResult](functions/ncmToConversionResult.md)
