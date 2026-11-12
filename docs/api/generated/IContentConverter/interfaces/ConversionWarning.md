[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [IContentConverter](../README.md) / ConversionWarning

# Interface: ConversionWarning

Defined in: src/converters/IContentConverter.ts:34

A structured conversion warning (#728 S3). `kind` is a stable, aggregatable
code (the prerequisite for the #738 conversion-metrics work); `detail` is
the human-readable specifics. `kind` is `string` (not an enum) because
converters and NCM each contribute their own codes — `NcmWarning` is an
assignable subset.

## Properties

### detail

> __detail__: `string`

Defined in: src/converters/IContentConverter.ts:36

***

### kind

> __kind__: `string`

Defined in: src/converters/IContentConverter.ts:35
