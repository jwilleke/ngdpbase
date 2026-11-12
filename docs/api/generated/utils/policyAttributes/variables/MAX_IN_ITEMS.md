[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / MAX\_IN\_ITEMS

# Variable: MAX\_IN\_ITEMS

> `const` __MAX\_IN\_ITEMS__: `256` = `256`

Defined in: src/utils/policyAttributes.ts:43

How wide a condition may be (#2261). Depth alone leaves the tree as wide as
a config file can make it, and the evaluator walks it for every page a
listing or search asks about. A literal `value` list in an `is-in`, the
arguments of one `and` or `or`, and the function nodes of the whole condition
are each capped.
