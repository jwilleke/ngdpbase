[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/context/ParseContext](../README.md) / WikiContextLike

# Interface: WikiContextLike

Defined in: src/parsers/context/ParseContext.ts:82

Minimal WikiContext interface for the parser side (#629).

ParseContext holds a reference to its parent WikiContext so user/page-data
fields don't have to be copied. We define a structural interface here rather
than importing the full WikiContext class to avoid coupling the parser
package to context internals (and to side-step circular imports).

Only the fields/methods ParseContext needs to delegate are listed.

## Properties

### engine

> `readonly` __engine__: [`WikiEngine`](WikiEngine.md)

Defined in: src/parsers/context/ParseContext.ts:83

***

### pageMetadata

> `readonly` __pageMetadata__: [`PageFrontmatter`](PageFrontmatter.md) \| `null`

Defined in: src/parsers/context/ParseContext.ts:86

***

### pageName

> `readonly` __pageName__: `string` \| `null`

Defined in: src/parsers/context/ParseContext.ts:84

***

### userContext

> `readonly` __userContext__: [`UserContext`](UserContext.md) \| `null`

Defined in: src/parsers/context/ParseContext.ts:85

## Methods

### canAccess()

> __canAccess__(`action`): `Promise`\<`boolean`\>

Defined in: src/parsers/context/ParseContext.ts:88

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getPrincipals()

> __getPrincipals__(): `string`[]

Defined in: src/parsers/context/ParseContext.ts:91

#### Returns

`string`[]

***

### hasPermission()

> __hasPermission__(`action`): `Promise`\<`boolean`\>

Defined in: src/parsers/context/ParseContext.ts:87

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

***

### mayShow()

> __mayShow__(`action`): `Promise`\<`boolean`\>

Defined in: src/parsers/context/ParseContext.ts:90

The non-recording affordance for display gates (#1668) — see WikiContext.mayShow.

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`boolean`\>
