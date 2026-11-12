[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / evaluateSeededAddonPage

# Function: evaluateSeededAddonPage()

> __evaluateSeededAddonPage__(`args`): [`SeededAddonPageStatus`](../type-aliases/SeededAddonPageStatus.md)

Defined in: src/utils/addonPageSync.ts:53

Decide what should happen to an already-seeded addon page, given its source
body, its current live body, and the `addon-source-hash` stamped at seed time.

- `current`          — live body already matches source; nothing to do.
- `outdated`         — source changed and the live page is unmodified since
                        seed (stored hash matches live), OR the page is legacy
                        (no stored hash — pre-#920 seed; treated as reseedable
                        since the previous body is kept as a revertable version).
                        Safe to reseed.
- `locally-modified` — source changed but the live body differs from what was
                        last seeded (⇒ operator-edited). Skip; never clobber.

## Parameters

### args

#### liveContent

`string`

#### sourceContent

`string`

#### storedHash

`string` \| `undefined`

## Returns

[`SeededAddonPageStatus`](../type-aliases/SeededAddonPageStatus.md)
