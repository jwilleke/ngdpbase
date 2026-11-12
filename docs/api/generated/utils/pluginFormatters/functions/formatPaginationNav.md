[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / formatPaginationNav

# Function: formatPaginationNav()

> __formatPaginationNav__(`currentPage`, `totalPages`, `hrefFor`, `ariaLabel?`): `string`

Defined in: src/utils/pluginFormatters.ts:629

Render the canonical pagination control (#1300).

This is the one pagination markup in the application. `WikiPagination`
produces the same shape in the browser and enhances any instance it finds —
clicks, arrow keys and swipe — so a surface gets the full control by emitting
this and nothing else.

The wrapper carries `data-current-page`, `data-total-pages` and the prev/next
URLs, which is what lets the enhancer work without being told anything by the
page. Everything it needs is in the markup.

Returns '' for a single page: a control that can only ever show "1" is noise.

## Parameters

### currentPage

`number`

The current page number (1-based)

### totalPages

`number`

Total number of pages

### hrefFor

(`page`) => `string`

Builds the URL for a given 1-based page number

### ariaLabel?

`string` = `'Pagination'`

Accessible name for the nav landmark

## Returns

`string`

## Example

```ts
formatPaginationNav(3, 12, (p) => `/view/Index?page=${p}`)
```
