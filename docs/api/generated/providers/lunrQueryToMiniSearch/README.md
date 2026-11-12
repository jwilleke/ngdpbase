[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / providers/lunrQueryToMiniSearch

# providers/lunrQueryToMiniSearch

Lunr-style query strings, read as MiniSearch query trees (#1736).

The search provider moved from Lunr to MiniSearch, but its callers still
speak Lunr's query language: the field-scoped search builds `+title:word`,
type-ahead appends `*` to the last term (`applyPrefixToLastTerm`), and a
person may type any of it into the search box. This keeps that language,
with the same meaning:

  word          an optional term; with no required terms, any one matches
  +word         required: every result contains it
  -word         excluded: no result contains it
  field:word    only that field (an unknown field is read as plain text, so
                a typed URL such as `https://x` is a search, not an error)
  word*         prefix match
  word~1        fuzzy match, up to that edit distance

A term's `^boost` is accepted and ignored. When required terms are present,
optional terms no longer narrow the results (as in Lunr); they are not used
for ranking either.

## Functions

- [lunrQueryToMiniSearch](functions/lunrQueryToMiniSearch.md)
