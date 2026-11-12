[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/FilterChain](../README.md) / ExtendedFilterChainStats

# Interface: ExtendedFilterChainStats

Defined in: src/parsers/filters/FilterChain.ts:148

Extended filter chain statistics

## Properties

### chain

> __chain__: [`ChainStatsSummary`](ChainStatsSummary.md)

Defined in: src/parsers/filters/FilterChain.ts:149

***

### configuration

> __configuration__: `object`

Defined in: src/parsers/filters/FilterChain.ts:151

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

Defined in: src/parsers/filters/FilterChain.ts:150

***

### performance

> __performance__: \{ `alertThresholds`: [`AlertThresholds`](AlertThresholds.md); `recentExecutionCount`: `number`; \} \| `null`

Defined in: src/parsers/filters/FilterChain.ts:158
