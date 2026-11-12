[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/dotpath](../README.md) / getByPath

# Function: getByPath()

> __getByPath__(`obj`, `path`): `unknown`

Defined in: src/ice/shims/dotpath.ts:7

Trivial dot-path lookup (#685) — the only "mapping engine" the framework has.
NO JSONPath dependency (design §7): `getByPath(obj, 'properties.mag')`,
`getByPath(obj, 'geometry.coordinates.2')` (numeric segment = array index).
Returns undefined for any missing segment.

## Parameters

### obj

`unknown`

### path

`string`

## Returns

`unknown`
