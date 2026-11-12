[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/moreInformationFooter

# converters/ncm/fix/moreInformationFooter

The JSPWiki "More Information" footer is removed (#1348).

A convention from the JSPWiki years, for want of a Referring Pages tab:

    ## More Information
    There might be more information for this subject on one of the following:
    [{ReferringPagesPlugin before='*' after='\n' }]

The page's Referring Pages tab now shows the same list, so the section goes
(operator, 2026-09-12). The section is the heading and everything up to
the next heading of the same or a higher level, or the end of the page.

Deliberately narrow: the section is removed only when every line in it is
one of the footer's own lines, in the variants stored pages carry — the
sentence (also cut short, or with the plugin on the same line), "Pages
that reference this topic:", and the plugin call (also missing its closing
`]`). A section with anything else under the heading ("See also: …") is
left for review. A ReferringPagesPlugin call without the heading is valid
NCM and is left alone. Never a heading the renderer treats as code or HTML.

## Variables

- [moreInformationFooter](variables/moreInformationFooter.md)
