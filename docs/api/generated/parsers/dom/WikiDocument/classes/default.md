[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/WikiDocument](../README.md) / default

# Class: default

Defined in: src/parsers/dom/WikiDocument.ts:85

WikiDocument - DOM-based representation of a wiki page

## Constructors

### Constructor

> __new default__(`pageData`, `context?`): `WikiDocument`

Defined in: src/parsers/dom/WikiDocument.ts:98

Creates a new WikiDocument

#### Parameters

##### pageData

`string`

Original wiki markup content

##### context?

[`WikiContext`](../interfaces/WikiContext.md)

Rendering context (stored as WeakRef)

#### Returns

`WikiDocument`

## Methods

### appendChild()

> __appendChild__(`node`): [`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Defined in: src/parsers/dom/WikiDocument.ts:246

Appends a child to the root element

#### Parameters

##### node

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Node to append

#### Returns

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Appended node

***

### clear()

> __clear__(): `void`

Defined in: src/parsers/dom/WikiDocument.ts:405

Clears all content from the document

#### Returns

`void`

***

### createCommentNode()

> __createCommentNode__(`text`): [`LinkedomComment`](../../../../types/linkedom/interfaces/LinkedomComment.md)

Defined in: src/parsers/dom/WikiDocument.ts:232

Creates a comment node

#### Parameters

##### text

`string`

Comment text

#### Returns

[`LinkedomComment`](../../../../types/linkedom/interfaces/LinkedomComment.md)

New comment node

***

### createElement()

> __createElement__(`tag`, `attributes?`): [`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md)

Defined in: src/parsers/dom/WikiDocument.ts:205

Creates a new element

#### Parameters

##### tag

`string`

Element tag name

##### attributes?

`Record`\<`string`, `string`\> = `{}`

Element attributes

#### Returns

[`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md)

New element

***

### createTextNode()

> __createTextNode__(`text`): [`LinkedomText`](../../../../types/linkedom/interfaces/LinkedomText.md)

Defined in: src/parsers/dom/WikiDocument.ts:222

Creates a text node

#### Parameters

##### text

`string`

Text content

#### Returns

[`LinkedomText`](../../../../types/linkedom/interfaces/LinkedomText.md)

New text node

***

### fromJSON()

> `static` __fromJSON__(`json`, `context?`): `WikiDocument`

Defined in: src/parsers/dom/WikiDocument.ts:382

Deserializes from JSON (for cache restore)

#### Parameters

##### json

[`WikiDocumentJSON`](../interfaces/WikiDocumentJSON.md)

JSON data

##### context?

[`WikiContext`](../interfaces/WikiContext.md) \| `null` = `null`

Rendering context

#### Returns

`WikiDocument`

Restored WikiDocument

***

### getChildCount()

> __getChildCount__(): `number`

Defined in: src/parsers/dom/WikiDocument.ts:414

Gets the number of child nodes in root

#### Returns

`number`

Number of children

***

### getContext()

> __getContext__(): [`WikiContext`](../interfaces/WikiContext.md) \| `null`

Defined in: src/parsers/dom/WikiDocument.ts:149

Gets the rendering context (if still alive)

JSPWiki equivalent: getContext()

#### Returns

[`WikiContext`](../interfaces/WikiContext.md) \| `null`

Context object or null if garbage collected

***

### getElementById()

> __getElementById__(`id`): [`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md) \| `null`

Defined in: src/parsers/dom/WikiDocument.ts:312

Gets element by ID

#### Parameters

##### id

`string`

Element ID

#### Returns

[`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md) \| `null`

Element or null

***

### getElementsByClassName()

> __getElementsByClassName__(`className`): [`LinkedomHTMLCollection`](../../../../types/linkedom/interfaces/LinkedomHTMLCollection.md)

Defined in: src/parsers/dom/WikiDocument.ts:322

Gets elements by class name

#### Parameters

##### className

`string`

Class name

#### Returns

[`LinkedomHTMLCollection`](../../../../types/linkedom/interfaces/LinkedomHTMLCollection.md)

Elements with class

***

### getElementsByTagName()

> __getElementsByTagName__(`tagName`): [`LinkedomHTMLCollection`](../../../../types/linkedom/interfaces/LinkedomHTMLCollection.md)

Defined in: src/parsers/dom/WikiDocument.ts:332

Gets elements by tag name

#### Parameters

##### tagName

`string`

Tag name

#### Returns

[`LinkedomHTMLCollection`](../../../../types/linkedom/interfaces/LinkedomHTMLCollection.md)

Elements with tag

***

### getMetadata()

> __getMetadata__(): [`WikiDocumentMetadata`](../interfaces/WikiDocumentMetadata.md)

Defined in: src/parsers/dom/WikiDocument.ts:169

Gets all metadata

#### Returns

[`WikiDocumentMetadata`](../interfaces/WikiDocumentMetadata.md)

Metadata object

***

### getMetadataValue()

> __getMetadataValue__(`key`, `defaultValue?`): `unknown`

Defined in: src/parsers/dom/WikiDocument.ts:190

Gets a metadata value

#### Parameters

##### key

`string`

Metadata key

##### defaultValue?

`unknown` = `null`

Default value if not found

#### Returns

`unknown`

Metadata value or default

***

### getPageData()

> __getPageData__(): `string`

Defined in: src/parsers/dom/WikiDocument.ts:127

Gets the original wiki markup

JSPWiki equivalent: getPageData()

#### Returns

`string`

Original page data

***

### getRootElement()

> __getRootElement__(): [`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md)

Defined in: src/parsers/dom/WikiDocument.ts:116

Gets the root element of the document

#### Returns

[`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md)

Root element (body)

***

### getStatistics()

> __getStatistics__(): [`WikiDocumentStatistics`](../interfaces/WikiDocumentStatistics.md)

Defined in: src/parsers/dom/WikiDocument.ts:432

Gets document statistics

#### Returns

[`WikiDocumentStatistics`](../interfaces/WikiDocumentStatistics.md)

Statistics

***

### insertBefore()

> __insertBefore__(`newNode`, `referenceNode`): [`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Defined in: src/parsers/dom/WikiDocument.ts:257

Inserts a node before a reference node in root

#### Parameters

##### newNode

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Node to insert

##### referenceNode

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md) \| `null`

Reference node

#### Returns

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Inserted node

***

### isEmpty()

> __isEmpty__(): `boolean`

Defined in: src/parsers/dom/WikiDocument.ts:423

Checks if the document is empty

#### Returns

`boolean`

True if empty

***

### querySelector()

> __querySelector__(`selector`): [`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md) \| `null`

Defined in: src/parsers/dom/WikiDocument.ts:292

Queries for a single element

#### Parameters

##### selector

`string`

CSS selector

#### Returns

[`LinkedomElement`](../../../../types/linkedom/interfaces/LinkedomElement.md) \| `null`

First matching element or null

***

### querySelectorAll()

> __querySelectorAll__(`selector`): [`LinkedomNodeList`](../../../../types/linkedom/interfaces/LinkedomNodeList.md)

Defined in: src/parsers/dom/WikiDocument.ts:302

Queries for all matching elements

#### Parameters

##### selector

`string`

CSS selector

#### Returns

[`LinkedomNodeList`](../../../../types/linkedom/interfaces/LinkedomNodeList.md)

Matching elements

***

### removeChild()

> __removeChild__(`node`): [`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Defined in: src/parsers/dom/WikiDocument.ts:267

Removes a child from the root element

#### Parameters

##### node

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Node to remove

#### Returns

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Removed node

***

### replaceChild()

> __replaceChild__(`newNode`, `oldNode`): [`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Defined in: src/parsers/dom/WikiDocument.ts:278

Replaces a child in the root element

#### Parameters

##### newNode

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

New node

##### oldNode

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Old node to replace

#### Returns

[`LinkedomNode`](../../../../types/linkedom/type-aliases/LinkedomNode.md)

Replaced node

***

### setContext()

> __setContext__(`context`): `void`

Defined in: src/parsers/dom/WikiDocument.ts:160

Sets the rendering context

JSPWiki equivalent: setContext(Context ctx)

#### Parameters

##### context

[`WikiContext`](../interfaces/WikiContext.md) \| `null`

Rendering context

#### Returns

`void`

***

### setMetadata()

> __setMetadata__(`key`, `value`): `void`

Defined in: src/parsers/dom/WikiDocument.ts:179

Sets a metadata value

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

### setPageData()

> __setPageData__(`data`): `void`

Defined in: src/parsers/dom/WikiDocument.ts:138

Sets the original wiki markup

JSPWiki equivalent: setPageData(String data)

#### Parameters

##### data

`string`

Wiki markup

#### Returns

`void`

***

### toHTML()

> __toHTML__(): `string`

Defined in: src/parsers/dom/WikiDocument.ts:347

Serializes the document to HTML string

JSPWiki equivalent: XHTMLRenderer.render()

#### Returns

`string`

HTML string

***

### toJSON()

> __toJSON__(): [`WikiDocumentJSON`](../interfaces/WikiDocumentJSON.md)

Defined in: src/parsers/dom/WikiDocument.ts:365

Serializes to JSON (for caching)

#### Returns

[`WikiDocumentJSON`](../interfaces/WikiDocumentJSON.md)

JSON representation

***

### toString()

> __toString__(): `string`

Defined in: src/parsers/dom/WikiDocument.ts:356

Serializes to string (for debugging)

#### Returns

`string`

String representation
