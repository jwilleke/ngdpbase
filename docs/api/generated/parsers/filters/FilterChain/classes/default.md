[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/FilterChain](../README.md) / default

# Class: default

Defined in: src/parsers/filters/FilterChain.ts:197

FilterChain - Modular content filtering pipeline

## Constructors

### Constructor

> __new default__(`engine?`): `FilterChain`

Defined in: src/parsers/filters/FilterChain.ts:206

#### Parameters

##### engine?

[`WikiEngine`](../interfaces/WikiEngine.md) \| `null` = `null`

#### Returns

`FilterChain`

## Methods

### addFilter()

> __addFilter__(`filter`, `_options?`): `boolean`

Defined in: src/parsers/filters/FilterChain.ts:320

Add filter to the chain with modular configuration

#### Parameters

##### filter

[`default`](../../BaseFilter/classes/default.md)

Filter to add

##### \_options?

`Record`\<`string`, `unknown`\> = `{}`

Registration options

#### Returns

`boolean`

True if added successfully

***

### clearAll()

> __clearAll__(): `Promise`\<`void`\>

Defined in: src/parsers/filters/FilterChain.ts:851

Clear all filters and reset state

#### Returns

`Promise`\<`void`\>

***

### collectErrors()

> __collectErrors__(`content`, `context`, `phase?`): `Promise`\<[`FilterValidationError`](../interfaces/FilterValidationError.md)[]\>

Defined in: src/parsers/filters/FilterChain.ts:462

Collect error-severity rule violations across all enabled filters without
mutating content. Used by the save path to decide whether to block a save
and what structured errors to surface to the editor (#596).

Each filter that opts in exposes its own async `collectErrors(content,
context)` returning a `FilterValidationError[]`. Filters without that
method are skipped silently — they participate in render-time `process()`
only.

#### Parameters

##### content

`string`

Content to validate

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

##### phase?

[`FilterPhase`](../../BaseFilter/type-aliases/FilterPhase.md)

#### Returns

`Promise`\<[`FilterValidationError`](../interfaces/FilterValidationError.md)[]\>

Aggregated error-severity violations from all enabled filters

***

### disableFilter()

> __disableFilter__(`filterId`): `boolean`

Defined in: src/parsers/filters/FilterChain.ts:736

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

Defined in: src/parsers/filters/FilterChain.ts:720

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

Defined in: src/parsers/filters/FilterChain.ts:829

Export filter chain state for persistence or debugging

#### Returns

[`ExportedChainState`](../interfaces/ExportedChainState.md)

Serializable state

***

### getConfiguration()

> __getConfiguration__(): [`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Defined in: src/parsers/filters/FilterChain.ts:816

Get configuration summary for debugging (modular introspection)

#### Returns

[`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Configuration summary

***

### getFilter()

> __getFilter__(`filterId`): [`default`](../../BaseFilter/classes/default.md) \| `null`

Defined in: src/parsers/filters/FilterChain.ts:699

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

> __getFilters__(`enabledOnly?`): [`default`](../../BaseFilter/classes/default.md)[]

Defined in: src/parsers/filters/FilterChain.ts:708

Get all filters sorted by priority

#### Parameters

##### enabledOnly?

`boolean` = `true`

Only return enabled filters

#### Returns

[`default`](../../BaseFilter/classes/default.md)[]

Filters sorted by priority

***

### getStats()

> __getStats__(): [`ExtendedFilterChainStats`](../interfaces/ExtendedFilterChainStats.md)

Defined in: src/parsers/filters/FilterChain.ts:751

Get comprehensive filter chain statistics (modular monitoring)

#### Returns

[`ExtendedFilterChainStats`](../interfaces/ExtendedFilterChainStats.md)

Filter chain statistics

***

### initialize()

> __initialize__(`context?`): `Promise`\<`void`\>

Defined in: src/parsers/filters/FilterChain.ts:227

Initialize FilterChain with complete modular configuration

#### Parameters

##### context?

[`FilterChainInitContext`](../interfaces/FilterChainInitContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

***

### loadModularConfiguration()

> __loadModularConfiguration__(): `void`

Defined in: src/parsers/filters/FilterChain.ts:247

Load modular configuration from app-default-config.json and app-custom-config.json
Demonstrates complete configuration modularity and reusability

#### Returns

`void`

***

### process()

> __process__(`content`, `context`, `phase?`): `Promise`\<`string`\>

Defined in: src/parsers/filters/FilterChain.ts:399

Process content through the filter chain with modular execution

#### Parameters

##### content

`string`

Content to filter

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

##### phase?

[`FilterPhase`](../../BaseFilter/type-aliases/FilterPhase.md)

#### Returns

`Promise`\<`string`\>

Filtered content

***

### removeFilter()

> __removeFilter__(`filterId`): `boolean`

Defined in: src/parsers/filters/FilterChain.ts:360

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

Defined in: src/parsers/filters/FilterChain.ts:788

Reset all filter statistics

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/filters/FilterChain.ts:871

Shutdown filter chain

#### Returns

`Promise`\<`void`\>
