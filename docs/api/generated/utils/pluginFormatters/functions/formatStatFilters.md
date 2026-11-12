[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / formatStatFilters

# Function: formatStatFilters()

> __formatStatFilters__(`stats`, `options?`): `string`

Defined in: src/utils/pluginFormatters.ts:767

Render the canonical summary-stat filter bar (#1303).

`/admin/users` had four cards that filter its table when clicked. Nine other
surfaces render summary counts in five presentations and none of them filter
— `admin-keywords` pixel-identical to the one that works, `admin-audit`
defining a `:hover` rule on cards with no click handler. An inconsistent
appearance is untidy; an inconsistent affordance is a lie.

The markup is the contract, as it is for `formatPaginationNav`: a card is
clickable because of what it carries, and `WikiStatFilters.enhance()` wires
any bar it finds. That is what lets a plugin an admin wrote offer the same
interaction as a core admin page.

Three kinds of card, and the difference is the whole design:

- `href` — a link. The server filters, so it is correct on a paginated list.
- `match` — a client-side row filter. Correct only when every row is loaded.
- `clears` — the card that puts everything back.
- none of them — a card that reports a number and does not pretend to filter.

Returns '' for an empty list.

## Parameters

### stats

[`StatFilter`](../interfaces/StatFilter.md)[]

The cards, in display order

### options?

[`StatFilterOptions`](../interfaces/StatFilterOptions.md) = `{}`

Row selector, aria label, column class

## Returns

`string`

## Example

```ts
formatStatFilters(
  [{ label: 'Active', value: 9, match: 'status=active', tone: 'success' }],
  { rowSelector: 'tbody tr[data-username]' }
)
```
