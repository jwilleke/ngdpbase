[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/filters/FilterChain](../README.md) / default

# Class: default

Defined in: [src/parsers/filters/FilterChain.ts:180](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L180)

FilterChain - Modular content filtering pipeline

## Constructors

### Constructor

> __new default__(`engine`): `FilterChain`

Defined in: [src/parsers/filters/FilterChain.ts:189](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L189)

#### Parameters

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md) | `null`

#### Returns

`FilterChain`

## Methods

### addFilter()

> __addFilter__(`filter`, `_options`): `boolean`

Defined in: [src/parsers/filters/FilterChain.ts:304](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L304)

Add filter to the chain with modular configuration

#### Parameters

##### filter

[`default`](../../BaseFilter/classes/default.md)

Filter to add

##### \_options

`Record`\<`string`, `unknown`\> = `{}`

Registration options

#### Returns

`boolean`

True if added successfully

***

### clearAll()

> __clearAll__(): `Promise`\<`void`\>

Defined in: [src/parsers/filters/FilterChain.ts:784](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L784)

Clear all filters and reset state

#### Returns

`Promise`\<`void`\>

***

### disableFilter()

> __disableFilter__(`filterId`): `boolean`

Defined in: [src/parsers/filters/FilterChain.ts:669](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L669)

Disable filter by ID

#### Parameters

##### filterId

`string`

Filter ID

#### Returns

`boolean`

True if successful

***

### enableFilter()

> __enableFilter__(`filterId`): `boolean`

Defined in: [src/parsers/filters/FilterChain.ts:653](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L653)

Enable filter by ID

#### Parameters

##### filterId

`string`

Filter ID

#### Returns

`boolean`

True if successful

***

### exportState()

> __exportState__(): [`ExportedChainState`](../interfaces/ExportedChainState.md)

Defined in: [src/parsers/filters/FilterChain.ts:762](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L762)

Export filter chain state for persistence or debugging

#### Returns

[`ExportedChainState`](../interfaces/ExportedChainState.md)

Serializable state

***

### getConfiguration()

> __getConfiguration__(): [`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Defined in: [src/parsers/filters/FilterChain.ts:749](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L749)

Get configuration summary for debugging (modular introspection)

#### Returns

[`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Configuration summary

***

### getFilter()

> __getFilter__(`filterId`): [`default`](../../BaseFilter/classes/default.md) \| `null`

Defined in: [src/parsers/filters/FilterChain.ts:632](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L632)

Get filter by ID

#### Parameters

##### filterId

`string`

Filter ID

#### Returns

[`default`](../../BaseFilter/classes/default.md) \| `null`

Filter or null if not found

***

### getFilters()

> __getFilters__(`enabledOnly`): [`default`](../../BaseFilter/classes/default.md)[]

Defined in: [src/parsers/filters/FilterChain.ts:641](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L641)

Get all filters sorted by priority

#### Parameters

##### enabledOnly

`boolean` = `true`

Only return enabled filters

#### Returns

[`default`](../../BaseFilter/classes/default.md)[]

Filters sorted by priority

***

### getStats()

> __getStats__(): [`ExtendedFilterChainStats`](../interfaces/ExtendedFilterChainStats.md)

Defined in: [src/parsers/filters/FilterChain.ts:684](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L684)

Get comprehensive filter chain statistics (modular monitoring)

#### Returns

[`ExtendedFilterChainStats`](../interfaces/ExtendedFilterChainStats.md)

Filter chain statistics

***

### initialize()

> __initialize__(`context`): `Promise`\<`void`\>

Defined in: [src/parsers/filters/FilterChain.ts:211](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L211)

Initialize FilterChain with complete modular configuration

#### Parameters

##### context

[`FilterChainInitContext`](../interfaces/FilterChainInitContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

***

### loadModularConfiguration()

> __loadModularConfiguration__(): `void`

Defined in: [src/parsers/filters/FilterChain.ts:231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L231)

Load modular configuration from app-default-config.json and app-custom-config.json
Demonstrates complete configuration modularity and reusability

#### Returns

`void`

***

### process()

> __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/filters/FilterChain.ts:383](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L383)

Process content through the filter chain with modular execution

#### Parameters

##### content

`string`

Content to filter

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Filtered content

***

### removeFilter()

> __removeFilter__(`filterId`): `boolean`

Defined in: [src/parsers/filters/FilterChain.ts:344](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L344)

Remove filter from the chain

#### Parameters

##### filterId

`string`

Filter ID to remove

#### Returns

`boolean`

True if removed successfully

***

### resetStats()

> __resetStats__(): `void`

Defined in: [src/parsers/filters/FilterChain.ts:721](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L721)

Reset all filter statistics

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/filters/FilterChain.ts:804](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/FilterChain.ts#L804)

Shutdown filter chain

#### Returns

`Promise`\<`void`\>
