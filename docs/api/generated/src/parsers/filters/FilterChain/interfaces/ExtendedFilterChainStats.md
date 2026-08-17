[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/filters/FilterChain](../README.md) / ExtendedFilterChainStats

# Interface: ExtendedFilterChainStats

Defined in: [src/parsers/filters/FilterChain.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L131)

Extended filter chain statistics

## Properties

### chain

> __chain__: [`ChainStatsSummary`](ChainStatsSummary.md)

Defined in: [src/parsers/filters/FilterChain.ts:132](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L132)

***

### configuration

> __configuration__: `object`

Defined in: [src/parsers/filters/FilterChain.ts:134](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L134)

#### enabled

> __enabled__: `boolean`

#### enableProfiling

> __enableProfiling__: `boolean`

#### failOnError

> __failOnError__: `boolean`

#### maxFilters

> __maxFilters__: `number`

#### timeout

> __timeout__: `number`

***

### filters

> __filters__: `Record`\<`string`, [`FilterExecutionStats`](FilterExecutionStats.md) & `object`\>

Defined in: [src/parsers/filters/FilterChain.ts:133](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L133)

***

### performance

> __performance__: \{ `alertThresholds`: [`AlertThresholds`](AlertThresholds.md); `recentExecutionCount`: `number`; \} \| `null`

Defined in: [src/parsers/filters/FilterChain.ts:141](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L141)
