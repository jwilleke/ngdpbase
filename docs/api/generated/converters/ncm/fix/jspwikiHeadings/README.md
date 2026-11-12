[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/jspwikiHeadings

# converters/ncm/fix/jspwikiHeadings

JSPWiki `!` headings → Markdown ATX headings (#1342).

JSPWiki marks a heading with `!` at the start of a line, and more marks
mean a LARGER heading: `!!!` is the largest, `!` the smallest. So `!!!`
becomes `#`, `!!` becomes `##` and `!` becomes `###`. Markdown shows a `!`
line as literal text.

The one place this mapping lives: the JSPWiki file converter calls this
step too, so a JSPWiki import and the NCM funnel read a `!` line the same
way.

Deliberately narrow:

- the `!` must be the first character of the line, as in JSPWiki;
- a Markdown image, `![alt](src)`, is not a heading; `![Main]` (a
    heading whose text starts with a link) still is;
- a line with nothing after the marks is left alone;
- never a line the renderer treats as code or HTML.

## Variables

- [jspwikiHeadings](variables/jspwikiHeadings.md)

## Functions

- [jspwikiHeadingLine](functions/jspwikiHeadingLine.md)
