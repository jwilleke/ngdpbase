[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [converters](../README.md) / JSPWikiConverter

# Class: JSPWikiConverter

Defined in: src/converters/JSPWikiConverter.ts:22

JSPWiki syntax to Markdown converter

## Implements

- [`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md)

## Constructors

### Constructor

> __new JSPWikiConverter__(): `JSPWikiConverter`

#### Returns

`JSPWikiConverter`

## Properties

### fileExtensions

> `readonly` __fileExtensions__: `string`[]

Defined in: src/converters/JSPWikiConverter.ts:25

File extensions this converter handles
Used for auto-detection (e.g., ['.txt', '.wiki'])

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`fileExtensions`](../../IContentConverter/interfaces/IContentConverter.md#fileextensions)

***

### formatId

> `readonly` __formatId__: `"jspwiki"` = `'jspwiki'`

Defined in: src/converters/JSPWikiConverter.ts:23

Unique identifier for this converter format
Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatId`](../../IContentConverter/interfaces/IContentConverter.md#formatid)

***

### formatName

> `readonly` __formatName__: `"JSPWiki"` = `'JSPWiki'`

Defined in: src/converters/JSPWikiConverter.ts:24

Human-readable name for this format
Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatName`](../../IContentConverter/interfaces/IContentConverter.md#formatname)

## Methods

### canHandle()

> __canHandle__(`content`, `filename`): `boolean`

Defined in: src/converters/JSPWikiConverter.ts:77

Check if this converter can handle the given content
Uses filename extension and content pattern detection

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

Defined in: src/converters/JSPWikiConverter.ts:33

Convert JSPWiki content to Markdown

#### Parameters

##### content

`string`

JSPWiki formatted content

#### Returns

[`ConversionResult`](../../IContentConverter/interfaces/ConversionResult.md)

ConversionResult with Markdown content, metadata, and warnings

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`convert`](../../IContentConverter/interfaces/IContentConverter.md#convert)
