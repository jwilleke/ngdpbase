[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/emailForLog](../README.md) / redactEmailAddresses

# Function: redactEmailAddresses()

> __redactEmailAddresses__(`text`): `string`

Defined in: src/utils/emailForLog.ts:26

Any address inside free text (an SMTP error often quotes the rejected one)
cut to its domain: `bob@example.org` → `…@example.org`.

## Parameters

### text

`string`

## Returns

`string`
