[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [IContentConverter](../README.md) / IContentConverter

# Interface: IContentConverter

Defined in: src/converters/IContentConverter.ts:57

Content converter interface
All format converters must implement these methods

## Properties

### fileExtensions

> `readonly` __fileExtensions__: `string`[]

Defined in: src/converters/IContentConverter.ts:74

File extensions this converter handles
Used for auto-detection (e.g., ['.txt', '.wiki'])

***

### formatId

> `readonly` __formatId__: `string`

Defined in: src/converters/IContentConverter.ts:62

Unique identifier for this converter format
Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')

***

### formatName

> `readonly` __formatName__: `string`

Defined in: src/converters/IContentConverter.ts:68

Human-readable name for this format
Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')

## Methods

### canHandle()

> __canHandle__(`content`, `filename`): `boolean`

Defined in: src/converters/IContentConverter.ts:92

Check if this converter can handle the given content
Used for format auto-detection when multiple converters exist

#### Parameters

##### content

`string`

The file content to check

##### filename

`string`

The filename (for extension checking)

#### Returns

`boolean`

True if this converter can handle the content

***

### convert()

> __convert__(`content`): [`ConversionResult`](ConversionResult.md)

Defined in: src/converters/IContentConverter.ts:82

Convert content from source format to Markdown

#### Parameters

##### content

`string`

The source content to convert

#### Returns

[`ConversionResult`](ConversionResult.md)

Conversion result with Markdown content, metadata, and warnings

***

### convertBuffer()?

> `optional` __convertBuffer__(`buffer`): `Promise`\<[`ConversionResult`](ConversionResult.md)\>

Defined in: src/converters/IContentConverter.ts:102

# 1131: convert a BINARY source (e.g. .docx) — optional; its presence
tells ImportManager to read the file as a Buffer instead of UTF-8 and
call this instead of [convert](#convert). The result's `content` may be an
intermediate format (DocxConverter returns HTML) that ImportManager
routes through the NCM normalizer like any other registered source.
Async because binary converters (mammoth) are.

#### Parameters

##### buffer

`Buffer`

#### Returns

`Promise`\<[`ConversionResult`](ConversionResult.md)\>
