[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceRunRequest

# Interface: IceRunRequest

Defined in: src/ice/types.ts:520

One import, as a caller asks for it.

## Properties

### options?

> `optional` __options?__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/types.ts:543

Options for this run's shims, over the site's (`ShimTools.options`): a
feed source's parse settings (#2109). Server-built; never a value a
client sent.

***

### original?

> `optional` __original?__: [`OriginalChoice`](../type-aliases/OriginalChoice.md)

Defined in: src/ice/types.ts:527

D11. Default `ngdpbase.import.engine.default-original`.

***

### receiver

> __receiver__: `string`

Defined in: src/ice/types.ts:523

The receiver id the results go to: `core.pages`, `phr.health-records`.

***

### scope?

> `optional` __scope?__: `string`

Defined in: src/ice/types.ts:537

A narrower ledger scope within the caller's own (#2013). The engine binds
every run's scope to the receiver and to the user it runs as (their
identity `@id`, else their username): the same file imported again by
the same user into the same receiver is skipped. A caller with its own
notion of a source (phr's source id) passes it to keep those apart; it
can never reach another user's or another receiver's scope. Never pass a
value a client sent.

***

### shim?

> `optional` __shim?__: `string`

Defined in: src/ice/types.ts:525

Pin the first shim (a format the person chose) instead of detecting one.

***

### source

> __source__: [`IceSource`](../type-aliases/IceSource.md)

Defined in: src/ice/types.ts:521

***

### target?

> `optional` __target?__: `string`

Defined in: src/ice/types.ts:549

The place within the receiver (#2118), for a receiver with `targets`:
one of those it gives the user the run is for. Required for such a
receiver and refused for any other.
