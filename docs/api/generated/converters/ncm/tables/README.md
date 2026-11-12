[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / converters/ncm/tables

# converters/ncm/tables

NCM table up-conversion — GFM pipe tables → JSPWiki styled tables (#728, NCM v2)

NCM v1 left tables as passthrough (both GFM pipe tables and JSPWiki `||`/`|`
tables rendered independently). NCM v2 makes the rich JSPWiki form the single
canonical table: every GFM pipe table found in a normalized body is rewritten
to a `||header||` / `|cell|` table wrapped in the configured style blocks
(default `%%table-fit %%table-bordered %%table-striped %%table-hover
%%sortable`). This gives imported markdown tables fit/border/zebra/hover and
client-side sorting for free, via the existing `JSPWikiPreprocessor`.

Two invariants the rest of NCM relies on:

- __Idempotent.__ The output has no GFM separator row (`|---|`), and detection
  requires a separator row, so a second pass converts nothing — the body is a
  fixed point. JSPWiki tables already in the body are likewise never matched.
- __Delimiter shape.__ `JSPWikiPreprocessor.parseTableRow` slices off the
  first and last cell (the empties around the outer delimiters), so rows MUST
  lead AND trail with their delimiter: `||a||b||c||` for headers, `|a|b|c|`
  for data. Omitting the trailing delimiter silently drops the last column.

## Variables

- [DEFAULT\_TABLE\_CLASSES](variables/DEFAULT_TABLE_CLASSES.md)

## Functions

- [upconvertPipeTables](functions/upconvertPipeTables.md)
