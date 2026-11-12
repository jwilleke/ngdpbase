[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/linkedom](../README.md) / LinkedomDocument

# Interface: LinkedomDocument

Defined in: src/types/linkedom.d.ts:54

## Properties

### body

> __body__: [`LinkedomElement`](LinkedomElement.md)

Defined in: src/types/linkedom.d.ts:55

***

### documentElement?

> `optional` __documentElement?__: [`LinkedomElement`](LinkedomElement.md)

Defined in: src/types/linkedom.d.ts:56

## Methods

### createComment()

> __createComment__(`text`): [`LinkedomComment`](LinkedomComment.md)

Defined in: src/types/linkedom.d.ts:59

#### Parameters

##### text

`string`

#### Returns

[`LinkedomComment`](LinkedomComment.md)

***

### createElement()

> __createElement__(`tag`): [`LinkedomElement`](LinkedomElement.md)

Defined in: src/types/linkedom.d.ts:57

#### Parameters

##### tag

`string`

#### Returns

[`LinkedomElement`](LinkedomElement.md)

***

### createTextNode()

> __createTextNode__(`text`): [`LinkedomText`](LinkedomText.md)

Defined in: src/types/linkedom.d.ts:58

#### Parameters

##### text

`string`

#### Returns

[`LinkedomText`](LinkedomText.md)

***

### getElementById()

> __getElementById__(`id`): [`LinkedomElement`](LinkedomElement.md) \| `null`

Defined in: src/types/linkedom.d.ts:60

#### Parameters

##### id

`string`

#### Returns

[`LinkedomElement`](LinkedomElement.md) \| `null`

***

### querySelector()

> __querySelector__(`selector`): [`LinkedomElement`](LinkedomElement.md) \| `null`

Defined in: src/types/linkedom.d.ts:61

#### Parameters

##### selector

`string`

#### Returns

[`LinkedomElement`](LinkedomElement.md) \| `null`

***

### querySelectorAll()

> __querySelectorAll__(`selector`): [`LinkedomElement`](LinkedomElement.md)[]

Defined in: src/types/linkedom.d.ts:62

#### Parameters

##### selector

`string`

#### Returns

[`LinkedomElement`](LinkedomElement.md)[]

***

### toString()

> __toString__(): `string`

Defined in: src/types/linkedom.d.ts:64

The whole document as HTML, its doctype included.

#### Returns

`string`
