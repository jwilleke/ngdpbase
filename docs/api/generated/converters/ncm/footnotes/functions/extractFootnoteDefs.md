[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/footnotes](../README.md) / extractFootnoteDefs

# Function: extractFootnoteDefs()

> __extractFootnoteDefs__(`content`): [`FootnoteExtraction`](../interfaces/FootnoteExtraction.md)

Defined in: src/converters/ncm/footnotes.ts:60

Pull every footnote definition (single-line and GFM multi-paragraph) out of
the body. Continuation lines — indented by 4+ spaces or a tab, with blank
lines allowed between paragraphs of the same definition — join the note
with newlines.

## Parameters

### content

`string`

## Returns

[`FootnoteExtraction`](../interfaces/FootnoteExtraction.md)
