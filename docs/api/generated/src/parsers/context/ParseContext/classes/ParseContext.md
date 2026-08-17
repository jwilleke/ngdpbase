[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/context/ParseContext](../README.md) / ParseContext

# Class: ParseContext

Defined in: [src/parsers/context/ParseContext.ts:129](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L129)

ParseContext - Context object for markup parsing operations

## Constructors

### Constructor

> __new ParseContext__(`content`, `context`, `engine`): `ParseContext`

Defined in: [src/parsers/context/ParseContext.ts:149](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L149)

#### Parameters

##### content

`string`

##### context

[`ParseContextOptions`](../type-aliases/ParseContextOptions.md)

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md)

#### Returns

`ParseContext`

## Properties

### engine

> `readonly` __engine__: [`WikiEngine`](../interfaces/WikiEngine.md)

Defined in: [src/parsers/context/ParseContext.ts:132](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L132)

***

### handlerResults

> __handlerResults__: `Map`\<`string`, `unknown`\>

Defined in: [src/parsers/context/ParseContext.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L142)

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: [src/parsers/context/ParseContext.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L143)

***

### originalContent

> `readonly` __originalContent__: `string`

Defined in: [src/parsers/context/ParseContext.ts:130](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L130)

***

### pageContext

> `readonly` __pageContext__: [`PageContext`](../interfaces/PageContext.md)

Defined in: [src/parsers/context/ParseContext.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L131)

***

### pageName

> `readonly` __pageName__: `string`

Defined in: [src/parsers/context/ParseContext.ts:133](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L133)

***

### protectedBlocks

> __protectedBlocks__: `unknown`[]

Defined in: [src/parsers/context/ParseContext.ts:139](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L139)

***

### requestInfo

> `readonly` __requestInfo__: [`RequestInfo`](../interfaces/RequestInfo.md) \| `null`

Defined in: [src/parsers/context/ParseContext.ts:136](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L136)

***

### syntaxTokens

> __syntaxTokens__: `unknown`[]

Defined in: [src/parsers/context/ParseContext.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L140)

***

### userContext

> `readonly` __userContext__: [`UserContext`](../interfaces/UserContext.md) \| `null`

Defined in: [src/parsers/context/ParseContext.ts:135](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L135)

***

### userName

> `readonly` __userName__: `string`

Defined in: [src/parsers/context/ParseContext.ts:134](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L134)

***

### variables

> __variables__: `Map`\<`string`, `unknown`\>

Defined in: [src/parsers/context/ParseContext.ts:141](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L141)

## Methods

### clone()

> __clone__(`overrides`): `ParseContext`

Defined in: [src/parsers/context/ParseContext.ts:352](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L352)

Clone context for sub-processing

#### Parameters

##### overrides

`Partial`\<[`PageContext`](../interfaces/PageContext.md)\> = `{}`

Properties to override

#### Returns

`ParseContext`

New context instance

***

### createErrorContext()

> __createErrorContext__(`error`, `phase`): [`ParseErrorContext`](../interfaces/ParseErrorContext.md)

Defined in: [src/parsers/context/ParseContext.ts:374](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L374)

Create error context for debugging

#### Parameters

##### error

`Error`

Error that occurred

##### phase

`string`

Phase where error occurred

#### Returns

[`ParseErrorContext`](../interfaces/ParseErrorContext.md)

Error context

***

### exportForCache()

> __exportForCache__(): [`CachedContextData`](../interfaces/CachedContextData.md)

Defined in: [src/parsers/context/ParseContext.ts:408](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L408)

Export context data for caching

#### Returns

[`CachedContextData`](../interfaces/CachedContextData.md)

Serializable context data

***

### getHandlerResult()

> __getHandlerResult__(`handlerId`): `unknown`

Defined in: [src/parsers/context/ParseContext.ts:293](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L293)

Get handler result

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`unknown`

Handler result or null

***

### getManager()

> __getManager__(`managerName`): `unknown`

Defined in: [src/parsers/context/ParseContext.ts:205](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L205)

Get manager instance from engine

#### Parameters

##### managerName

`string`

Name of manager to retrieve

#### Returns

`unknown`

Manager instance or null

***

### getMetadata()

> __getMetadata__(`key`, `defaultValue`): `unknown`

Defined in: [src/parsers/context/ParseContext.ts:315](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L315)

Get metadata value

#### Parameters

##### key

`string`

Metadata key

##### defaultValue

`unknown` = `null`

Default value if not found

#### Returns

`unknown`

Metadata value

***

### getPhaseTiming()

> __getPhaseTiming__(`phaseName`): `number`

Defined in: [src/parsers/context/ParseContext.ts:335](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L335)

Get phase timing

#### Parameters

##### phaseName

`string`

Name of phase

#### Returns

`number`

Duration in milliseconds or 0

***

### getSummary()

> __getSummary__(): [`ContextSummary`](../interfaces/ContextSummary.md)

Defined in: [src/parsers/context/ParseContext.ts:390](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L390)

Get context summary for logging

#### Returns

[`ContextSummary`](../interfaces/ContextSummary.md)

Context summary

***

### getTotalTime()

> __getTotalTime__(): `number`

Defined in: [src/parsers/context/ParseContext.ts:343](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L343)

Get total processing time

#### Returns

`number`

Total time in milliseconds

***

### getUserRoles()

> __getUserRoles__(): `string`[]

Defined in: [src/parsers/context/ParseContext.ts:242](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L242)

Get user roles

#### Returns

`string`[]

Array of user roles

***

### getVariable()

> __getVariable__(`name`, `defaultValue`): `unknown`

Defined in: [src/parsers/context/ParseContext.ts:273](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L273)

Get variable value

#### Parameters

##### name

`string`

Variable name

##### defaultValue

`unknown` = `null`

Default value if not found

#### Returns

`unknown`

Variable value

***

### hasPermission()

> __hasPermission__(`permission`, `resource`): `boolean`

Defined in: [src/parsers/context/ParseContext.ts:223](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L223)

Check if user has specific permission

#### Parameters

##### permission

`string`

Permission to check

##### resource

Resource context (optional)

`string` | `null`

#### Returns

`boolean`

True if user has permission

***

### hasRole()

> __hasRole__(`role`): `boolean`

Defined in: [src/parsers/context/ParseContext.ts:254](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L254)

Check if user has specific role

#### Parameters

##### role

`string`

Role to check

#### Returns

`boolean`

True if user has role

***

### importFromCache()

> __importFromCache__(`data`): `void`

Defined in: [src/parsers/context/ParseContext.ts:427](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L427)

Import context data from cache

#### Parameters

##### data

[`CachedContextData`](../interfaces/CachedContextData.md)

Cached context data

#### Returns

`void`

***

### isAuthenticated()

> __isAuthenticated__(): `boolean`

Defined in: [src/parsers/context/ParseContext.ts:213](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L213)

Check if user is authenticated

#### Returns

`boolean`

True if user is authenticated

***

### recordPhaseTiming()

> __recordPhaseTiming__(`phaseName`, `duration`): `void`

Defined in: [src/parsers/context/ParseContext.ts:326](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L326)

Record phase timing

#### Parameters

##### phaseName

`string`

Name of phase

##### duration

`number`

Duration in milliseconds

#### Returns

`void`

***

### setHandlerResult()

> __setHandlerResult__(`handlerId`, `result`): `void`

Defined in: [src/parsers/context/ParseContext.ts:284](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L284)

Store handler result

#### Parameters

##### handlerId

`string`

Handler identifier

##### result

`unknown`

Handler result

#### Returns

`void`

***

### setMetadata()

> __setMetadata__(`key`, `value`): `void`

Defined in: [src/parsers/context/ParseContext.ts:304](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L304)

Set metadata value

#### Parameters

##### key

`string`

Metadata key

##### value

`unknown`

Metadata value

#### Returns

`void`

***

### setVariable()

> __setVariable__(`name`, `value`): `void`

Defined in: [src/parsers/context/ParseContext.ts:263](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/context/ParseContext.ts#L263)

Set variable value

#### Parameters

##### name

`string`

Variable name

##### value

`unknown`

Variable value

#### Returns

`void`
