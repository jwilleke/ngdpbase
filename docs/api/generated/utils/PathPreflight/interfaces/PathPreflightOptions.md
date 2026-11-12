[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/PathPreflight](../README.md) / PathPreflightOptions

# Interface: PathPreflightOptions

Defined in: src/utils/PathPreflight.ts:31

Test seams. Production passes none of these.

## Properties

### isDirectory?

> `optional` __isDirectory?__: (`path`) => `boolean`

Defined in: src/utils/PathPreflight.ts:40

How to test for a mounted directory. Defaults to `fs.statSync`.

#### Parameters

##### path

`string`

#### Returns

`boolean`

***

### platform?

> `optional` __platform?__: `Platform`

Defined in: src/utils/PathPreflight.ts:38

Which platform to check as. Defaults to the real one.

Injected rather than stubbed on `process`, because mutating a global for
the duration of a test leaks into anything running in parallel.
