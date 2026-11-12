[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / ConditionOperand

# Type Alias: ConditionOperand

> __ConditionOperand__ = \{ `attributeid`: `string`; `datatype`: `string`; \} \| \{ `datatype`: `string`; `value`: `unknown`; \}

Defined in: src/types/Policy.ts:45

An argument of a comparison (#2255, #2261, #2330), as XACML 3.0 writes one in
lowercase. An attribute is `{ "attributeid": "subject:department-id",
"datatype": "string" }`: `attributeid` starts `subject:`, `resource:` or
`environment:`. A literal is `{ "value": "sales", "datatype": "string" }`,
and for `X-is-in` its `value` may be an array. `datatype` is required and is
one of the XACML JSON profile's short names.
