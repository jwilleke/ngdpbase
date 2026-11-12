[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/version](../README.md) / applyVersionToLock

# Function: applyVersionToLock()

> __applyVersionToLock__(`lock`, `newVersion`): [`PackageLock`](../interfaces/PackageLock.md)

Defined in: src/utils/version.ts:171

Set the project's own version in a parsed lockfile — the pure half of
updatePackageLock, split out so the mapping is testable without
touching the filesystem.

Writes exactly two fields: the top-level `version` and the root package entry
`packages[""].version`. Dependency entries are never touched — only npm may
change those, and rewriting one here would corrupt resolution.

## Parameters

### lock

[`PackageLock`](../interfaces/PackageLock.md)

Parsed lockfile (mutated in place and returned)

### newVersion

`string`

New version string

## Returns

[`PackageLock`](../interfaces/PackageLock.md)

The same object, for convenient chaining
