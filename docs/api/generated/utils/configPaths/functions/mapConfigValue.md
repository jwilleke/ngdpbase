[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configPaths](../README.md) / mapConfigValue

# Function: mapConfigValue()

> __mapConfigValue__(`value`, `visit`, `below?`): `unknown`

Defined in: src/utils/configPaths.ts:42

Visit a value and everything inside it, top first. `visit` returns a
replacement for the node, or `undefined` to keep it and go inside. Copy on
write: a map or list nothing inside changed is returned as itself, so a read
of a value with nothing to replace allocates nothing.

## Parameters

### value

`unknown`

### visit

(`node`, `below`) => `unknown`

### below?

`string`[] = `[]`

## Returns

`unknown`
