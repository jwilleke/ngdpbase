[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / formatMoney

# Function: formatMoney()

> __formatMoney__(`minorUnits`, `currency`, `locale?`): `string`

Defined in: src/utils/pluginFormatters.ts:361

Show an amount kept as whole minor units (cents) in its currency:
`formatMoney(125050, 'USD')` is `$1,250.50`. The number of decimals is the
currency's own (JPY 0, KWD 3); an unlisted code gets two. A malformed code
never throws: it is shown after the number. Plain text: escape it when
putting it in HTML.

## Parameters

### minorUnits

`number`

### currency

`string`

### locale?

`string` = `'en-US'`

## Returns

`string`
