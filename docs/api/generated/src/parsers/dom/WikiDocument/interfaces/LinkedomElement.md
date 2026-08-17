[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/WikiDocument](../README.md) / LinkedomElement

# Interface: LinkedomElement

Defined in: [src/parsers/dom/WikiDocument.ts:36](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L36)

## Properties

### childNodes

> __childNodes__: [`LinkedomNodeList`](LinkedomNodeList.md)

Defined in: [src/parsers/dom/WikiDocument.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L42)

***

### className

> __className__: `string`

Defined in: [src/parsers/dom/WikiDocument.ts:39](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L39)

***

### firstChild

> __firstChild__: [`LinkedomNode`](../type-aliases/LinkedomNode.md) \| `null`

Defined in: [src/parsers/dom/WikiDocument.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L43)

***

### innerHTML

> __innerHTML__: `string`

Defined in: [src/parsers/dom/WikiDocument.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L37)

***

### lastChild

> __lastChild__: [`LinkedomNode`](../type-aliases/LinkedomNode.md) \| `null`

Defined in: [src/parsers/dom/WikiDocument.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L44)

***

### nodeType

> __nodeType__: `number`

Defined in: [src/parsers/dom/WikiDocument.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L40)

***

### tagName

> __tagName__: `string`

Defined in: [src/parsers/dom/WikiDocument.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L41)

***

### textContent

> __textContent__: `string`

Defined in: [src/parsers/dom/WikiDocument.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L38)

## Methods

### appendChild()

> __appendChild__(`node`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: [src/parsers/dom/WikiDocument.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L47)

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### getAttribute()

> __getAttribute__(`name`): `string` \| `null`

Defined in: [src/parsers/dom/WikiDocument.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L46)

#### Parameters

##### name

`string`

#### Returns

`string` \| `null`

***

### getElementsByClassName()

> __getElementsByClassName__(`className`): [`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

Defined in: [src/parsers/dom/WikiDocument.ts:55](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L55)

#### Parameters

##### className

`string`

#### Returns

[`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

***

### getElementsByTagName()

> __getElementsByTagName__(`tagName`): [`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

Defined in: [src/parsers/dom/WikiDocument.ts:56](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L56)

#### Parameters

##### tagName

`string`

#### Returns

[`LinkedomHTMLCollection`](LinkedomHTMLCollection.md)

***

### insertBefore()

> __insertBefore__(`newNode`, `referenceNode`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: [src/parsers/dom/WikiDocument.ts:48](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L48)

#### Parameters

##### newNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

##### referenceNode

[`LinkedomNode`](../type-aliases/LinkedomNode.md) | `null`

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### querySelector()

> __querySelector__(`selector`): `LinkedomElement` \| `null`

Defined in: [src/parsers/dom/WikiDocument.ts:53](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L53)

#### Parameters

##### selector

`string`

#### Returns

`LinkedomElement` \| `null`

***

### querySelectorAll()

> __querySelectorAll__(`selector`): [`LinkedomNodeList`](LinkedomNodeList.md)

Defined in: [src/parsers/dom/WikiDocument.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L54)

#### Parameters

##### selector

`string`

#### Returns

[`LinkedomNodeList`](LinkedomNodeList.md)

***

### remove()

> __remove__(): `void`

Defined in: [src/parsers/dom/WikiDocument.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L52)

#### Returns

`void`

***

### removeChild()

> __removeChild__(`node`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: [src/parsers/dom/WikiDocument.ts:49](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L49)

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

***

### replaceChild()

> __replaceChild__(`newNode`, `oldNode`): [`LinkedomNode`](../type-aliases/LinkedomNode.md)

Defined in: [src/parsers/dom/WikiDocument.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L50)

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

Defined in: [src/parsers/dom/WikiDocument.ts:51](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L51)

#### Parameters

##### node

[`LinkedomNode`](../type-aliases/LinkedomNode.md)

#### Returns

`void`

***

### setAttribute()

> __setAttribute__(`name`, `value`): `void`

Defined in: [src/parsers/dom/WikiDocument.ts:45](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/WikiDocument.ts#L45)

#### Parameters

##### name

`string`

##### value

`string`

#### Returns

`void`
