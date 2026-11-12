[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/fileHandling](../README.md) / memberMediaType

# Function: memberMediaType()

> __memberMediaType__(`name`, `bytes`): `string`

Defined in: src/ice/fileHandling.ts:71

The media type of a file unpacked from a zip (#2061): its extension's,
checked against its bytes where that is cheap. JSON must start with `{` or
`[` (NDJSON with `{`), XML with `<`; one that does not is
`application/octet-stream`. Then the upload door's own rule
(`resolveUploadMime`): bytes that show a type decide (an XML file with an
`<?xml` prolog is `text/xml`), and a claim they do not bear out is
`application/octet-stream`. So the type a receiver is handed is the type
the door stores.

## Parameters

### name

`string`

### bytes

`Buffer`

## Returns

`string`
