[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonsPathResolver](../README.md) / SplitAddonsPath

# Interface: SplitAddonsPath

Defined in: src/utils/addonsPathResolver.ts:18

## Properties

### directories

> __directories__: `string`[]

Defined in: src/utils/addonsPathResolver.ts:20

Plain directory entries (bundled/drop-in), not yet resolved to absolute.

***

### retired

> __retired__: `string`[]

Defined in: src/utils/addonsPathResolver.ts:22

Retired `node_modules:` entries (#2102): ignored; AddonsManager warns about them once at start.
