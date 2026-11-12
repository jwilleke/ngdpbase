[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / MAX\_CONDITION\_DEPTH

# Variable: MAX\_CONDITION\_DEPTH

> `const` __MAX\_CONDITION\_DEPTH__: `4` = `4`

Defined in: src/utils/policyAttributes.ts:34

How deep a condition may nest. Every function node counts, arguments that
are attributes or values do not, so `or` > `and` > `not` > `string-equal` is 4
and one more level is refused.
