[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiCodeMarkers

# converters/ncm/fix/jspwikiCodeMarkers

JSPWiki `{{{ }}}` code markers → Markdown code (#1332).

JSPWiki marks preformatted text with `{{{` and `}}}`. That is not Markdown:
the renderer shows the braces and reads the text inside as page markup, so
`** item` in an example becomes a bullet and `[{Plugin}]` runs. Rewritten:

- a `{{{` at the start of a line (up to 3 spaces in) opens a block, closed
    by the first `}}}` after it — or by a ``` line, where an author mixed
    the two. Both become ``` fences at the opener's indent; text after the
    `{{{`, and text before or after the `}}}` (`}}} /%`), moves onto a line
    of its own. Lines in between are code and are not changed;
- `{{{text}}}` on one line becomes an inline code span. A `[[{` inside
    becomes `[{`: outside code that escape shows as `[{`, which is what the
    reader saw between the braces, but inside a code span it would show;
- a ``` block opened right under a `%%` style line (`%%prettify`) and
    ended by `}}}` with `/%` after it, on the same line or the next, is
    closed there: `}}}` becomes ``` and the `/%` goes on its own line. An
    old import turned the lone `{{{` into ``` but left `}}} /%`, so the
    code ran on through the rest of the page.

Deliberately narrow:

- never a `{{{` inside code, an inline code span or an HTML block;
- a `}}}` with no `{{{` before it is left alone (`{\boldsymbol {\tau }}}`);
- a `{{{` that opens mid-line and closes on a later line is left alone:
    it is inline text across a line break, and a fence there would split
    the sentence (or list item) it sits in;
- any other `}}}` inside a ``` block is code, and is left alone;
- if any `{{{` block is never closed, nothing is changed.

Runs first, so the steps after it see the example text as code.

## Variables

- [jspwikiCodeMarkers](variables/jspwikiCodeMarkers.md)

## Functions

- [codeSpan](functions/codeSpan.md)
