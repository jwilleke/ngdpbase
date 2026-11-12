[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiLinkLeftovers

# converters/ncm/fix/jspwikiLinkLeftovers

Links the JSPWiki import left half-converted (#1492).

The import turned `[text|url|target='_blank']` into Markdown by pieces, and
on some pages the pieces were left glued together. Today they show as
harmless text; once bare web addresses become links (`linkify`, #1492),
each would become one long broken link. Three shapes, each unambiguous:

- `url(url)`, the same address twice, becomes `url`;
- `url(url|target='_blank')`, the same address twice, becomes `url`;
- `](url|target='_blank')`, a Markdown link whose destination kept the
    JSPWiki attribute, becomes `](url)` — every external link opens in a new
    tab anyway (#1492).

Deliberately narrow:

- two different addresses in `url(other)` are left alone;
- a wiki link split over two lines (`[Long title` then
    `|url|target='_blank']`) is left alone: which line it belongs to needs a
    reader;
- never inside code, an HTML block or an inline code span.

## Variables

- [jspwikiLinkLeftovers](variables/jspwikiLinkLeftovers.md)

## Functions

- [fixLinkLeftoversInLine](functions/fixLinkLeftoversInLine.md)
