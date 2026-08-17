[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/DOMBuilder](../README.md) / default

# Class: default

Defined in: [src/parsers/dom/DOMBuilder.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L121)

DOMBuilder class

## Constructors

### Constructor

> __new default__(`wikiDocument`): `DOMBuilder`

Defined in: [src/parsers/dom/DOMBuilder.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L142)

Creates a new DOMBuilder

#### Parameters

##### wikiDocument

[`default`](../../WikiDocument/classes/default.md)

Target WikiDocument

#### Returns

`DOMBuilder`

## Methods

### adjustListStack()

> __adjustListStack__(`targetLevel`, `isOrdered`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:522](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L522)

Adjusts the list stack to match the desired level

#### Parameters

##### targetLevel

`number`

##### isOrdered

`boolean`

#### Returns

`void`

***

### buildFromTokens()

> __buildFromTokens__(`tokens`): [`default`](../../WikiDocument/classes/default.md)

Defined in: [src/parsers/dom/DOMBuilder.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L156)

Builds a DOM tree from an array of tokens

#### Parameters

##### tokens

[`Token`](../interfaces/Token.md)[]

Array of tokens from Tokenizer

#### Returns

[`default`](../../WikiDocument/classes/default.md)

The WikiDocument with built DOM

***

### closeAllLists()

> __closeAllLists__(): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:582](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L582)

Closes all open lists

#### Returns

`void`

***

### closeCurrentParagraph()

> __closeCurrentParagraph__(): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:515](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L515)

Closes the current paragraph context

#### Returns

`void`

***

### closeCurrentTable()

> __closeCurrentTable__(): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:589](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L589)

Closes the current table context

#### Returns

`void`

***

### ensureParagraph()

> __ensureParagraph__(): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:498](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L498)

Ensures a paragraph context exists for inline content

#### Returns

`void`

***

### handleBold()

> __handleBold__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:423](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L423)

Handles bold text __text__

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleCodeBlock()

> __handleCodeBlock__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:453](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L453)

Handles code blocks {{{code}}}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleCodeInline()

> __handleCodeInline__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:443](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L443)

Handles inline code {{text}}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleComment()

> __handleComment__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:467](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L467)

Handles HTML comments <!-- comment -->

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleEscaped()

> __handleEscaped__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:260](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L260)

Handles escaped text [[...]]
This is literal text that should not be parsed

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleHeading()

> __handleHeading__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:346](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L346)

Handles headings !, !!, !!!

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleInterWiki()

> __handleInterWiki__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:332](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L332)

Handles interwiki links [Wiki:Page]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleItalic()

> __handleItalic__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:433](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L433)

Handles italic text ''text''

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleLink()

> __handleLink__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:318](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L318)

Handles links [link|text]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleListItem()

> __handleListItem__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:369](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L369)

Handles list items *, #

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleNewline()

> __handleNewline__(`_token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:480](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L480)

Handles newlines

#### Parameters

##### \_token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handlePlugin()

> __handlePlugin__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:283](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L283)

Handles plugins [{PLUGIN ...}]
Creates inline span element to allow plugins within paragraphs

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleTableCell()

> __handleTableCell__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:393](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L393)

Handles table cells | cell |

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleText()

> __handleText__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:250](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L250)

Handles plain text tokens

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleVariable()

> __handleVariable__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:269](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L269)

Handles variables {$varname}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleWikiTag()

> __handleWikiTag__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:303](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L303)

Handles wiki tags [tag]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### processToken()

> __processToken__(`token`): `void`

Defined in: [src/parsers/dom/DOMBuilder.ts:185](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L185)

Processes a single token

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

Token to process

#### Returns

`void`
