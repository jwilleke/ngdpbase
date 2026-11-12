[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/searchExportSource](../README.md) / SearchExportDeps

# Interface: SearchExportDeps

Defined in: src/ice/searchExportSource.ts:123

## Properties

### engine

> __engine__: `Manager`

Defined in: src/ice/searchExportSource.ts:124

## Methods

### allowed()

> __allowed__(`ctx`): `Promise`\<`boolean`\>

Defined in: src/ice/searchExportSource.ts:131

Does this user hold `page-export` now? Throws the step-up answer when it needs a fresh sign-in.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### limits()

> __limits__(): `object`

Defined in: src/ice/searchExportSource.ts:127

#### Returns

`object`

##### maxBytes

> __maxBytes__: `number`

##### maxItems

> __maxItems__: `number`

***

### mayExportPage()

> __mayExportPage__(`ctx`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/ice/searchExportSource.ts:126

May this user export this page alone (`page-export` for it, in its private store or shared folder)?

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### offered()

> __offered__(`ctx`): `Promise`\<`boolean`\>

Defined in: src/ice/searchExportSource.ts:129

Is the Export action for a search offered to this user (page-export held)?

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

***

### permits()

> __permits__(`ctx`, `permission`): `Promise`\<`boolean`\>

Defined in: src/ice/searchExportSource.ts:132

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### permission

`string`

#### Returns

`Promise`\<`boolean`\>
