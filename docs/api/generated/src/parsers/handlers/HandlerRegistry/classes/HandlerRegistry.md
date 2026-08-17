[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/handlers/HandlerRegistry](../README.md) / HandlerRegistry

# Class: HandlerRegistry

Defined in: [src/parsers/handlers/HandlerRegistry.ts:111](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L111)

HandlerRegistry - Advanced handler registration and management system

## Constructors

### Constructor

> __new HandlerRegistry__(`engine`): `HandlerRegistry`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:120](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L120)

#### Parameters

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md) | `null`

#### Returns

`HandlerRegistry`

## Methods

### clearAll()

> __clearAll__(): `Promise`\<`void`\>

Defined in: [src/parsers/handlers/HandlerRegistry.ts:623](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L623)

Clear all handlers

#### Returns

`Promise`\<`void`\>

***

### disableHandler()

> __disableHandler__(`handlerId`): `boolean`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:484](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L484)

Disable handler by ID

#### Parameters

##### handlerId

`string`

Handler ID

#### Returns

`boolean`

True if successful

***

### enableHandler()

> __enableHandler__(`handlerId`): `boolean`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:469](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L469)

Enable handler by ID

#### Parameters

##### handlerId

`string`

Handler ID

#### Returns

`boolean`

True if successful

***

### exportState()

> __exportState__(): [`ExportedRegistryState`](../interfaces/ExportedRegistryState.md)

Defined in: [src/parsers/handlers/HandlerRegistry.ts:647](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L647)

Export registry state for persistence

#### Returns

[`ExportedRegistryState`](../interfaces/ExportedRegistryState.md)

Serializable registry state

***

### getHandler()

> __getHandler__(`handlerId`): [`default`](../../BaseSyntaxHandler/classes/default.md) \| `null`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:428](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L428)

Get handler by ID

#### Parameters

##### handlerId

`string`

Handler ID

#### Returns

[`default`](../../BaseSyntaxHandler/classes/default.md) \| `null`

Handler or null if not found

***

### getHandlersByPattern()

> __getHandlersByPattern__(`pattern`): [`default`](../../BaseSyntaxHandler/classes/default.md)[]

Defined in: [src/parsers/handlers/HandlerRegistry.ts:451](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L451)

Get handlers by pattern

#### Parameters

##### pattern

Pattern to match

`string` | `RegExp`

#### Returns

[`default`](../../BaseSyntaxHandler/classes/default.md)[]

Matching handlers

***

### getHandlersByPriority()

> __getHandlersByPriority__(`enabledOnly`): [`default`](../../BaseSyntaxHandler/classes/default.md)[]

Defined in: [src/parsers/handlers/HandlerRegistry.ts:437](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L437)

Get all handlers sorted by priority

#### Parameters

##### enabledOnly

`boolean` = `true`

Only return enabled handlers

#### Returns

[`default`](../../BaseSyntaxHandler/classes/default.md)[]

Handlers sorted by priority

***

### getInfo()

> __getInfo__(): [`RegistryInfo`](../interfaces/RegistryInfo.md)

Defined in: [src/parsers/handlers/HandlerRegistry.ts:660](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L660)

Get registry information

#### Returns

[`RegistryInfo`](../interfaces/RegistryInfo.md)

Registry information

***

### getStats()

> __getStats__(): [`ExtendedRegistryStats`](../interfaces/ExtendedRegistryStats.md)

Defined in: [src/parsers/handlers/HandlerRegistry.ts:498](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L498)

Get registry statistics

#### Returns

[`ExtendedRegistryStats`](../interfaces/ExtendedRegistryStats.md)

Registry statistics

***

### registerHandler()

> __registerHandler__(`handler`, `options`): `Promise`\<`boolean`\>

Defined in: [src/parsers/handlers/HandlerRegistry.ts:153](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L153)

Register a syntax handler with full validation and conflict detection

#### Parameters

##### handler

[`default`](../../BaseSyntaxHandler/classes/default.md)

Handler to register

##### options

[`RegistrationOptions`](../interfaces/RegistrationOptions.md) = `{}`

Registration options

#### Returns

`Promise`\<`boolean`\>

True if registration successful

***

### resetStats()

> __resetStats__(): `void`

Defined in: [src/parsers/handlers/HandlerRegistry.ts:522](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L522)

Reset all handler statistics

#### Returns

`void`

***

### resolveExecutionOrder()

> __resolveExecutionOrder__(): [`default`](../../BaseSyntaxHandler/classes/default.md)[]

Defined in: [src/parsers/handlers/HandlerRegistry.ts:542](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L542)

Resolve handler execution order considering dependencies

#### Returns

[`default`](../../BaseSyntaxHandler/classes/default.md)[]

Handlers in dependency-resolved order

***

### unregisterHandler()

> __unregisterHandler__(`handlerId`): `Promise`\<`boolean`\>

Defined in: [src/parsers/handlers/HandlerRegistry.ts:225](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L225)

Unregister a syntax handler

#### Parameters

##### handlerId

`string`

ID of handler to unregister

#### Returns

`Promise`\<`boolean`\>

True if unregistration successful

***

### validateDependencies()

> __validateDependencies__(): [`DependencyValidationError`](../interfaces/DependencyValidationError.md)[]

Defined in: [src/parsers/handlers/HandlerRegistry.ts:597](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/HandlerRegistry.ts#L597)

Validate all handler dependencies

#### Returns

[`DependencyValidationError`](../interfaces/DependencyValidationError.md)[]

Array of dependency validation errors
