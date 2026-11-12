[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditConfigChange](../README.md) / isSecretKey

# Function: isSecretKey()

> __isSecretKey__(`key`, `secretKeys`): `boolean`

Defined in: src/utils/auditConfigChange.ts:39

Is this key one the operator has declared secret?

The list is `ngdpbase.config.sensitive-values` (its `secret` entries), the same one that masks values on
`/admin/configuration` and drives log redaction. It is operator-editable
configuration, so it can contain anything: non-string entries are ignored
rather than throwing, because a malformed list must not stop a config change
from being recorded.

## Parameters

### key

`string`

### secretKeys

`unknown`

## Returns

`boolean`
