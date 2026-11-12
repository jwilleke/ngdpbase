[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/types

# converters/ncm/types

ngdp Compatible Markdown (NCM) — core types (#728, Phase 2 Slice 1)

Spec: docs/NGDP-Compatible-Markdown.md

These are NCM-local types. The shared `ConversionResult.warnings`
(string[]) used by ImportManager/ValidationManager/the converters is NOT
changed here — migrating that to structured warnings is a separate, broad
slice (#728 S3). NCM functions return their own [NcmResult](interfaces/NcmResult.md) so this
slice has zero blast radius on existing consumers.

## Interfaces

- [NcmResult](interfaces/NcmResult.md)
- [NcmWarning](interfaces/NcmWarning.md)

## Type Aliases

- [NcmSourceFormat](type-aliases/NcmSourceFormat.md)
- [NcmWarningKind](type-aliases/NcmWarningKind.md)

## Variables

- [NCM\_VERSION](variables/NCM_VERSION.md)
