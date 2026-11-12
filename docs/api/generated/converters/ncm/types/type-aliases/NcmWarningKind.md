[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/types](../README.md) / NcmWarningKind

# Type Alias: NcmWarningKind

> __NcmWarningKind__ = `"html-dropped"` \| `"img-attached"` \| `"img-rejected"` \| `"link-externalized"` \| `"placeholder-inserted"` \| `"converter-note"` \| `"source-unsupported"`

Defined in: src/converters/ncm/types.ts:32

Stable warning/error code. Free text alone is not aggregatable — the code
is the prerequisite for the conversion-metrics work (#738) and tightens
determinism (enum > prose). Detail strings carry the specifics.
