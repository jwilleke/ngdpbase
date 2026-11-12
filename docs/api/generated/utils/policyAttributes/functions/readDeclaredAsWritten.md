[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / readDeclaredAsWritten

# Function: readDeclaredAsWritten()

> __readDeclaredAsWritten__(`config`, `key`): `unknown`

Defined in: src/utils/policyAttributes.ts:366

A declaration map as written, every `$NAME` left unresolved, or `null` when
it cannot be read. Declarations are read this way so a `$NAME` in one is
judged and reported as written and an environment variable's value never
reaches a message or a log line; a throwing read (an unset variable) is
`null`, not an exception.

## Parameters

### config

\{ `getProperty`: (`key`, `def?`) => `unknown`; `getUnresolvedProperty?`: (`key`, `def?`) => `unknown`; \} \| `null` \| `undefined`

### key

`string`

## Returns

`unknown`
