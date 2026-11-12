[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [converters](../README.md) / MarkdownConverter

# Class: MarkdownConverter

Defined in: src/converters/MarkdownConverter.ts:36

Content converter interface
All format converters must implement these methods

## Implements

- [`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md)

## Constructors

### Constructor

> __new MarkdownConverter__(): `MarkdownConverter`

#### Returns

`MarkdownConverter`

## Properties

### fileExtensions

> `readonly` __fileExtensions__: `string`[]

Defined in: src/converters/MarkdownConverter.ts:39

File extensions this converter handles
Used for auto-detection (e.g., ['.txt', '.wiki'])

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`fileExtensions`](../../IContentConverter/interfaces/IContentConverter.md#fileextensions)

***

### formatId

> `readonly` __formatId__: `"markdown"` = `'markdown'`

Defined in: src/converters/MarkdownConverter.ts:37

Unique identifier for this converter format
Used for format selection in import options (e.g., 'jspwiki', 'mediawiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatId`](../../IContentConverter/interfaces/IContentConverter.md#formatid)

***

### formatName

> `readonly` __formatName__: `"Markdown"` = `'Markdown'`

Defined in: src/converters/MarkdownConverter.ts:38

Human-readable name for this format
Displayed in UI format selection (e.g., 'JSPWiki', 'MediaWiki')

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`formatName`](../../IContentConverter/interfaces/IContentConverter.md#formatname)

## Methods

### canHandle()

> __canHandle__(`content`, `filename`): `boolean`

Defined in: src/converters/MarkdownConverter.ts:87

Accepts .md / .markdown by extension; also matches content that starts
with a YAML frontmatter block or a Markdown heading.

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

Defined in: src/converters/MarkdownConverter.ts:48

Parse frontmatter and return body content unchanged.

Existing frontmatter fields are extracted as metadata so ImportManager's
`buildFrontmatter` can honour them (e.g. preserve a uuid that already
exists, carry over audience restrictions, etc.).

#### Parameters

##### content

`string`

#### Returns

[`ConversionResult`](../../IContentConverter/interfaces/ConversionResult.md)

#### Implementation of

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md).[`convert`](../../IContentConverter/interfaces/IContentConverter.md#convert)
