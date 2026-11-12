[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/managerUtils](../README.md) / ManagerFetchOptions

# Interface: ManagerFetchOptions

Defined in: src/utils/managerUtils.ts:14

Common options for manager methods that feed plugin content.
Passed as a raw key=value object from the plugin's fetch= parameter.
Domain-specific options (e.g. alertLevel, colorCode) are handled per-manager.

## Properties

### before?

> `optional` __before?__: `string`

Defined in: src/utils/managerUtils.ts:24

ISO date string — include only items before this date.

***

### limit?

> `optional` __limit?__: `number`

Defined in: src/utils/managerUtils.ts:16

Max items to return. 0 = unlimited.

***

### since?

> `optional` __since?__: `string`

Defined in: src/utils/managerUtils.ts:22

ISO date string — include only items at or after this date.

***

### sortBy?

> `optional` __sortBy?__: `string`

Defined in: src/utils/managerUtils.ts:18

Field name to sort by — each manager defines valid values.

***

### sortOrder?

> `optional` __sortOrder?__: `"asc"` \| `"desc"`

Defined in: src/utils/managerUtils.ts:20

Sort direction.
