[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / PolicyCondition

# Type Alias: PolicyCondition

> __PolicyCondition__ = `Record`\<`string`, ([`ConditionOperand`](ConditionOperand.md) \| `PolicyCondition`)[]\>

Defined in: src/types/Policy.ts:66

A policy's condition (#2330): one function, named for its XACML 3.0 function
in lowercase, whose value is the array of its arguments.

- `string-equal`, `integer-equal`, `boolean-equal`, `string-is-in`,
  `integer-is-in`, `integer-greater-than`, `integer-greater-than-or-equal`,
  `integer-less-than`, `integer-less-than-or-equal` take two
  [ConditionOperand](ConditionOperand.md)s;
- `and` and `or` take a list of conditions, `not` takes one;

nested at most 4 deep.

Each node is true, false or unknown. A comparison reading an attribute that
is missing is unknown; in `or` a true branch decides, in `and` a false one
does, and `not` of unknown is unknown. An allow applies only when the
condition is true; a deny applies when it is true or unknown.
