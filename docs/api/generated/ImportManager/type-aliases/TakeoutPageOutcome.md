[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / TakeoutPageOutcome

# Type Alias: TakeoutPageOutcome

> __TakeoutPageOutcome__ = \{ `importedAs`: `string`; `outcome`: `"imported"`; `title`: `string`; \} \| \{ `outcome`: `"unchanged"`; `title`: `string`; \} \| \{ `outcome`: `"changed-since-takeout"`; `title`: `string`; \} \| \{ `outcome`: `"uuid-elsewhere"`; `title`: `string`; `where?`: `string`; \} \| \{ `message`: `string`; `outcome`: `"failed"`; `title`: `string`; \}

Defined in: src/managers/ImportManager.ts:356

One page's outcome in a takeout import (#1472).

## Union Members

### Type Literal

\{ `importedAs`: `string`; `outcome`: `"imported"`; `title`: `string`; \}

***

### Type Literal

\{ `outcome`: `"unchanged"`; `title`: `string`; \}

***

### Type Literal

\{ `outcome`: `"changed-since-takeout"`; `title`: `string`; \}

***

### Type Literal

\{ `outcome`: `"uuid-elsewhere"`; `title`: `string`; `where?`: `string`; \}

`where` is named only when the requester may view that page.

***

### Type Literal

\{ `message`: `string`; `outcome`: `"failed"`; `title`: `string`; \}
