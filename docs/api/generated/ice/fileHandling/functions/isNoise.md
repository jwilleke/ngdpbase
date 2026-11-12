[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/fileHandling](../README.md) / isNoise

# Function: isNoise()

> __isNoise__(`filePath`, `patterns`): `boolean`

Defined in: src/ice/fileHandling.ts:93

Is this path noise — something an operating system or archiver adds that is
nobody's data? Patterns (configuration, `ngdpbase.import.engine.noise`):

- `name/` — any path with a directory segment of that name (`__MACOSX/`);
- `prefix*` / `*suffix` — a file name starting or ending so (`._*`);
- anything else — a file name exactly (`.DS_Store`), case-insensitive.

## Parameters

### filePath

`string`

### patterns

readonly `string`[]

## Returns

`boolean`
