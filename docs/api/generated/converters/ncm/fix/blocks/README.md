[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/blocks

# converters/ncm/fix/blocks

Block map of a page body, read from markdown-it's parser (#1332).

Every fix step asks the same questions of a page — is this line code? is it
inside an HTML block? which lines start a list item, of which list, at what
depth? — and each used to answer them with its own line regexes. Those
regexes were approximations of CommonMark, and each approximation was wrong
in its own way (#1335, the no-break-space `*`, the lazy line that ended a
list early). This module answers them once, from the parser that will
render the page after the converter swap (#1273), using the source line
range markdown-it records on every block token.

Code lines are the union of what markdown-it calls code (fences, indented
code) and what MarkupParser's Step 0 extracts as a fenced block before any
converter runs (#1335: an optionally indented run of three or more
backticks, closed by the same run indented no further than the opener or
3 spaces). A step never edits a line either of them treats as code.

Lines are split on `\n`; a trailing `\r` is kept out of the text the steps
see and put back by [joinLines](functions/joinLines.md), so CRLF pages stay CRLF.

## Interfaces

- [BlockMap](interfaces/BlockMap.md)
- [ItemBlock](interfaces/ItemBlock.md)
- [ListInfo](interfaces/ListInfo.md)
- [ListItem](interfaces/ListItem.md)

## Functions

- [buildBlockMap](functions/buildBlockMap.md)
- [isBlank](functions/isBlank.md)
- [joinLines](functions/joinLines.md)
- [markerColumns](functions/markerColumns.md)
- [splitLines](functions/splitLines.md)
