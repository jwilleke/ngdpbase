[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/DOMBuilder](../README.md) / default

# Class: default

Defined in: src/parsers/dom/DOMBuilder.ts:121

DOMBuilder class

## Constructors

### Constructor

> __new default__(`wikiDocument`): `DOMBuilder`

Defined in: src/parsers/dom/DOMBuilder.ts:142

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

Defined in: src/parsers/dom/DOMBuilder.ts:525

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

Defined in: src/parsers/dom/DOMBuilder.ts:156

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

Defined in: src/parsers/dom/DOMBuilder.ts:585

Closes all open lists

#### Returns

`void`

***

### closeCurrentParagraph()

> __closeCurrentParagraph__(): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:518

Closes the current paragraph context

#### Returns

`void`

***

### closeCurrentTable()

> __closeCurrentTable__(): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:592

Closes the current table context

#### Returns

`void`

***

### ensureParagraph()

> __ensureParagraph__(): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:501

Ensures a paragraph context exists for inline content

#### Returns

`void`

***

### handleBold()

> __handleBold__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:426

Handles bold text __text__

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleCodeBlock()

> __handleCodeBlock__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:456

Handles code blocks {{{code}}}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleCodeInline()

> __handleCodeInline__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:446

Handles inline code {{text}}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleComment()

> __handleComment__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:470

Handles HTML comments <!-- comment -->

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleEscaped()

> __handleEscaped__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:260

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

Defined in: src/parsers/dom/DOMBuilder.ts:349

Handles headings !, !!, !!!

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleInterWiki()

> __handleInterWiki__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:335

Handles interwiki links [Wiki:Page]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleItalic()

> __handleItalic__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:436

Handles italic text ''text''

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleLink()

> __handleLink__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:318

Handles links [link|text]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleListItem()

> __handleListItem__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:372

Handles list items *, #

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleNewline()

> __handleNewline__(`_token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:483

Handles newlines

#### Parameters

##### \_token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handlePlugin()

> __handlePlugin__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:283

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

Defined in: src/parsers/dom/DOMBuilder.ts:396

Handles table cells | cell |

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleText()

> __handleText__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:250

Handles plain text tokens

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleVariable()

> __handleVariable__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:269

Handles variables {$varname}

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### handleWikiTag()

> __handleWikiTag__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:303

Handles wiki tags [tag]

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

#### Returns

`void`

***

### processToken()

> __processToken__(`token`): `void`

Defined in: src/parsers/dom/DOMBuilder.ts:185

Processes a single token

#### Parameters

##### token

[`Token`](../interfaces/Token.md)

Token to process

#### Returns

`void`
