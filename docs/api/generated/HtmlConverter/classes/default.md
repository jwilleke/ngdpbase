[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [HtmlConverter](../README.md) / default

# Class: default

Defined in: src/converters/HtmlConverter.ts:56

HTML to Markdown converter

Implements IContentConverter for importing web pages as wiki pages.
Extracts the primary article content, strips boilerplate, and converts to Markdown.

## Implements

- [`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md)

## Constructors

### Constructor

> __new default__(): `HtmlConverter`

Defined in: src/converters/HtmlConverter.ts:63

#### Returns

`HtmlConverter`

## Properties

### fileExtensions

> `readonly` __fileExtensions__: `string`[]

Defined in: src/converters/HtmlConverter.ts:59

File extensions this converter handles
Used for auto-detection (e.g., ['.txt', '.wiki'])

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`fileExtensions`](../../IContentConverter/interfaces/IContentConverter.md#fileextensions)

***

### formatId

> `readonly` __formatId__: `"html"` = `'html'`

Defined in: src/converters/HtmlConverter.ts:57

Unique identifier for this converter format
Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatId`](../../IContentConverter/interfaces/IContentConverter.md#formatid)

***

### formatName

> `readonly` __formatName__: `"HTML Web Page"` = `'HTML Web Page'`

Defined in: src/converters/HtmlConverter.ts:58

Human-readable name for this format
Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatName`](../../IContentConverter/interfaces/IContentConverter.md#formatname)

## Methods

### canHandle()

> __canHandle__(`content`, `filename`): `boolean`

Defined in: src/converters/HtmlConverter.ts:142

Check if this converter can handle the given content

#### Parameters

##### content

`string`

##### filename

`string`

#### Returns

`boolean`

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`canHandle`](../../IContentConverter/interfaces/IContentConverter.md#canhandle)

***

### convert()

> __convert__(`content`): [`ConversionResult`](../../IContentConverter/interfaces/ConversionResult.md)

Defined in: src/converters/HtmlConverter.ts:97

Convert HTML content to Markdown

#### Parameters

##### content

`string`

Raw HTML string

#### Returns

[`ConversionResult`](../../IContentConverter/interfaces/ConversionResult.md)

ConversionResult with Markdown content, metadata, and warnings

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`convert`](../../IContentConverter/interfaces/IContentConverter.md#convert)
