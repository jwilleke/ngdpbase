[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / formatPaginationLinks

# Function: formatPaginationLinks()

> __formatPaginationLinks__(`currentPage`, `totalPages`, `pageName`, `queryParam?`): `string`

Defined in: src/utils/pluginFormatters.ts:826

Build pagination HTML for a plugin result set, addressed by page name.

A thin wrapper over `formatPaginationNav` (#1301): it turns a page name and a
query parameter into the `/view/{page}?{param}=N` URLs this application uses,
and leaves the markup to the canonical control.

It previously emitted its own `.plugin-pagination` div — prev/next text links
with no page numbers and no styling, since that class had no CSS anywhere in
the repo. Its signature and its single-page behaviour are unchanged, so the
plugins calling it did not have to change; what they render did.

Returns '' when there is only one page (nothing to navigate).

## Parameters

### currentPage

`number`

The current page number (1-based)

### totalPages

`number`

Total number of pages

### pageName

`string`

Wiki page name used to build `/view/{pageName}?page=N`

### queryParam?

`string` = `'page'`

Query string parameter name (default: 'page')

## Returns

`string`
