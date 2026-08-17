[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/filters/FilterChain](../README.md) / ExportedChainState

# Interface: ExportedChainState

Defined in: [src/parsers/filters/FilterChain.ts:160](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L160)

Exported chain state

## Properties

### config

> __config__: [`FilterChainConfig`](FilterChainConfig.md)

Defined in: [src/parsers/filters/FilterChain.ts:161](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L161)

***

### filters

> __filters__: [`ExportedFilterInfo`](ExportedFilterInfo.md)[]

Defined in: [src/parsers/filters/FilterChain.ts:165](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L165)

***

### stats

> __stats__: `Omit`\<[`FilterChainStats`](FilterChainStats.md), `"filterExecutions"`\> & `object`

Defined in: [src/parsers/filters/FilterChain.ts:162](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L162)

#### Type Declaration

##### filterExecutions

> __filterExecutions__: `Record`\<`string`, [`FilterExecutionStats`](FilterExecutionStats.md)\>
