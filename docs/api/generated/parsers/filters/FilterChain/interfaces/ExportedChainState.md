[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/FilterChain](../README.md) / ExportedChainState

# Interface: ExportedChainState

Defined in: src/parsers/filters/FilterChain.ts:177

Exported chain state

## Properties

### config

> __config__: [`FilterChainConfig`](FilterChainConfig.md)

Defined in: src/parsers/filters/FilterChain.ts:178

***

### filters

> __filters__: [`ExportedFilterInfo`](ExportedFilterInfo.md)[]

Defined in: src/parsers/filters/FilterChain.ts:182

***

### stats

> __stats__: `Omit`\<[`FilterChainStats`](FilterChainStats.md), `"filterExecutions"`\> & `object`

Defined in: src/parsers/filters/FilterChain.ts:179

#### Type Declaration

##### filterExecutions

> __filterExecutions__: `Record`\<`string`, [`FilterExecutionStats`](FilterExecutionStats.md)\>
