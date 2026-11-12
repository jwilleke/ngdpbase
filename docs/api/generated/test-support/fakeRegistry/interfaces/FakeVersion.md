[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [test-support/fakeRegistry](../README.md) / FakeVersion

# Interface: FakeVersion

Defined in: src/test-support/fakeRegistry.ts:71

## Properties

### attestations?

> `optional` __attestations?__: `unknown`

Defined in: src/test-support/fakeRegistry.ts:78

false: the release carries no attestations. Otherwise the registry answers this body for them.

***

### integrity?

> `optional` __integrity?__: `string`

Defined in: src/test-support/fakeRegistry.ts:76

Override dist.integrity (to simulate a mismatch).

***

### manifest?

> `optional` __manifest?__: `Record`\<`string`, `unknown`\>

Defined in: src/test-support/fakeRegistry.ts:74

Manifest fields the packument reports (defaults to what the tarball's package.json says).

***

### tgz

> __tgz__: `Buffer`

Defined in: src/test-support/fakeRegistry.ts:72
