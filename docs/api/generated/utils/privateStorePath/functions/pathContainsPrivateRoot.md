[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / pathContainsPrivateRoot

# Function: pathContainsPrivateRoot()

> __pathContainsPrivateRoot__(`pagesDirectory`, `filePath`, `layout?`): `boolean`

Defined in: src/utils/privateStorePath.ts:675

True when `filePath` is inside the private root of `pagesDirectory`. Measured
from the pages directory, not by searching the absolute path for `/private/`
— which matched every page on a host whose data sits under `/private/var`
or `/private/tmp` (macOS).

## Parameters

### pagesDirectory

`string`

### filePath

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`boolean`
