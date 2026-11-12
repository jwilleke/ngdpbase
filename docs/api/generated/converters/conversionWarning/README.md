[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / converters/conversionWarning

# converters/conversionWarning

Classify legacy free-text converter warnings into structured
[ConversionWarning](../../IContentConverter/interfaces/ConversionWarning.md) (#728 S3).

The 3 converters build their warnings as prose `string[]` internally; this
maps them to a stable `kind` at the single `convert()` return site, so the
~12 push call-sites don't each need touching. `detail` preserves the
original message verbatim (lossless). `kind` is coarse but stable and
aggregatable — finer taxonomy can come later without breaking the contract.

## Functions

- [classifyWarnings](functions/classifyWarnings.md)
