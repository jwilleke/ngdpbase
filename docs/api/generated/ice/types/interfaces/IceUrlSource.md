[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceUrlSource

# Interface: IceUrlSource

Defined in: src/ice/types.ts:496

A URL the engine fetches as the run's one file (D1, D10, #2109): through
the one guarded path (`guardedFetch`, #1139) with the site's egress policy
and default User-Agent, and the source's own headers and timeout (#1959),
which also apply to every follow-up fetch a shim asks of the engine during
the run. A feed's schedule is its owner's job; the engine fetches when run.

## Properties

### headers?

> `optional` __headers?__: `Record`\<`string`, `string`\>

Defined in: src/ice/types.ts:502

Request headers for every fetch of the run (a `User-Agent` replaces the site default).

***

### metadata?

> `optional` __metadata?__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/types.ts:510

Facts the source states about the file, carried on it and on every item
read from it (a feed source's id). The engine adds `sourceUrl`, the URL
fetched, so a shim can resolve the file's relative links.

***

### name?

> `optional` __name?__: `string`

Defined in: src/ice/types.ts:500

The name the fetched file gets in reports and the ledger. Default: the URL.

***

### timeoutMs?

> `optional` __timeoutMs?__: `number`

Defined in: src/ice/types.ts:504

Each fetch's time limit, ms. Default `ngdpbase.fetch-timeout-ms`.

***

### type

> __type__: `"url"`

Defined in: src/ice/types.ts:497

***

### url

> __url__: `string`

Defined in: src/ice/types.ts:498
