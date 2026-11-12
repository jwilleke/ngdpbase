[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactPrivateNames](../README.md) / redactPrivateNames

# Function: redactPrivateNames()

> __redactPrivateNames__(`text`): `string`

Defined in: src/utils/redactPrivateNames.ts:56

Strike the title from every private page name in `text`.

## Parameters

### text

`string`

a log line, message or audit field

## Returns

`string`

the text with each private title replaced by `[redacted]`
