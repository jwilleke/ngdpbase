[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactSecrets](../README.md) / redactSecrets

# Function: redactSecrets()

> __redactSecrets__(`text`): `string`

Defined in: src/utils/redactSecrets.ts:198

Replace every configured secret in `text` with `[redacted:<key>]`.

The key is named so the line stays diagnosable — "the SMTP password appeared
here" is useful; an anonymous `***` is not.

Uses split/join rather than a RegExp: secrets routinely contain characters
that are regex metacharacters, and building a pattern from an untrusted-shape
value is how a redactor ends up throwing on the one line that mattered.

## Parameters

### text

`string`

## Returns

`string`
