[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [converters/DocxConverter](../README.md) / default

# Class: default

Defined in: src/converters/DocxConverter.ts:19

Content converter interface
All format converters must implement these methods

## Implements

- [`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md)

## Constructors

### Constructor

> __new default__(): `DocxConverter`

#### Returns

`DocxConverter`

## Properties

### fileExtensions

> `readonly` __fileExtensions__: `string`[]

Defined in: src/converters/DocxConverter.ts:22

File extensions this converter handles
Used for auto-detection (e.g., ['.txt', '.wiki'])

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`fileExtensions`](../../../IContentConverter/interfaces/IContentConverter.md#fileextensions)

***

### formatId

> `readonly` __formatId__: `"docx"` = `'docx'`

Defined in: src/converters/DocxConverter.ts:20

Unique identifier for this converter format
Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`formatId`](../../../IContentConverter/interfaces/IContentConverter.md#formatid)

***

### formatName

> `readonly` __formatName__: `"Word (.docx)"` = `'Word (.docx)'`

Defined in: src/converters/DocxConverter.ts:21

Human-readable name for this format
Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`formatName`](../../../IContentConverter/interfaces/IContentConverter.md#formatname)

## Methods

### canHandle()

> __canHandle__(`_content`, `_filename`): `boolean`

Defined in: src/converters/DocxConverter.ts:30

Never claims by content (#879 extension-first): a docx read as UTF-8 is
zip garbage, and probing it risks both false negatives and another
converter mis-claiming. detectFormat's extension pass finds this
converter; the content pass must stay silent.

#### Parameters

##### \_content

`string`

##### \_filename

`string`

#### Returns

`boolean`

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`canHandle`](../../../IContentConverter/interfaces/IContentConverter.md#canhandle)

***

### convert()

> __convert__(`_content`): [`ConversionResult`](../../../IContentConverter/interfaces/ConversionResult.md)

Defined in: src/converters/DocxConverter.ts:35

A docx has no meaningful text form — the binary contract is the only door.

#### Parameters

##### \_content

`string`

#### Returns

[`ConversionResult`](../../../IContentConverter/interfaces/ConversionResult.md)

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`convert`](../../../IContentConverter/interfaces/IContentConverter.md#convert)

***

### convertBuffer()

> __convertBuffer__(`buffer`): `Promise`\<[`ConversionResult`](../../../IContentConverter/interfaces/ConversionResult.md)\>

Defined in: src/converters/DocxConverter.ts:39

# 1131: convert a BINARY source (e.g. .docx) — optional; its presence
tells ImportManager to read the file as a Buffer instead of UTF-8 and
call this instead of [convert](../../../IContentConverter/interfaces/IContentConverter.md#convert). The result's `content` may be an
intermediate format (DocxConverter returns HTML) that ImportManager
routes through the NCM normalizer like any other registered source.
Async because binary converters (mammoth) are.

#### Parameters

##### buffer

`Buffer`

#### Returns

`Promise`\<[`ConversionResult`](../../../IContentConverter/interfaces/ConversionResult.md)\>

#### Implementation of

[`IContentConverter`](../../../IContentConverter/interfaces/IContentConverter.md).[`convertBuffer`](../../../IContentConverter/interfaces/IContentConverter.md#convertbuffer)
