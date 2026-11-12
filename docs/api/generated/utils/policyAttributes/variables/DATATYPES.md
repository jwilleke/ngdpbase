[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / DATATYPES

# Variable: DATATYPES

> `const` __DATATYPES__: readonly \[`"string"`, `"integer"`, `"boolean"`, `"double"`, `"date"`, `"time"`, `"dateTime"`, `"anyURI"`\]

Defined in: src/utils/policyAttributes.ts:24

The datatypes a condition may name: the XACML 3.0 JSON profile's short
names. Only `string`, `integer` and `boolean` have a function today, so a
condition naming any other is refused as a datatype its function does not take.
