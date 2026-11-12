[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/linkedom](../README.md) / LinkedomElement

# Interface: LinkedomElement

Defined in: src/types/linkedom.d.ts:28

## Properties

### childNodes

> __childNodes__: [`LinkedomNodeList`](LinkedomNodeList.md)

Defined in: src/types/linkedom.d.ts:36

***

### className

> __className__: `string`

Defined in: src/types/linkedom.d.ts:32

***

### firstChild

> __firstChild__: [`LinkedomNode`](../type-aliases/LinkedomNode.md) \| `null`

Defined in: src/types/linkedom.d.ts:37

***

### innerHTML

> __innerHTML__: `string`

Defined in: src/types/linkedom.d.ts:29

***

### lastChild

> __lastChild__: [`LinkedomNode`](../type-aliases/LinkedomNode.md) \| `null`

Defined in: src/types/linkedom.d.ts:38

***

### nodeName

> __nodeName__: `string`

Defined in: src/types/linkedom.d.ts:34

***

### nodeType

> __nodeType__: `number`

Defined in: src/types/linkedom.d.ts:33

***

### outerHTML

> __outerHTML__: `string`

Defined in: src/types/linkedom.d.ts:30

***

### tagName

> __tagName__: `string`

Defined in: src/types/linkedom.d.ts:35

***

### textContent

> __textContent__: `string` \| `null`

Defined in: src/types/linkedom.d.ts:31

## Methods

### appendChild()

> __appendChild__(`node`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: src/types/linkedom.d.ts:42

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### getAttribute()

> __getAttribute__(`name`): `string` \| `null`

Defined in: src/types/linkedom.d.ts:40

#### Parameters

##### name

`string`

#### Returns

`string` \| `null`

***

### getElementsByClassName()

> __getElementsByClassName__(`className`): [`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

Defined in: src/types/linkedom.d.ts:50

#### Parameters

##### className

`string`

#### Returns

[`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

***

### getElementsByTagName()

> __getElementsByTagName__(`tagName`): [`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

Defined in: src/types/linkedom.d.ts:51

#### Parameters

##### tagName

`string`

#### Returns

[`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

***

### insertBefore()

> __insertBefore__(`newNode`, `referenceNode`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: src/types/linkedom.d.ts:43

#### Parameters

##### newNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

##### referenceNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md) \| `null`

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### querySelector()

> __querySelector__(`selector`): `LinkedomElement` \| `null`

Defined in: src/types/linkedom.d.ts:48

#### Parameters

##### selector

`string`

#### Returns

`LinkedomElement` \| `null`

***

### querySelectorAll()

> __querySelectorAll__(`selector`): `LinkedomElement`[]

Defined in: src/types/linkedom.d.ts:49

#### Parameters

##### selector

`string`

#### Returns

`LinkedomElement`[]

***

### remove()

> __remove__(): `void`

Defined in: src/types/linkedom.d.ts:47

#### Returns

`void`

***

### removeAttribute()

> __removeAttribute__(`name`): `void`

Defined in: src/types/linkedom.d.ts:41

#### Parameters

##### name

`string`

#### Returns

`void`

***

### removeChild()

> __removeChild__(`node`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: src/types/linkedom.d.ts:44

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### replaceChild()

> __replaceChild__(`newNode`, `oldNode`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: src/types/linkedom.d.ts:45

#### Parameters

##### newNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

##### oldNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### replaceWith()

> __replaceWith__(`node`): `void`

Defined in: src/types/linkedom.d.ts:46

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

`void`

***

### setAttribute()

> __setAttribute__(`name`, `value`): `void`

Defined in: src/types/linkedom.d.ts:39

#### Parameters

##### name

`string`

##### value

`string`

#### Returns

`void`
