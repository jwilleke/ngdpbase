[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceOriginalChoices

# Interface: IceOriginalChoices

Defined in: src/ice/types.ts:244

D11: the original-file choices a receiver offers, and which one is chosen
when the user picks none (#2021). The import screen offers only `allowed`,
and the engine refuses a run asking for any other.

## Properties

### allowed

> __allowed__: [`OriginalChoice`](../type-aliases/OriginalChoice.md)[]

Defined in: src/ice/types.ts:245

***

### default?

> `optional` __default?__: [`OriginalChoice`](../type-aliases/OriginalChoice.md)

Defined in: src/ice/types.ts:247

One of `allowed`. Default: `ngdpbase.import.engine.default-original` when allowed, else the first allowed.

***

### types?

> `optional` __types?__: `string`[]

Defined in: src/ice/types.ts:255

The media types this receiver keeps (#2061), exactly, e.g.
`['application/json', 'application/x-ndjson', 'text/xml']`: no wildcards.
For a keep at upload into the receiver's own vault, the upload door
allows these even when the site's attachment allow-list does not
([OriginalKeep](OriginalKeep.md)). Every other upload still uses the site's list.
