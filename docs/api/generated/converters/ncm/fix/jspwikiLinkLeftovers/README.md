[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiLinkLeftovers

# converters/ncm/fix/jspwikiLinkLeftovers

Links the JSPWiki import left half-converted (#1492).

The import turned `[text|url|target='_blank']` into Markdown by pieces, and
on some pages the pieces were left glued together. Now that a bare web
address renders as a link (#2443), each would show as one long broken link.
Five shapes, each unambiguous:

- `url(url)`, the same address twice, becomes `url`;
- `url(url|target='_blank')`, the same address twice, becomes `url`;
- `](url|target='_blank')`, a Markdown link whose destination kept the
    JSPWiki attribute, becomes `](url)` — every external link opens in a new
    tab anyway (#1492);
- a wiki link split over two lines is joined only when the break is at the pipe
    (`[Long title` then `|url|target='_blank']`, or `[Long title|` then
    `url|target='_blank']`, #2443): the address and its closing `]` must
    be on the second line, nothing between the lines, and the first line
    must end inside an unclosed `[`. Anything less clear is left alone;
- a link that lost its opening `[` (#2451) is repaired in the shapes seen on
    real pages: `text|url|target='_blank']` at the start of a line (after a list, quote or
    heading marker) becomes `[text](url)`, with the marker kept in front; the same with no text (` |url|target='_blank']`) becomes the
    bare address, which renders as a link; and `url|Wikipedia:url|target='_blank'`
    with no brackets at all, the same address twice, becomes `url`. The
    `|target=` leftover is required, the text holds no bracket, and a line right
    after one with an unclosed `[` is left alone;
- never inside code, an HTML block or an inline code span;
- a line longer than 10,000 characters is left as it is, and an
    address is matched up to 2,048 characters, so the cost of a
    page grows with its size, not with the square of one line;
- a join may not make a line longer than 10,000 characters or
    take more than 20 continuation lines (the first line and
    20 more); a longer run is left as it is.

One run does everything: a line is repaired for the leftovers above before
it is tested for a join, and a line made by a join is looked at again, so a
second run changes nothing.

## Variables

- [jspwikiLinkLeftovers](variables/jspwikiLinkLeftovers.md)

## Functions

- [fixLinkLeftoversInLine](functions/fixLinkLeftoversInLine.md)
