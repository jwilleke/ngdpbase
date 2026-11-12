[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/styleClosers

# converters/ncm/fix/styleClosers

Bare `%%` style closers → `/%` (#1346).

JSPWiki closes a `%%` style block with `/%` or with a bare `%%`. NCM writes
only `/%` (operator decision, 2026-09-12); the renderer still tolerates a
bare `%%`, so this changes the text, not what the page shows. A `%%` is a
closer under Apache's rule (`JSPWikiMarkupParser.handleDiv`): not followed
by a letter or `(`, with a block open. That covers a line that is only
`%%` and the inline form `%%sub text%%`.

Openers are counted to know whether a block is open: `%%` followed by a
letter or `(` opens one, `/%` or a bare `%%` closes the innermost. An
inline opener (text after it on the line) that is never closed ends with
its paragraph, as in Apache, so a blank line drops the inline ones still
open; a block-form opener (alone on its line) stays open until closed.

Deliberately narrow:

- a `%%` with no block open is left alone, for review; Apache drops it;
- never a line the renderer treats as code or HTML, and never inside an
    inline code span.

## Variables

- [styleClosers](variables/styleClosers.md)
