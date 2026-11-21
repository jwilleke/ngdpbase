[__ngdpbase API v5.45.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiLinkLeftovers

# converters/ncm/fix/jspwikiLinkLeftovers

Links the JSPWiki import left half-converted (#1492).

The import turned `[text|url|target='_blank']` into Markdown by pieces, and
on some pages the pieces were left glued together. Now that a bare web
address renders as a link (#2443), each would show as one long broken link.
Each shape is unambiguous:

- `url(url)`, the same address twice, becomes `url`;
- `url(url|target='_blank')`, the same address twice, becomes `url`;
- `](url|target='_blank')`, a Markdown link whose destination kept the
    JSPWiki attribute, becomes `](url)` — every external link opens in a new
    tab anyway (#1492);
- a wiki link split over two lines is joined back onto one (#2443, below);
- a link that lost its opening `[` (#2451), in the shapes seen on real
    pages: `text|url|target='_blank']` at the start of a line (after an
    indent, quote, list or heading marker, which stay in front) becomes
    `[text](url)`, and the same with no text (` |url|target='_blank']`)
    becomes the bare address, which renders as a link; and
    `url|Wikipedia:url|target='_blank'` (with or without a closing `]`) with
    no brackets at all, the same address twice, becomes `url`.

Deliberately narrow:

- two different addresses in `url(other)` are left alone;
- a split link is joined only when the break is at the pipe
    (`[Long title` then `|url|target='_blank']`, or `[Long title|` then
    `url|target='_blank']`, #2443): the address and its closing `]` must
    be on the second line, nothing between the lines, and the first line
    must end inside an unclosed `[`. Anything less clear is left alone;
- a lost-bracket repair needs the leftover `|target=` and, for the text
    form, the text at the start of the line (after a quote, list or heading
    marker) with no bracket in it, which does not start with a quote mark;
    a line right after one with an unclosed `[` is left alone, since it may
    be the second half of a split link; the `]` after an interwiki copy is
    dropped only when no unclosed `[` comes before it on the line;
- never inside code, an HTML block or an inline code span;
- a line longer than MAX\_LINE characters is left as it is, and an
    address is matched up to MAX\_URL characters, so the cost of a
    page grows with its size, not with the square of one line;
- a join may not make a line longer than MAX\_LINE characters or
    take more than MAX\_JOINS continuation lines (the first line and
    20 more); a longer run is left as it is.

One run does everything: a line is repaired for the leftovers above before
it is tested for a join, and a line made by a join is looked at again, so a
second run changes nothing.

## Variables

- [jspwikiLinkLeftovers](variables/jspwikiLinkLeftovers.md)

## Functions

- [fixLinkLeftoversInLine](functions/fixLinkLeftoversInLine.md)
