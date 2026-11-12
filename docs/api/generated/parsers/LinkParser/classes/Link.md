[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / Link

# Class: Link

Defined in: src/parsers/LinkParser.ts:892

Link class representing a parsed link

## Constructors

### Constructor

> __new Link__(`data?`): `Link`

Defined in: src/parsers/LinkParser.ts:918

Create a new Link instance

#### Parameters

##### data?

[`LinkData`](../interfaces/LinkData.md) = `{}`

Link data

#### Returns

`Link`

## Properties

### attributes

> __attributes__: [`LinkAttributes`](../interfaces/LinkAttributes.md)

Defined in: src/parsers/LinkParser.ts:906

Parsed attributes object

***

### attributesString

> __attributesString__: `string` \| `null`

Defined in: src/parsers/LinkParser.ts:903

Raw attributes string

***

### endIndex

> __endIndex__: `number`

Defined in: src/parsers/LinkParser.ts:912

End index in content

***

### originalText

> __originalText__: `string`

Defined in: src/parsers/LinkParser.ts:894

Original text from content

***

### startIndex

> __startIndex__: `number`

Defined in: src/parsers/LinkParser.ts:909

Start index in content

***

### target

> __target__: `string` \| `null`

Defined in: src/parsers/LinkParser.ts:900

Target page or URL

***

### text

> __text__: `string`

Defined in: src/parsers/LinkParser.ts:897

Display text for the link

## Methods

### getAttribute()

> __getAttribute__(`name`): `string` \| `undefined`

Defined in: src/parsers/LinkParser.ts:957

Get attribute value by name

#### Parameters

##### name

`string`

Attribute name

#### Returns

`string` \| `undefined`

Attribute value

***

### getEffectiveTarget()

> __getEffectiveTarget__(): `string`

Defined in: src/parsers/LinkParser.ts:940

Get the effective target (target or text if no target)

#### Returns

`string`

Effective target

***

### hasAttributes()

> __hasAttributes__(): `boolean`

Defined in: src/parsers/LinkParser.ts:948

Check if link has attributes

#### Returns

`boolean`

True if has attributes

***

### isSimple()

> __isSimple__(): `boolean`

Defined in: src/parsers/LinkParser.ts:932

Check if this is a simple link (no target specified)

#### Returns

`boolean`

True if simple link

***

### setAttribute()

> __setAttribute__(`name`, `value`): `void`

Defined in: src/parsers/LinkParser.ts:966

Set attribute value

#### Parameters

##### name

`string`

Attribute name

##### value

`string`

Attribute value

#### Returns

`void`

***

### toObject()

> __toObject__(): [`LinkInfo`](../interfaces/LinkInfo.md)

Defined in: src/parsers/LinkParser.ts:976

Get link information as object

#### Returns

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information
