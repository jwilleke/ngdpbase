[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / converters/ncm/fix/bulletMarkers

# converters/ncm/fix/bulletMarkers

Bullet markers → the house style, `- ` (#1271 decision S1).

CommonMark accepts `*`, `+` and `-` as bullet markers, and starts a NEW list
whenever the marker changes. Imported JSPWiki pages use `* item`; pages
written here use `- item`; mixing them on one page reads inconsistently in
the source and splits lists that were meant to be one. This rewrites every
bullet marker the parser sees to `-`, keeping its indent and spacing, so
nothing moves.

Because the parser decides what is a list item, a thematic break (`* * *`),
emphasis (`*italic*`), indented code and fenced code are never touched, and
a bullet inside a block quote (`> * item`) is. The result is parsed again:
a new marker merges lists that differed only by marker, but must never add,
drop or re-nest an item (`* - -` would become a thematic break), and if it
does, nothing is changed.

## Variables

- [bulletMarkers](variables/bulletMarkers.md)
