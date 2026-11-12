[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/redactPrivateNames](../README.md) / redactPrivateNamesFormat

# Function: redactPrivateNamesFormat()

> __redactPrivateNamesFormat__(): `Format`

Defined in: src/utils/redactPrivateNames.ts:87

Winston format striking private titles from the message, any stack, and
the metadata a line carries (`logger.info(msg, { pageName })`). Placed
before `printf`, beside redactSecretsFormat, so every transport gets it.

## Returns

`Format`
