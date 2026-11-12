[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / ShareVisit

# Interface: ShareVisit

Defined in: src/types/Share.ts:220

One visit through a vault link, as its owner sees it (#1388): when, and
what was opened. The audit trail keeps the full record, with the address.

## Properties

### at

> __at__: `string`

Defined in: src/types/Share.ts:221

***

### file?

> `optional` __file?__: `string`

Defined in: src/types/Share.ts:225

The file opened, by id.

***

### list?

> `optional` __list?__: `true`

Defined in: src/types/Share.ts:227

The link's page list was opened.

***

### page?

> `optional` __page?__: `string`

Defined in: src/types/Share.ts:223

The page opened, by uuid.
