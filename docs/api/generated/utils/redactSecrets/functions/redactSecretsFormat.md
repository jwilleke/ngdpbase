[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactSecrets](../README.md) / redactSecretsFormat

# Function: redactSecretsFormat()

> __redactSecretsFormat__(): `Format`

Defined in: src/utils/redactSecrets.ts:218

Winston format that redacts secrets from the message and any attached stack.

Place it BEFORE `printf` in the pipeline so it applies once, to every
transport and every consumer, rather than per output target.

Non-string messages are left alone: the printf stage stringifies them, and
mutating an object's identity mid-pipeline would surprise a structured/JSON
provider. The primary leak shape is an interpolated string.

## Returns

`Format`
