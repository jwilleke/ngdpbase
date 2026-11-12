[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sniffMime](../README.md) / SniffedMime

# Type Alias: SniffedMime

> __SniffedMime__ = `"image/jpeg"` \| `"image/png"` \| `"image/gif"` \| `"image/webp"` \| `"application/pdf"` \| `"image/svg+xml"` \| `"text/html"` \| `"text/xml"`

Defined in: src/utils/sniffMime.ts:12

The type a file's bytes show it to be, for the formats we can recognise
(#1624). An upload's declared type is the browser's claim; this is the
evidence. Returns null when the bytes match none of the formats below —
the caller decides what an unrecognised file is.

Markup is recognised from the first kilobyte, case-insensitively, after
leading whitespace (trimStart also drops a byte-order mark). SVG is checked before HTML because
an SVG may itself contain a `<script>`.
