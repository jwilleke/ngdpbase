[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / AddonSiteCriticalLayer

# Interface: AddonSiteCriticalLayer

Defined in: src/utils/addonConfigLayer.ts:431

## Properties

### problems

> __problems__: `string`[]

Defined in: src/utils/addonConfigLayer.ts:436

***

### refused

> __refused__: `Map`\<`string`, `string`\>

Defined in: src/utils/addonConfigLayer.ts:435

Addons whose value is not exactly `true` or `false`, by slug, with why: never loaded.

***

### siteCritical

> __siteCritical__: `Map`\<`string`, `boolean`\>

Defined in: src/utils/addonConfigLayer.ts:433

Each addon with a value, by slug: true when its failure to load puts the site in maintenance mode.
