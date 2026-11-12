[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/footnotes](../README.md) / ExtractedFootnoteDef

# Interface: ExtractedFootnoteDef

Defined in: src/converters/ncm/footnotes.ts:17

NCM footnote capture (#1125) — the pure half.

GFM and NCM share the `[^id]` / `[^id]: text` syntax, and the render
pipeline already links refs inline. What the sidecar footnote list
(FootnoteManager + FootnotesPlugin, the one with the CRUD UI) needs is the
DEFINITIONS as structured records. This module extracts them and rewrites
the body; it is deliberately side-effect free so §3.1 determinism holds —
the sidecar write belongs to the caller (the convert route), exactly as
image localization splits pure rewrite from attachment persistence.

Ids are preserved verbatim — the body's `[^note-1]` refs must keep
resolving to `#footnote-note-1` in the rendered list, so renumbering would
break every ref it touched.

## Properties

### display

> __display__: `string`

Defined in: src/converters/ncm/footnotes.ts:19

***

### id

> __id__: `string`

Defined in: src/converters/ncm/footnotes.ts:18

***

### note

> __note__: `string`

Defined in: src/converters/ncm/footnotes.ts:21

***

### url

> __url__: `string`

Defined in: src/converters/ncm/footnotes.ts:20
