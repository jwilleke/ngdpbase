[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditConfigChange](../README.md) / describeConfigValue

# Function: describeConfigValue()

> __describeConfigValue__(`value`): `unknown`

Defined in: src/utils/auditConfigChange.ts:51

Render a configuration value for the record.

Primitives are kept as they are, so a reader filtering on `after: true` gets
what they expect. Anything else becomes JSON, truncated past
MAX\_VALUE\_CHARS with an explicit marker — a truncated value that does
not say it was truncated is worse than no value at all.

## Parameters

### value

`unknown`

## Returns

`unknown`
