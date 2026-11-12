[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiItalic

# converters/ncm/fix/jspwikiItalic

JSPWiki `''italic''` → Markdown `*italic*` (#1342).

Each `''` toggles italic, as in Apache's parser (`handleApostrophe`). An
italic run does not stop at a paragraph break: `startBlockLevel` closes it
at the end of the block and reopens it at the start of the next, so a
quotation of several paragraphs (or with a list inside) is italic
throughout. Markdown emphasis cannot cross a block, so the run is closed
with `*` on the last line of each block and reopened on the first line of
the next — after its list marker, heading marks or quote marker.

A `''` that is the whole line (a closer written on its own line) is
dropped and its `*` goes on the neighbouring text line instead: a line
that is only `*` would be read as an empty list item.

Deliberately narrow:

- never inside code, an HTML block, an inline code span or a
    `[{Plugin …}]` call (`caption=''` is an empty argument, not italic);
- a page whose `''` count is odd is left alone, for review: which one is
    stray cannot be told;
- the `*` goes before a line's closing `\` or `\` break, never after it.

The JSPWiki file converter calls this step too, so import and the NCM
funnel read `''` one way.

## Variables

- [jspwikiItalic](variables/jspwikiItalic.md)
